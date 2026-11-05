import {StockPanel} from './Online.jsx';
import { useState } from 'preact/hooks';
import { ChevronDown, Upload } from 'lucide-preact';
import { project } from '../editor/store.js';
import { prefs, setPrefs } from '../prefs.js';
import { Button, IconButton, Row, Select, Toggle, toast } from '../ui.jsx';
import { DesignFontSelect } from './FontSelect.jsx';
import { EMOJI_STYLES } from './emoji.js';
import { BRAND_ROLES } from '../../shared/designBrand.js';
import { currentBrand, updateBrand, setBrandFont, applyCurrentBrand } from './brand.js';
import { fileUrl } from '../player.js';
import { filterLibraryItems } from '../../shared/designLibrary.js';
import { brandPalette } from '../../shared/designContent.js';
import { DESIGN_FONT_PAIRS } from '../../shared/designTemplates.js';
import { addTextPreset } from './content.js';
import { AppearanceCard, fontPairs } from './OfflinePanels.jsx';
import { currentDesign } from './store.js';
import { LibraryCard, StylesPanel } from './LibraryPanel.jsx';
import { LibrarySections } from './LibrarySection.jsx';
import { chooseImage, chooseOpenImage, openImageFiles, requestPlace } from './assets.js';
import { placeLibraryImage, previewLibraryImage, applyLibraryColor, previewLibraryColor } from './library.js';
import { brandLogo, chooseBrandLogo, brandColors, saveBrandColor } from './brand.js';
import { droppedPaths, hasFiles } from '../fileDrop.js';

export async function importDesignFiles(paths, alternate = false) {
  if (!paths.length) return;
  if (!currentDesign.value) await openImageFiles(paths, { copy: alternate ? !prefs.value.importCopy : prefs.value.importCopy });
  else await requestPlace(paths, null, alternate);
}
export function ImportImageButton() {
  const error = err => toast(err.message, { kind: 'error' });
  return <div class="dz-import-actions"><Button icon={Upload} onClick={() => (currentDesign.value ? chooseImage() : chooseOpenImage()).catch(error)}>Import Image…</Button><IconButton icon={ChevronDown} title="Import options" onClick={async () => {
    const id = await window.api.popupMenu([{ id: 'embedded', label: 'Import Embedded…', enabled: !!currentDesign.value }, { id: 'linked', label: 'Import Linked…', enabled: !!currentDesign.value }, { separator: true }, { id: 'open', label: 'Open as New Design…' }]);
    if (id) (id === 'open' ? chooseOpenImage() : chooseImage(id === 'embedded')).catch(error);
  }}/></div>;
}
export function ImageCard({ item, source, prefix }) {
  const path = source.path || source.asset?.path || source.media?.streams?.main?.proxy || source.media?.streams?.main?.path || source.media?.path;
  return <LibraryCard id={`${prefix}:${item.id}`} apply={(_, point) => placeLibraryImage(source, point)} preview={() => previewLibraryImage(source)} title={`${item.name}. Click or drag to place the image.`}><img src={fileUrl(path)} alt="" draggable={false}/><b>{item.name}</b></LibraryCard>;
}
export function ColorCard({color}){return <LibraryCard id={`color:${color}`} apply={hit=>applyLibraryColor(color,hit)} preview={()=>previewLibraryColor(color)} menuItems={[{id:'delete',label:'Remove Color',run:()=>setPrefs({designColors:brandColors().filter(c=>c!==color)})}]} title={`${color}. Click to apply to selected text or shapes, or the background.`}><span class="dz-library-swatch" style={{background:color}}/><b>{color}</b></LibraryCard>;}
export function ContentPanel({ query = '' }) {
  const p = project.value;
  const recent = filterLibraryItems(Object.values(p.designAssets || {}).filter(a => a.origin === 'placed'), query).reverse();
  const media = filterLibraryItems(Object.values(p.media).filter(m => m.kind === 'image'), query);
  return <><ImportImageButton/><div class="dz-content-drop" onDragOver={e => { if (hasFiles(e.dataTransfer)) { e.preventDefault(); e.stopPropagation(); } }} onDrop={e => { if (!hasFiles(e.dataTransfer)) return; e.preventDefault(); e.stopPropagation(); importDesignFiles(droppedPaths(e.dataTransfer, window.api.pathForFile), e.altKey).catch(err => toast(err.message, { kind: 'error' })); }}>Drop images here</div><LibrarySections query={query} sections={[
    { id: 'recent', title: 'Recent', items: recent, render: a => <ImageCard key={a.id} item={a} source={{ asset: a }} prefix="asset"/>, empty: 'Images imported into this project appear here.' },
    { id: 'project', title: 'From Project', items: media, render: m => <ImageCard key={m.id} item={m} source={{ media: m }} prefix="media"/>, empty: 'Images from Edit appear here.' },
  ]}/><StockPanel query={query}/></>;
}
export function TextPanel({ query = '' }) {
  return <><div class="dz-text-presets">{['title','subtitle','badge'].map(kind=><Button key={kind} onClick={()=>addTextPreset(kind)}>Add {kind[0].toUpperCase()+kind.slice(1)}</Button>)}</div><StylesPanel query={query} extraSections={[{id:'font-pairs',title:'Font Pairs',items:filterLibraryItems(fontPairs(),query),render:pair=><AppearanceCard key={pair.id} pair={pair} user={!DESIGN_FONT_PAIRS.some(p=>p.id===pair.id)}/>}]} /></>;
}
export function BrandPanel({ query = '' }) {
  const logo = brandLogo.value, colors = brandColors(),fonts=prefs.value.designBrandFonts||{},palette={id:'brand',name:'Brand Palette',colors:[currentBrand().roles.background,currentBrand().roles.title,currentBrand().roles.cta,currentBrand().roles.secondary,currentBrand().roles.stroke]}, [color, setColor] = useState('#ffd60a');
  const items = filterLibraryItems(colors.map(hex => ({ id: hex, name: hex })), query);
  const brand=currentBrand(),[kitName,setKitName]=useState(''),kits=Array.isArray(prefs.value.designBrandKits)?prefs.value.designBrandKits:[];
  return <div class="dz-brand"><p class="hint">Your reusable defaults for new text, shapes and emoji. Font changes update matching text in this design. Use Apply Brand to restyle existing elements. Explicit library styles keep their example colors.</p><Row label="Use Brand defaults"><Toggle checked={brand.enabled} onChange={enabled=>updateBrand({enabled})}/></Row><LibrarySections query={query} sections={[
    { id: 'logo', title: 'Logo', items: filterLibraryItems(logo ? [{ id: 'logo', name: logo.name }] : [], query), actions: <IconButton icon={Upload} title={logo ? 'Replace Logo' : 'Choose Logo'} onClick={() => chooseBrandLogo().catch(err => toast(err.message, { kind: 'error' }))}/>, empty: 'Choose a logo to reuse in your designs.', render: item => <ImageCard key={item.id} item={item} source={{ path: logo.path, name: logo.name }} prefix="brand"/> },
    { id: 'colors', title: 'Brand Colors', items, empty: 'Save up to 20 colors to reuse in Design.', render: item => <ColorCard key={item.id} color={item.id}/> },
    {id:'brand-palette',title:'Brand Palette',items:palette?filterLibraryItems([palette],query):[],empty:'Save brand colors to make a palette.',render:item=><AppearanceCard key={item.id} palette={item}/>},
  ]}/><section class="dz-brand-section"><h3>Color Roles</h3>{Object.keys(BRAND_ROLES).map(role=><Row key={role} label={({cta:'CTA',fill:'Element fill',body:'Body text',title:'Title text'})[role]||role[0].toUpperCase()+role.slice(1)}><input type="color" aria-label={`Brand ${role} color`} value={brand.roles[role]} onInput={e=>updateBrand({roles:{...brand.roles,[role]:e.currentTarget.value}})}/><span class="hint">{brand.roles[role]}</span></Row>)}<Button disabled={!currentDesign.value} onClick={applyCurrentBrand}>Apply Brand to This Design</Button></section>
  <section class="dz-brand-section"><h3>Brand Fonts</h3><Row label="Title" stacked><DesignFontSelect value={fonts.title||'sans'} onChange={font=>setBrandFont('title',font)}/></Row><Row label="Body" stacked><DesignFontSelect value={fonts.body||'sans'} onChange={font=>setBrandFont('body',font)}/></Row></section>
  <section class="dz-brand-section"><h3>Emoji Style</h3><Row label="Default" stacked><Select value={brand.emojiStyle} options={EMOJI_STYLES} onChange={emojiStyle=>updateBrand({emojiStyle})}/></Row><p class="hint">The emoji library follows this choice. Each placed emoji has its own style in Properties. OpenMoji graphics: CC BY-SA 4.0.</p></section>
  <section class="dz-brand-section"><h3>Saved Colors</h3><Row label="New color" stacked><input aria-label="New brand color" type="color" value={color} onInput={e=>setColor(e.currentTarget.value)}/><Button class="small" onClick={()=>saveBrandColor(color)}>Save Color</Button></Row></section>
  <section class="dz-brand-section"><h3>Brand Kits</h3><input class="text-input" aria-label="Brand kit name" placeholder="Brand kit name" value={kitName} onInput={e=>setKitName(e.currentTarget.value)}/><Button disabled={!kitName.trim()||kits.length>=50} onClick={()=>{setPrefs({designBrandKits:[...kits,{id:crypto.randomUUID(),name:kitName.trim(),brand,fonts}]});setKitName('')}}>Save Brand Kit</Button>{kits.map(kit=><Row key={kit.id} label={kit.name}><Button class="small" onClick={()=>{updateBrand(kit.brand);setBrandFont('title',kit.fonts.title||'sans');setBrandFont('body',kit.fonts.body||'sans')}}>Use</Button><Button class="small" onClick={()=>setPrefs({designBrandKits:kits.filter(k=>k.id!==kit.id)})}>Delete</Button></Row>)}</section></div>;
}

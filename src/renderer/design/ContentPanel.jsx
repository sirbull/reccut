import { useState } from 'preact/hooks';
import { ChevronDown, Upload } from 'lucide-preact';
import { project } from '../editor/store.js';
import { prefs, setPrefs } from '../prefs.js';
import { Button, IconButton, Row, toast } from '../ui.jsx';
import { fileUrl } from '../player.js';
import { filterLibraryItems } from '../../shared/designLibrary.js';
import { brandPalette } from '../../shared/designContent.js';
import { DESIGN_FONT_PAIRS } from '../../shared/designTemplates.js';
import { addTextPreset } from './content.js';
import { FontSelect } from '../editor/Inspector.jsx';
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
  ]}/></>;
}
export function TextPanel({ query = '' }) {
  return <><div class="dz-text-presets">{['title','subtitle','badge'].map(kind=><Button key={kind} onClick={()=>addTextPreset(kind)}>Add {kind[0].toUpperCase()+kind.slice(1)}</Button>)}</div><StylesPanel query={query} extraSections={[{id:'font-pairs',title:'Font Pairs',items:filterLibraryItems(fontPairs(),query),render:pair=><AppearanceCard key={pair.id} pair={pair} user={!DESIGN_FONT_PAIRS.some(p=>p.id===pair.id)}/>}]} /></>;
}
export function BrandPanel({ query = '' }) {
  const logo = brandLogo.value, colors = brandColors(),fonts=prefs.value.designBrandFonts||{},palette=brandPalette(colors), [color, setColor] = useState('#ffd60a');
  const items = filterLibraryItems(colors.map(hex => ({ id: hex, name: hex })), query);
  return <><LibrarySections query={query} sections={[
    { id: 'logo', title: 'Logo', items: filterLibraryItems(logo ? [{ id: 'logo', name: logo.name }] : [], query), actions: <IconButton icon={Upload} title={logo ? 'Replace Logo' : 'Choose Logo'} onClick={() => chooseBrandLogo().catch(err => toast(err.message, { kind: 'error' }))}/>, empty: 'Choose a logo to reuse in your designs.', render: item => <ImageCard key={item.id} item={item} source={{ path: logo.path, name: logo.name }} prefix="brand"/> },
    { id: 'colors', title: 'Brand Colors', items, empty: 'Save up to 20 colors to reuse in Design.', render: item => <ColorCard key={item.id} color={item.id}/> },
    {id:'brand-palette',title:'Brand Palette',items:palette?filterLibraryItems([palette],query):[],empty:'Save brand colors to make a palette.',render:item=><AppearanceCard key={item.id} palette={item}/>},
  ]}/><h3 class="dz-brand-fonts-title">Brand Fonts</h3><Row label="Title"><FontSelect value={fonts.title||'sans'} onChange={title=>setPrefs({designBrandFonts:{...fonts,title}})}/></Row><Row label="Body"><FontSelect value={fonts.body||'sans'} onChange={body=>setPrefs({designBrandFonts:{...fonts,body}})}/></Row><Row label="New color"><input aria-label="New brand color" type="color" value={color} onInput={e => setColor(e.currentTarget.value)}/><Button class="small" onClick={() => saveBrandColor(color)}>Save Color</Button></Row></>;
}

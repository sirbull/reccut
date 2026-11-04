import { useState } from 'preact/hooks';
import { ChevronDown, Plus, Upload } from 'lucide-preact';
import { project } from '../editor/store.js';
import { prefs, setPrefs } from '../prefs.js';
import { Button, IconButton, Row, toast } from '../ui.jsx';
import { fileUrl } from '../player.js';
import { filterLibraryItems } from '../../shared/designLibrary.js';
import { BUILTIN_DESIGN_STYLES } from '../../shared/designTemplates.js';
import { currentDesign, addText } from './store.js';
import { LibraryCard, StylesPanel } from './LibraryPanel.jsx';
import { LibrarySections } from './LibrarySection.jsx';
import { chooseImage, chooseOpenImage, openImageFiles, requestPlace } from './assets.js';
import { placeLibraryImage, previewLibraryImage, applyLibraryColor, previewLibraryColor, applyStyle } from './library.js';
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
function ImageCard({ item, source, prefix }) {
  const path = source.path || source.asset?.path || source.media?.streams?.main?.proxy || source.media?.streams?.main?.path || source.media?.path;
  return <LibraryCard id={`${prefix}:${item.id}`} apply={(_, point) => placeLibraryImage(source, point)} preview={() => previewLibraryImage(source)} title={`${item.name}. Double-click or drag to place the image.`}><img src={fileUrl(path)} alt="" draggable={false}/><b>{item.name}</b></LibraryCard>;
}
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
  return <><Button icon={Plus} onClick={() => { if (currentDesign.value) addText(); else applyStyle(BUILTIN_DESIGN_STYLES[1]); }}>Add Text</Button><StylesPanel query={query}/></>;
}
export function BrandPanel({ query = '' }) {
  const logo = brandLogo.value, colors = brandColors(), [color, setColor] = useState('#ffd60a');
  const items = filterLibraryItems(colors.map(hex => ({ id: hex, name: hex })), query);
  return <><LibrarySections query={query} sections={[
    { id: 'logo', title: 'Logo', items: filterLibraryItems(logo ? [{ id: 'logo', name: logo.name }] : [], query), actions: <IconButton icon={Upload} title={logo ? 'Replace Logo' : 'Choose Logo'} onClick={() => chooseBrandLogo().catch(err => toast(err.message, { kind: 'error' }))}/>, empty: 'Choose a logo to reuse in your designs.', render: item => <ImageCard key={item.id} item={item} source={{ path: logo.path, name: logo.name }} prefix="brand"/> },
    { id: 'colors', title: 'Brand Colors', items, empty: 'Save up to 20 colors to reuse in Design.', render: item => <LibraryCard key={item.id} id={`color:${item.id}`} apply={hit => applyLibraryColor(item.id, hit)} preview={() => previewLibraryColor(item.id)} menuItems={[{ id: 'delete', label: 'Remove Color', run: () => setPrefs({ designColors: brandColors().filter(c => c !== item.id) }) }]} title={`${item.name}. Double-click to apply to selected text or shapes, or the background.`}><span class="dz-library-swatch" style={{ background: item.id }}/><b>{item.name}</b></LibraryCard> },
  ]}/><Row label="New color"><input aria-label="New brand color" type="color" value={color} onInput={e => setColor(e.currentTarget.value)}/><Button class="small" onClick={() => saveBrandColor(color)}>Save Color</Button></Row></>;
}

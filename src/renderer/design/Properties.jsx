import { FlipHorizontal, FlipVertical } from 'lucide-preact';
import { FontSelect } from '../editor/Inspector.jsx';
import { Row, Section, NumberField, Slider, Toggle, Select, Segmented, Button, IconButton } from '../ui.jsx';
import { solidFill } from '../../shared/design.js';
import { currentDesign, selection, selectedLayers, changeDesign, changeLayers, currentDesignId, newDesignOpen, beginDesignTransient, updateDesignTransient, endDesignTransient } from './store.js';
import { imageMissing, imageVersion, locateImage } from './assets.js';

export function Properties() {
  const d = currentDesign.value, ids = selection.value;
  imageVersion.value;
  if (!d) return null;
  const layers = selectedLayers(), l = layers[0];
  const patch = (props) => changeLayers((l) => Object.assign(l, props));
  const live = (props) => { const id = currentDesignId.value; updateDesignTransient((p) => { for (const l of p.designs[id]?.layers || []) if (ids.includes(l.id) && !l.locked) Object.assign(l, props); }); };
  const end = () => endDesignTransient();
  const number = (key, label, min = -65536, max = 65536, step = 1, precision = 0) => <Row label={label}><NumberField value={layers.every((a) => a[key] === l[key]) ? l[key] : null} min={min} max={max} step={step} precision={precision} width={90} onStart={beginDesignTransient} onChange={(v) => live({ [key]: v })} onCommit={end} /></Row>;
  if (!l) return <Section title="Design" collapsible={false}>
    {ids.length > 0 && <p class="hint">Unlock a selected layer to edit it.</p>}
    <Row label="Name" stacked><input key={d.id} class="text-input" value={d.name} onFocus={beginDesignTransient} onInput={(e) => { const name = e.currentTarget.value; updateDesignTransient((p) => { p.designs[d.id].name = name; }); }} onBlur={end} /></Row>
    <Row label="Canvas"><span>{d.width} × {d.height}</span><Button class="small" onClick={() => (newDesignOpen.value = { designId: d.id })}>Resize…</Button></Row>
    <Row label="Transparent"><Toggle checked={!d.background} onChange={(v) => changeDesign((d) => { d.background = v ? null : solidFill('#18181b'); })} /></Row>
    {d.background && <Row label="Background"><input type="color" aria-label="Background color" value={d.background.color} onFocus={beginDesignTransient} onInput={(e) => { const color = e.currentTarget.value; updateDesignTransient((p) => { p.designs[d.id].background = solidFill(color); }); }} onChangeCapture={end} onBlur={end} /></Row>}
    <p class="hint">V selects, T adds text and U draws a rectangle. Drag handles to resize or rotate. Space and drag pans the canvas.</p>
  </Section>;
  const text = layers.every((l) => l.type === 'text'), image = layers.every((l) => l.type === 'image'), hasFill = layers.every((l) => l.type !== 'image');
  return <>
    <Section title={layers.length > 1 ? `${layers.length} selected layers` : l.name} collapsible={false}>
      {number('x', 'X')}{number('y', 'Y')}{number('w', 'Width', 1)}{number('h', 'Height', 1)}{number('rotation', 'Rotation', -36000, 36000, 1, 1)}
      <Row label="Flip"><IconButton icon={FlipHorizontal} title="Flip horizontally" active={l.flipX} onClick={() => changeLayers((l) => { l.flipX = !l.flipX; })} /><IconButton icon={FlipVertical} title="Flip vertically" active={l.flipY} onClick={() => changeLayers((l) => { l.flipY = !l.flipY; })} /></Row>
      <Row label="Opacity"><Slider min={0} max={1} value={l.opacity} onStart={beginDesignTransient} onInput={(opacity) => live({ opacity })} onCommit={end} /><span>{Math.round(l.opacity * 100)}%</span></Row>
    </Section>
    {hasFill && <Section title="Fill"><Row label="Enabled"><Toggle checked={Boolean(l.fill)} onChange={(v) => patch({ fill: v ? solidFill() : null })} /></Row>{l.fill && <Row label="Color"><input type="color" aria-label="Fill color" value={l.fill.color} onFocus={beginDesignTransient} onInput={(e) => live({ fill: solidFill(e.currentTarget.value) })} onChangeCapture={end} onBlur={end} /></Row>}</Section>}
    {text && <Section title="Text">
      <Row label="Content" stacked><textarea class="text-input" value={l.text} rows={3} onFocus={beginDesignTransient} onInput={(e) => live({ text: e.currentTarget.value })} onBlur={end} /></Row>
      <Row label="Font" stacked><FontSelect value={l.font} onChange={(font) => patch({ font })} /></Row>
      <Row label="Weight"><Select value={String(l.weight)} options={[100,200,300,400,500,600,700,800,900].map((v) => ({ value: String(v), label: String(v) }))} onChange={(v) => patch({ weight: Number(v) })} /></Row>
      {number('size', 'Size', 6, 4096)}{number('lineHeight', 'Line height', 0.5, 5, 0.05, 2)}
      <Row label="Align"><Segmented value={l.align} options={['left','center','right'].map((value) => ({ value, label: value }))} onChange={(align) => patch({ align })} /></Row>
      <Row label="Vertical"><Select value={l.valign} options={['top','middle','bottom'].map((value) => ({ value, label: value }))} onChange={(valign) => patch({ valign })} /></Row>
      <Row label="Uppercase"><Toggle checked={l.uppercase} onChange={(uppercase) => patch({ uppercase })} /></Row>
      <Row label="Fit text in box"><Toggle checked={l.autofit} onChange={(autofit) => patch({ autofit })} /></Row>
    </Section>}
    {image && <Section title="Image"><Row label="Fit"><Select value={l.fit} options={['cover','contain','stretch'].map((value) => ({ value, label: value }))} onChange={(fit) => patch({ fit })} /></Row><Button onClick={() => patch({ crop: { x: 0, y: 0, w: 1, h: 1 } })}>Reset Crop</Button>{imageMissing(l) && <p class="warn">Missing image. <button class="link" onClick={() => locateImage(l)}>Locate…</button></p>}</Section>}
  </>;
}

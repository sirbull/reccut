import { EXPRESSION_PRESETS, normalizeExpression } from '../../shared/expressions.js';
import { Button, NumberField, Row, Select, Toggle } from '../ui.jsx';
import { beginTransient, commit, endTransient, updateTransient } from './store.js';

export function ExpressionControls({ clip, prop, min, max, scale = 1, baseValue = 0, onClose }) {
  const expression = normalizeExpression(clip.expressions?.[prop]);
  const patch = (values, live = false) => (live ? updateTransient : commit)(q => {
    const c = q.clips[clip.id]; if (!c) return;
    if (typeof c.props[prop] !== 'number' && !c.kf?.[prop]?.length) c.props[prop] = baseValue;
    c.expressions ||= {};
    c.expressions[prop] = normalizeExpression({ ...expression, ...values });
  });
  const choose = preset => {
    if (preset === 'none') { commit(q => { if (q.clips[clip.id]?.expressions) delete q.clips[clip.id].expressions[prop]; }); return; }
    const rotation = preset === 'rotate' && (prop === 'rotation' || prop === 'pattern.rotation');
    const amount = rotation ? 45 : Math.min(20 / scale, (max - min) / scale / 10) * (baseValue >= max / scale ? -1 : 1);
    patch({ preset, amount: expression?.amount ?? amount,
      frequency: expression?.frequency ?? 1, enabled: true,
      min: rotation ? null : min / scale, max: rotation ? null : max / scale });
  };
  const numeric = (key, label, lo, hi, step = .1, factor = 1) => <Row label={label}><NumberField
    value={expression[key] * factor} min={lo} max={hi} step={step} precision={step < 1 ? 2 : 0}
    onStart={beginTransient} onChange={v => patch({ [key]: v / factor }, true)} onCommit={() => endTransient(true)} /></Row>;
  return <div class="expression-controls" style={{padding:'8px',border:'1px solid var(--line-2)',borderRadius:'6px',margin:'4px 0 8px'}}>
    <Row label="Expression"><Select value={expression?.preset || 'none'} options={[{value:'none',label:'None'}, ...EXPRESSION_PRESETS.filter(p=>p.value!=='rotate'||['rotation','pattern.rotation'].includes(prop))]} onChange={choose}/><Button class="small" onClick={onClose}>Done</Button></Row>
    {expression && <>
      <p class="hint">{EXPRESSION_PRESETS.find(p => p.value === expression.preset)?.description} Adds to the value and existing keyframes.</p>
      <Row label="Enabled"><Toggle checked={expression.enabled} onChange={enabled=>patch({enabled})}/></Row>
      {numeric('amount','Amount',-1e6,1e6,.1,scale)}
      {numeric('frequency',['rotate','drift'].includes(expression.preset)?'Speed multiplier':'Cycles / second',0,100,.1)}
      {numeric('phase','Phase (°)',-36000,36000,1)}
      {['wiggle','flicker'].includes(expression.preset)&&numeric('seed','Random Seed',0,99999,1)}
      <Button class="small" onClick={()=>choose('none')}>Remove Expression</Button>
    </>}
  </div>;
}

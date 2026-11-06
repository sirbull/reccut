// Små, gjenbrukbare grensesnittkomponenter i samme stil som resten av appen.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { ChevronDown, X } from 'lucide-preact';
import { FONTS } from '../shared/model.js';

export function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      class={`toggle${checked ? ' on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function Segmented({ value, options, onChange, disabled, size }) {
  return (
    <div class={`segmented${disabled ? ' disabled' : ''}${size ? ` ${size}` : ''}`}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          class={o.value === value ? 'active' : ''}
          title={o.title || (o.icon ? o.label : undefined)}
          onClick={() => onChange(o.value)}
        >
          {o.icon ? <o.icon size={14} /> : null}
          {o.icon && !o.showLabel ? null : o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({ value, options, onChange, disabled, title }) {
  return (
    <select class="select" value={value ?? ''} disabled={disabled} title={title} onChange={(e) => onChange(e.currentTarget.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Fontvelger der hvert valg vises i sin egen skrift, med brukerens tekst som prøve.
// Native <select> kan ikke style valgene på macOS, derfor popover + CSS anchor.
export function FontPicker({ value, options, onChange, sample }) {
  const id = useId(), ref = useRef();
  const [query, setQuery] = useState('');
  const css = (f) => FONTS[f] || `${JSON.stringify(f)}, ${FONTS.sans}`;
  const text = String(sample || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const current = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const pick = (v) => { ref.current.hidePopover(); onChange(v); };
  const onToggle = (e) => {
    if (e.newState !== 'open') return setQuery('');
    ref.current.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'center' });
    ref.current.querySelector('input').focus();
  };
  const onKeyDown = (e) => {
    e.stopPropagation(); // ingen app-snarveier mens menyen er åpen
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && shown[0]) return pick(shown[0].value);
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const items = [...ref.current.querySelectorAll('input, [role=option]')], i = items.indexOf(document.activeElement);
    items[Math.max(0, Math.min(items.length - 1, i + step))]?.focus();
  };
  return (
    <>
      <button type="button" class="select font-picker" popovertarget={id} style={{ anchorName: `--${id}`, fontFamily: css(value) }}>
        {current?.label ?? value}
      </button>
      <div ref={ref} id={id} popover="auto" class="font-picker-list" style={{ positionAnchor: `--${id}` }} onToggle={onToggle} onKeyDown={onKeyDown}>
        <input class="text-input" type="search" aria-label="Search fonts" placeholder="Search fonts" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
        <div role="listbox">
          {shown.map((o) => (
            <button type="button" role="option" key={o.value} aria-selected={o.value === value} onClick={() => pick(o.value)}>
              <span style={{ fontFamily: css(o.value) }}>{text || o.label}</span>
              {text && <small>{o.label}</small>}
            </button>
          ))}
          {!shown.length && <p class="hint">No fonts match “{query}”.</p>}
        </div>
      </div>
    </>
  );
}

export function Row({ label, children, hint, stacked }) {
  return (
    <div class={`row${stacked ? ' stacked' : ''}`}>
      {label != null && <span class="row-label">{label}</span>}
      <div class="row-control">{children}</div>
      {hint && <div class="row-hint">{hint}</div>}
    </div>
  );
}

export function Section({ title, children, actions, open: initialOpen = true, collapsible = true, ...rest }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <section class={`section${open ? '' : ' closed'}`} {...rest}>
      <header class={collapsible ? 'collapsible' : ''} aria-expanded={collapsible ? open : undefined} onClick={() => collapsible && setOpen(!open)}>
        <h3>{title}</h3>
        <div class="section-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
        {collapsible && <ChevronDown class="section-chevron" size={14} />}
      </header>
      {open && <div class="section-body">{children}</div>}
    </section>
  );
}

export function Button({ variant = 'secondary', icon: Icon, children, class: cls = '', ...rest }) {
  return (
    <button type="button" class={`btn ${variant} ${cls}`} {...rest}>
      {Icon && <Icon size={15} />}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, title, active, size = 16, class: cls = '', ...rest }) {
  return (
    <button type="button" class={`icon-btn${active ? ' active' : ''} ${cls}`} title={title} aria-label={title} {...rest}>
      <Icon size={size} />
    </button>
  );
}

// Dra opp/høyre for å øke, ned/venstre for å redusere. Klikk for å skrive.
export function NumberField({ value, onChange, onCommit, onStart, min = -Infinity, max = Infinity, step = 1, precision = 0, unit = '', width = 64, disabled }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const input = useRef(null);
  const drag = useRef(null);
  const clampV = (v) => Math.min(max, Math.max(min, v));
  const display = value == null || Number.isNaN(value) ? '' : Number(value).toFixed(precision);

  useLayoutEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);

  const onPointerDown = (e) => {
    if (editing || disabled || e.button !== 0 || drag.current) return;
    e.preventDefault();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, v: Number(value) || 0, axis: null };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = d.y - e.clientY;
    if (!d.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 3) return;
      // Lås retningen når draget starter, så små sidebevegelser ikke gir hopp.
      d.axis = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
      onStart?.();
    }
    const distance = d.axis === 'y' ? dy : dx;
    const k = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    onChange(clampV(Number((d.v + Math.round(distance / 2) * step * k).toFixed(Math.max(precision, 3)))));
  };
  const finishPointer = (e, allowEdit = false) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(d.id)) e.currentTarget.releasePointerCapture(d.id);
    if (d.axis) onCommit?.();
    else if (allowEdit) {
      setText(display);
      setEditing(true);
    }
  };
  const commitText = () => {
    setEditing(false);
    const v = parseFloat(String(text).replace(',', '.'));
    if (!Number.isNaN(v)) {
      onStart?.();
      onChange(clampV(v));
      onCommit?.();
    }
  };

  if (editing) {
    return (
      <input
        class="num-field editing"
        style={{ width }}
        value={text}
        ref={input}
        onInput={(e) => setText(e.currentTarget.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <div
      class={`num-field${disabled ? ' disabled' : ''}`}
      style={{ width }}
      tabIndex={disabled ? -1 : 0}
      // Med tastaturet (Tab eller hurtigsøket) går feltet rett i skrivemodus.
      onFocus={() => {
        if (disabled || drag.current) return;
        setText(display);
        setEditing(true);
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finishPointer(e, true)}
      onPointerCancel={finishPointer}
      onLostPointerCapture={finishPointer}
    >
      {display}
      {unit && <span class="unit">{unit}</span>}
    </div>
  );
}

export function Slider({ value, min, max, step = 0.01, onInput, onStart, onCommit, disabled, center }) {
  const pct = ((value - min) / (max - min)) * 100;
  const zero = center != null ? ((center - min) / (max - min)) * 100 : 0;
  const lo = Math.min(pct, zero);
  const hi = Math.max(pct, zero);
  return (
    <input
      type="range"
      class="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      style={{ '--lo': `${lo}%`, '--hi': `${hi}%` }}
      onPointerDown={() => onStart?.()}
      onInput={(e) => onInput(Number(e.currentTarget.value))}
      // Native change commits after the last input. preact/compat remaps onChange
      // to input, which would commit before the live edit and lose the undo step.
      onChangeCapture={() => onCommit?.()}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

export function Modal({ title, onClose, children, footer, width = 720, class: cls = '' }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div class="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div class={`modal ${cls}`} role="dialog" aria-modal="true" aria-label={title} style={{ width }} onKeyDown={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          {onClose && <IconButton icon={X} title="Close" onClick={onClose} />}
        </header>
        <div class="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

/* Meldinger nederst i vinduet */

export const toasts = signal([]);
let toastSeq = 1;

export function toast(text, { actions = [], kind = 'info', timeout = 7000 } = {}) {
  const id = toastSeq++;
  toasts.value = [...toasts.value, { id, text, actions, kind }];
  if (timeout) setTimeout(() => dismissToast(id), timeout);
  return id;
}

export function dismissToast(id) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

export function Toasts() {
  return (
    <div class="toasts">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast ${t.kind}`}>
          <span>{t.text}</span>
          {t.actions.map((a) => (
            <button
              key={a.label}
              class={`btn ${a.primary ? 'primary' : 'secondary'} small`}
              onClick={() => {
                a.onClick();
                dismissToast(t.id);
              }}
            >
              {a.label}
            </button>
          ))}
          <IconButton icon={X} title="Close" size={14} onClick={() => dismissToast(t.id)} />
        </div>
      ))}
    </div>
  );
}

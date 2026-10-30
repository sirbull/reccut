// Små, gjenbrukbare grensesnittkomponenter i samme stil som resten av appen.
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { X } from 'lucide-preact';

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

export function Row({ label, children, hint, stacked }) {
  return (
    <div class={`row${stacked ? ' stacked' : ''}`}>
      {label != null && <span class="row-label">{label}</span>}
      <div class="row-control">{children}</div>
      {hint && <div class="row-hint">{hint}</div>}
    </div>
  );
}

export function Section({ title, children, actions, open: initialOpen = true, collapsible = true }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <section class={`section${open ? '' : ' closed'}`}>
      <header onClick={() => collapsible && setOpen(!open)}>
        <h3>{title}</h3>
        <div class="section-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
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

// Tallfelt som kan dras sidelengs for å endre verdien, som i Final Cut Pro.
export function NumberField({ value, onChange, onCommit, onStart, min = -Infinity, max = Infinity, step = 1, precision = 0, unit = '', width = 64, disabled }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const drag = useRef(null);
  const clampV = (v) => Math.min(max, Math.max(min, v));
  const display = value == null || Number.isNaN(value) ? '' : Number(value).toFixed(precision);

  const onPointerDown = (e) => {
    if (editing || disabled) return;
    e.preventDefault();
    drag.current = { x: e.clientX, v: Number(value) || 0, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 3) return;
    if (!d.moved) onStart?.();
    d.moved = true;
    const k = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    onChange(clampV(Number((d.v + Math.round(dx / 2) * step * k).toFixed(Math.max(precision, 3)))));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) onCommit?.();
    else {
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
        ref={(el) => el && setTimeout(() => el.select(), 0)}
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
    <div class={`num-field${disabled ? ' disabled' : ''}`} style={{ width }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
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
      onChange={() => onCommit?.()}
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
      <div class={`modal ${cls}`} style={{ width }} onKeyDown={(e) => e.stopPropagation()}>
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

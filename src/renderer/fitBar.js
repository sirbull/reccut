// En verktøylinje som krymper trinnvis når den er for smal: klassene c1, c2 … legges på én etter én
// til innholdet får plass. CSS-en bestemmer hva hvert trinn skjuler, så ingenting overlapper.
import { useLayoutEffect, useRef } from 'preact/hooks';

export function fitBar(el, folds) {
  for (let i = 1; i <= folds; i++) el.classList.remove(`c${i}`);
  for (let i = 1; i <= folds && el.scrollWidth > el.clientWidth + 1; i++) el.classList.add(`c${i}`);
}

export function useFitBar(folds) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const fit = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => fitBar(el, folds)); };
    fitBar(el, folds);
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const mo = new MutationObserver(fit);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { cancelAnimationFrame(frame); ro.disconnect(); mo.disconnect(); };
  }, []);
  return ref;
}

import { signal } from '@preact/signals';

// DataTransfer payloads cannot be read during dragover. Keep our own payload
// until dragend, including drags cancelled outside the timeline.
export const libraryDrag = signal(null);
let dragImage = null;
export function endLibraryDrag() {
  libraryDrag.value = null;
  dragImage?.remove();
  dragImage = null;
}
export function startLibraryDrag(e, item) {
  endLibraryDrag();
  const label = e.currentTarget.querySelector(':scope > span:last-child')?.textContent || item.id;
  const payload = { ...item, label };
  e.dataTransfer.setData('application/x-reccut', JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
  libraryDrag.value = payload;
  if (['transition', 'effect', 'afx', 'apreset', 'frameFx', 'redact'].includes(item.kind)) {
    dragImage = document.createElement('div');
    dragImage.className = `library-drag-preview${item.kind === 'transition' ? ' transition' : ''}`;
    const icon = document.createElement('span');
    icon.className = 'library-drag-icon';
    icon.textContent = item.kind === 'transition' ? '⋈' : '✦';
    dragImage.append(icon, document.createTextNode(label));
    dragImage.style.left = `${Math.max(0, Math.min(e.clientX || 0, window.innerWidth - 200))}px`;
    dragImage.style.top = `${Math.max(0, Math.min(e.clientY || 0, window.innerHeight - 50))}px`;
    document.body.append(dragImage);
    e.dataTransfer.setDragImage(dragImage, 18, 22);
    // Chromium captures the drag image after dragstart. Keep it in the viewport
    // for that capture, then remove the source box while the native image moves.
    const captured = dragImage;
    setTimeout(() => captured.remove(), 0);
  }
  document.addEventListener('dragend', endLibraryDrag, { once: true });
}

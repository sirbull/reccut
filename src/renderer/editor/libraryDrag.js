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
  const label = item.label || e.currentTarget.querySelector(':scope > span:last-child')?.textContent || item.id;
  const payload = { ...item, label };
  e.dataTransfer.setData('application/x-reccut', JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
  libraryDrag.value = payload;
  if (['transition', 'effect', 'afx', 'apreset', 'frameFx', 'redact', 'adjustment'].includes(item.kind)) {
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
  } else if (item.kind === 'media') {
    // A small native icon follows the pointer in the browser. Over the timeline,
    // a separate filmstrip follows it without changing the native copy badge.
    dragImage = document.createElement('div');
    dragImage.className = 'library-media-drag-icon';
    const shape = item.mediaKind === 'audio'
      ? '<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>'
      : '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>';
    dragImage.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${shape}</svg>`;
    dragImage.style.left = `${Math.max(0, Math.min(e.clientX || 0, window.innerWidth - 28))}px`;
    dragImage.style.top = `${Math.max(0, Math.min(e.clientY || 0, window.innerHeight - 28))}px`;
    document.body.append(dragImage);
    e.dataTransfer.setDragImage(dragImage, 12, 12);
    const captured = dragImage;
    setTimeout(() => captured.remove(), 0);
  }
  document.addEventListener('dragend', endLibraryDrag, { once: true });
}

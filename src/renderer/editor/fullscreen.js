import { toast } from '../ui.jsx';
import { setPrefs } from '../prefs.js';

// Knappen, dobbeltklikk og menyen bruker samme fullskjermbryter.
export async function toggleViewerFullscreen(viewer = document.querySelector('.viewer')) {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (viewer) {
      if (viewer.classList.contains('external-preview-only')) {
        setPrefs({ externalPreviewShowLocal: true });
        await new Promise(requestAnimationFrame);
      }
      await viewer.requestFullscreen();
    }
  } catch (err) {
    toast(`Could not change preview full screen: ${err.message}`, { kind: 'error' });
  }
}

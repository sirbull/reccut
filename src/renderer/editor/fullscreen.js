import { toast } from '../ui.jsx';

// Knappen, dobbeltklikk og menyen bruker samme fullskjermbryter.
export async function toggleViewerFullscreen(viewer = document.querySelector('.viewer')) {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (viewer) await viewer.requestFullscreen();
  } catch (err) {
    toast(`Could not change preview full screen: ${err.message}`, { kind: 'error' });
  }
}

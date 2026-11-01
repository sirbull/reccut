// Native file drops fall back to media import anywhere in the main window.
// Local targets (timeline, import dialog and batch export) keep their own behavior.
export const hasFiles = (dt) => Array.from(dt?.types || []).includes('Files');

export function droppedPaths(dt, pathForFile) {
  return [...new Set(Array.from(dt?.files || []).flatMap((file) => {
    try {
      const path = pathForFile(file);
      return path ? [path] : [];
    } catch {
      return [];
    }
  }))];
}

export function installFileDrop(target, { pathForFile, onFiles, onHover, onError }) {
  let depth = 0;
  const reset = () => { depth = 0; onHover(false); };
  const enter = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    depth++;
    onHover(true);
  };
  const over = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault(); // Also prevents Chromium from navigating to dropped files.
    e.dataTransfer.dropEffect = 'copy';
    onHover(true);
  };
  const leave = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) onHover(false);
  };
  const drop = (e) => {
    if (!hasFiles(e.dataTransfer) || e.defaultPrevented) return;
    e.preventDefault();
    // Read the File objects synchronously; the drag data store closes after dispatch.
    const paths = droppedPaths(e.dataTransfer, pathForFile);
    if (!paths.length) return onError(new Error('Could not read the dropped files. Try Import Media instead.'));
    try {
      Promise.resolve(onFiles(paths)).catch(onError);
    } catch (err) {
      onError(err);
    }
  };
  const listeners = [
    ['dragenter', enter, true], ['dragover', over, true], ['dragleave', leave, true],
    ['drop', reset, true], ['drop', drop, false], ['dragend', reset, true], ['blur', reset, false],
  ];
  for (const args of listeners) target.addEventListener(...args);
  return () => {
    for (const args of listeners) target.removeEventListener(...args);
    reset();
  };
}

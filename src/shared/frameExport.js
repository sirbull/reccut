// Still images keep their exact dimensions, including odd sizes, and can retain alpha.
export const FRAME_FORMATS = [
  { id: 'png', label: 'PNG', ext: 'png', mime: 'image/png', alpha: true },
  { id: 'jpeg', label: 'JPEG', ext: 'jpg', mime: 'image/jpeg', alpha: false },
  { id: 'webp', label: 'WebP', ext: 'webp', mime: 'image/webp', alpha: true },
];

export function frameExportSettings(project, { time, width, height, format = 'png', alpha = false }) {
  const fmt = FRAME_FORMATS.find((f) => f.id === format);
  if (!fmt) throw new Error('Choose PNG, JPEG or WebP.');
  if (![width, height].every((n) => Number.isInteger(n) && n >= 1 && n <= 8192)) {
    throw new Error('Width and height must be whole numbers from 1 to 8192 pixels.');
  }
  if (!Number.isFinite(time) || !(project.duration > 0) || !(project.fps > 0)) {
    throw new Error('The timeline is empty. Add some clips first.');
  }
  // At the end of the timeline, export the final frame rather than an empty image.
  const last = Math.max(0, Math.ceil(project.duration * project.fps - 1e-7) - 1);
  const index = Math.min(last, Math.max(0, Math.floor(time * project.fps + 1e-7)));
  return { time: index / project.fps, width, height, format, alpha: Boolean(alpha && fmt.alpha) };
}

export function frameGeometry(project, frame) {
  // Fit the sequence into the chosen size without distorting the picture.
  const scale = Math.min(frame.width / project.width, frame.height / project.height);
  return { w: frame.width, h: frame.height, matrix: [scale, scale, (frame.width - project.width * scale) / 2, (frame.height - project.height * scale) / 2] };
}

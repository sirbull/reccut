// Åpner mikrofon og kamera når den lagrede enhets-ID-en ikke lenger finnes.
// Chromium gir enhetene nye ID-er (særlig på Windows: ny USB-port, driver eller virtuelle innganger som
// RØDE Connect og Voicemeeter som startes på nytt). Da feiler { deviceId: { exact } } med
// OverconstrainedError og tom melding. Vi finner enheten igjen på navnet, ellers brukes systemets standard.

// Finner enheten som var valgt: samme ID, ellers samme navn. null betyr systemets standard.
export function resolveDevice(savedId, savedLabel, list) {
  if (!savedId) return null;
  if (list.some((d) => d.id === savedId)) return savedId;
  const label = String(savedLabel || '').trim();
  if (!label) return null;
  return list.find((d) => d.label === label)?.id ?? null;
}

const MISSING = new Set(['OverconstrainedError', 'NotFoundError']);
export const missingDevice = (err) => MISSING.has(err?.name);

// Lesbar feilmelding. Chromium gir ofte tom melding, og navnet alene sier lite.
export function inputErrorText(err, what = 'the input') {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `Reccut has no access to ${what}. Allow it in the system settings.`;
    case 'NotReadableError':
    case 'AbortError':
      return `Could not open ${what}. Another app may be using it, or the device is turned off. Close the other app and try again.`;
    case 'OverconstrainedError':
    case 'NotFoundError':
      return `Could not find ${what}. Choose another one, or connect it and try again.`;
    default:
      return `Could not open ${what}: ${err?.message || err?.name || 'unknown error'}`;
  }
}

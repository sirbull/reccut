import { useState } from 'preact/hooks';
import { Button, Modal, Segmented } from '../ui.jsx';
import * as engine from './engine.js';

const api = window.api;
const isMac = api.platform === 'darwin';
const isWin = api.platform === 'win32';
const USB_WEBCAM = 'With a cable (Android 14 or later): connect the phone with USB, tap the USB notification on the phone and choose Webcam.';

function steps(phone) {
  if (phone === 'iphone' && isMac) return [
    'Use iOS 16 or later on the iPhone and macOS 13 or later on the Mac, signed in to the same Apple Account.',
    'Turn on Wi-Fi and Bluetooth on both.',
    'On the iPhone, open Settings › General › AirPlay & Continuity and turn on Continuity Camera.',
    'Place the iPhone close to the Mac, steady and in landscape, with the back cameras facing you. Lock its screen.',
    'Optional: a USB cable gives a steadier picture and keeps the phone charged.',
  ];
  if (phone === 'iphone') return [
    `${isWin ? 'Windows' : 'This system'} has no built-in way to use an iPhone as a camera.`,
    'Install a webcam app on both the iPhone and this computer, for example Camo or iVCam, and follow its steps.',
    'The app adds a camera that Reccut can use.',
  ];
  if (isWin) return [
    'Wireless (Windows 11): open Settings › Bluetooth & devices › Mobile devices, turn on access to your mobile devices and link the phone with the Link to Windows app.',
    'Under Manage devices, turn on Use as a connected camera.',
    USB_WEBCAM,
  ];
  return [
    USB_WEBCAM,
    `Wireless: ${isMac ? 'macOS' : 'this system'} has no built-in way. Install a webcam app on both the phone and this computer, for example Camo or DroidCam.`,
  ];
}

// Reccut bruker bare kameraer systemet allerede kjenner. Veiviseren forklarer hvordan telefonen blir et av dem.
export function PhoneCamera({ onClose }) {
  const [phone, setPhone] = useState('iphone');
  const [known] = useState(() => new Set(engine.cameras.value.map((c) => c.id)));
  const found = engine.cameras.value.filter((c) => !known.has(c.id));
  const use = (id) => { engine.chooseCamera(id); onClose(); };
  return <Modal title="Use a Phone as Camera" onClose={onClose} width={520}
    footer={<><Button onClick={() => engine.refreshDevices()}>Look Again</Button><Button variant="primary" onClick={onClose}>Done</Button></>}>
    <Segmented value={phone} onChange={setPhone} options={[{ value: 'iphone', label: 'iPhone' }, { value: 'android', label: 'Android' }]} />
    <ol class="phone-steps">{steps(phone).map((t) => <li key={t}>{t}</li>)}</ol>
    {found.length
      ? found.map((c) => <Button key={c.id} variant="primary" onClick={() => use(c.id)}>Use {c.label}</Button>)
      : <p class="hint" role="status">Waiting for the phone… It appears in the camera list as soon as this computer sees it.</p>}
  </Modal>;
}

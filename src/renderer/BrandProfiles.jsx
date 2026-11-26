// The Brand profile picker, shared by the Brand tab in Edit and the Brand panel in Design.
import { useState } from 'preact/hooks';
import { MoreHorizontal } from 'lucide-preact';
import { Button, IconButton, Modal, Row, Select, Toggle, toast } from './ui.jsx';
import { prefs } from './prefs.js';
import { activeProfileId } from '../shared/brandLibrary.js';
import { createProfile, profileDialog, profileMenu, profiles, renameProfile, switchBrandProfile } from './brandProfiles.js';

export function BrandProfileBar() {
  prefs.value;
  const list = profiles();
  return (
    <div class="brand-profile-bar">
      <Row label="Profile">
        <Select
          value={activeProfileId(prefs.value)}
          options={list.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(id) => switchBrandProfile(id).catch((err) => toast(err.message, { kind: 'error' }))}
        />
        <IconButton icon={MoreHorizontal} title="New, rename, delete, export or import a Brand profile" onClick={profileMenu} />
      </Row>
    </div>
  );
}

export function BrandProfileDialog() {
  const d = profileDialog.value;
  const [name, setName] = useState(d.name || '');
  const [copy, setCopy] = useState(Boolean(d.copy));
  const [busy, setBusy] = useState(false);
  const close = () => { if (!busy) profileDialog.value = null; };
  const ok = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (d.mode === 'rename') renameProfile(d.id, name);
      else await createProfile(name, { copy });
      profileDialog.value = null;
    } catch (err) {
      toast(err.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={d.mode === 'rename' ? 'Rename Brand Profile' : 'New Brand Profile'} width={420} onClose={close} footer={<><Button disabled={busy} onClick={close}>Cancel</Button><Button variant="primary" disabled={!name.trim() || busy} onClick={ok}>{d.mode === 'rename' ? 'Rename' : 'Create'}</Button></>}>
      <Row label="Name" stacked>
        <input class="text-input" autoFocus maxLength={60} value={name} onInput={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
      </Row>
      {d.mode === 'new' && (
        <>
          <Row label="Start from current colors, fonts and logo">
            <Toggle checked={copy} onChange={setCopy} />
          </Row>
          <p class="hint">Each profile has its own titles, lower thirds, effect presets, Design elements, brand colors, fonts and logo. Switch profile in Brand at any time.</p>
        </>
      )}
    </Modal>
  );
}

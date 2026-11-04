import { computed } from '@preact/signals';
import { prefs, setPrefs } from '../prefs.js';
import { designPanel } from '../../shared/designLibrary.js';
import { endLibraryDrag } from './library.js';
export const activeDesignPanel = computed(() => designPanel(prefs.value.designPanel));
export const wideDesignPanel = computed(() => Boolean(prefs.value.designPanelWide));
export function openDesignPanel(panel) { endLibraryDrag(); setPrefs({ designPanel: designPanel(panel) }); }
export function toggleDesignPanel(panel) { openDesignPanel(activeDesignPanel.value === panel ? null : panel); }
export function expandDesignPanel() { setPrefs({ designPanelWide: !wideDesignPanel.value }); }

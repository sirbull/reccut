import { computed, signal } from '@preact/signals';
import { prefs, setPrefs } from '../prefs.js';
import { designPanel } from '../../shared/designLibrary.js';
import { endLibraryDrag } from './library.js';
import { zoom, viewScale, setZoom } from './store.js';
export const PANEL_NARROW = 300, PANEL_WIDE = 560, SIDEBAR_WIDTH = 300;
export const activeDesignPanel = computed(() => designPanel(prefs.value.designPanel));
// Live width while a panel edge is dragged; saved to prefs when the drag ends.
const panelDraft = signal({});
export const designPanelWidth = computed(() => panelDraft.value.designPanelWidth || prefs.value.designPanelWidth || (prefs.value.designPanelWide ? PANEL_WIDE : PANEL_NARROW));
export const designSidebarWidth = computed(() => panelDraft.value.designSidebarWidth || prefs.value.designSidebarWidth || SIDEBAR_WIDTH);
export function setPanelWidth(key, value, save) { panelDraft.value = save ? {} : { [key]: value }; if (save) setPrefs({ [key]: value, designPanelWide: false }); }
export const wideDesignPanel = computed(() => designPanelWidth.value >= 460);
export function openDesignPanel(panel) { endLibraryDrag(); setPrefs({ designPanel: designPanel(panel) }); }
export function toggleDesignPanel(panel) { openDesignPanel(activeDesignPanel.value === panel ? null : panel); }
// Resizing a panel changes the canvas area, never the zoom: "Fit on Screen" turns into the current percentage.
export function keepDesignZoom() { if (zoom.value === 'fit') setZoom(viewScale.value); }
export function expandDesignPanel() { keepDesignZoom(); setPrefs({ designPanelWidth: wideDesignPanel.value ? PANEL_NARROW : PANEL_WIDE, designPanelWide: false }); }

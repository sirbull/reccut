// Om Voiceover Booth er åpen. Egen fil, så menyen kan åpne den uten å laste opptaksmotoren.
import { signal } from '@preact/signals';

export const boothOpen = signal(false);
export const openBooth = () => (boothOpen.value = true);

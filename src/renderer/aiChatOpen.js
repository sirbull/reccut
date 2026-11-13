// Om AI Agent-vinduet er åpent. Egen modul uten avhengigheter, så velkomstvinduet kan åpne det
// uten å dra med seg resten av appen.
import { signal } from '@preact/signals';
export const aiChatOpen = signal(false);

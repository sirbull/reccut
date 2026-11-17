# RecCut Lens Flare Kit

**Start her:** [IMPLEMENTER_I_CLAUDE.md](IMPLEMENTER_I_CLAUDE.md)

Inneholder **36 originalgenererte, transparente RGBA PNG-ressurser**, **8 redigerbare JSON-presets**, en **manifest-fil**, **3 eksempler rendret i 3840×2160**, kontaktsider, Python-generator og kvalitetstester.

Pakken er beregnet for en hybrid lens-flare-effekt: GPU-shaders for storskala glød/streaks, PNG-sprites for ghosts, refleksjonsringer, arcs og dirt. Alle bildefiler er reelle, separate PNG-er; dette er ikke en samling utsnitt av en collage.

## Kjapp start for Claude Code

1. Pakk ut hele zip-filen i prosjektet (eller en midlertidig mappe Claude kan lese).
2. Be Claude lese `IMPLEMENTER_I_CLAUDE.md`, `manifest.json`, minst ett preset og renderer-referansen under `scripts/`.
3. Be Claude kartlegge RecCuts arkitektur og implementere **fase 1** før GUI-utviklingen.
4. Kontroller import, blend og normalisert refleksjonsakse i forhåndsvisning før keyframes og editor.
5. Kjør `python scripts/validate_pack.py`.

**Presets:** `cinematic_warm`, `anamorphic_blue`, `sci_fi_violet`, `golden_sunset`, `prism_rainbow`, `vintage_35mm`, `flashlight_white`, `concert_cyan`.

**Forhåndsvisning:** `previews/presets_overview.jpg` og `previews/asset_contact_sheet.jpg`.

**Avhengigheter for utvikler-skriptene (ikke for RecCut):** `numpy`, `Pillow`, `scipy`.

Alle PNG-ene er programmatisk generert. Ingen eksterne tredjepartsbilder er brukt. Se implementeringsdokumentet for tekniske forbehold.

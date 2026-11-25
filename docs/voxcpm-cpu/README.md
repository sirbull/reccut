# VoxCPM2 CPU-målinger (fase 9)

Rådata: [2026-11-24-github-runners-avx2.json](2026-11-24-github-runners-avx2.json).

## 24. november 2026: GitHub-maskiner, `avx2`-motoren

- Benchmark-kjøring `45410757984`, med motorene fra bygg `45407673562` (Reccut `c50a05d`, upstream `d30f00f`).
- `--cpu`, ingen `--threads` (ggml-standard: 4 tråder), `--runs 3 --warm 5`, 97 jobber per plattform.
- Maskin: AMD EPYC 7763, 4 vCPU, 16 GB RAM. Windows Server 2025 (2 fysiske kjerner, High performance) og Ubuntu 26.04.
- Modellstien hadde mellomrom, `æøå` og `Ω`. Windows-motoren fant modellene, og det UTF-8-manifestet virker.

| Kriterium (foreslått) | Mål | Windows | Linux |
|---|---|---|---|
| Varm sanntidsfaktor | median ≤ 3, p95 ≤ 5 | **11,4 / 12,7 — ikke bestått** | **13,1 / 20,2 — ikke bestått** |
| Oppstart | klar ≤ 60 s, første korte WAV ≤ 90 s | 2,0 s / 26,3 s — bestått | 1,9 s / 29,2 s — bestått |
| Minne (motorprosessen) | ≤ 8 GiB | 5,6 GiB — bestått | 5,8 GiB — bestått |
| Avbryt | lukket og ryddet ≤ 2 s | 0,13 s — bestått | 0,30 s — bestått |
| Stabilitet | ≥ 10 jobber, stemmebytte, ren jobb etter avbryt | bestått | bestått |

Varm sanntidsfaktor per tilfelle (median): Windows: kort en 11,5, kort nb 12,6, middels en 8,2,
middels nb 8,3. Linux: kort en 18,8, kort nb 19,7, middels en 12,7, middels nb 13,0. Korte setninger
er tregest fordi faste kostnader per jobb blir en større andel.

Samme manus ga identisk lyd ved gjentakelse og etter stemmebytte (`switchBackIdentical`,
`firstJobMatchesWarm`), så motoren er deterministisk og stabil på begge plattformene.

### Vurdering

Motoren virker riktig på Windows og Linux, men den er for treg på denne maskinen: ett minutt tale
tar 8 til 20 minutter. **Ingen plattform slås på.**

- `baseline` (bare SSE2) er ubrukelig: sanntidsfaktor rundt 200 (se planen).
- GitHub-maskinen er svakere enn en vanlig utvikler-PC (2 fysiske kjerner på Windows), og motoren
  brukte ggml sine 4 standardtråder. En måling på en moderne PC med `--threads` lik antall fysiske
  kjerner gjenstår, men en faktor 3–4 raskere trengs for å nå målet.
- Mulige veier videre: GPU-støtte (Vulkan) på Windows/Linux, mindre presise vekter for den akustiske
  modellen (nå F16), eller en tregere «lag i bakgrunnen»-modus med ærlig tidsanslag og egne kriterier.

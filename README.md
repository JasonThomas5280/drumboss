# DrumBoss 🥁

**Make beats in seconds.** A pocket drum machine and loop studio that runs entirely in your mobile browser — no app store, no account, no samples to download.

**▶ Play it: https://jasonthomas5280.github.io/drumboss/**

## Why it's fun

- **Opens playing-ready** — a starter groove is loaded; the first tap makes sound.
- **🎲 The Dice** — one tap rolls a fresh, genre-aware groove that always lands. Hold it to re-roll only the hats and percs while keeping your foundation.
- **Sounds pro by default** — a hidden master bus (kick-keyed sidechain, glue compression, soft clipper) plus per-hit humanization make even random taps sound produced.
- **Four kits, four moods** — Trap, Boom Bap, House, Lo-Fi. Swapping kits re-themes the whole app and hot-swaps sounds *while the loop plays*. Hold a track name to borrow a single sound from another kit.
- **Deep when you want it** — hold any step for velocity, pitch (808 basslines!), rolls, and micro-timing nudge. Chain patterns A–D into a song. Perform mode gives you finger-drumming pads with note-repeat and quantized punch-in recording.
- **Beats travel as links** — the whole beat is compressed into the URL. Whoever opens it hears it instantly and can remix it. Or export a `.wav`.
- **✦ The Daily Seed** — everyone gets the same groove canvas each day, derived from the date. No server involved.

## Tech

- Vite + React + TypeScript PWA; zustand for state; zero UI framework.
- Raw Web Audio API with a lookahead scheduler ("A Tale of Two Clocks") for drum-machine-tight timing on mobile.
- **Every sound is synthesized at load time** with `OfflineAudioContext` — no sample downloads, the whole app is ~65 KB gzipped.
- Share links carry a sparse packed pattern compressed with lz-string in the hash fragment.

## Develop

```bash
npm install
npm run dev        # local dev server
npm test           # vitest: groove determinism, share-link codec
npm run build      # typecheck + production build
node scripts/smoke.mjs   # headless-Chromium end-to-end smoke test
```

Deploys to GitHub Pages automatically on push to `main` (`.github/workflows/deploy.yml`).

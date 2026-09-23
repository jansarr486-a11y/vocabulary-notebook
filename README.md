# 📓 Vocabulary Notebook

An offline-first, installable **PWA** for a private English tutor's students
(ages 8–18, levels A1–B2, plus IELTS/TOEFL tracks).

**Zero backend. Zero cost. Zero cloud.** All data lives exclusively in the
student's own browser (IndexedDB) — nothing ever leaves the device except one
optional, clearly-marked dictionary lookup.

## Features

- **Local profiles** — multiple students per device, optional 4-digit PIN
  (salted SHA-256 "kid-lock"), profile switcher on launch, backup restore at
  the gate.
- **Four progressive sections per word** — dictionary definition → dictionary
  example → student's own sentence (active recall, no suggestions) → optional
  note/mnemonic/synonyms. Sections unlock N days after the previous one is
  completed (intervals configurable in Settings; unlock dates are stored per
  word, so later interval changes never reshuffle existing words).
- **Today dashboard** — every due/overdue section across all words, sorted
  most-overdue-first, with red/yellow/green colour coding, streak counter and
  daily-goal progress bar.
- **Flashcard review** — completed words resurface as flip cards; Easy/Hard
  ratings feed a light weighting so tricky words come back sooner.
- **Dictionary auto-suggest** — one tap pulls a definition/example from the
  free dictionaryapi.dev API; results are cached in IndexedDB so they keep
  working offline after the first fetch. Fails gracefully; the app is fully
  usable without it.
- **Pronunciation** — speaker icon on every word via the browser's built-in
  Web Speech API (no paid TTS).
- **Images** — optional per-word picture, downscaled client-side and stored as
  a Blob in IndexedDB.
- **Exports (all client-side)** — styled PDF notebook (cover page +
  alphabetical word cards), full JSON backup for device migration, single
  word-card PNG for sharing, and a compact progress summary the student can
  paste to their tutor.
- **Sample pack** — 8 demo words across levels/stages, loadable from Settings.

## Tech

Vite + React 18 + TypeScript · Dexie 4 (IndexedDB) · vite-plugin-pwa
(Workbox, autoUpdate) · jsPDF (lazy-loaded) · html-to-image (lazy-loaded) ·
HashRouter · self-hosted Caveat + Nunito fonts · Vitest.

No server, no API routes, no accounts, no tracking.

## Run it

```bash
npm install
npm run dev        # development
npm run build      # typecheck + production build (dist/)
npm run preview    # serve the production build
npm test           # unit tests (scheduling engine)
npm run icons      # regenerate PWA icons
```

Deploy the `dist/` folder to any static host. Everything (app shell, fonts,
icons, logic) is precached by the service worker on first load; after that the
app works fully offline, including reloads.

> Install it via the browser's "Install app" / "Add to Home Screen" button.
> Data stays on that device — use Settings → Full JSON backup to move a
> notebook between devices.

## Extending

Every record carries `schemaVersion` and the Dexie upgrade chain starts at
`version(1)`, so future modules (reading/listening practice for IELTS/TOEFL)
can add new tables and routes without touching the existing vocabulary data.

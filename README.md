# 📓 Vocabulary Notebook

An offline-first, installable **PWA** for a private English tutor's students
(ages 8–18, levels A1–B2, plus IELTS/TOEFL tracks).

**Zero backend. Zero cost. Zero cloud.** All data lives exclusively in the
student's own browser (IndexedDB) — nothing ever leaves the device except one
optional, clearly-marked dictionary lookup.

**Live app:** https://jansarr486-a11y.github.io/vocabulary-notebook/
(open in Chrome/Edge → install icon in the address bar → works offline forever)

## Features

- **Local profiles** — multiple students per device, optional 4-digit PIN
  (salted SHA-256 "kid-lock"), profile switcher on launch, backup restore at
  the gate.
- **Four progressive sections per word** — dictionary definition → dictionary
  example → student's own sentence (active recall, no suggestions) → optional
  note/mnemonic/synonyms. Sections unlock N days after the previous one is
  completed (intervals configurable in Settings; unlock dates are stored per
  word, so later interval changes never reshuffle existing words).
- **Word Library** — a curated, read-only word bank the tutor maintains by
  editing one static data file (`src/features/library/libraryData.ts`).
  Collections group one or many books (e.g. Barron's IELTS Essential Words, or
  the ایران‌آمریکا series with Ran/Elementary/Intermediate/Advance). Browsing
  needs no network; words are copied into the student's notebook with their
  definition pre-filled, the student's own sentence left empty, and a source
  tag (collection + book) for later reference. Duplicate adds are blocked by
  case-insensitive matching, and multi-select lets a student grab several
  words at once.
- **Today dashboard** — every due/overdue section across all words, sorted
  most-overdue-first, with red/yellow/green colour coding, streak counter and
  daily-goal progress bar.
- **Flashcard review** — completed words resurface as flip cards; Easy/Hard
  ratings feed a light weighting so tricky words come back sooner.
- **Dictionary auto-suggest** — one tap pulls a definition/example from the
  free dictionaryapi.dev API; results are cached in IndexedDB so they keep
  working offline after the first fetch. Fails gracefully; the app is fully
  usable without it.
- **Persian meanings** — every word (hand-added or Library-sourced) can carry
  an optional Persian translation, shown as a small subtitle under the
  definition on cards, tiles and flashcards.
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

Tutors extend the **Word Library** purely in `src/features/library/libraryData.ts`:

- add a word → append it to a book's `words` array;
- add a book → append it to a collection's `books` (give it a `level`);
- add a standalone collection → append a top-level entry with one book
  (single-book collections open straight into the word list).

No code changes are needed — the UI, counts and navigation derive from the
data, and guard-rail unit tests in `libraryData.test.ts` catch typos like
duplicate ids or missing definitions.

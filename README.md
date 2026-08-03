# LIFE OS

Persoonlijke alles-in-één app van Bink: vriezervoorraad & 16-dagen-kookrondes, sport, evidence-based leren, taken, geld en Google Agenda.

**Kern:** `index.html` — vanilla HTML/CSS/JS, geen build tools, geen dependencies. Daarnaast alleen statische assets: `apple-touch-icon.png` + `icon-192/512.png` (iOS accepteert géén SVG/data-URL als beginscherm-icoon) en `manifest.webmanifest` (voor Android/Chrome-installatie). Data staat lokaal in `localStorage` (key `lifeos_v1`), met optionele Supabase-sync tussen apparaten.

Alle technische keuzes en het onderzoek erachter (platform, sync, toegankelijkheid, leerwetenschap, voedselveiligheid) staan met bronnen in **[DECISIONS.md](DECISIONS.md)**.

## Gebruiken

- **Desktop (Windows/Linux):** `index.html` openen in een browser — werkt direct, ook offline.
- **Online zetten (nodig voor iPhone/iPad en de agenda-embed):** sleep de **hele map** (index.html + iconen + manifest) naar [Netlify Drop](https://app.netlify.com/drop) (gratis, 2 minuten) of gebruik GitHub Pages.
- **iPhone/iPad:** open de URL in Safari → deel-knop → **"Zet op beginscherm"** → voelt als een app.
- **Supabase-sync (optioneel):** maak een gratis project op supabase.com, plak het SQL-blok uit *Instellingen → Supabase-sync* in de SQL-editor, en vul Project-URL + anon key in bij Instellingen.
- **Google Agenda:** plak de embed-`src`-URL bij Instellingen (Google Agenda → Instellingen → Agenda integreren → embed-code).

**Backup:** *Instellingen → Exporteer JSON* — wekelijks even doen.

## Tests

```bash
npm install
npm test
```

Playwright (Chromium), 19 tests: alle tabs zonder console-errors, taak/training toevoegen, porties, overhoormodus, persistentie na herladen, file://-fallback van de agenda, datumlogica (getrapte spacing-regel, kookrotatie, achterstallig-detectie, fout-antwoord-interval, review-cap vóór tentamen), native-dialog-flows, undo-toast, formulier-validatie, avondeten-regel ("nooit twee dagen hetzelfde"), Google-Calendar-linkformaat met tijdzone, klikdoel-groottes, aanwezigheid en geldigheid van iconen/manifest, en screenshots op 390×844 en 1280×800.

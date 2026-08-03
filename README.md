# LIFE OS

Persoonlijke alles-in-één app van Bink: componenten-kookboek met geverifieerde voedingswaarden en maaltijdlog, vriezervoorraad & 16-dagen-kookrondes, sport met gewicht- en eiwittracker, evidence-based leren, taken, geld en Google Agenda.

**Eten** = kookboek (bereidingen × sauzen × koolhydraten, vrij te mixen + kruidenmixen om te batchen), maaltijdlog met dagtotalen tegen je eiwit-/caloriedoel, en het 16-dagen vriezersysteem. **Sport** = trainingslog, dagelijkse wegingen met 7-daags trendgemiddelde, en doelen op basis van Morton 2018 (eiwit) en Mifflin-St Jeor (kcal).

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

Playwright (Chromium), 24 tests: alle tabs zonder console-errors, taak/training toevoegen, porties (incl. automatische maaltijdlog), overhoormodus, persistentie na herladen, file://-fallback van de agenda, datumlogica (getrapte spacing-regel, kookrotatie, achterstallig-detectie, fout-antwoord-interval, review-cap vóór tentamen), kookboek (zoeken, filteren, receptdialog, macro-logging in dagtotalen), eigen recepten, gewichtslog met upsert + eiwitdoel, 7-daags trendgemiddelde, native-dialog-flows, undo-toast, formulier-validatie, avondeten-regel, Google-Calendar-linkformaat met tijdzone, klikdoel-groottes, iconen/manifest, en screenshots op 390×844 en 1280×800.

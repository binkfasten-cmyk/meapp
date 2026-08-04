# LIFE OS

Persoonlijke alles-in-één app van Bink: componenten-kookboek met geverifieerde voedingswaarden en maaltijdlog, vriezervoorraad & 16-dagen-kookrondes, sport met gewicht- en eiwittracker, evidence-based leren, taken, geld en Google Agenda.

**Eten** = je eigen kookboek (begint leeg — je vult zelf bereidingen, sauzen, koolhydraten, complete gerechten en kruidenmixen in, met macro's per portie en bewerken achteraf), maaltijdlog met dagtotalen tegen je eiwit-/caloriedoel, en de **kookronde-planner**: kies per 16-daagse ronde 4 gerechten — compleet of zelf gemixt uit je componenten — en de app genereert automatisch de boodschappenlijst (met écht opgetelde hoeveelheden) én het kookdag-draaiboek (langste suddertijd eerst, koolhydraten vers op de eetdag). Gekookte gerechten staan als voorraad in de vriezer en zijn met één tik als maaltijd te loggen, mét de opgetelde macro's van de mix. **Sport** = trainingslog, dagelijkse wegingen met 7-daags trendgemiddelde, en doelen op basis van Morton 2018 (eiwit) en Mifflin-St Jeor (kcal).

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

Playwright (Chromium), 28 tests: alle tabs zonder console-errors, taak/training toevoegen, porties (incl. automatische maaltijdlog), overhoormodus, persistentie na herladen, file://-fallback van de agenda, datumlogica (getrapte spacing-regel, kookrotatie, achterstallig-detectie, fout-antwoord-interval, review-cap vóór tentamen), kookboek (zoeken, filteren, receptdialog, macro-logging in dagtotalen), eigen recepten, gewichtslog met upsert + eiwitdoel, 7-daags trendgemiddelde, native-dialog-flows, undo-toast, formulier-validatie, avondeten-regel, Google-Calendar-linkformaat met tijdzone, klikdoel-groottes, iconen/manifest, en screenshots op 390×844 en 1280×800.

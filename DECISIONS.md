# LIFE OS — Onderzoek & technische beslissingen

Dit document legt per onderdeel vast **hoe het werkt**, **welke best practices zijn toegepast** en **waarom**, met bronnen. Het is de verantwoording bij `index.html`.

---

## 1. iOS "Zet op beginscherm" & platform

**Hoe het werkt:** iOS draait een web-app vanaf het beginscherm in een eigen "standalone"-container (los van Safari, met eigen localStorage). Welke metatags gelden, bepaalt Apple; Android/Chrome kijkt naar het web-app-manifest.

**Toegepaste best practices:**
- **Beide** `-capable`-metatags (`mobile-web-app-capable` is de standaard sinds Safari 17.4, maar het weglaten van de `apple-`-variant breekt standalone-gedrag op oudere iOS-versies die nog in omloop zijn — bekend uit o.a. Next.js issue #74524). ([webkit.org/blog/15063](https://webkit.org/blog/15063/webkit-features-in-safari-17-4/))
- `black-translucent`-statusbalk + `viewport-fit=cover` + `env(safe-area-inset-*)`-padding boven én onder, zodat content edge-to-edge kan zonder achter de statusbalk of home-indicator te verdwijnen. ([Apple: Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html))
- **`apple-touch-icon.png` is een echt PNG-bestand** (180×180). iOS accepteert géén SVG en géén data-URL voor dit icoon — dan valt het terug op een pagina-screenshot als beginscherm-icoon. ([mathiasbynens.be/notes/touch-icons](https://mathiasbynens.be/notes/touch-icons))
- **`manifest.webmanifest`** met `display: standalone` + 192/512-iconen: dit is wat Android/Chrome nodig heeft voor een echte app-installatie; iOS negeert het grotendeels en draait op de metatags. Een data-URL-manifest is onbetrouwbaar (CSP, installability-bugs) — daarom een echt bestand. ([web.dev/learn/pwa/web-app-manifest](https://web.dev/learn/pwa/web-app-manifest/))
- **Externe links:** in standalone-modus opent een externe link een in-app-overlay. Met `target="_blank" rel="noopener noreferrer"` blijft de app-state eronder bewaard; zonder `_blank` vervangt de navigatie de app en raak je context kwijt. Alle externe links in de app doen dit. ([firt.dev over iOS-PWA-linkgedrag](https://medium.com/@firt/whats-new-on-ios-12-2-for-progressive-web-apps-75c348f8e945))

## 2. Dataopslag & persistentie

**Hoe het werkt:** alles staat in één JSON-object in `localStorage` (key `lifeos_v1`). Elke mutatie schrijft direct weg; er is geen "opslaan"-knop.

**Toegepaste best practices:**
- **ITP-realiteit:** Safari wist script-writable storage na 7 dagen Safari-gebruik zonder site-interactie — maar **beginscherm-apps zijn hiervan uitgezonderd** (WebKit documenteert dat het eerste-partij-domein van home-screen-apps wordt overgeslagen in de opschoning). Installatie op het beginscherm ís dus de persistentie-strategie op iOS; de kwetsbare kopie is die in de Safari-tab. ([webkit.org/tracking-prevention](https://webkit.org/tracking-prevention/))
- `navigator.storage.persist()` bij het opstarten: beschermt tegen eviction bij opslagdruk (Safari 17+, Chrome, Firefox). Het is géén gegarandeerde ITP-override, maar gratis en zinvol. ([webkit.org/blog/14403](https://webkit.org/blog/14403/updates-to-storage-policy/))
- localStorage-limiet is ~5 MiB; elke schrijfactie zit in try/catch en een `QuotaExceededError` geeft een zichtbare waarschuwing + export-advies in plaats van stil dataverlies. ([MDN: Storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria))
- **Schema-versionering + migratie:** elke load gaat door `migrate()`, die ontbrekende collecties aanvult en seed-gerechten per id merget (nieuwe gerechten komen erbij zonder porties/`lastEaten` van de gebruiker te overschrijven). Geïmporteerde backups en binnenkomende sync-data gaan door dezelfde normalisatie.
- JSON-export/-import als echte backup voor onvervangbare data (aanbevolen wekelijkse gewoonte, staat in de UI).

## 3. Supabase-sync

**Hoe het werkt:** één tabel `lifeos` met een rij per collectie (`id`, `data jsonb`, `updated_at`). De app praat er met pure `fetch` tegen (PostgREST REST-API, geen SDK — houdt het single-file).

**Toegepaste best practices:**
- **Upsert:** `POST /rest/v1/lifeos?on_conflict=id` met `Prefer: resolution=merge-duplicates,return=minimal`. `on_conflict` expliciet (zelf-documenterend), `return=minimal` voor de kleinste response. ([PostgREST: Upsert](https://docs.postgrest.org/en/stable/references/api/tables_views.html#upsert))
- **Debounce + retry:** pushes zijn per collectie gedebounced (600 ms — snel doorklikken wordt één request; ongecontroleerd per-keystroke pushen is de bekendste quota-valkuil). Timeout 10 s via `AbortController`; retry alléén bij netwerkfouten/408/429/5xx (upserts zijn idempotent, dus veilig te herhalen), exponentiële backoff met jitter; 4xx wordt niet herhaald. ([Supabase rate limits](https://supabase.com/docs/guides/auth/rate-limits))
- **Goedkope change-detectie:** PostgREST ondersteunt geen ETag/If-Modified-Since ([PostgREST issue #1176](https://github.com/PostgREST/postgrest/issues/1176)), dus pollt de app een **watermark** (`select=updated_at&order=updated_at.desc&limit=1` — minimale response) en haalt de volledige data alleen op als de server echt nieuwer is. Poll: bij laden, bij `visibilitychange`, bij `online`, en elke 60 s zolang de app zichtbaar is.
- **Conflictstrategie:** last-write-wins per collectie-rij op `updated_at`. Verdedigbaar voor één gebruiker met meerdere apparaten; gedocumenteerde beperkingen: (a) gelijktijdige offline-edits op twee apparaten → de oudste verliest die collectie; (b) de timestamps komen van de client, dus een scheve apparaat­klok kan de verkeerde kant laten winnen. Acceptabel voor v1, opgelost met server-side triggers in v2.
- **Beveiliging eerlijk benoemd:** de anon key is per definitie publiek; met `using (true)`-policy kan iedereen met URL+key lezen/schrijven. In de UI staat die waarschuwing bij de instellingen. **v2-upgradepad** (onderzocht): Supabase Auth zonder SDK — éénmalig een gebruiker aanmaken en dan password-grant via `POST /auth/v1/token?grant_type=password` (~15 regels fetch, geen e-mail-ratelimits), met policy `auth.uid() = user_id`. ([Supabase RLS-gids](https://supabase.com/docs/guides/database/postgres/row-level-security))
- Sync mag de app nooit breken: alle fouten eindigen in het statusbolletje, nooit in een kapotte UI.

## 4. Google Agenda (zonder API)

**Hoe het werkt:** events aanmaken via de officiële template-URL, agenda bekijken via de embed-iframe. Bewust geen Calendar API (OAuth-consent + verificatie is overkill voor persoonlijk gebruik).

**Toegepaste best practices:**
- **Template-links:** `render?action=TEMPLATE&text=…&dates=YYYYMMDDTHHmmss/…&ctz=Europe/Amsterdam`. Floating tijden **met expliciete `ctz`** pinnen het event op Nederlandse wandkloktijd en laten Google de zomertijd-berekening doen; zonder `ctz` interpreteert Google de tijd in de tijdzone van de kijker. Alle waarden door `encodeURIComponent`. ([community-spec add-event-to-calendar-docs](https://github.com/InteractionDesignFoundation/add-event-to-calendar-docs/blob/main/services/google.md))
- **Embed-iframe:** werkt cookie-vrij als de agenda openbaar is; een privé-agenda vereist Google-login in dezelfde browser. **Bekende iOS-valkuil:** in een beginscherm-app blokkeert Apple third-party-cookies in iframes áltijd, waardoor privé-embeds daar falen — de UI legt dat uit en biedt altijd een "Open Google Agenda"-fallback (ook op `file://`). ([Apple dev forums thread 125109](https://developer.apple.com/forums/thread/125109))

## 5. Toegankelijkheid & UI

**Toegepaste best practices (WCAG 2.2 / Apple HIG / ARIA APG / NN-g):**
- **Contrast — twee palet-fouten gevonden en gefixt** (berekend met de WCAG-luminantieformule):
  - Secundaire tekst `#6B7572` op crème haalde 4,42:1 (net onder AA 4,5:1) → gedonkerd naar `#67706D` (4,74:1), visueel vrijwel identiek.
  - Wit op terracotta `#E07A5F` haalde 2,95:1 — faalt zelfs de 3:1-grens voor grote tekst → tekstdragende terracotta (knoppen, badges) gebruikt nu `#AF5F4A` (4,6:1); het originele `#E07A5F` blijft voor decoratieve accenten. ([WCAG contrast-eisen](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html))
- **Klikdoelen:** primaire knoppen ≥44 px, icoonknoppen (±, verwijderen) 44×44, checkboxes 24 px visueel (WCAG 2.2 AA-minimum is 24 px; Apple HIG adviseert 44 pt). ([Understanding SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html))
- **Navigatie-semantiek:** de tab-bar en sidebar zijn `<nav>` met `aria-current="page"` op het actieve item — het ARIA-`tablist`-patroon is bedoeld voor in-page-widgets, niet voor app-navigatie, en zou toetsenbordgebruikers een onverwacht arrow-key-model opdringen. ([ARIA APG Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), [Deque over tab panels](https://www.deque.com/blog/a11y-support-series-part-1-aria-tab-panel-accessibility/))
- **Modals:** native `<dialog>` + `showModal()` (Baseline, >96% support): top-layer, echte focus-trap, Escape-afhandeling en focus-herstel zijn gratis en foutloos — een handgebouwde div-overlay is anno 2026 niet meer te verantwoorden. Light-dismiss via backdrop-klik zelf toegevoegd. ([MDN dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog))
- **Destructieve acties:** losse items verwijderen = direct + **undo-toast** (NN-g: verkies undo boven confirmaties; confirm-dialogen slijten af door overgebruik). Alleen "Reset alles" houdt een expliciete bevestiging — dat is de onomkeerbare bulk-actie waarvoor confirmaties wél bedoeld zijn. ([NN-g: Confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog/))
- **Formulieren:** geen stille no-ops — een leeg verplicht veld krijgt focus, een zichtbare markering én `aria-invalid`. ([WebAIM form validation](https://webaim.org/techniques/formvalidation/))
- **Inklapsecties:** native `<details>/<summary>` (toegankelijk zonder JS, toetsenbord werkt, state wordt door screenreaders aangekondigd); elke summary heeft een betekenisvol label. Open/dicht-status overleeft re-renders via `data-key`.
- **Verder:** `:focus-visible`-ringen, `prefers-reduced-motion`-override, `scroll-padding-bottom` zodat de vaste tab-bar nooit een gefocust element bedekt (WCAG 2.4.11), toast met `role="status"`/`aria-live="polite"`, tab-bar met 5 hoofditems + "Meer"-sheet (HIG/Material: 3-5 bestemmingen).
- **Focus- en scroll-behoud:** de app rendert opnieuw na elke mutatie; daarbij worden actief element, cursorpositie, scrollpositie en open `<details>` hersteld — anders voelt elke aanpassing als een pagina-refresh.

## 6. Leersysteem (wetenschappelijke verantwoording)

Alle parameters zijn tegen de primaire literatuur gecontroleerd; twee dingen kwamen daarbij uit het oorspronkelijke ontwerp als onjuist en zijn gecorrigeerd.

- **Spacing-tussenpoos — getrapt i.p.v. vlak 15%.** Cepeda 2008 laat zien dat de optimale tussenpoos geen vaste fractie is: ~20-40% van de resterende tijd bij korte horizons, dalend naar ~5-10% bij een jaar. De app gebruikt daarom: ≤3 weken → 25%, tot 3 maanden → 15%, daarboven → 8% (min. 1 dag). Een vlakke 15% was te krap voor korte horizons en te ruim voor lange. ([Cepeda et al. 2008, Psychological Science](https://laplab.ucsd.edu/articles/Cepeda%20et%20al%202008_psychsci.pdf))
- **Successive relearning:** 3× correct ophalen als criterium klopt (Rawson, Dunlosky & Sciartelli 2013). **Correctie:** het bekende "68% vs. 26%"-contrast hoort níét bij die studie maar bij een later experiment (gerapporteerd in Rawson & Dunlosky 2022): 3 successen gespreid over sessies vs. 3 op één dag. De teksten in de app zijn daarop aangepast — het punt is dus: sprei je successen. ([Rawson & Dunlosky 2022, PSPI](https://journals.sagepub.com/doi/full/10.1177/09637214221100484))
- **Fout antwoord = kort interval.** Elk serieus spaced-repetition-systeem (SM-2, Anki, FSRS) verkort het interval na een fout; goed en fout dezelfde lange tussenpoos geven is een bekende ontwerpfout. In de app: fout → morgen opnieuw; goed → de vak-tussenpoos. Reviews worden nooit ná de tentamendatum gepland (cap op tentamen − 1 dag).
- **Spacing-momenten 0/40/70/90%:** behouden als praktisch schema, maar zonder optimaliteitsclaim — het bewijs voor "expanding" boven gelijkmatige spreiding is zwak (Karpicke & Roediger 2007 vond zelfs een omkering op een uitgestelde toets; Kang e.a. 2014 vond equivalentie). Wat wél robuust is: vroeg beginnen. Zo staat het nu in de UI. ([Kang et al. 2014](https://link.springer.com/article/10.3758/s13423-014-0636-z))
- **Overhoor-volgorde:** achterstallige items eerst, dan laagste goed-reeks — sluit aan bij het principe dat moeilijke/verlopen items de meeste ophaalwinst opleveren.

## 7. Voedselveiligheid (Voedingscentrum, geverifieerd)

Alle regels in de app zijn tegen voedingscentrum.nl gecontroleerd:
- Binnen 2 uur na koken koelen/invriezen; koelkast (4°C) max 2 dagen; vriezer (−18°C) ±3 maanden (kwaliteitsgrens) — **bevestigd**. ([bewaartips](https://www.voedingscentrum.nl/nl/thema/kopen-koken-bewaren/eten-bewaren/bewaartips-voor-koelkast-vriezer-en-voorraadkast.aspx))
- Ontdooien in koelkast of magnetron, nooit op het aanrecht; ontdooid binnen 24 uur opeten — **bevestigd**.
- Opwarmen "stomend heet, door-en-door"; ≥75°C kerntemperatuur is het onderliggende getal (NVWA/hygiënecode) — **bevestigd**, formulering aangescherpt.
- **Correctie:** de oorspronkelijke regel "nooit opnieuw invriezen zonder eerst te verhitten" suggereerde dat verhitten hernieuwd invriezen goedmaakt. Het officiële standpunt: een ontdooid/opgewarmd **maaltijdrestje nooit opnieuw invriezen** — weggooien. De enige toegestane route is rauwe diepvriesingrediënten die je tot een gerecht doorverhit: dat gerecht mag daarna één keer de vriezer in. De app-tekst is hierop aangepast. ([Voedingscentrum: tweede keer invriezen](https://www.voedingscentrum.nl/nl/service/vraag-en-antwoord/koken-en-bewaren/kun-je-een-maaltijdrestje-tweede-keer-invriezen.aspx))

## 8. Kookboek & voedingswaarden

**Hoe het werkt:** het kookboek is component-gebaseerd — bereidingen (kip/rund/vis/ei/vega), sauzen, koolhydraten, groenten en kruidenmixen die vrij te combineren zijn, plus de 16 vriezergerechten en eigen recepten. Elk gerecht (behalve mixen) heeft macro's per portie; één tik logt het als maaltijd van vandaag.

**Toegepaste best practices:**
- **Voedingswaarden geverifieerd** tegen USDA FoodData Central en NEVO-gebaseerde bronnen (Voedingscentrum, voedingswaardetabel.nl), per ingrediënt met FDC-id of bron gedocumenteerd; per-portie-macro's van seed-recepten zijn daaruit berekend voor de *bereide* toestand (gegaard gewicht wijkt sterk af van rauw — kipfilet: 165 kcal/31 g eiwit per 100 g bereid). ([USDA FDC](https://fdc.nal.usda.gov/), [Voedingscentrum](https://www.voedingscentrum.nl))
- **Nederlandse gehakt-conventie:** NEVO's "rul bereid" rekent het bakvet mee in het gerecht (331 kcal/100 g voor 15%-gehakt) waar USDA's "drained" waarde (218 kcal) het vet weggiet. De app gebruikt de NEVO-stijl, want zo koken Nederlanders — gedocumenteerd zodat het bewust is.
- **Kruidenmixen:** batch-verhoudingen per potje, met geverifieerde houdbaarheid — piek-aroma ±6 maanden, kwaliteitsvenster 1–2 jaar (McCormick zegt 1–2 jaar voor blends; specerijenhandel noemt 4–8 maanden piek), nooit "bedorven" in voedselveiligheidszin. Dosering ~1 el (≈8 g) per 500 g vlees, conform rub-standaard 1 el per pond. ([McCormick](https://www.mccormick.com/blogs/how-to/how-long-do-spices-last), [RawSpiceBar](https://rawspicebar.com/blogs/spices-101/how-long-do-ground-spices-last))
- Vriezerporties loggen automatisch mee in het maaltijdlog (één handeling = voorraad − 1 én macro's geteld). Vriezergerecht-macro's zijn schattingen op receptniveau, gemarkeerd als zodanig.

**Kookronde-planner (vervangt de vaste 4-rondes-rotatie):**
- Je stelt per 16-daagse ronde zelf 4 gerechten samen: een **compleet gerecht** (een van de 16 klassiekers of een eigen recept) óf een **eigen mix** van componenten (eiwitbereiding + saus + koolhydraat + groente). Een mix wordt één gerecht met opgetelde macro's, en is later met één tik als één maaltijd te loggen.
- De **boodschappenlijst wordt gegenereerd** uit de ingrediënten van alle geplande gerechten; identieke regels worden samengevoegd met een aantal ("2× 1 ui"). Bewust géén hoeveelheden-parsing van vrije tekst — samenvoegen op identieke regels is transparant en foutloos; afgevinkte regels blijven staan zolang de regel niet wijzigt.
- Het **kookdag-draaiboek wordt gegenereerd** volgens de logica van het originele systeem: langste suddertijd eerst, richttijden per gerecht (mise en place → gerechten gestaffeld → proeven → portioneren/invriezen), met de echte bereidingsstappen per component. Koolhydraat-componenten worden expliciet uitgesteld naar de eetdag (regel: koolhydraten vers koken).
- Oude data migreert automatisch: vaste gerechten met porties > 0 worden voorraad-items (schema v4).

## 9. Voedings- & gewichtsdoelen (Sport-tab)

Alle parameters komen uit de primaire sportvoedingsliteratuur:
- **Eiwit: default 1,8 g/kg/dag, instelbaar 1,6–2,2.** Morton et al. 2018 (meta-analyse, BJSM): plateau in vetvrije-massawinst bij **1,62 g/kg** (95%-BI 1,03–2,20) — meer dan ~1,6 levert gemiddeld weinig extra op; 2,2 is de bovengrens van de onzekerheid, geen apart "optimum". De AND/DC/ACSM-positie (1,2–2,0 g/kg) dekt expliciet ook adolescente atleten — een postpuberale 17-jarige mag als volwassene gerekend worden. ([Morton 2018](https://pubmed.ncbi.nlm.nih.gov/28698222/), [AND/DC/ACSM 2016](https://pubmed.ncbi.nlm.nih.gov/26891166/))
- **Dagtotaal boven maaltijdverdeling:** ~0,4 g/kg per maaltijd over 4 maaltijden is een nuttige vuistregel (Schoenfeld & Aragon 2018), maar het dagtotaal is de dominante factor — de app toont daarom een dagdoel en geen dwingende maaltijdverdeling. ([Schoenfeld & Aragon 2018](https://pubmed.ncbi.nlm.nih.gov/29497353/))
- **Caloriedoel: Mifflin-St Jeor** (de door de Academy of Nutrition & Dietetics aanbevolen RMR-formule) × 1,5 activiteit (3×/week training); lean bulk = **+300 kcal** (~10–15% surplus; Iraki/Helms 2019 adviseren 10–20%). Richttempo aankomen **0,25–0,5% lichaamsgewicht/week** — de app waarschuwt boven de 0,5%. ([Iraki et al. 2019](https://doi.org/10.3390/sports7070154), [AND over Mifflin-St Jeor](https://www.andeal.org/template.cfm?template=guide_summary&key=621))
- **Tiener-specifiek:** geen agressieve cut — de app biedt alleen "onderhoud" en "lean bulk" en benoemt dat expliciet (lage energiebeschikbaarheid is een gezondheidsrisico; AND/DC/ACSM: ≥30 kcal/kg vetvrije massa). Creatine wordt bewust níét proactief geadviseerd (ISSN-voorwaarden voor minderjarigen: postpuberaal, serieus trainend, onder begeleiding).
- **Wegen: dagelijks, zelfde omstandigheden, 7-daags voortschrijdend gemiddelde.** Dagschommelingen van 1–2% zijn vocht/glycogeen; alle doellogica (trend, waarschuwingen) draait op het gemiddelde, nooit op een losse meting — de methode die o.a. MacroFactor en Helms hanteren. ([MacroFactor methodologie](https://help.macrofactorapp.com/en/articles/21-weight-trend))

## 10. Bewuste beperkingen (v1)

- **Geen service worker/offline-cache voor de gehoste versie** — de data staat lokaal en de app is één bestand, maar de eerste load vereist netwerk. v2-kandidaat, samen met echte push-notificaties.
- **Geen auth op de sync**: zie §3; de UI waarschuwt ervoor en het upgradepad ligt klaar.
- **Geen donker thema**: het design system definieert één vast palet; een donkere variant is een designbeslissing, geen technische, en is bewust uitgesteld.
- **Inline event-handlers** (`onclick=…`): op een statische, persoonlijke pagina zonder CSP is dit een acceptabele, leesbare keuze; bij een eventuele publieke versie met CSP moet dit naar event-delegatie.
- **Client-timestamps als sync-sleutel**: zie §3; v2 lost dit op met een server-side `updated_at`-trigger.

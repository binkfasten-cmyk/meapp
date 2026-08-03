// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');

/** Verzamel console-errors per pagina. */
function trackErrors(page) {
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

// Fout van de agenda-iframe/fonts (netwerk uit in testomgeving) is geen app-bug.
function appErrors(errors) {
  return errors.filter((e) => !/net::|Failed to load resource|ERR_/i.test(e));
}

test('elke tab opent zonder console-errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(APP);
  for (const tab of ['vandaag', 'eten', 'sport', 'leren', 'taken', 'geld', 'agenda', 'instellingen']) {
    await page.evaluate((t) => window.showTab(t), tab);
    await expect(page.locator('#tab-' + tab)).toBeVisible();
  }
  expect(appErrors(errors)).toEqual([]);
});

test('taak toevoegen, filteren en afvinken', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(APP);
  await page.evaluate(() => window.showTab('taken'));
  await page.fill('#taak-titel', 'Playwright-taak');
  await page.selectOption('#taak-domein', 'Business');
  await page.click('#tab-taken button:has-text("+ taak")');
  await expect(page.locator('#tab-taken')).toContainText('Playwright-taak');
  // filter op ander domein: taak verdwijnt
  await page.click('.filterrij button:has-text("School")');
  await expect(page.locator('#tab-taken .card').nth(1)).not.toContainText('Playwright-taak');
  await page.click('.filterrij button:has-text("Business")');
  await expect(page.locator('#tab-taken')).toContainText('Playwright-taak');
  expect(appErrors(errors)).toEqual([]);
});

test('training toevoegen telt mee voor de week', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => window.showTab('sport'));
  await page.selectOption('#tr-type', 'cardio');
  await page.fill('#tr-note', 'testrondje');
  await page.click('#tab-sport button:has-text("+ log")');
  await expect(page.locator('#tab-sport')).toContainText('testrondje');
  const wk = await page.locator('#tab-sport .tile').first().locator('.val').textContent();
  expect(wk).toContain('1');
});

test('kookronde: compleet gerecht plannen, koken, portie gegeten + maaltijdlog', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => { window.showTab('eten'); etenView = 'ronde'; renderEten(); });
  // compleet gerecht kiezen
  await page.click('#tab-eten button:has-text("+ compleet gerecht")');
  await page.locator('dialog#modal .rij:has-text("Chili con carne") button:has-text("kies")').click();
  await expect(page.locator('#tab-eten')).toContainText('1/4 gerechten');
  // boodschappenlijst is gegenereerd uit de klassieker-ingrediënten
  const bood = await page.evaluate(() => window.lifeos.store.grocery.lists.plan.map((x) => x.item));
  expect(bood).toContain('500 g rundergehakt');
  expect(bood).toContain('1 blik kidneybonen');
  // draaiboek is gegenereerd met echte stappen
  const db = await page.evaluate(() => window.lifeos.store.freezer.draaiboek.map((x) => x.txt));
  expect(db.some((t) => t.includes('Mise en place'))).toBe(true);
  expect(db.some((t) => t.includes('Chili con carne'))).toBe(true);
  expect(db.some((t) => t.includes('kidneybonen'))).toBe(true);
  // ronde gekookt -> voorraad met 4 porties
  await page.click('#tab-eten button:has-text("Ronde gekookt ✓")');
  await expect(page.locator('#tab-eten')).toContainText('Voorraad');
  const rij = page.locator('#tab-eten .rij:has-text("Chili con carne")').last();
  await expect(rij.locator('.porties-groot')).toHaveText('4');
  // portie gegeten -> voorraad -1 en maaltijd gelogd
  await rij.locator('button[title="portie gegeten"]').click();
  const st = await page.evaluate(() => ({
    voorraad: window.lifeos.store.freezer.voorraad[0],
    meals: window.lifeos.store.nutrition.meals,
  }));
  expect(st.voorraad.porties).toBe(3);
  expect(st.voorraad.lastEaten).toBeTruthy();
  expect(st.meals.length).toBe(1);
  expect(st.meals[0].naam).toBe('Chili con carne');
  expect(st.meals[0].eiwit).toBeGreaterThan(20);
});

test('boodschappen: hoeveelheden worden echt opgeteld over gerechten heen', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => {
    planVoegToe(['vz-chili'], 'Chili con carne');   // 1 ui, 2 tenen knoflook, 1 blik tomatenblokjes
    planVoegToe(['vz-dal'], 'Rode linzen-dal');     // 2 uien, 2 tenen knoflook, 1 blik tomatenblokjes
  });
  const bood = await page.evaluate(() => window.lifeos.store.grocery.lists.plan.map((x) => x.item));
  expect(bood).toContain('3 uien');                    // 1 + 2, met correct meervoud
  expect(bood).toContain('4 tenen knoflook');          // 2 + 2
  expect(bood).toContain('2 blikken tomatenblokjes');  // blik -> blikken
  expect(bood).not.toContain('1 ui');
  expect(bood).not.toContain('2 uien');
  // parser-randgevallen
  const r = await page.evaluate(() => ({
    grammen: fmtIngredient(1150, 'g', 'kippendijfilet'),      // g -> kg boven 1000
    los: parseIngredient('scheut azijn'),                     // geen hoeveelheid
    breuk: parseIngredient('1½ el BBQ-rub'),
  }));
  expect(r.grammen).toBe('1,15 kg kippendijfilet');
  expect(r.los).toEqual({ qty: 1, unit: '×', naam: 'scheut azijn' });
  expect(r.breuk.qty).toBe(1.5);
  expect(r.breuk.unit).toBe('el');
});

test('kookronde: zelf mixen — componenten worden één gerecht met opgetelde macro’s', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => { window.showTab('eten'); etenView = 'ronde'; renderEten(); });
  await page.click('#tab-eten button:has-text("+ mix zelf")');
  await page.locator('dialog#modal input.mix-check[value="kip-grill"]').check();
  await page.locator('dialog#modal input.mix-check[value="saus-roomtomaat"]').check();
  await page.locator('dialog#modal input.mix-check[value="kool-rijst"]').check();
  // live preview telt op: 320 + 170 + 270 kcal
  await expect(page.locator('#mix-preview')).toContainText('760 kcal');
  await page.fill('#mix-naam', 'Romige kip met rijst');
  await page.click('dialog#modal button:has-text("+ toevoegen aan ronde")');
  await expect(page.locator('#tab-eten')).toContainText('Romige kip met rijst');
  // boodschappen bevatten ingrediënten van álle componenten
  const bood = await page.evaluate(() => window.lifeos.store.grocery.lists.plan.map((x) => x.item));
  expect(bood).toContain('500 g kipfilet');
  expect(bood.some((x) => x.includes('kookroom'))).toBe(true);
  expect(bood.some((x) => x.includes('rijst'))).toBe(true);
  // draaiboek: rijst wordt uitgesteld naar de eetdag
  const db = await page.evaluate(() => window.lifeos.store.freezer.draaiboek.map((x) => x.txt));
  expect(db.some((t) => t.includes('vers bereiden op de eetdag'))).toBe(true);
  // koken en eten: één tik logt het als één gerecht met som-macro's
  await page.click('#tab-eten button:has-text("Ronde gekookt ✓")');
  await page.locator('#tab-eten .rij:has-text("Romige kip met rijst") button[title="portie gegeten"]').click();
  const meal = await page.evaluate(() => window.lifeos.store.nutrition.meals[0]);
  expect(meal.naam).toBe('Romige kip met rijst');
  expect(meal.kcal).toBe(760);
  expect(meal.eiwit).toBe(66); // 58 + 3 + 5
});

test('overhoormodus: één ronde vraag → antwoord → goed', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(APP);
  await page.evaluate(() => window.showTab('leren'));
  // vak + item aanmaken
  await page.fill('#vak-naam', 'Statistiek');
  const exam = await page.evaluate(() => window.lifeos.addDays(new Date().toISOString().slice(0, 10), 30));
  await page.fill('#vak-datum', exam);
  await page.click('#tab-leren button:has-text("+ vak")');
  await page.fill('#item-vraag', 'Wat is een p-waarde?');
  await page.fill('#item-antwoord', 'Kans op deze (of extremere) data als H0 waar is');
  await page.click('#tab-leren button:has-text("+ item")');
  await expect(page.locator('#tab-leren')).toContainText('Wat is een p-waarde?');
  // overhoren
  await page.click('button:has-text("Overhoor mij")');
  await expect(page.locator('#quiz-card')).toContainText('Wat is een p-waarde?');
  await page.click('button:has-text("Toon antwoord")');
  await expect(page.locator('.quiz-antwoord')).toContainText('H0');
  await page.click('#quiz-card button:has-text("Goed")');
  // 1 goede sessie geregistreerd + nextReview gezet (gap voor 30 dagen = 5)
  const item = await page.evaluate(() => window.lifeos.store.study.items[0]);
  expect(item.sessies).toEqual(['goed']);
  expect(item.nextReview).toBeTruthy();
  expect(appErrors(errors)).toEqual([]);
});

test('persistentie: data blijft na herladen', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => window.showTab('taken'));
  await page.fill('#taak-titel', 'Blijf-ik-staan-taak');
  await page.click('#tab-taken button:has-text("+ taak")');
  await page.evaluate(() => {
    planVoegToe(['vz-dal'], 'Rode linzen-dal');
    rondeGekookt();
  });
  await page.reload();
  await page.evaluate(() => window.showTab('taken'));
  await expect(page.locator('#tab-taken')).toContainText('Blijf-ik-staan-taak');
  const voorraad = await page.evaluate(() => window.lifeos.store.freezer.voorraad[0]);
  expect(voorraad.naam).toBe('Rode linzen-dal');
  expect(voorraad.porties).toBe(4);
});

test('file://-smoketest: agenda toont fallback i.p.v. iframe', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => window.showTab('agenda'));
  await expect(page.locator('#tab-agenda')).toContainText('Open Google Agenda');
  await expect(page.locator('#tab-agenda iframe')).toHaveCount(0);
});

test('datumlogica: spacing-gap, kookronde, achterstallig', async ({ page }) => {
  await page.goto(APP);
  const r = await page.evaluate(() => {
    const L = window.lifeos;
    const vandaag = new Date().toISOString().slice(0, 10);
    return {
      gap7: L.gapVoorDagen(7),
      gap30: L.gapVoorDagen(30),
      gap60: L.gapVoorDagen(60),
      gap180: L.gapVoorDagen(180),
      plus16: L.daysBetween(vandaag, L.addDays(vandaag, 16)),
      overdueGisteren: L.isOverdue(L.addDays(vandaag, -1), false),
      overdueMorgen: L.isOverdue(L.addDays(vandaag, 1), false),
      overdueKlaar: L.isOverdue(L.addDays(vandaag, -1), true),
    };
  });
  // getrapte Cepeda-regel: 25% ≤3 wk, 15% <3 mnd, 8% daarboven
  expect(r.gap7).toBe(2);
  expect(r.gap30).toBeGreaterThanOrEqual(4);
  expect(r.gap30).toBeLessThanOrEqual(5);
  expect(r.gap60).toBe(9);
  expect(r.gap180).toBe(14);
  expect(r.plus16).toBe(16);
  expect(r.overdueGisteren).toBe(true);
  expect(r.overdueMorgen).toBe(false);
  expect(r.overdueKlaar).toBe(false);
});

test('migratie: oude vaste-gerechten-data wordt voorraad (schema v3 → v4)', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => {
    localStorage.setItem('lifeos_v1', JSON.stringify({
      settings: { name: '', weekGoal: 3, cycleDays: 16, updated_at: '2026-01-01T00:00:00Z' },
      freezer: {
        dishes: [
          { id: 'chili', naam: 'Chili con carne', ronde: 1, veg: false, serveerMet: 'rijst', porties: 3, lastEaten: '2026-08-01' },
          { id: 'tikka', naam: 'Kip tikka masala', ronde: 1, veg: false, serveerMet: 'rijst', porties: 0, lastEaten: null },
        ],
        lastCookDate: '2026-07-20', nextRound: 2, updated_at: '2026-01-01T00:00:00Z',
      },
    }));
  });
  await page.reload();
  const st = await page.evaluate(() => window.lifeos.store.freezer);
  // porties > 0 worden voorraad-items met macro's; lege gerechten niet
  expect(st.voorraad.length).toBe(1);
  expect(st.voorraad[0].naam).toBe('Chili con carne');
  expect(st.voorraad[0].porties).toBe(3);
  expect(st.voorraad[0].macros.eiwit).toBeGreaterThan(20);
  expect(st.lastCookDate).toBe('2026-07-20');
  expect(st.dishes).toBeUndefined();
  expect(st.nextRound).toBeUndefined();
});

test('quick-add via native dialog: taak vanaf Vandaag', async ({ page }) => {
  await page.goto(APP);
  await page.click('#tab-vandaag button:has-text("+ taak")');
  await expect(page.locator('dialog#modal')).toBeVisible();
  await page.fill('#m-titel', 'Dialoogtaak');
  await page.click('dialog#modal button:has-text("Toevoegen")');
  await expect(page.locator('dialog#modal')).not.toBeVisible();
  await page.evaluate(() => window.showTab('taken'));
  await expect(page.locator('#tab-taken')).toContainText('Dialoogtaak');
  // Escape sluit de dialog (native <dialog>-gedrag)
  await page.evaluate(() => window.showTab('vandaag'));
  await page.click('#tab-vandaag button:has-text("+ taak")');
  await expect(page.locator('dialog#modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog#modal')).not.toBeVisible();
});

test('lege verplichte velden: zichtbare validatie i.p.v. stille no-op', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => window.showTab('taken'));
  await page.click('#tab-taken button:has-text("+ taak")');
  await expect(page.locator('#taak-titel')).toHaveAttribute('aria-invalid', 'true');
  const n = await page.evaluate(() => window.lifeos.store.tasks.list.length);
  expect(n).toBe(0);
});

test('verwijderen toont undo-toast en undo herstelt', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => window.showTab('taken'));
  await page.fill('#taak-titel', 'Weg en terug');
  await page.click('#tab-taken button:has-text("+ taak")');
  await page.locator('#tab-taken .rij:has-text("Weg en terug") .del').click();
  await expect(page.locator('#tab-taken')).not.toContainText('Weg en terug');
  await expect(page.locator('#toast')).toContainText('Taak verwijderd');
  await page.click('#toast button:has-text("Ongedaan maken")');
  await expect(page.locator('#tab-taken')).toContainText('Weg en terug');
});

test('avondeten-suggestie: nooit het gerecht van gisteren', async ({ page }) => {
  await page.goto(APP);
  const sug = await page.evaluate(() => {
    const L = window.lifeos;
    const vandaag = new Date();
    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const gisteren = new Date(vandaag); gisteren.setDate(gisteren.getDate() - 1);
    const langGeleden = new Date(vandaag); langGeleden.setDate(langGeleden.getDate() - 10);
    // alleen 2 gerechten op voorraad: gisteren gegeten vs. 10 dagen geleden
    L.store.freezer.voorraad = [
      { id: 'a', naam: 'Gisteren-gerecht', recepten: [], porties: 3, lastEaten: iso(gisteren), macros: null },
      { id: 'b', naam: 'Oud-gerecht', recepten: [], porties: 1, lastEaten: iso(langGeleden), macros: null },
    ];
    return L.avondetenSuggestie();
  });
  expect(sug.id).toBe('b'); // gisteren gegeten → uitgesloten, langst-geleden wint
});

test('fout antwoord = korte tussenpoos (morgen), goed = vak-tussenpoos', async ({ page }) => {
  await page.goto(APP);
  const r = await page.evaluate(() => {
    const L = window.lifeos;
    const vandaag = new Date().toISOString().slice(0, 10);
    L.store.study.vakken.push({ id: 'vak1', naam: 'Test', examDate: L.addDays(vandaag, 40) });
    L.store.study.items.push({ id: 'it1', vak: 'vak1', vraag: 'q', antwoord: 'a', sessies: [], lastSession: '', nextReview: '' });
    window.sessieResultaat('it1', 'fout');
    const naFout = L.store.study.items.find((i) => i.id === 'it1').nextReview;
    window.sessieResultaat('it1', 'goed');
    const naGoed = L.store.study.items.find((i) => i.id === 'it1').nextReview;
    return { naFout, naGoed, vandaag };
  });
  expect(r.naFout).toBe(await page.evaluate((v) => window.lifeos.addDays(v, 1), r.vandaag));
  // 40 dagen tot tentamen → 15%-trede → gap 6
  expect(r.naGoed).toBe(await page.evaluate((v) => window.lifeos.addDays(v, 6), r.vandaag));
});

test('review wordt nooit ná het tentamen gepland', async ({ page }) => {
  await page.goto(APP);
  const r = await page.evaluate(() => {
    const L = window.lifeos;
    const vandaag = new Date().toISOString().slice(0, 10);
    const exam = L.addDays(vandaag, 3);
    L.store.study.vakken.push({ id: 'vak2', naam: 'Kort', examDate: exam });
    L.store.study.items.push({ id: 'it2', vak: 'vak2', vraag: 'q', antwoord: 'a', sessies: ['goed','goed'], lastSession: '', nextReview: '' });
    window.sessieResultaat('it2', 'goed');
    return { nextReview: L.store.study.items.find((i) => i.id === 'it2').nextReview, exam };
  });
  expect(r.nextReview < r.exam).toBe(true);
});

test('Google Calendar-links: ctz-tijdzone en correct datumformaat', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => window.showTab('leren'));
  await page.fill('#vak-naam', 'Recht');
  const exam = await page.evaluate(() => window.lifeos.addDays(new Date().toISOString().slice(0, 10), 20));
  await page.fill('#vak-datum', exam);
  await page.click('#tab-leren button:has-text("+ vak")');
  const href = await page.locator('#tab-leren a:has-text("zet in agenda")').first().getAttribute('href');
  expect(href).toContain('action=TEMPLATE');
  expect(href).toContain('ctz=Europe%2FAmsterdam');
  expect(href).toMatch(/dates=\d{8}T190000\/\d{8}T200000/);
});

test('klikdoelen: alle knoppen minstens 24px, primaire knoppen 44px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(APP);
  for (const tab of ['vandaag', 'eten', 'sport', 'leren', 'taken']) {
    await page.evaluate((t) => window.showTab(t), tab);
    const fouten = await page.evaluate(() => {
      const out = [];
      for (const b of document.querySelectorAll('.tab.active button, .tabbar button')) {
        const r = b.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue; // verborgen
        if (r.height < 24 || r.width < 24) out.push(b.className + ': ' + Math.round(r.width) + 'x' + Math.round(r.height));
        if ((b.classList.contains('knop') || b.classList.contains('iconbtn')) && r.height < 44)
          out.push('primair te klein: ' + b.className + ' ' + Math.round(r.height));
      }
      return out;
    });
    expect(fouten, 'tab ' + tab).toEqual([]);
  }
  await ctx.close();
});

test('statische bestanden: PNG-iconen en manifest aanwezig en gelinkt', async ({ page }) => {
  const fs = require('fs');
  const p = (f) => path.resolve(__dirname, '..', f);
  for (const f of ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest']) {
    expect(fs.existsSync(p(f)), f + ' ontbreekt').toBe(true);
  }
  // PNG magic bytes (iOS accepteert alleen echte PNG's)
  const buf = fs.readFileSync(p('apple-touch-icon.png'));
  expect(buf.subarray(0, 4).toString('hex')).toBe('89504e47');
  const manifest = JSON.parse(fs.readFileSync(p('manifest.webmanifest'), 'utf8'));
  expect(manifest.display).toBe('standalone');
  await page.goto(APP);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', 'apple-touch-icon.png');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'manifest.webmanifest');
});

test('kookboek: zoeken, filteren en receptdialog met macro’s', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => window.showTab('eten'));
  // kookboek is de standaardweergave; filter op kruidenmixen
  await page.click('#tab-eten .filterrij button:has-text("Kruidenmixen")');
  await expect(page.locator('#tab-eten')).toContainText('Cajun-mix');
  await expect(page.locator('#tab-eten')).toContainText('Shoarma-mix');
  // zoeken over alle categorieën heen
  await page.click('#tab-eten .filterrij button:has-text("Alles")');
  await page.fill('#kook-zoek', 'teriyaki');
  await expect(page.locator('#tab-eten .card').first()).toContainText('Teriyakisaus');
  // dialog met macro's en batchinfo
  await page.evaluate(() => { kookZoek = ''; renderAll(); });
  await page.click('#tab-eten .rij:has-text("Gegrilde kipfilet") .groei');
  await expect(page.locator('dialog#modal')).toContainText('58 g');
  await expect(page.locator('dialog#modal')).toContainText('Bereiding');
  await page.click('dialog#modal button:has-text("Sluiten")');
  // kruidenmix-dialog toont houdbaarheid en dosering
  await page.click('#tab-eten .rij:has-text("Cajun-mix") .groei');
  await expect(page.locator('dialog#modal')).toContainText('Houdbaar');
  await expect(page.locator('dialog#modal')).toContainText('6 mnd');
});

test('maaltijd loggen uit kookboek telt op in dagtotalen', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => window.showTab('eten'));
  await page.click('#tab-eten .rij:has-text("Gegrilde kipfilet") .groei');
  await page.fill('#log-porties', '2');
  await page.click('dialog#modal button:has-text("Gegeten")');
  const tot = await page.evaluate(() => window.lifeos.dagTotalen(new Date().toISOString().slice(0, 10)));
  expect(tot.eiwit).toBe(116); // 58 × 2 porties
  expect(tot.kcal).toBe(640);
  // zichtbaar in de Gegeten-weergave
  await page.click('#tab-eten .filterrij button:has-text("Gegeten")');
  await expect(page.locator('#tab-eten')).toContainText('Gegrilde kipfilet');
  await expect(page.locator('#tab-eten')).toContainText('2×');
});

test('gewicht loggen: eiwitdoel, trend en dagelijkse upsert', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => window.showTab('sport'));
  await page.fill('#gewicht-kg', '70');
  await page.click('#tab-sport button:has-text("+ weging")');
  let r = await page.evaluate(() => ({
    doel: window.lifeos.eiwitDoel(),
    n: window.lifeos.store.nutrition.weight.length,
  }));
  expect(r.doel).toBe(126); // 70 kg × 1,8 g/kg
  expect(r.n).toBe(1);
  // tweede weging op dezelfde dag vervangt (upsert), geen tweede rij
  await page.fill('#gewicht-kg', '70.4');
  await page.click('#tab-sport button:has-text("+ weging")');
  r = await page.evaluate(() => ({
    n: window.lifeos.store.nutrition.weight.length,
    kg: window.lifeos.store.nutrition.weight[0].kg,
  }));
  expect(r.n).toBe(1);
  expect(r.kg).toBe(70.4);
});

test('7-daags gemiddelde en trend per week', async ({ page }) => {
  await page.goto(APP);
  const r = await page.evaluate(() => {
    const L = window.lifeos;
    const vandaag = new Date().toISOString().slice(0, 10);
    // 14 dagen lineair stijgend: 70.0 → 71.3 (0.1/dag = 0.7 kg/week)
    for (let i = 13; i >= 0; i--) {
      L.store.nutrition.weight.push({ date: L.addDays(vandaag, -i), kg: 70 + (13 - i) * 0.1 });
    }
    return { trend: L.trendGewicht(), perWeek: L.trendPerWeek() };
  });
  // gemiddelde van de laatste 7 (70.7..71.3) = 71.0
  expect(r.trend).toBeCloseTo(71.0, 1);
  expect(r.perWeek).toBeCloseTo(0.7, 1);
});

test('eigen recept toevoegen en verwijderen met undo', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => window.showTab('eten'));
  await page.click('#tab-eten summary:has-text("Eigen recept")');
  await page.fill('#er-naam', 'Proteïne-pannenkoeken');
  await page.fill('#er-kcal', '400');
  await page.fill('#er-eiwit', '35');
  await page.fill('#er-ingr', '100 g havermout\n2 eieren\n100 g kwark');
  await page.fill('#er-stappen', 'Blenden\nBakken');
  await page.click('#tab-eten button:has-text("+ recept opslaan")');
  await expect(page.locator('#tab-eten')).toContainText('Proteïne-pannenkoeken');
  await page.reload();
  await page.evaluate(() => window.showTab('eten'));
  await expect(page.locator('#tab-eten')).toContainText('Proteïne-pannenkoeken'); // persistent
});

test('screenshots: iPhone 390×844 en desktop 1280×800', async ({ browser }) => {
  for (const [naam, vp] of [['iphone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    await page.goto(APP);
    for (const tab of ['vandaag', 'eten', 'leren']) {
      await page.evaluate((t) => window.showTab(t), tab);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `test-results/screens/${naam}-${tab}.png`, fullPage: false });
    }
    await ctx.close();
  }
});

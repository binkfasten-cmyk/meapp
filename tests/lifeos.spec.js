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

test('portie +1 en portie gegeten (met lastEaten)', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => window.showTab('eten'));
  const eerste = page.locator('#tab-eten .card').nth(1).locator('.rij').first();
  await eerste.locator('button[aria-label="portie erbij"]').click();
  await expect(page.locator('#tab-eten .card').nth(1).locator('.rij').first().locator('.porties-groot')).toHaveText('1');
  await page.locator('#tab-eten .card').nth(1).locator('.rij').first().locator('button[title="portie gegeten"]').click();
  await expect(page.locator('#tab-eten .card').nth(1).locator('.rij').first().locator('.porties-groot')).toHaveText('0');
  const lastEaten = await page.evaluate(() => window.lifeos.store.freezer.dishes[0].lastEaten);
  expect(lastEaten).toBeTruthy();
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
  await page.evaluate(() => window.showTab('eten'));
  await page.locator('#tab-eten .card').nth(1).locator('.rij').first()
    .locator('button[aria-label="portie erbij"]').click();
  await page.reload();
  await page.evaluate(() => window.showTab('taken'));
  await expect(page.locator('#tab-taken')).toContainText('Blijf-ik-staan-taak');
  const porties = await page.evaluate(() => window.lifeos.store.freezer.dishes[0].porties);
  expect(porties).toBe(1);
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
      plus16: L.daysBetween(vandaag, L.addDays(vandaag, 16)),
      overdueGisteren: L.isOverdue(L.addDays(vandaag, -1), false),
      overdueMorgen: L.isOverdue(L.addDays(vandaag, 1), false),
      overdueKlaar: L.isOverdue(L.addDays(vandaag, -1), true),
    };
  });
  expect(r.gap7).toBe(1);
  expect(r.gap30).toBeGreaterThanOrEqual(4);
  expect(r.gap30).toBeLessThanOrEqual(5);
  expect(r.gap60).toBe(9);
  expect(r.plus16).toBe(16);
  expect(r.overdueGisteren).toBe(true);
  expect(r.overdueMorgen).toBe(false);
  expect(r.overdueKlaar).toBe(false);
});

test('kookronde gekookt: 4 porties, datum vandaag, ronde schuift door', async ({ page }) => {
  await page.goto(APP);
  await page.evaluate(() => window.showTab('eten'));
  await page.click('#tab-eten button:has-text("gekookt ✓")');
  const st = await page.evaluate(() => ({
    r1: window.lifeos.store.freezer.dishes.filter((d) => d.ronde === 1).map((d) => d.porties),
    lastCook: window.lifeos.store.freezer.lastCookDate,
    next: window.lifeos.store.freezer.nextRound,
  }));
  expect(st.r1).toEqual([4, 4, 4, 4]);
  expect(st.lastCook).toBe(new Date().toISOString().slice(0, 10));
  expect(st.next).toBe(2);
  // avondeten-suggestie komt nu uit ronde 1
  const sug = await page.evaluate(() => window.lifeos.avondetenSuggestie());
  expect(sug).not.toBeNull();
  expect(sug.ronde).toBe(1);
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

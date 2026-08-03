// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    // De app is één statisch HTML-bestand; tests openen het via file://.
    launchOptions: {
      // Vooraf geïnstalleerde Chromium (werkt onafhankelijk van de @playwright/test-versie).
      executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium',
    },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});

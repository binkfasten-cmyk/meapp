# Werkafspraken voor dit project

- **Zet aan het einde van elke werkcyclus een pull request klaar.** Is er al een open PR voor de werkbranch, dan volstaat pushen (de PR wordt automatisch bijgewerkt); is die er niet (of is hij gemerged), maak dan een nieuwe aan en meld de URL.
- Taal: UI, documentatie en communicatie in het Nederlands.
- Na elke wijziging: Playwright-suite draaien (`npm test`) en screenshots visueel controleren vóór commit/push.
- Onderzoek en technische keuzes documenteren in `DECISIONS.md` met bronnen.
- De app is één `index.html` (vanilla, geen build tools) + statische assets; zie `README.md` voor deployment.

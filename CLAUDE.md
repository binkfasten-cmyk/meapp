# Werkafspraken voor dit project

- **Maak voor elke werkcyclus een níéuwe pull request.** Start elk nieuw stuk werk op een verse branch vanaf de laatste `main`, en zet aan het einde een nieuwe PR klaar met een duidelijke titel en beschrijving; meld de URL. Nooit doorbouwen op een branch waarvan de PR al gemerged is.
- Taal: UI, documentatie en communicatie in het Nederlands.
- Na elke wijziging: Playwright-suite draaien (`npm test`) en screenshots visueel controleren vóór commit/push.
- Onderzoek en technische keuzes documenteren in `DECISIONS.md` met bronnen.
- De app is één `index.html` (vanilla, geen build tools) + statische assets; zie `README.md` voor deployment.

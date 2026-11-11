# Native Names

A mobile-first map quiz that teaches what countries call themselves in their own language, and how to say it.
Plain HTML/CSS/JS, no build step, installable PWA that works offline.

- **Name it** – "What does China call itself?" with four native names.
- **Reverse** – see 한국 and tap the right country on the map.
- **Say it** – hear the name via the browser's speech synthesis, then grade yourself.
- Fact card after every answer: where the English name came from, two facts, capital, language.
- Streaks, score, countries mastered coloured on the map, spaced repetition, three unlockable levels.
- 89 countries. Progress is stored in `localStorage` only.

## Install on an iPhone
Open the site in Safari → Share → **Add to Home Screen**.

## Files
- `index.html`, `style.css`, `app.js` – the app
- `data.js` – the country data (names, romanisation, speech language, etymology, facts)
- `map-data.js` – generated from Natural Earth via `tools/build-map.mjs` (world-atlas 110m)
- `sw.js`, `manifest.webmanifest`, `icons/` – PWA bits

## Regenerate the map
```
cd tools && npm install
curl -sSLO https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json
node build-map.mjs countries-110m.json
```

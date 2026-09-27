# Prototypes de la phase 0

Code jetable qui a servi à répondre aux questions de `docs/phase0-findings.md`. Il ne fait pas partie de l'extension.

Prérequis : Node 24 ou plus, Chrome, Opera GX et Edge installés aux emplacements par défaut (voir `lib/browsers.mjs`).

```sh
cd spikes
npm install
node fixtures/make-sample.mjs          # génère fixtures/sample.pdf
curl -L -o fixtures/arxiv-1706.03762.pdf https://arxiv.org/pdf/1706.03762
# tracemonkey.pdf vient du dépôt PDF.js (web/compressed.tracemonkey-pldi-09.pdf)
```

| Dossier | Question | Commande |
|---|---|---|
| `recolor/` | 1 et 2 : pipeline de PDF.js 6.3, interception canvas contre post-traitement WebGL2 | `node recolor/run.mjs`, puis `node recolor/bench.mjs` |
| `dnr-ext/` | 4 : condition DNR `responseHeaders`, 13 cas | `node dnr-ext/run.mjs chrome` (ou `opera`, `edge`) |
| `overlay-ext/` | 5 : calque sur le lecteur natif, hauteur de la barre d'outils | `node overlay-ext/run.mjs chrome [--headful]`, puis `node overlay-ext/sample-pixels.mjs` |

Le harnais de recoloration s'ouvre aussi à la main : `node server.mjs 8123`, puis `http://127.0.0.1:8123/recolor/index.html?mode=shader` (`mode=hook` ou `mode=none`, `file=...`, `scale=...`). Maintenir `Alt` affiche l'original.

Chrome ignore `--load-extension` depuis la version 137 : `lib/browsers.mjs` charge l'extension avec la méthode CDP `Extensions.loadUnpacked` (connexion par pipe, via `puppeteer-core`).

Les résultats (captures, JSON) sont écrits dans `out/`, ignoré par git. Les captures utiles sont copiées dans `docs/phase0/`.

`dnr-ext/background.js` adapte les règles de `extensions/chromium/pdfHandler.js` du dépôt mozilla/pdf.js (Apache 2.0).

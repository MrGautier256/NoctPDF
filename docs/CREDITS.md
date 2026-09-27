# Crédits et licences

## Code tiers embarqué

| Composant | Licence | Où | Usage |
|---|---|---|---|
| [PDF.js](https://github.com/mozilla/pdf.js) 6.3.289, build `gulp chromium` | Apache 2.0 | `vendor/pdfjs/` (licence dans `vendor/pdfjs/LICENSE`) | Lecteur embarqué, livré tel quel dans `content/`. Un seul patch d'une ligne (`patches/pdfjs/`), appliqué à la copie du paquet. |
| Modules wasm de PDF.js (OpenJPEG, JBIG2, qcms, QuickJS) | voir `vendor/pdfjs/content/web/wasm/LICENSE_*` | idem | Décodage JPEG 2000, JBIG2, profils ICC, scripts des formulaires. |
| Polices standard et CMaps de PDF.js | voir `vendor/pdfjs/content/web/standard_fonts/LICENSE_*` et les en-têtes des CMaps | idem | Rendu des polices non embarquées. |

## Code porté (adapté, pas copié tel quel)

Ces fichiers reprennent la logique de l'extension Chromium officielle de PDF.js (`extensions/chromium/`, Apache 2.0, Copyright Mozilla Foundation). Chacun le signale en tête de fichier.

| Notre fichier | Origine | Changements |
|---|---|---|
| `src/background/dnr-rules.ts` | `pdfHandler.js` (règles DNR) | règles construites depuis nos réglages ; `Content-Disposition: attachment` respecté aussi dans la frame principale si demandé |
| `src/platform/index.ts` (`isResponseHeadersConditionSupported`) | `pdfHandler.js` | TypeScript |
| `src/background/viewer-bridge.ts` | `pdfHandler.js` (messages du viewer) | `getParentOrigin` renvoie l'origine réelle au lieu de `undefined` pour une page http (bug de l'original : `origin[1]` sans groupe capturant) |
| `src/background/file-scheme.ts` | `pdfHandler.js` (`webNavigation` pour `file://`) | soumis aux réglages et au choix "lecteur natif" |
| `src/background/referer.ts` | `preserve-referer.js` | TypeScript, `Map` au lieu d'objets |
| `src/background/router.ts`, `src/shared/viewer-url.ts` | `extension-router.js` | limité aux schémas http, https et file |
| `src/content/pdf-embeds.ts`, `src/entrypoints/pdf-detect.content/style.css` | `contentscript.js`, `contentstyle.css` | soumis aux réglages ; repli si Chrome occupe déjà le shadow root du `<body>` |

**Non repris** : `telemetry.js` (ping quotidien vers un serveur tiers), `suppress-update.js`, la page d'options de PDF.js.

## Références consultées (aucun code copié)

- [shivaprsd/doq](https://github.com/shivaprsd/doq) (MIT) : technique d'interception du canvas, idées sur la recoloration.
- [shivaprsd/doqment](https://github.com/shivaprsd/doqment) (MIT).
- [hekatonsure/DarkMinPDF](https://github.com/hekatonsure/DarkMinPDF) (MIT) : cas limites de l'interception DNR.
- [MINERVA-RP/chrome-extension-pdf-dark-mode](https://github.com/MINERVA-RP/chrome-extension-pdf-dark-mode) : **pas de licence publiée**, donc lu pour les idées uniquement (calque sur le lecteur natif).

## Outils

WXT, Vue, valibot, Vitest, Playwright, puppeteer-core, pdf-lib, pngjs : dépendances de développement ou de build, sous leurs licences respectives (voir `package-lock.json`).

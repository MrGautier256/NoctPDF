# NoctPDF

Extension Manifest V3 pour Chrome, Opera, Edge, Brave et Vivaldi : un vrai mode sombre pour les PDF, dans un lecteur PDF.js embarqué (moteur principal) ou en calque sur le lecteur intégré du navigateur.

> État : **phase 1** (squelette). Les PDF s'ouvrent dans le lecteur embarqué, avec l'interface sombre de PDF.js ; la recoloration des pages arrive en phase 2. Plan complet : `.claude/prompt.md`. Décisions techniques : `docs/phase0-findings.md`. Suivi : `docs/backlog.md`.

## Installer depuis les sources

Prérequis : Node 24 (le dépôt contient un `.node-version` ; avec [fnm](https://github.com/Schniz/fnm), `fnm use`).

```sh
npm install
npm run build
```

Puis, dans le navigateur :

1. Ouvrir `chrome://extensions` (`opera://extensions` dans Opera, `edge://extensions` dans Edge).
2. Activer le **mode développeur**.
3. **Charger l'extension non empaquetée** et choisir le dossier `.output/chrome-mv3`.
4. Pour les PDF locaux : ouvrir les détails de l'extension et activer **Autoriser l'accès aux URL de fichier**. Sans cet accès, le lecteur s'ouvre quand même et explique comment l'activer.

Chrome 128 minimum (condition `responseHeaders` des règles DNR).

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | build en continu (WXT) |
| `npm run build` | build de production dans `.output/chrome-mv3` |
| `npm run zip` | archive prête pour les boutiques |
| `npm test` | tests unitaires (Vitest) |
| `npm run test:e2e` | build puis tests e2e (Playwright, Chromium de Playwright) |
| `npm run test:browsers` | test de fumée dans Chrome, Opera GX et Edge installés (CDP) |
| `npm run lint` / `npm run format` | ESLint et Prettier |
| `npm run typecheck` | vérification des types (vue-tsc) |
| `npm run pdfjs:update [vX.Y.Z]` | recompile PDF.js depuis un tag et met à jour `vendor/pdfjs/` |

Les tests e2e demandent le Chromium de Playwright : `npx playwright install chromium`.

## Permissions et pourquoi

| Permission | Pourquoi |
|---|---|
| `declarativeNetRequestWithHostAccess` + accès à tous les sites | Rediriger les réponses PDF (repérées par leur en-tête `Content-Type`) vers le lecteur embarqué, sans lire le contenu des pages. |
| `storage` | Réglages, et préférences du lecteur PDF.js. |
| `webNavigation` | Ouvrir les PDF locaux quand l'accès aux fichiers n'est pas accordé ; savoir quand un onglet quitte le lecteur intégré. |
| `webRequest` (lecture seule) | Retenir l'en-tête `Referer` de la requête PDF, que le lecteur renvoie en rechargeant le fichier (certains sites l'exigent), et repérer les réponses à un formulaire POST, que le lecteur ne peut pas reproduire. |

Aucune télémétrie, aucune requête réseau en dehors du PDF demandé.

## Organisation

```
src/
  background/     service worker : règles DNR, lecteur natif par onglet, file://, pont avec le viewer
  content/        PDF intégrés aux pages (embed, object) et PDF non redirigés
  viewer/         couche NoctPDF chargée dans le lecteur PDF.js
  settings/       schéma (valibot), migrations, stockage découpé
  platform/       seul module qui appelle les APIs d'extension
  shared/         messages et URL du lecteur
  ui/             popup et options (Vue 3)
  entrypoints/    points d'entrée WXT
vendor/pdfjs/     PDF.js compilé, non modifié
patches/pdfjs/    patchs minimes, appliqués à la copie du paquet
scripts/          mise à jour de PDF.js, fixtures, icônes
test/             e2e (Playwright), fumée multi-navigateurs, fixtures
spikes/           prototypes jetables de la phase 0
```

## Licences

Le code tiers et le code porté sont décrits dans `docs/CREDITS.md` (PDF.js : Apache 2.0). La licence du projet reste à choisir.

# Phase 2 : conclusions et mesures

Date : 8 octobre 2026. Suite de `docs/phase0-findings.md`, après la revue qui a validé la phase 0 et demandé les corrections ci-dessous avec captures avant/après.

Environnement de mesure, **différent de la phase 0** : session cloud sandboxée, sans GPU, Chromium 141.0.7390.37 (bundle Playwright). WebGL2 y tourne sur **SwiftShader** (rendu logiciel) : `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)`, confirmé par `recolorer.renderer`. La phase 0 avait un vrai GPU (Intel Iris Plus). Ce point est important pour lire les mesures de performance ci-dessous : il gonfle le coût des étapes GPU, pas celui du calcul JS (LUT).

Un autre écart d'environnement : `arxiv.org` est bloqué par la politique réseau de cette session (`CONNECT tunnel failed, response 403`), donc l'article arXiv 1706.03762 réel n'a pas pu être retéléchargé ici. La bordure de lien hyperref a été reproduite avec un PDF de test dédié (`spikes/fixtures/make-link-border.mjs`) plutôt que le fichier réel. À revérifier sur le fichier arXiv d'origine dès qu'une session avec accès réseau complet est disponible.

Tous les correctifs ci-dessous sont dans `src/color/`, `src/viewer/engine/` et `src/viewer/layer.ts`, avec leurs tests Vitest. Les captures viennent de `spikes/recolor/` (modèle couleur et harnais portés depuis `src/`, voir les commentaires en tête de `spikes/recolor/color.mjs` et `main.mjs`) via `spikes/recolor/capture-linux.mjs`, une variante Linux/sandbox de `run.mjs` (qui suppose des navigateurs Windows).

## Rampe de gris cassée

**Corrigé.** Avant (`docs/phase0/recolor-shader.png`) : les cases 4 à 7 de la rampe sont visuellement identiques (vers `#8c8c8c`), avec un saut juste avant — le garde-fou de contraste s'appliquait alors à tort aux gris. Après (`docs/phase2/recolor-shader-fixed.png`) : rampe visuellement continue, chaque case distincte de ses voisines.

Test de non-régression : `src/color/remap.test.ts`, rampe 0..255 strictement monotone en L OKLab (écart minimum 0.0008 entre deux pas) et sans suite de 3 octets quantifiés identiques ou plus.

## Orange devenu marron (triangle)

**Corrigé.** Avant : le triangle orange (`rgb(255, 153, 26)` dans le PDF de test) devient un marron terne, sans lien visuel avec sa teinte d'origine. Après : il reste reconnaissable comme orange/ambré, avec sa chroma préservée. Voir `docs/ADR-001-recoloration.md` § Modèle couleur pour le mécanisme (bande de luminance lisible pour les couleurs vives, exemption pour les couleurs très claires).

Test : `src/color/remap.test.ts`, angle de teinte OKLCh à moins de 15° de l'original et chroma de sortie au-dessus de 40 % de la chroma d'entrée ; et vérification que le résultat n'est pas une simple inversion linéaire sur toute la plage `bg → fg`.

## Bordures de liens hyperref (vert fluo)

**Corrigé**, avec la réserve réseau ci-dessus (reproduit sur un fixture dédié, pas le fichier arXiv réel). Avant (`docs/phase2/recolor-linkborder-before.png`, mode désactivé) : bordure `rgb(0, 255, 0)` telle que PDF.js la pose, vert fluo. Après (`docs/phase2/recolor-linkborder-fixed.png`) : bordure recolorée par le même modèle, vérifiée par échantillonnage de pixels à `rgb(0, 90, 0)` (un vert sombre, cohérent avec le thème sombre du test) — pas une approximation visuelle, une lecture de pixel.

Option `theme.hideLinkBorders` ajoutée pour masquer la bordure plutôt que la recolorer (schéma des réglages, additive, sans migration).

## Scan plus clair que le fond du thème

**Corrigé.** Avant (`docs/phase0/recolor-scan.png`) : le papier recoloré forme un rectangle visiblement plus clair que le fond de page autour. Après (`docs/phase2/recolor-scan-fixed.png`) : le papier se fond dans le fond de page, sans jointure visible ; le texte (ici des blocs simulant des mots, le PDF de test n'a pas de vrai texte scanné) ressort en clair avec un bon contraste.

Mécanisme : `src/color/scan-normalize.ts`, percentiles 5/95 de l'histogramme de luminance de la page, étirés vers 0..1 avant le LUT. Test unitaire avec un histogramme synthétique (papier à 42, encre à 10, bruit de scanner au-delà de 200) vérifiant que les percentiles retrouvent bien `[10, 42]`.

## Blanc du shader contre fond CSS de `.page`

**Corrigé.** `makeRemap` court-circuite le blanc et le noir purs pour retourner exactement `bg`/`fg` (pas de retour par OKLab, qui a une erreur d'arrondi). Test : `remap([1,1,1])` égal exactement à l'octet de `bg`, `remap([0,0,0])` égal exactement à l'octet de `fg`.

## Risques couverts

- **`imagesRightClickMinSize` et comportement interne** : `src/viewer/engine/operator-list-fallback.ts` détecte un traqueur vide sur une page qui peint des images (`shouldUseOperatorListFallback`) et reconstruit les rects depuis l'`operator list` (marche la CTM via `save`/`restore`/`transform`, gère aussi `paintImageXObjectRepeat` et `paintInlineImageXObjectGroup`, non couverts par le traqueur d'après la phase 0). Testé avec des listes d'opérateurs synthétiques.
- **Pages rendues sans original conservé** : `reprocessAll()` ignore les canvases dont `isConnected` est faux (page recyclée par la virtualisation de PDF.js) plutôt que de recolorer un élément détaché.
- **Miniatures** : vérifié en lisant le code vendu plutôt que supposé. `pageView.thumbnailCanvas` est littéralement `pageView.canvas` : une miniature hérite de nos pixels déjà recolorés, gratuitement, **sauf** que le `pagerendered` interne de PDF.js (qui copie ce canvas vers la miniature) est enregistré avant le nôtre, donc une miniature peut se figer sur les pixels non traités si le panneau est déjà ouvert au premier rendu d'une page. Corrigé en régénérant l'image de la miniature depuis notre canvas déjà traité juste après notre propre traitement. Lacune restante documentée dans `docs/backlog.md` : un changement de thème en direct ne régénère pas les miniatures déjà affichées.
- **WebGL2 indisponible** : `ShaderRecolorer` peut lever à la construction (GPU sur liste noire, etc.). `src/viewer/layer.ts` l'attrape et bascule en pages non thémées plutôt que de les cacher indéfiniment derrière la CSS anti-flash.

## Changement de thème en moins de 200 ms

**Mesuré sur ce sandbox (SwiftShader, pas de GPU) : au-dessus du budget**, 173 à 246 ms sur 4 passages (`sample.pdf`, bascule sépia ↔ sombre, `window.__switchTheme`) :

| Essai | Total | dont LUT (17³) |
|---|---|---|
| 1 | 236.6 ms | 51.8 ms |
| 2 | 245.8 ms | 33.6 ms |
| 3 | 185.8 ms | 32.7 ms |
| 4 | 173.4 ms | 34.3 ms |

Détail par étape (`window.__bench()`, une page visible, 1,39 Mpx) :

| Étape | Ce sandbox (SwiftShader) | Phase 0 (Iris Plus réel) |
|---|---|---|
| Copie de l'original | 2.7 ms | 0.3 ms |
| Classification (cache chaud) | 0.7 ms | — |
| Envoi + shader | 25.9 ms | 0.2 ms |
| Recopie dans le canvas | 93.1 ms | 3.8 ms |
| **Total par page** | **116.3 ms** | **4.3 ms** |
| LUT 17³ | 47.8 ms (froid), 33-34 ms (chaud) | 32-53 ms |

Le calcul JS de la LUT (CPU, pas de GPU impliqué) est cohérent avec la phase 0 : 32 à 53 ms dans les deux cas. C'est la recopie GPU → canvas qui explique l'essentiel de l'écart (93 ms contre 3.8 ms), un facteur 24 cohérent avec un rendu logiciel plutôt que matériel.

**Conclusion** : le critère des 200 ms reste démontré par les mesures de la phase 0 sur GPU réel (LUT 32-53 ms + 4-15 ms par page visible, très en dessous du budget), mais **n'a pas pu être reconfirmé sur GPU réel par ce changement** : cette session ne dispose que d'un rendu logiciel. Le modèle couleur corrigé n'ajoute aucun coût significatif par rapport à la phase 0 (la LUT et le classement par image sont les mêmes calculs, juste avec un garde-fou en plus, négligeable). À revérifier sur la machine de test de la phase 0 ou équivalent avant de clore ce critère d'acceptation.

## Reproduire ces mesures

```sh
cd spikes
npm install
node fixtures/make-sample.mjs
node fixtures/make-link-border.mjs
node recolor/capture-linux.mjs                 # captures -> spikes/out/phase2/
node recolor/measure-theme-switch.mjs          # bascule de thème
```

Le chemin du navigateur est `/opt/pw-browsers/chromium` par défaut (premier argument pour le changer). `capture-linux.mjs` est la variante de `run.mjs` pour un bac à sable Linux sans les navigateurs Windows attendus par `lib/browsers.mjs`.

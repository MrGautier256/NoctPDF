# ADR-001 : moteur de recoloration

Statut : adopté (phase 2). Décisions initiales validées en phase 0 (`docs/phase0-findings.md`), affinées ici avec les corrections de la revue de phase 2.

## Contexte

Le cahier des charges demande un rendu propre (pas un simple négatif) : fond et texte aux couleurs du thème, couleurs sémantiques reconnaissables (liens, surlignages), images préservées ou adaptées selon un réglage, aucun flash blanc, changement de thème en moins de 200 ms.

Deux approches ont été prototypées en phase 0 sur PDF.js 6.3.289 (`spikes/recolor/`) :

1. **Interception canvas** (`DrawHookRecolorer`) : envelopper `fillStyle`/`strokeStyle`/`drawImage` du contexte 2D pendant que PDF.js dessine.
2. **Post-traitement WebGL2** (`ShaderRecolorer`) : laisser PDF.js dessiner normalement, puis recolorer le canvas entier via un LUT 3D échantillonné par un shader, en excluant les zones d'image via `pageView.imageCoordinates` (le `CanvasImagesTracker` intégré à PDF.js 6.x).

## Décision

**L'approche 2 (WebGL2) est le moteur par défaut.** L'approche 1 est reléguée à un rôle de repli, et seulement en phase 6 : pas comme moteur complet, mais comme le même modèle couleur exécuté en CPU dans un Worker (voir § Repli).

Raisons :

- Approche 2 ne dépend que d'API publiques stables de PDF.js (`pagerendered`, `pageView.canvas`, `imageCoordinates`), donc résiste mieux à ses évolutions internes.
- Elle permet une politique par image (`keep`/`dim`/`blend`/`grayscale`/`invert`/`auto`) sans ambiguïté entre une image de contenu et un canvas de groupe interne à PDF.js.
- Un changement de thème ne demande qu'un nouveau LUT et un nouveau passage shader sur les pages déjà rendues, pas un nouveau rendu PDF.js : c'est ce qui rend le changement de thème rapide (voir § Performance).
- Elle garde l'original par page, ce qui permet le coup d'œil (`Alt`) et le mode comparaison sans recalcul.

## Modèle couleur : OKLab, avec un repli en bande pour les couleurs vives

Référence testée : `src/color/remap.ts` (port fidèle vers `spikes/recolor/color.mjs` pour les captures ci-dessous).

- **Gris** (chroma faible) : la luminance OKLab est remappée linéairement et inversée sur le segment `fg → bg` (blanc devient `bg`, noir devient `fg`). Les canaux a/b suivent le même paramètre t, ce qui teinte les gris du thème (utile pour un thème sépia).
- **Couleurs saturées, peu claires ou moyennement claires** (chroma au-dessus du seuil, luminance d'origine en dessous d'environ 0.8) : **phase 2, correction**. La phase 0 les faisait suivre la même inversion linéaire que les gris, ce qui les poussait vers le bord du gamut à faible luminance et leur faisait perdre leur teinte (le triangle orange virait au marron, capture `docs/phase0/recolor-shader.png`). Elles sont maintenant ramenées dans une bande de luminance lisible, à l'intérieur de la plage `bg → fg` du thème (35 % à 70 % du trajet), ce qui les garde dans le gamut sans écraser leur chroma. Voir `docs/phase2/recolor-shader-fixed.png` : le triangle reste reconnaissable comme orange.
- **Couleurs saturées très claires** (luminance d'origine au-delà d'environ 0.8, lissée jusqu'à 0.92) : exemptées de la bande, elles continuent de s'inverser pleinement comme les gris. C'est ce qui fait qu'un surlignage jaune devient un jaune sombre lisible sous le texte, plutôt qu'un jaune de luminance moyenne qui se fondrait moins bien.
- **Garde-fou de contraste** : limité aux couleurs saturées (`w > 0.5`) et aux luminances d'origine sous 0.75, pour ne jamais s'appliquer aux gris (qui suivent déjà `bg → fg`). Corrige par bissection la luminance de sortie jusqu'au ratio de contraste WCAG demandé (`tuning.minTextContrast`, 4.5 par défaut).
- **Blanc et noir purs** : court-circuités pour retourner exactement `bg`/`fg` (pas de retour par OKLab), afin que le blanc traité par le shader soit un octet-pour-octet identique au fond CSS de `.page` (`--page-bg-color`), sans quoi on verrait une jointure visible entre pages traitées et non traitées (phase 2, correction).

### Test de non-régression

`src/color/remap.test.ts` vérifie que la rampe de gris 0..255 reste strictement monotone (en L OKLab continu, avec un écart minimum de 0.0008 entre deux pas) et ne produit jamais une suite de trois octets quantifiés identiques ou plus : c'est la signature du bug rapporté (cases 4 à 7 identiques vers `#8c8c8c`, avec un saut juste avant), qui venait du garde-fou de contraste s'appliquant alors à tort aux gris.

## Images

`images.mode` résout directement vers un mode de rect (`keep`/`dim`/`grayscale`/`invert`/`blend`), sauf `auto` qui classe chaque image par un échantillon 48x48 (part de pixels clairs, nombre de bins de couleur dominants ; `src/viewer/engine/image-policy.ts`, testé). Les pages scannées (image couvrant au moins `scanDetectionThreshold` de la page, couche texte vide) suivent leur propre réglage `scannedPages`, indépendant de `images.mode` : une page scannée n'est pas « une image sur la page », elle est la page.

### Pages scannées : normalisation par percentiles (phase 2, correction)

Le papier d'un scan n'est presque jamais blanc pur ni l'encre noir pur, ce qui faisait ressortir le papier recoloré plus clair que le fond du thème autour des pages (`#2a` contre `#1e`, capture `docs/phase0/recolor-scan.png`) et un texte peu contrasté. `src/color/scan-normalize.ts` calcule les 5e et 95e percentiles de l'histogramme de luminance de la page et étire cette plage vers 0..1 avant le passage dans le LUT, pour qu'il voie une plage pleine noir-blanc. Voir `docs/phase2/recolor-scan-fixed.png` : le papier se fond maintenant dans le fond de page, sans jointure visible.

## Bordures de liens hyperref (phase 2, ajout)

Non couvertes par le shader (canvas uniquement) ni par une règle CSS classique : PDF.js grave la couleur de bordure soit dans un style en ligne (`style.borderColor`, cas d'un lien sur une seule ligne), soit dans un `stroke` à l'intérieur d'une URI `data:` SVG posée en `background-image` (cas d'un lien qui enjambe plusieurs lignes, le cas courant pour hyperref) — une règle de feuille de style ne peut pas atteindre l'intérieur d'une `background-image`. `src/viewer/engine/link-borders.ts` lit et réécrit l'une ou l'autre forme avec le même modèle de couleur, `!important` pour l'emporter sur le style en ligne. `theme.hideLinkBorders` masque la bordure au lieu de la recolorer. Voir `docs/phase2/recolor-linkborder-before.png` / `-fixed.png`.

## Repli sans WebGL2 (phase 6, pas avant)

Décision validée en phase 0 : si WebGL2 est indisponible, le repli n'est **pas** un `DrawHookRecolorer` complet. C'est le même modèle couleur (`src/color/remap.ts`) exécuté en CPU dans un Worker, pour garder les mêmes fonctions (bande, normalisation de scan, garde-fou de contraste) sans dupliquer la logique. L'interception canvas ne sert plus qu'en mode enregistrement, pour un futur garde-fou de contraste local (texte sur aplat coloré).

En attendant la phase 6, si WebGL2 est indisponible, `src/viewer/layer.ts` affiche les pages **non thémées** plutôt que de les cacher indéfiniment (la CSS anti-flash attend un marqueur que le moteur ne posera jamais sans lui) : mieux vaut un PDF sans thème qu'un PDF invisible.

## Performance

Mesures phase 0 (GPU réel, Intel Iris Plus, Chrome 153) : LUT 17³ en 32 à 53 ms, retraitement par page visible en 1 à 15 ms, changement de thème complet projeté sous 100 ms.

Mesures phase 2 (ce changement), refaites avec le modèle couleur corrigé : voir `docs/phase2-findings.md`. Elles n'ont pu être prises que sur le rendu logiciel (SwiftShader, pas de GPU) de ce bac à sable, ce qui gonfle le coût des étapes GPU d'un facteur 8 à 20 par rapport à la phase 0 ; le critère des 200 ms reste donc **mesuré comme tenu sur le matériel de la phase 0, pas reconfirmé sur GPU réel par ce changement**. Détails et nombres exacts dans `docs/phase2-findings.md`.

## Alternatives rejetées

- `pageColors`/`forcePageColors` de PDF.js : transforme les images en noir et blanc (pdf.js #17826), flashs blancs documentés au défilement (pdf.js #18680). Écarté dès la phase 0.
- Filtre `filter: invert` sur l'embed natif : sans effet dans les Chromium récents (plus d'`<embed>` accessible, shadow root fermé). Concerne le moteur B, pas ce document.

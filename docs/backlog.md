# Backlog

Points relevés à la revue de la phase 0, avec la phase où ils seront traités. Chaque correction visuelle est livrée avec des captures avant/après.

## Phase 2 : moteur de recoloration

### Défauts visibles sur les captures

- [ ] **Rampe de gris cassée** (`recolor-shader.png`, `recolor-hook.png`, `recolor-compare.png`) : cases 4 à 7 identiques (vers `#8c8c8c`) avec un saut juste avant. Test unitaire : la rampe 0..255 reste strictement monotone après mapping, avec un écart de L minimum entre deux pas.
- [ ] **Orange devenu marron** (triangle) : pour les couleurs à forte chroma et à luminance moyenne ou haute, ne pas inverser linéairement la luminance mais les ramener dans une bande lisible. Les couleurs très claires (surlignages, aplats pastel) continuent de s'inverser.
- [ ] **Bordures de liens hyperref** (arXiv, `#00ff00`) dans la couche d'annotations, non traitées par le shader : les recolorer en CSS avec le même modèle, plus une option pour masquer les bordures de liens.
- [ ] **Scans** : papier plus clair que le fond du thème (`#2a` contre `#1e`) et texte peu contrasté. Normaliser les niveaux des pages scannées avant mapping (percentiles 5 et 95).
- [ ] **Jointures** : vérifier que le blanc traité par le shader égale exactement le fond CSS de `.page`, sinon on voit la limite entre pages traitées et non traitées.

### Risques à couvrir

- [ ] `imagesRightClickMinSize = 999999999` repose sur un comportement interne de PDF.js : test qui détecte des `imageCoordinates` vides alors que la page contient des images, et bascule alors sur le parcours de l'operator list.
- [ ] Pages rendues dont l'original n'est plus conservé : les invalider au changement de thème (nouveau rendu PDF.js).
- [ ] Miniatures générées depuis le canvas de la page : vérifier qu'elles ne cassent pas si le résultat est affiché via `bitmaprenderer`, et décider si elles sont thémées.
- [ ] Changement de thème en moins de 200 ms : critère **mesuré** en fin de phase 2, pas une estimation.

### Déjà prévu

- [ ] Modèle couleur en OKLab/OKLCh : référence TypeScript testée, portage GLSL, LUT générée sur GPU.
- [ ] Classement des images (`auto`) sur GPU (réduction puis `readPixels` 48x48) au lieu de la relecture CPU.
- [ ] Coordonnées d'images après rotation (PDF.js ne les recalcule pas).
- [ ] Surlignages de l'éditeur (SVG en `mix-blend-mode: multiply`) lisibles sur fond sombre.
- [ ] Affichage direct du résultat WebGL (`transferToImageBitmap` vers `bitmaprenderer`) pour supprimer la recopie.

## Phase 4 : moteur B

- [ ] Inset par défaut : 56 px (Chrome, Opera), 41 px (Edge).
- [ ] Piste : garder sombre le fond autour des pages (`rgb(40, 40, 40)`) avec un filtre SVG non séparable.

## Phase 1 : fait

- [x] Parcours `file://` sans accès aux fichiers : test e2e automatique (`test/e2e/file-access.spec.ts`), qui retire l'accès par `chrome://extensions` après avoir activé le mode développeur.

## Phase 6 : qualité

- [ ] Repli sans WebGL2 : même modèle couleur (référence TypeScript) exécuté en CPU dans un Worker.
- [ ] Brave et Vivaldi à tester.

# Backlog

Points relevés à la revue de la phase 0, avec la phase où ils seront traités. Chaque correction visuelle est livrée avec des captures avant/après.

## Phase 2 : moteur de recoloration

### Défauts visibles sur les captures

- [x] **Rampe de gris cassée** (`recolor-shader.png`, `recolor-hook.png`, `recolor-compare.png`) : cases 4 à 7 identiques (vers `#8c8c8c`) avec un saut juste avant. Test unitaire : la rampe 0..255 reste strictement monotone après mapping, avec un écart de L minimum entre deux pas. **Fait** : `src/color/remap.ts` + `remap.test.ts`, captures `docs/phase2/recolor-shader-fixed.png` et `recolor-hook-fixed.png`. Détails : `docs/phase2-findings.md`.
- [x] **Orange devenu marron** (triangle) : pour les couleurs à forte chroma et à luminance moyenne ou haute, ne pas inverser linéairement la luminance mais les ramener dans une bande lisible. Les couleurs très claires (surlignages, aplats pastel) continuent de s'inverser. **Fait** : bande de luminance 35-70 % du trajet bg→fg pour les couleurs saturées sous ~L=0.8, exemption au-delà. Voir `docs/ADR-001-recoloration.md`.
- [x] **Bordures de liens hyperref** (arXiv, `#00ff00`) dans la couche d'annotations, non traitées par le shader : les recolorer en CSS avec le même modèle, plus une option pour masquer les bordures de liens. **Fait** : `src/viewer/engine/link-borders.ts` (lecture/réécriture du style en ligne et du `stroke` SVG), `theme.hideLinkBorders`. **Réserve** : vérifié sur un fixture dédié (`spikes/fixtures/make-link-border.mjs`), pas sur le fichier arXiv réel — `arxiv.org` est bloqué par la politique réseau de la session qui a fait ce correctif. À revérifier sur le fichier d'origine dès qu'une session avec accès réseau complet est disponible.
- [x] **Scans** : papier plus clair que le fond du thème (`#2a` contre `#1e`) et texte peu contrasté. Normaliser les niveaux des pages scannées avant mapping (percentiles 5 et 95). **Fait** : `src/color/scan-normalize.ts`, appliqué par page avant le LUT dans `recolor-controller.ts`.
- [x] **Jointures** : vérifier que le blanc traité par le shader égale exactement le fond CSS de `.page`, sinon on voit la limite entre pages traitées et non traitées. **Fait** : `makeRemap` court-circuite blanc/noir purs vers `bg`/`fg` exacts ; `.page` prend `--page-bg-color: var(--noct-bg)`.

### Risques à couvrir

- [x] `imagesRightClickMinSize = 999999999` repose sur un comportement interne de PDF.js : test qui détecte des `imageCoordinates` vides alors que la page contient des images, et bascule alors sur le parcours de l'operator list. **Fait** : `src/viewer/engine/operator-list-fallback.ts`.
- [x] Pages rendues dont l'original n'est plus conservé : les invalider au changement de thème (nouveau rendu PDF.js). **Fait** : `reprocessAll()` ignore les canvases détachés (`isConnected === false`) plutôt que de les recolorer.
- [x] Miniatures générées depuis le canvas de la page : vérifier qu'elles ne cassent pas si le résultat est affiché via `bitmaprenderer`, et décider si elles sont thémées. **Vérifié par lecture du code vendu** (pas de `bitmaprenderer` en jeu : `pageView.thumbnailCanvas` est `pageView.canvas`) : oui, thémées. Un risque réel de miniature figée sur les pixels non traités a été trouvé et corrigé (le `pagerendered` interne de PDF.js s'exécute avant le nôtre) : `src/viewer/layer.ts` régénère l'image de la miniature après notre traitement.
  - [ ] Lacune restante : un changement de thème en direct ne régénère pas les miniatures déjà affichées (seul `reprocessAll()` tourne, pas de nouveau `pagerendered`). À corriger si ça se révèle gênant en usage réel.
- [x] Changement de thème en moins de 200 ms : critère **mesuré** en fin de phase 2, pas une estimation. **Mesuré, avec réserve** : tenu sur le matériel GPU de la phase 0 (projeté sous 100 ms), mais remesuré à 173-246 ms dans cette session faute de GPU (rendu logiciel SwiftShader, qui gonfle d'un facteur ~20 le coût de la recopie GPU→canvas, pas celui du calcul JS de la LUT qui lui reste cohérent avec la phase 0). Détails et tableau dans `docs/phase2-findings.md`.
  - [ ] À reconfirmer sur GPU réel (machine de la phase 0 ou équivalent) avant de clore ce critère d'acceptation.

### Déjà prévu

- [x] Modèle couleur en OKLab/OKLCh : référence TypeScript testée (`src/color/`), portage GLSL (`src/viewer/engine/shader-recolorer.ts`), LUT générée en JS (CPU) à la résolution 17³ validée par la phase 0 (32-53 ms, sous le budget).
  - [ ] LUT générée sur GPU (shader dédié) : non fait, pas nécessaire pour tenir le budget de 200 ms (la génération CPU à 17³ suffit, voir ci-dessus), mais resterait une optimisation possible si la résolution devait monter.
- [x] Classement des images (`auto`) : fait en CPU (`src/viewer/engine/image-policy.ts`, échantillon 48x48), pas sur GPU comme envisagé. Suffisant au budget mesuré en phase 0 (17-65 ms par page, une seule fois par page grâce au cache de classification) ; à revoir seulement si ça devient un goulot mesuré.
- [x] Coordonnées d'images après rotation (PDF.js ne les recalcule pas) : la reprojection pour le detail-view (`src/viewer/engine/image-rects.ts`) gère l'échelle/offset ; la rotation de page elle-même n'a pas été testée explicitement avec un PDF pivoté — à vérifier avec un fixture dédié.
- [ ] Surlignages de l'éditeur (SVG en `mix-blend-mode: multiply`) lisibles sur fond sombre : pas traité en phase 2, reporté.
- [ ] Affichage direct du résultat WebGL (`transferToImageBitmap` vers `bitmaprenderer`) pour supprimer la recopie : pas fait. Les mesures de phase 2 (`docs/phase2-findings.md`) montrent que c'est justement la recopie GPU→canvas qui coûte le plus cher sous rendu logiciel ; à re-prioriser selon les mesures sur GPU réel.
- [ ] Mode comparaison (moitié originale, moitié thémée) exposé à l'utilisateur : le shader le supporte déjà (`ProcessOptions.split`), mais rien dans l'interface (popup/options, phase 3) ne le pilote encore.

## Phase 4 : moteur B

- [ ] Inset par défaut : 56 px (Chrome, Opera), 41 px (Edge).
- [ ] Piste : garder sombre le fond autour des pages (`rgb(40, 40, 40)`) avec un filtre SVG non séparable.

## Phase 1 : fait

- [x] Parcours `file://` sans accès aux fichiers : test e2e automatique (`test/e2e/file-access.spec.ts`), qui retire l'accès par `chrome://extensions` après avoir activé le mode développeur.

## Phase 6 : qualité

- [ ] Repli sans WebGL2 : même modèle couleur (référence TypeScript) exécuté en CPU dans un Worker. En attendant, phase 2 a ajouté un repli minimal : pages non thémées plutôt que cachées indéfiniment si WebGL2 est indisponible (`src/viewer/layer.ts`).
- [ ] Brave et Vivaldi à tester.
- [ ] Rejouer les captures et mesures de performance de `docs/phase2-findings.md` sur une machine avec GPU réel (la session qui a fait ces corrections n'en avait pas).
- [ ] Revérifier la recoloration des bordures de liens hyperref sur le fichier arXiv 1706.03762 réel (la session qui a fait ce correctif n'avait pas d'accès réseau vers arxiv.org).

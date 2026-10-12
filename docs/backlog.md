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

## Phase 3 : interface

- [x] Préréglages de thème, éditeur avec aperçu en direct et import/export, page d'options complète, habillage « enhanced » de la barre d'outils PDF.js. Détails et décisions : `docs/phase3-findings.md`.
- [x] Bug trouvé en vérifiant réellement l'UI dans un navigateur (pas seulement le typecheck) : ajouter une règle par site l'effaçait aussitôt (schéma trop strict sur un motif vide). Corrigé, testé (`settings.test.ts`).
- [x] Choix du moteur par site : résolu, voir phase 5.
- [ ] « Réappliquer » (popup, moteur B) : sans objet avant la phase 4.
- [ ] Mode comparaison exposé dans l'interface (popup ou options) : le shader le supporte déjà (`ProcessOptions.split`).
- [ ] Miniatures qui restent à jour pendant un changement de thème en direct (lacune phase 2, toujours ouverte).
- [ ] Suite e2e (`npm run test:e2e`) : la version de Chromium préinstallée dans les sessions sandboxées (1194) ne correspond pas à celle attendue par `@playwright/test` 1.63 (1243), et même en pointant vers l'exécutable disponible, le service worker n'expose pas `chrome.declarativeNetRequest` dans cette combinaison. Distinct du bac à sable qui a servi à la phase 2 (qui n'avait pas ce problème avec Puppeteer). À corriger pour qu'une session sandboxée puisse faire tourner la suite e2e existante.

## Phase 4 : moteur B

- [x] Inset par défaut : 56 px (Chrome, Opera), 41 px (Edge), détection Edge via `navigator.userAgentData.brands`, `coverToolbar` pour le forcer à 0. **Fait** : `src/content/native-overlay-logic.ts` (`resolveToolbarInset`), testé.
- [x] Couche unique `backdrop-filter: url(#svg)` (invert + hueRotate(180) + tables par canal), insérée une fois au `DOMContentLoaded` plus un `MutationObserver` de secours (pas de ré-insertion par timers multiples, cf. phase 0). **Fait** : `src/content/native-overlay.ts`.
- [x] Quatre styles : `smart` (suit le thème choisi pour le moteur A), `pure` (noir/blanc purs), `warm` (palette sépia fixe), `mono` (désature avant le mapping). **Fait**, testé (`native-overlay-logic.test.ts`).
- [x] Réactivité aux changements de réglages (`storage.onChanged`) sans recharger la page, activation uniquement si `engine === "native-overlay"`. **Fait**, vérifié avec un vrai navigateur (voir ci-dessous).
- [x] Impression : la couche est cachée en CSS (`@media print`) plutôt que par des écouteurs `beforeprint`/`afterprint`, plus simple et robuste (fonctionne même si l'impression vient du moteur PDF natif, hors de notre portée JS).
- [x] Communication honnête des limites : bandeau discret (coin bas-droit) listant les limites (images inversées, fond alentour plus clair) avec un bouton vers le moteur A (`noct:switchToEnhanced`, nouveau message). **Fait**, vérifié avec un vrai navigateur.
- [x] Vérifié avec un vrai Chromium (pas seulement typecheck/lint) : bundle compilé chargé dans une page servie en HTTP avec `Content-Type: application/pdf`, `chrome.*` simulé. Confirme le montage initial, la bascule de style en direct, l'envoi du message au clic, et le démontage complet au changement de moteur.
- [ ] Détection des `<embed>`/`<object>` plein cadre insérés **après** le chargement initial de la page (cas rare) : seule la détection au chargement et au changement de réglages est couverte, pas de détection continue comme pour le moteur A (`animationstart`). À ajouter si ça se révèle gênant en usage réel.
- [ ] Le bandeau de limites, une fois fermé, ne réapparaît plus pour la durée de vie de la page mais n'est pas mémorisé entre pages/onglets (pas de `sessionStorage`) : choix délibéré pour rester simple, à revoir si jugé répétitif à l'usage.
- [ ] Piste non retenue : garder sombre le fond autour des pages avec un filtre SVG non séparable — hors de portée du moteur B qui ne contrôle que la page web autour du plugin PDF natif, pas son chrome interne.

## Phase 5 : finitions

- [x] Résolution des règles par site contre le document courant : `src/settings/site-rules.ts` (`resolveSiteRule`/`resolveEffectiveSettings`, motifs façon Chrome `*://*.example.com/*`, testé). Branché partout où le moteur/thème global était lu directement :
  - `background/index.ts` (`noct:shouldTakeOverPdfDocument`, PDF non interceptées par DNR) ;
  - `content/pdf-embeds.ts` (`<embed>`/`<object>`), résolu par l'URL de l'embed et non plus globalement ;
  - `content/native-overlay.ts` (moteur B), résolu par `document.URL` ;
  - `background/dnr-rules.ts` : règles DNR dédiées, plus prioritaires que tout le reste — exclusion (allow) quand le site veut un autre moteur que le global « enhanced », redirection forcée (uniquement sur le `content-type: application/pdf` standard, pas les heuristiques octet-stream/extension/Content-Disposition ni `file://`) quand le site veut « enhanced » alors que le global ne l'est pas. Testé (`dnr-rules.test.ts`).
  - Page d'options : sélecteurs moteur/thème par règle ajoutés (`App.vue`), vérifiés avec un vrai navigateur (le JSON stocké contient bien le bon override après un enregistrement).
- [x] Raccourcis clavier (`commands`) : `toggle-enabled` (Ctrl/Cmd+Shift+D) et `cycle-theme` (Ctrl/Cmd+Shift+T). **Fait** : `src/background/commands.ts`, déclarés dans `wxt.config.ts`.
- [x] Menu contextuel sur les liens PDF : « Ouvrir dans le lecteur amélioré » / « Ouvrir dans le lecteur intégré », sans d'abord naviguer puis basculer depuis le popup. **Fait** : `src/background/context-menu.ts`, permission `contextMenus` ajoutée.
- [x] Onboarding minimal : la page d'options s'ouvre automatiquement à la première installation (`runtime.onInstalled`, `reason === "install"`), sur la section thème (vue par défaut déjà existante). Pas de parcours dédié construit en plus : la page d'options existante suffit comme première prise en main.
- [x] Ajouts à la page de diagnostics : raccourcis clavier effectivement assignés par Chrome (`chrome.commands.getAll()`), utile car Chrome peut laisser une combinaison non assignée en cas de conflit. **Fait** et vérifié avec un vrai navigateur.
- [ ] Le menu contextuel ne vérifie le lien que par motif d'URL (`*.pdf*`) côté navigateur, pas par `content-type` réel (impossible à connaître avant de cliquer) : un lien qui se termine en `.pdf` mais n'en est pas un échouera comme n'importe quel lien mal formé, un lien PDF sans extension `.pdf` dans l'URL n'aura pas l'entrée de menu.
- [ ] Le motif de règle par site (`*://*.example.com/*`) couvre le sous-ensemble courant des motifs Chrome (schéma, hôte avec joker, port explicite, chemin avec jokers) mais pas le mot-clé spécial `<all_urls>`.

## Phase 1 : fait

- [x] Parcours `file://` sans accès aux fichiers : test e2e automatique (`test/e2e/file-access.spec.ts`), qui retire l'accès par `chrome://extensions` après avoir activé le mode développeur.

## Phase 6 : qualité

- [ ] Repli sans WebGL2 : même modèle couleur (référence TypeScript) exécuté en CPU dans un Worker. En attendant, phase 2 a ajouté un repli minimal : pages non thémées plutôt que cachées indéfiniment si WebGL2 est indisponible (`src/viewer/layer.ts`).
- [ ] Brave et Vivaldi à tester.
- [ ] Rejouer les captures et mesures de performance de `docs/phase2-findings.md` sur une machine avec GPU réel (la session qui a fait ces corrections n'en avait pas).
- [ ] Revérifier la recoloration des bordures de liens hyperref sur le fichier arXiv 1706.03762 réel (la session qui a fait ce correctif n'avait pas d'accès réseau vers arxiv.org).

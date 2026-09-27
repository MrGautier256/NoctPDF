# Phase 0 : conclusions de la validation technique

Date : 27 septembre 2026. Machine de test : Windows 11, Intel Core i7-1065G7, GPU Intel Iris Plus (ANGLE D3D11), 16 Go.

Navigateurs testés :

| Navigateur | Version | Base Chromium |
|---|---|---|
| Chrome | 153.0.8010.54 | 153 |
| Opera GX | 136.0.6008.67 | 152.0.7977.120 |
| Edge | 154.0.4258.37 | 154 |

Brave et Vivaldi ne sont pas installés sur la machine : non testés.

Tous les prototypes sont dans `spikes/` (voir `spikes/README.md` pour les relancer). Les captures citées sont copiées dans `docs/phase0/`.

---

## Résumé des décisions proposées

1. **Recoloration : approche 2 (post-traitement WebGL2) en moteur principal**, avec le masque d'images fourni par le traqueur d'images **intégré à PDF.js 6.x**. L'approche 1 (interception canvas) reste en repli si WebGL2 est indisponible.
2. **Espace couleur : OKLab** (justification détaillée dans l'ADR de la phase 2).
3. **Base : le build `gulp chromium` de PDF.js 6.3.289**, mais on n'en garde que le viewer (`content/`). Le service worker est le nôtre, en TypeScript, avec la logique DNR portée depuis `pdfHandler.js` (sans la télémétrie du build officiel).
4. **Interception : la condition DNR `responseHeaders` fonctionne** sur Chrome 153, Opera GX 136 et Edge 154 (13 cas sur 13 dans chaque navigateur).
5. **Moteur B : `backdrop-filter: url(#svg)` fonctionne** sur les pages du lecteur natif dans les trois navigateurs. On peut donc appliquer les couleurs exactes du thème, sans approximation par `mix-blend-mode`.

## Hypothèses du cahier des charges qui se révèlent fausses

| Hypothèse | Réalité mesurée | Conséquence |
|---|---|---|
| PDF.js est en 5.x, la 6.x est annoncée | La 6.x est sortie : **6.3.289** (29 août 2026), après 6.0 (mai), 6.1 (juin), 6.2 (juillet) | On cible 6.3.289 |
| `filter: invert` sur l'embed touche l'interface mais pas les pages | Dans Chrome 153 et Opera 136, **il n'y a plus d'`<embed>` accessible** : le `<body>` du document PDF ne contient qu'un `<link>` vers `pdf_embedder.css`, le reste est dans un shadow root fermé. Le filtre n'a donc aucune cible et aucun effet | L'option "legacy" n'a plus de sens. Un filtre sur `<html>` inverse tout, barre d'outils comprise (voir § 5) |
| Détection d'un PDF natif : contentType, sinon un `<embed>` de type PDF | La détection par `<embed>` échoue pour un PDF de premier niveau (même raison). `document.contentType === "application/pdf"` fonctionne partout, y compris dans une iframe | Détection par `contentType` en premier. La forme `<embed>` ne sert plus que pour les embeds placés par une page web |
| Il faut réinsérer le calque à la frame suivante, au `load`, à 250 ms, 800 ms et 2 s | Un calque inséré **une seule fois** au `DOMContentLoaded` reste au-dessus des pages (Chrome 153 et Opera 136, en fenêtré) | On garde une réinsertion idempotente peu coûteuse (MutationObserver) par sécurité, sans les minuteries |
| L'interception canvas (approche 1) est fragile si PDF.js rend dans un worker | PDF.js 6.3 rend **toujours sur le thread principal** avec un contexte 2D. Le worker ne fait que l'analyse et le décodage des images | L'approche 1 reste viable ; elle n'est pas retenue en principal pour d'autres raisons (§ 2) |
| Le build `chromium` est une bonne base telle quelle | Son service worker envoie une **télémétrie quotidienne** (`telemetry.js` vers `pdfjs.robwu.nl`) | On n'embarque que `content/` et on écrit notre propre service worker |
| Tests e2e : Playwright avec Chromium chargeant l'extension | Chrome (marque Google) ignore `--load-extension` depuis la version 137. Il faut passer par la méthode CDP `Extensions.loadUnpacked` (connexion par pipe). C'est ce que font les prototypes, avec `puppeteer-core` | Playwright avec son Chromium embarqué pour la CI ; scripts CDP pour Chrome, Opera et Edge installés |

Autre constat d'environnement : **Node.js n'est pas installé** sur la machine. Les prototypes ont tourné avec un Node 24.21.0 LTS portable placé dans un dossier temporaire. Il faudra une installation durable avant la phase 1 (voir la question 5 en fin de document).

---

## 1. Dernière version stable de PDF.js et pipeline de rendu

**Version : 6.3.289**, publiée le 29 août 2026 (`pdfjs-dist@6.3.289` sur npm, tag `v6.3.289` sur GitHub).

Pipeline observé (instrumentation de tous les appels 2D pendant le rendu de `sample.pdf`, et lecture du code source) :

- **Rendu des pages : thread principal**, `CanvasGraphics` dessine dans le `CanvasRenderingContext2D` du canvas de la page. Pages 1 et 2 de l'échantillon : 508 `fillText`, 23 `fill`, 12 `stroke`, 3 `drawImage` (photo, schéma, scan), aucun appel sur un `OffscreenCanvasRenderingContext2D` du thread principal.
- **Images : décodées dans le worker** en `ImageBitmap` (via `OffscreenCanvas` côté worker, option `isOffscreenCanvasSupported`), puis dessinées par `drawImage(ImageBitmap)`. Les masques d'image et certaines images inline passent encore par un canvas temporaire.
- **WebGPU (nouveau en 6.x)** : option `enableWebGPU`, activée par défaut dans le viewer. Elle ne sert **qu'aux dégradés de type maillage** (shadings Gouraud, types 4 à 7), rastérisés dans un `OffscreenCanvas` puis composés dans la page.
- **Modules wasm** livrés dans `web/wasm/` : `openjpeg.wasm` (JPEG 2000), `jbig2.wasm`, `qcms_bg.wasm` (profils ICC), `quickjs-eval.wasm` (bac à sable JavaScript des formulaires), avec des repli JavaScript. La CSP doit contenir `'wasm-unsafe-eval'` (le build chromium l'a déjà).
- **Detail canvas** : activé par défaut (`enableDetailCanvas: true`). Au fort zoom, un second canvas couvre seulement la zone visible, par-dessus le canvas basse résolution de la page. Il n'est affiché qu'une fois complet quand le canvas de base est déjà fini. L'événement `pagerendered` le signale avec `isDetailView: true`.
- **Affichage progressif au premier rendu** : sans `pageColors`, PDF.js affiche le canvas **avant la fin du rendu** (mise à jour toutes les 500 ms via un canvas temporaire). Pour un post-traitement pixel, il faut donc masquer le canvas tant qu'il n'est pas traité, sinon on verrait un flash du rendu blanc. Le prototype le fait en CSS (`canvas:not([data-noct]) { visibility: hidden }`) et le fond `.page` prend la couleur `bg` : aucun flash observé.
- **Nouveau en 6.x : `CanvasImagesTracker`**. Quand l'option `imagesRightClickMinSize` vaut autre chose que `-1`, PDF.js enregistre pendant le rendu la position de chaque image dessinée, sous forme de rectangle éventuellement tourné (3 points), en **coordonnées normalisées** (0 à 1) du canvas. Le résultat est exposé sur `pageView.imageCoordinates`.

## 2. Approche 1 (interception canvas) et approche 2 (post-traitement avec masque)

Les deux ont été prototypées sur PDF.js 6.3.289 avec le même modèle couleur OKLab (`spikes/recolor/`), puis comparées sur trois documents : l'échantillon généré, l'article arXiv 1706.03762 et `tracemonkey.pdf`.

### Viabilité

- **Approche 1 : viable.** Envelopper les setters `fillStyle` et `strokeStyle` et la méthode `drawImage` de `CanvasRenderingContext2D.prototype` suffit, parce que le rendu reste sur le thread principal. doq 2.6 (août 2026) cible d'ailleurs PDF.js 6.0.227 avec cette technique.
- **Approche 2 : viable, et plus simple que prévu.** Il n'est **pas nécessaire de parcourir l'operator list** nous-mêmes : le traqueur intégré à PDF.js donne déjà les rectangles d'images, rotation et découpe comprises. Il couvre `paintImageXObject` et `paintInlineImageXObject`. Il ne couvre pas `paintImageXObjectRepeat` ni `paintInlineImageXObjectGroup` (images répétées ou groupées, rares) : un parcours de l'operator list limité à ces deux opérateurs servira de complément. Les masques pochoirs (`paintImageMaskXObject`) ne sont pas enregistrés, ils sont donc bien recolorés, comme le demande le cahier des charges.

Deux pièges relevés dans le traqueur :

- Hors Firefox, `imagesRightClickMinSize` est à `-1` parce que l'option insère des canvas invisibles dans la couche texte, ce qui **dégrade la sélection de texte dans Chrome**. Parade sans patch : une valeur énorme (par exemple `999999999`). L'enregistrement reste actif et aucun canvas n'est créé, puisque chaque image est plus petite que le minimum.
- Les coordonnées sont calculées au premier rendu et **ne sont jamais recalculées après une rotation**. Notre couche devra leur appliquer la rotation courante (transformation triviale du carré unité).

### Résultat visuel

Rendu quasiment identique entre les deux approches pour le texte et les vecteurs, ce qui est attendu avec le même modèle couleur : texte `fg` sur fond `bg`, lien bleu resté bleu et lisible, rouge et vert conservés, surlignage jaune devenu un jaune sombre sous du texte clair, tableau coloré lisible (captures `recolor-shader.png` et `recolor-hook.png`).

Différences observées :

- **Images** : l'approche 2 applique une politique par image. Le mode `auto` du prototype (part de pixels clairs et nombre de couleurs dominantes, sur une vignette 48x48) a bien classé la photo en `dim` (1 % de pixels clairs, 15 couleurs) et le schéma en `invert` (87 % de pixels clairs, 6 couleurs). Avec l'approche 1, on ne voit que `drawImage(ImageBitmap)` : le classement demanderait de lire les pixels de l'image, ce qui est possible mais sans avantage.
- **Pages scannées** : détectées par l'approche 2 (image couvrant au moins 85 % de la page et couche texte vide), puis recolorées entièrement (`recolor-scan.png`). L'approche 1 laissait le scan presque blanc.
- **Coup d'œil et comparaison** : immédiats avec l'approche 2, puisqu'on garde l'original. La comparaison moitié-moitié (`recolor-compare.png`) est un simple uniforme du shader.
- **Fort zoom (400 %)** : le detail canvas est correctement traité, avec les rectangles d'images reprojetés dans sa zone.

Défauts du modèle couleur du prototype, à corriger en phase 2 :

- Le garde-fou de contraste s'appliquait à toutes les couleurs sombres : il écrasait les gris moyens de la rampe (cases 4 à 7 identiques, vers `#8c8c8c`, avec un saut juste avant ; visible sur `recolor-shader.png`, `recolor-hook.png` et `recolor-compare.png`). Correction relevée à la relecture : j'ai modifié le code du prototype (garde-fou limité aux couleurs saturées) **après** les captures, sans refaire de capture pour le vérifier. Le bug n'est donc pas démontré corrigé ; il est traité en phase 2 avec un test de monotonie et des captures avant/après.
- Les éléments déjà sombres (en-tête de tableau gris foncé, encadré bleu nuit) deviennent clairs. C'est la nature d'une inversion de luminance ; une option "préserver les aplats sombres" sera étudiée en phase 2.

### Performance (Chrome 153 headless, GPU Iris Plus réel via ANGLE)

Coût du post-traitement par page, en régime établi, médiane sur 20 passes :

| Document | Pixels du canvas | Copie de l'original | Envoi et shader | Recopie dans le canvas | **Total** |
|---|---|---|---|---|---|
| sample, DPR 1 | 1,39 Mpx | 0,3 ms | 0,2 ms | 3,8 ms | **4,3 ms** |
| tracemonkey, DPR 1 | 1,34 Mpx | 0,2 ms | 0,1 ms | 5,0 ms | **5,5 ms** |
| sample, DPR 2 | 5,56 Mpx | 0,3 ms | 0,2 ms | 9,5 ms | **10 ms** |
| tracemonkey, DPR 2 | 5,38 Mpx | 0,3 ms | 0,2 ms | 14,1 ms | **15 ms** |

- **Dans le budget de 16 ms par page visible**, y compris en DPR 2. Le poste principal est la recopie du résultat WebGL dans le canvas 2D : on peut l'éviter en affichant directement le résultat (`transferToImageBitmap` vers un canvas `bitmaprenderer`).
- Premier traitement de la session : environ 37 ms (compilation du shader), une seule fois.
- **Classement des images (`auto`)** : 17 à 65 ms par page à cause d'une relecture CPU des pixels. Il n'est fait qu'une fois par page, mais il faudra le passer côté GPU (réduction dans un petit framebuffer puis `readPixels` de 48x48).
- **LUT 3D calculée en JavaScript** : 250 à 530 ms en 33³, 32 à 53 ms en 17³. **Trop lent pour un changement de thème sous 200 ms.** Le modèle couleur sera donc écrit aussi en GLSL, la LUT générée par le GPU (moins d'une milliseconde), la version TypeScript servant de référence testée.
- **Changement de thème mesuré** :
  - Approche 1 : il faut refaire le rendu PDF.js des pages visibles, soit 38 à 155 ms sur ces documents. Ce temps croît avec la complexité des pages (cartes, plans : plusieurs secondes possibles).
  - Approche 2 : retraitement des pages visibles en 1 à 15 ms chacune, plus la génération de la LUT. Avec une LUT générée sur GPU, moins de 50 ms attendus quelle que soit la complexité des pages.
- Coût mémoire de l'approche 2 : une copie de l'original par page rendue (environ 22 Mo en DPR 2). On ne garde les originaux que pour les pages visibles ; les autres seront retraitées à la demande.

### Recommandation

**Approche 2 en principal, approche 1 en repli**, derrière une interface `Recolorer` commune :

- `ShaderRecolorer` (défaut) : WebGL2, masque d'images du traqueur PDF.js, politique d'image par rectangle, pages scannées, coup d'œil, comparaison, changement de thème instantané. Il ne dépend que d'APIs publiques et stables (`pagerendered`, `pageView.canvas`, `imageCoordinates`), donc il résiste mieux aux évolutions internes de PDF.js.
- `DrawHookRecolorer` (repli) : si WebGL2 est indisponible (GPU sur liste noire, par exemple). Moins de fonctions (pas de classement d'images, thème appliqué par un nouveau rendu).
- Piste pour le garde-fou "contraste par rapport au fond réellement dessiné" : l'approche 2 ne distingue pas le texte d'un aplat au niveau du pixel. L'inversion de luminance préserve l'ordre des contrastes, ce qui suffit dans les cas testés. Pour aller plus loin, on pourra utiliser l'approche 1 en **mode enregistrement seul** (noter la position et la couleur des `fillText`, sans rien modifier) afin de corriger localement les zones de texte trop peu contrastées. À décider en phase 2.

## 3. Build `gulp chromium` ou composants `pdf_viewer`

**Recommandation : le build `chromium`, en n'utilisant que son dossier `content/`.**

Mesures : `npx gulp chromium` sur le tag `v6.3.289` fonctionne, en 2 min 30 environ (après un `npm ci` des dépendances de développement de PDF.js). Le résultat pèse 12 Mo : `content/build/` (pdf.mjs, pdf.worker.mjs, pdf.sandbox.mjs), `content/web/` (viewer complet, CSS, locales, cmaps, polices standard, profils ICC, wasm).

Pourquoi ce build plutôt que les composants de `pdfjs-dist` :

- Il contient le viewer complet : recherche, sommaire, miniatures, pièces jointes, calques, impression, formulaires, éditeur (surlignage, dessin, texte, signature), propriétés, mot de passe, présentation, i18n. Refaire tout cela avec `PDFViewer`, `EventBus`, `PDFLinkService` et `PDFFindController` représenterait des semaines de travail.
- Son intégration navigateur (`chromecom.js`) gère déjà : l'URL au format `?DNR:<url>` produite par la règle de redirection, l'accès aux `file://` avec l'écran d'aide pour l'activer, la transmission du `Referer`, et la lecture des préférences dans `chrome.storage`.
- Le viewer "generic" (disponible précompilé) rejette les fichiers d'une autre origine et n'a pas cette intégration.

Ce qu'on **ne reprend pas** :

- `background.js` et les scripts qu'il charge : `telemetry.js` (ping quotidien vers un serveur tiers, contraire à la règle "aucune télémétrie"), `suppress-update.js`, la page d'options de PDF.js.
- À la place : notre service worker TypeScript, qui porte les règles DNR de `pdfHandler.js` (Apache 2.0, crédité) et répond au petit protocole attendu par le viewer : messages `getParentOrigin`, `isAllowedFileSchemeAccess`, `openExtensionsPageForFileAccess`, et port `chromecom-referrer` (logique de `preserve-referer.js`, à porter aussi).

Contraintes relevées :

- Le viewer suppose le chemin `/content/web/viewer.html` : le dossier `content/` doit être copié tel quel à la racine du paquet.
- La CSP de `viewer.html` (`style-src 'self'`) interdit les `<style>` en ligne : notre CSS sera dans des fichiers.
- L'événement `webviewerloaded` n'existe que dans le build generic. Pour charger notre couche, il faut **un patch d'une ligne** dans `viewer.html` (une balise `<script type="module">`), appliqué par script depuis `patches/`. Nos options PDF.js (`imagesRightClickMinSize`, couleurs de l'interface, etc.) passent par `PDFViewerApplicationOptions` ou par les préférences stockées dans `chrome.storage`.
- Les préférences PDF.js sont stockées à la racine de `chrome.storage.sync`, clé par clé : nos réglages devront vivre sous une clé à part (par exemple `noctpdf`).
- `scripts/update-pdfjs.ts` devra cloner le tag, faire `npm ci` puis `gulp chromium` dans un dossier temporaire (plusieurs centaines de Mo de dépendances, quelques minutes), puis copier `build/chromium/content/` dans `vendor/pdfjs/` et réappliquer les patches.

## 4. La condition DNR `responseHeaders`

**Elle fonctionne sur les trois navigateurs.** Prototype : `spikes/dnr-ext/` (règles adaptées de `pdfHandler.js`, plus une règle `attachment` pour la frame principale et la règle de session "ouvrir dans le lecteur natif").

| Cas | Attendu | Chrome 153 | Opera GX 136 | Edge 154 |
|---|---|---|---|---|
| `application/pdf`, avec `#page=2` | redirigé, fragment conservé | OK | OK | OK |
| Sans extension `.pdf` (type arXiv) | redirigé | OK | OK | OK |
| `octet-stream` et chemin `.pdf` | redirigé | OK | OK | OK |
| `octet-stream` et `Content-Disposition` avec un nom `.pdf` | redirigé | OK | OK | OK |
| `application/pdf; charset=...` | redirigé | OK | OK | OK |
| `Content-Disposition: attachment` (respect activé) | téléchargé | OK | OK | OK |
| Page HTML ordinaire | intacte | OK | OK | OK |
| PDF dans une iframe | iframe redirigée | OK | OK | OK |
| PDF dans un `<embed>` d'une page web | non couvert par le DNR | OK (non redirigé) | OK | OK |
| Paramètre d'échappement de téléchargement | lecteur natif | OK | OK | OK |
| `file://` (accès aux fichiers accordé) | redirigé | OK | OK | OK |
| Formulaire POST renvoyant un PDF | lecteur natif | OK | OK | OK |
| "Ouvrir dans le lecteur natif" | natif, puis natif après rechargement, puis le PDF suivant est redirigé | OK | OK | OK |

Dans chaque cas redirigé, le viewer a bien récupéré le PDF (statut 200, signature `%PDF-`).

Précisions :

- La page cible doit figurer dans `web_accessible_resources`, sinon la redirection échoue en `ERR_BLOCKED_BY_CLIENT`.
- Le DNR ne sait pas encoder l'URL : on redirige vers `viewer.html?DNR:<url brute>`, format déjà compris par le viewer chromium. Le fragment (`#page=2`) est conservé.
- Le test de support de `pdfHandler.js` (`isHeaderConditionSupported`) renvoie vrai dans les trois navigateurs. En dessous de Chrome 128, plutôt que des regex d'URL `.pdf`, on reprendra le repli du build chromium : un content script qui repère les documents `application/pdf` et les rouvre dans le viewer.
- Le comportement par défaut du build officiel est d'**ignorer** `attachment` dans la frame principale (il affiche toujours le PDF). Notre réglage `respectAttachmentDownloads` ajoute la règle `allow` correspondante ; testé et fonctionnel.
- **"Ouvrir dans le lecteur natif"** : une règle de session `allow`, priorité maximale, limitée à `tabIds: [onglet]` et à l'URL exacte (`|url|`), fonctionne sans boucle. Elle survit au rechargement et ne touche pas les autres PDF de l'onglet.
- Les `<embed>` et `<object>` PDF d'une page web ne passent pas par le DNR : il faut un content script qui les remplace par une iframe du viewer (réglage `interception.embeddedPdfs`), comme le fait le build chromium.
- `file://` : une extension chargée par CDP reçoit l'accès aux fichiers par défaut, je n'ai donc pas pu tester le cas "accès refusé" automatiquement. Ce chemin (`webNavigation.onBeforeNavigate` puis `tabs.update` vers le viewer, qui affiche l'aide) sera vérifié à la main en phase 1 avec une extension chargée normalement.

## 5. Moteur B sur le lecteur natif

Prototype : `spikes/overlay-ext/`, six variantes, captures et échantillonnage de pixels à positions fixes (`sample-pixels.mjs`).

**`backdrop-filter` touche-t-il les pages ?** Oui, dans les trois navigateurs, en headless comme en fenêtré.

**`backdrop-filter: url(#svg)` fonctionne-t-il ?** Oui, dans les trois. Le filtre testé (inversion, rotation de teinte de 180°, puis `feComponentTransfer` qui envoie le blanc sur `bg` et le noir sur `fg`) donne des couleurs exactes. Mesures sur Chrome 153 en fenêtré (Opera identique au pixel près ; colonne `mix-blend-mode` mesurée en headless) :

| Point mesuré | Sans calque | `invert(1) hue-rotate(180deg)` | `url(#svg)` (bg `#1e1f22`, fg `#e6e3dc`) | Pile `mix-blend-mode` |
|---|---|---|---|---|
| Barre d'outils | `#3c3c3c` | `#3c3c3c` (non touchée) | `#3c3c3c` | `#3c3c3c` |
| Blanc de page | `#ffffff` | `#000000` | **`#1e1f21`** | `#1b1c1d` |
| Noir (rampe de gris) | `#000000` | `#ffffff` | **`#e6e3dc`** | `#e6e3dc` |
| Fond autour des pages | `#282828` | `#d7d7d7` | `#c6c4be` | `#c6c4be` |
| Ciel de la photo | `#609ae9` | `#3872c1` | `#4976ae` | `#98682c` |

La pile `mix-blend-mode` (`difference`, puis `screen` et `multiply`) marche aussi mais elle est moins exacte et, sans rotation de teinte, elle inverse les teintes. **Le filtre SVG sera la technique par défaut** ; les styles prédéfinis (smart, pure, mono, warm) deviennent de simples variantes de ce filtre.

**Hauteur réelle de la barre d'outils** (mesurée dans la frame interne du lecteur via CDP, puis confirmée au pixel près) :

| Navigateur | Lecteur | Barre d'outils |
|---|---|---|
| Chrome 153 | PDFium, OOPIF (`viewer-toolbar`) | **56 px** |
| Opera GX 136 | identique à Chrome | **56 px** |
| Edge 154 | lecteur Adobe Acrobat (mention "Avec Adobe Acrobat"), autre structure de frames | **40 px + 1 px de bordure** |

Edge : **inset par défaut de 41 px**. Correction après relecture : la première capture Edge avait été prise avec l'inset de 56 px du prototype, d'où une bande blanche de 8 px non couverte en haut de la page (lignes 48 à 55). Nouvelle mesure, ligne par ligne à x = 600 : lignes 0 à 39 pour la barre (`#3b3b3b`), ligne 40 pour sa bordure (`#4f4f4f`), lignes 41 à 47 pour le fond autour de la page, page à partir de la ligne 48. Avec un inset de 40, la page est entièrement couverte mais la bordure passe en gris clair (`#a8a6a2`) ; 41 px la laisse intacte. La capture `native-edge-backdrop-svg.png` a été refaite en fenêtré avec l'inset corrigé. On détectera Edge par `navigator.userAgentData.brands` pour choisir l'inset par défaut, plutôt que de déclarer le moteur B non supporté.

Limites confirmées (impossibles à contourner) :

- le fond autour des pages et le panneau des miniatures deviennent clairs (`#c6c4be` avec le filtre SVG) ;
- les images sont inversées : avec la rotation de teinte, le ciel reste bleu mais la photo devient un négatif (soleil marron).

Piste à tester en phase 4 : le fond autour des pages est exactement `rgb(40, 40, 40)`. Un filtre SVG non séparable (un masque calculé sur les trois canaux) pourrait garder sombre cette seule valeur. Non validé pour l'instant.

Filtre "legacy" : `filter: invert` sur l'embed n'a plus d'effet (§ hypothèses). Un filtre sur `<html>` inverse tout, **barre d'outils comprise** (`#c3c3c3` mesuré). Je propose de supprimer l'option "legacy" plutôt que d'offrir un rendu dégradé.

---

## Ce qui reste ouvert (sans bloquer la phase 1)

- Garde-fou de contraste local (texte sur aplat coloré) : approche retenue en phase 2.
- Recoloration des miniatures de la barre latérale et du surlignage de l'éditeur. Ce dernier est un SVG en `mix-blend-mode: multiply`, presque invisible sur fond sombre : il faudra une surcharge CSS.
- Brave et Vivaldi : à tester dès qu'ils sont installés (même moteur Chromium, aucun écart attendu).
- WXT : non évalué en phase 0. Point d'attention : le dossier `public/` doit recevoir `content/` tel quel pour respecter le chemin `/content/web/viewer.html`.

## Décisions validées (27 septembre 2026)

1. **Recoloration** : approche 2 (WebGL2) en principal. Le repli n'est **pas** un `DrawHookRecolorer` complet : c'est le même modèle couleur (la référence TypeScript) exécuté en CPU dans un Worker, pour garder les mêmes fonctions. Il sera fait en phase 6. L'interception canvas ne sert plus qu'en mode enregistrement, pour le futur garde-fou de contraste local.
2. **Espace couleur** : OKLab, avec OKLCh pour les manipulations de teinte et de chroma.
3. **Base PDF.js** : build `chromium` 6.3.289, dossier `content/` seul, versionné compilé dans `vendor/` (aucun build de PDF.js à l'installation), notre service worker, patch d'une ligne. `minimum_chrome_version` à `"128"`, sans repli pour les versions antérieures.
4. **Moteur B** : filtre SVG par défaut, option "legacy" supprimée. Inset Edge corrigé à 41 px (voir § 5).
5. **Node.js** : fnm, avec un `.node-version` (24 LTS) à la racine du dépôt.

Les problèmes relevés sur les captures et les risques à couvrir sont suivis dans `docs/backlog.md`.

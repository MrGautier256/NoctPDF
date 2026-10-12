# Préparation boutique (Chrome Web Store, et par extension Edge/Opera Addons)

Ce document réunit ce que demande le tableau de bord du développeur Chrome Web Store : description courte/longue, justification de chaque permission, réponses à l'onglet « Pratiques de confidentialité », et une checklist avant de soumettre. Rien ici n'est publié automatiquement : c'est à copier-coller dans le tableau de bord.

## 1. Avant de soumettre

- [ ] **Politique de confidentialité hébergée** : la Chrome Web Store exige une URL publique, pas un fichier de dépôt. Publier `docs/privacy-policy.md` quelque part accessible (GitHub Pages, le wiki du dépôt, ou toute page web) et coller cette URL dans l'onglet *Privacy practices* du tableau de bord.
- [ ] **Compte développeur** Chrome Web Store créé (frais unique de 5 $).
- [ ] **Zip de production** : `npm run build && npm run zip` → `.output/noctpdf-<version>-chrome.zip`.
- [ ] **Captures d'écran** : la boutique en demande au moins une (1280×800 ou 640×400). Les captures avant/après de `docs/phase2/` (`recolor-shader-fixed.png` etc., 1100×1400) montrent la recoloration mais ne sont pas aux dimensions boutique ni habillées pour la promotion — en préparer au moins une depuis une install réelle (page d'options, ou un PDF avant/après) aux bonnes dimensions avant de soumettre.
- [ ] **Icône** : `public/icon/128.png` existe déjà (manifeste) et peut servir aussi d'icône boutique.
- [ ] Vérifier `wxt.config.ts` → `manifest.version` (ou `package.json`) est à jour avant de zipper.

## 2. Description courte (≤ 132 caractères)

**FR** : `Un vrai mode sombre pour les PDF : pages thémées, images préservées, lecteur personnalisable.` (97 car.)

**EN** : `A true dark mode for PDFs: themed pages, preserved images, a fully customizable reader.` (91 car.)

## 3. Description longue

**FR**

> NoctPDF donne aux PDF un vrai mode sombre, pas juste une page noircie : les couleurs sont recolorées une par une (texte, traits, remplissages) en préservant leur teinte et leur lisibilité, tandis que les images et les photos restent reconnaissables plutôt que de virer au négatif.
>
> Deux moteurs au choix :
> - **Lecteur amélioré** : notre propre lecteur PDF.js, avec une recoloration pixel par pixel (modèle de couleur OKLab) pour un résultat net, sans les artefacts d'un simple filtre CSS.
> - **Calque sur le lecteur intégré** : si vous préférez garder le lecteur natif du navigateur, un calque applique un thème sombre par-dessus, avec ses propres limites assumées (images inversées).
>
> Personnalisable de bout en bout : thèmes prédéfinis ou sur mesure, réglages de luminosité/contraste/saturation, politique par image (préserver, atténuer, convertir en niveaux de gris...), règles par site pour un moteur ou un thème différent sur certains domaines, raccourcis clavier, menu contextuel sur les liens PDF.
>
> Aucune télémétrie, aucun serveur : vos réglages ne voyagent que via la synchronisation de votre propre compte navigateur. Code source ouvert : github.com/MrGautier256/NoctPDF.

**EN**

> NoctPDF gives PDFs a real dark mode, not just a blackened page: colors are remapped one by one (text, lines, fills) while preserving their hue and readability, while images and photos stay recognizable instead of turning into negatives.
>
> Two engines to choose from:
> - **Enhanced reader**: our own PDF.js-based reader, with pixel-by-pixel recoloring (the OKLab color model) for a clean result, without the artifacts of a plain CSS filter.
> - **Overlay on the built-in reader**: if you'd rather keep the browser's native reader, an overlay applies a dark theme on top of it, with its own acknowledged limitations (images get inverted).
>
> Fully customizable: built-in or custom themes, brightness/contrast/saturation sliders, a per-image policy (keep, dim, grayscale...), per-site rules for a different engine or theme on specific domains, keyboard shortcuts, a right-click menu on PDF links.
>
> No telemetry, no server: your settings only travel through your own browser account's sync. Open source: github.com/MrGautier256/NoctPDF.

## 4. Catégorie

« Productivité » (Productivity) est la catégorie la plus proche sur la Chrome Web Store.

## 5. Justification de chaque permission (onglet *Permissions* du tableau de bord)

Le tableau de bord demande une justification en texte libre pour chaque permission déclarée dans le manifeste. Réutiliser (et traduire si besoin) le tableau de `docs/privacy-policy.md` § « Pourquoi chaque permission est nécessaire ». Résumé prêt à coller :

- **`declarativeNetRequestWithHostAccess` + `host_permissions: <all_urls>`** : « Nécessaire pour repérer, par l'en-tête `Content-Type` de la réponse réseau, qu'une page est un PDF, afin de la rediriger vers le lecteur intégré de l'extension. L'extension ne lit pas le contenu des pages ; elle n'inspecte que des en-têtes de réponse HTTP. Doit s'appliquer à tous les sites puisqu'un PDF peut être hébergé n'importe où. »
- **`storage`** : « Enregistre les réglages de l'utilisateur et les préférences du lecteur PDF.js intégré, via `chrome.storage.sync` (synchronisation propre au compte navigateur de l'utilisateur, pas un serveur de l'éditeur). »
- **`webNavigation`** : « Permet d'ouvrir les PDF locaux (`file://`) quand l'extension n'a pas la permission d'accès aux fichiers (et d'expliquer comment l'activer), et de savoir quand un onglet quitte le lecteur natif du navigateur. »
- **`webRequest`** (lecture seule) : « Retient l'en-tête `Referer` d'une requête PDF, que certains sites exigent pour servir le fichier (le lecteur doit le renvoyer en re-récupérant le PDF), et détecte les réponses à un formulaire POST, qui ne peuvent pas être rejouées. Aucune modification de requête, lecture seule. »
- **`contextMenus`** : « Ajoute une entrée de menu contextuel sur les liens PDF pour les ouvrir directement dans le lecteur choisi. »

## 6. Onglet *Privacy practices* (pratiques de confidentialité)

Réponses attendues aux questions type de cet onglet :

- **Cette extension collecte-t-elle des données utilisateur ?** Non — aucune donnée n'est collectée, transmise à l'éditeur ni vendue. Les réglages restent dans `chrome.storage.sync` (propre au compte de l'utilisateur).
- **Utilise-t-elle des données personnelles ou sensibles, l'historique de navigation, le contenu web, etc. ?** Non.
- **But unique déclaré (« single purpose »)** : « Afficher les documents PDF avec un thème sombre personnalisable (page redessinée pixel par pixel, ou calque sur le lecteur intégré du navigateur). »
- **Remote code** : non, tout le code est embarqué dans le paquet de l'extension (PDF.js vendu dans `vendor/pdfjs/`, patché localement). Aucun script n'est chargé depuis un serveur distant.

## 7. Captures d'écran suggérées

Dans l'ordre de ce qui vendrait le mieux l'extension :

1. Un même PDF avant/après (moitié claire, moitié recolorée) — le shader supporte déjà un mode comparaison (`ProcessOptions.split`), pas encore exposé dans l'interface (voir `docs/backlog.md`, phase 3) ; à défaut, deux captures côte à côte.
2. La page d'options, section thème, avec la grille de préréglages et l'aperçu en direct.
3. Le popup avec les pastilles de thème rapide.

Aucune de ces captures n'a été produite dans cette session (nécessite une install réelle dans un navigateur avec rendu matériel pour un résultat présentable) ; les captures `docs/phase2/*.png` servent de preuve technique mais pas de matériel promotionnel.

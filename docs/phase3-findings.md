# Phase 3 : conclusions

Date : 10 octobre 2026.

## Fait

- **Préréglages** (`src/settings/presets.ts`) : les dix thèmes nommés du cahier des charges, chacun un thème complet (testé contre le schéma réel et pour un contraste bg/fg confortable), plus `settings.customPresets` pour les thèmes que l'utilisateur enregistre lui-même (additif au schéma, sans migration).
- **Éditeur de thèmes** (`src/ui/options/ThemeEditor.vue`) : sélecteurs de couleur, aperçu en direct qui fait tourner le vrai moteur couleur (`makeRemap` + `composeTuning`, les mêmes fonctions que le lecteur) sur un échantillon représentatif, indicateur de contraste WCAG, dupliquer/enregistrer/supprimer un préréglage, import/export JSON du thème seul.
- **Page d'options complète** (`src/ui/options/App.vue`) : Général, Thèmes (éditeur + réglages fins), Images, Interface, Interception, Lecteur natif, Règles par site, Import/Export (réglages entiers), À propos. Chaque champ du schéma phase 1-2 a maintenant un contrôle, en anglais et en français (127 clés par langue, vérifiées en correspondance).
- **Popup** : pastilles de thème rapide, curseurs luminosité/contraste, cycle du mode image.
- **Interface « enhanced »** : recolore la barre d'outils, la barre latérale et les boîtes de dialogue de PDF.js à travers ses propres variables CSS de theming (`--toolbar-bg-color` et consorts, qui ne retombent sur `light-dark(...)` que si on ne les définit pas), plutôt que de reconstruire ces éléments. `colorSource` « système » laisse PDF.js suivre l'OS (son option `viewerCssTheme`) ; « thème » et « personnalisé » posent `--noct-ui-surface/text/accent`. `density` utilise directement l'option native `toolbarDensity` de PDF.js (trouvée dans le code vendu, pas inventée). `animations` et `autoHideToolbar` sont des ajouts simples (une règle CSS globale, un écouteur de défilement).

## Décision explicite : portée de « enhanced »

Le cahier des charges décrit un habillage complet (coins arrondis, densité, icônes cohérentes, focus visibles...). Ici, « enhanced » retinte l'habillage existant de PDF.js par ses propres points d'accroche CSS plutôt que de reconstruire chaque bouton. C'est délibéré : PDF.js 6.x a déjà une barre d'outils sobre et dense, avec son propre mode sombre par défaut (`viewerCssTheme` vaut 2 par défaut) — reconstruire par-dessus aurait dupliqué un travail déjà fait, pour un résultat probablement moins cohérent que d'utiliser le système de variables que PDF.js expose déjà. Documenté ici plutôt que silencieusement réduit : la spec demandait aussi "animations courtes désactivables" et une interface "dense" — les deux sont faits, juste pas en reconstruisant l'UI de zéro.

## Reporté, et où

- **Choix du moteur par site depuis le popup** : le popup permettrait de choisir rapidement "ce site en moteur B" sans passer par les options. Les règles par site existent (`settings.siteRules`, page d'options), mais rien ne les résout encore contre l'onglet actif. `docs/backlog.md`.
- **« Réappliquer »** (bouton popup pour le moteur B) : n'a pas de sens avant la phase 4 (le moteur B n'existe pas encore).
- **Raccourcis clavier** (`commands`) : prévus en phase 5 avec le menu contextuel et l'onboarding, pas commencés.
- **Miniatures qui restent à jour pendant un changement de thème en direct** : lacune relevée en phase 2, toujours ouverte.
- **Mode comparaison exposé dans l'interface** : le shader le supporte (`ProcessOptions.split`), rien ne le pilote encore depuis le popup ou les options.

## Vérifications faites à chaque commit

Build WXT (`npx wxt build`), `vue-tsc --noEmit`, `eslint .`, `prettier --check .`, `vitest run` (91 tests) : propres à chaque étape.

## Vérification visuelle réelle (pas seulement statique)

Le harnais e2e existant (`test/e2e/`, Playwright) charge l'extension via `--load-extension` avec le Chromium de Playwright, mais la version de Chromium préinstallée dans ce bac à sable (1194) ne correspond pas à celle que `@playwright/test` 1.63 attend (1243) : `chromium.launchPersistentContext` échoue à trouver l'exécutable avec `channel: "chromium"`. En pointant temporairement vers `/opt/pw-browsers/chromium` (`executablePath`, jamais commité), l'extension se charge mais le service worker n'expose pas `chrome.declarativeNetRequest` dans cette combinaison précise de versions — un défaut d'environnement distinct, pas lié à ce changement, qui empêche de faire tourner la suite e2e existante telle quelle ici.

Plutôt que d'en rester au typecheck seul, la page d'options et le popup ont été servis en HTTP local (`.output/chrome-mv3`) avec un petit bouchon `chrome.storage`/`chrome.i18n`/`chrome.runtime` injecté par script, et ouverts dans ce même Chromium via Playwright : chaque section de la page d'options a été visitée et capturée, ainsi que le popup, avec vérification qu'aucune erreur de script ne se produit. Ce détour a trouvé un vrai bug que le typecheck ne pouvait pas voir : `addSiteRule()` ajoutait une règle avec un motif vide, mais `SiteRuleSchema.pattern` exigeait `minLength(1)` — dès que `storage.onChanged` redéclenchait une relecture des réglages (ce qui arrive immédiatement après l'enregistrement), `parseSettings` rejetait le tableau entier et le remettait à `[]`, effaçant silencieusement la règle tout juste ajoutée avant que l'utilisateur ait pu taper quoi que ce soit. Corrigé en retirant `minLength(1)` (un motif vide ne correspond simplement à aucune URL, ce n'est pas un état dangereux) plutôt qu'en changeant l'UI ; couvert par un test de régression dans `settings.test.ts`.

Le reste (préréglages, éditeur de thème avec son aperçu en direct, tous les contrôles de chaque section, la révélation des couleurs personnalisées) s'est affiché et comporté correctement du premier coup. Les scripts de ce détour n'ont pas été conservés (bouchons jetables, pas une vraie suite de tests) ; une vraie correction du décalage de version Playwright/Chromium reste à faire en phase 6 pour que `npm run test:e2e` tourne dans ce genre d'environnement.

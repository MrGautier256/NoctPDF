# Politique de confidentialité — NoctPDF

*Dernière mise à jour : 2026-10-12.*

## En une phrase

NoctPDF ne collecte, ne transmet et ne vend aucune donnée. Il n'y a pas de serveur NoctPDF : l'extension ne parle qu'au navigateur lui-même et, pour chaque PDF, au site qui l'héberge (exactement comme votre navigateur l'aurait fait sans l'extension).

## Ce que NoctPDF fait avec vos données

| Donnée | Où elle reste | Pourquoi |
|---|---|---|
| Vos réglages (thème, moteur, règles par site, etc.) | `chrome.storage.sync` — l'infrastructure de synchronisation de votre propre compte navigateur (Google pour Chrome, Microsoft pour Edge, etc.), pas un serveur NoctPDF | Pour retrouver vos réglages sur vos autres appareils connectés au même compte, comme n'importe quelle extension qui utilise `storage.sync` |
| Le contenu d'un PDF que vous ouvrez | Jamais envoyé nulle part par NoctPDF : le PDF est récupéré directement depuis le site qui l'héberge (ou votre disque), affiché localement, et son contenu ne quitte jamais votre appareil | NoctPDF est un lecteur et un filtre de couleur, pas un service |
| L'en-tête `Referer` d'une requête PDF | Retenu en mémoire (stockage de session, effacé à la fermeture de l'onglet), jamais transmis ailleurs qu'au site qui héberge le PDF lui-même | Certains sites exigent ce en-tête pour servir le fichier ; le lecteur doit le renvoyer en re-récupérant le PDF |
| Historique de navigation, mots de passe, contenu des pages web (hors PDF) | Jamais lu, jamais stocké | NoctPDF n'a aucune raison d'y accéder |

Aucune télémétrie, aucune analytique, aucun service tiers (pas de Google Analytics, pas de Sentry, pas de serveur de crash reports). Le code est open source et vérifiable : <https://github.com/MrGautier256/NoctPDF>.

## Pourquoi chaque permission est nécessaire

| Permission | Pourquoi | Donnée concernée |
|---|---|---|
| `declarativeNetRequestWithHostAccess` + accès à tous les sites | Repérer, par son en-tête `Content-Type`, qu'une réponse réseau est un PDF, pour la rediriger vers le lecteur intégré de l'extension au lieu du lecteur natif du navigateur | NoctPDF ne lit pas le contenu des pages ; seuls les en-têtes de réponse HTTP d'une requête PDF sont inspectés, et seulement pour décider d'une redirection |
| `storage` | Réglages NoctPDF et préférences du lecteur PDF.js | Voir tableau ci-dessus |
| `webNavigation` | Ouvrir les PDF locaux (`file://`) quand l'accès aux fichiers n'est pas autorisé, et savoir quand un onglet quitte le lecteur natif | Aucune donnée personnelle ; seulement des événements de navigation (URL, état) |
| `webRequest` (lecture seule) | Retenir l'en-tête `Referer` d'une requête PDF (voir tableau ci-dessus) et détecter les réponses à un formulaire POST, que le lecteur ne peut pas reproduire | En-têtes HTTP d'une requête PDF uniquement |
| `contextMenus` | Afficher « Ouvrir dans le lecteur amélioré/intégré » sur un clic droit sur un lien PDF | Aucune donnée ; juste l'URL du lien cliqué, utilisée pour ouvrir un onglet |
| Raccourcis clavier (`commands`) | Activer/désactiver NoctPDF et changer de thème au clavier | Aucune donnée |

## Enfants

NoctPDF ne s'adresse pas spécifiquement aux enfants et ne collecte aucune donnée, de quiconque.

## Changements

Toute modification de cette politique sera publiée dans ce même fichier, avec sa date de mise à jour, et son historique reste visible dans l'historique Git du dépôt.

## Contact

Pour toute question, ouvrez une *issue* sur <https://github.com/MrGautier256/NoctPDF/issues>.

---

# Privacy Policy — NoctPDF (English)

*Last updated: 2026-10-12.*

## In one sentence

NoctPDF collects, transmits, and sells nothing. There is no NoctPDF server: the extension only talks to the browser itself and, for each PDF, to the site hosting it (exactly as your browser would have done without the extension).

## What NoctPDF does with your data

| Data | Where it stays | Why |
|---|---|---|
| Your settings (theme, engine, per-site rules, etc.) | `chrome.storage.sync` — your own browser account's own sync infrastructure (Google for Chrome, Microsoft for Edge, etc.), not a NoctPDF server | So your settings follow you to your other devices signed into the same account, like any extension using `storage.sync` |
| The content of a PDF you open | Never sent anywhere by NoctPDF: the PDF is fetched directly from the site hosting it (or your disk), rendered locally, and its content never leaves your device | NoctPDF is a reader and a color filter, not a service |
| The `Referer` header of a PDF request | Held in memory (session storage, cleared when the tab closes), never sent anywhere but the site hosting the PDF itself | Some sites require this header to serve the file; the reader must resend it when re-fetching the PDF |
| Browsing history, passwords, the content of non-PDF web pages | Never read, never stored | NoctPDF has no reason to access any of it |

No telemetry, no analytics, no third-party service (no Google Analytics, no Sentry, no crash-reporting server). The code is open source and auditable: <https://github.com/MrGautier256/NoctPDF>.

## Why each permission is needed

| Permission | Why | Data involved |
|---|---|---|
| `declarativeNetRequestWithHostAccess` + access to all sites | Spot, from its `Content-Type` header, that a network response is a PDF, to redirect it to the extension's own reader instead of the browser's built-in one | NoctPDF does not read page content; only a PDF request's HTTP response headers are inspected, solely to decide on a redirect |
| `storage` | NoctPDF settings and the PDF.js reader's own preferences | See table above |
| `webNavigation` | Open local (`file://`) PDFs when file access hasn't been granted, and know when a tab leaves the native reader | No personal data; only navigation events (URL, state) |
| `webRequest` (read-only) | Remember a PDF request's `Referer` header (see table above) and detect responses to a POST form, which the reader cannot reproduce | HTTP headers of a PDF request only |
| `contextMenus` | Show "Open in the enhanced/built-in reader" on a right-click on a PDF link | No data; just the clicked link's URL, used to open a tab |
| Keyboard shortcuts (`commands`) | Toggle NoctPDF and switch themes from the keyboard | No data |

## Children

NoctPDF is not directed at children and collects no data from anyone.

## Changes

Any change to this policy will be published in this same file, dated, with its history visible in the repository's Git history.

## Contact

For any question, open an issue at <https://github.com/MrGautier256/NoctPDF/issues>.

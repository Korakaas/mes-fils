# Mes fils : repères pour travailler sur l'appli

Appli personnelle de Kora pour suivre ses fils, ses patrons et ses projets de crochet (elle remplace un suivi Notion). Interface **en français**, look pastel, pensée pour le téléphone (Samsung S25, installée en PWA). Répondre à Kora en français, simplement : le résultat d'abord, le détail ensuite.

## Pile technique
- PWA en JavaScript pur (modules ES), sans framework ni étape de build. Les pages sont servies telles quelles par GitHub Pages, publiées automatiquement depuis la branche `main` (fichier `.nojekyll`, pas de workflow) : https://korakaas.github.io/mes-fils/
- Données locales dans IndexedDB (`js/store.js` : collections de documents, blobs pour les photos et PDF, métadonnées).
- Synchro facultative avec le projet Supabase de Kora (`js/sync.js`, `supabase/setup.sql`). Pas de serveur à nous.
- Service worker `sw.js` : réseau d'abord, cache de secours. **La constante `VERSION` doit être incrémentée à chaque livraison.** Le numéro affiché en bas des Réglages (`js/views/settings.js`) est écrit à part : mettre les deux à jour (un test le vérifie).
- pdf.js et tesseract.js sont fournis dans `vendor/` (pas de CDN, voir la CSP dans `index.html`).

## Organisation du code
- `js/app.js` : routeur par hash (`#/stock`, `#/projet/<id>`…), rendu, gestion du lien `#connect=`.
- `js/ctx.js` : état d'interface, registres d'événements (`actions`, `inputs`, `changes`, `submits`), composants communs (topbar, feuilles, photos).
- Événements : le HTML porte `data-act`, `data-input`, `data-change` ou `data-submit`, et la fonction correspondante est enregistrée dans le registre. Pas d'`onclick` en ligne (la CSP les interdit).
- `js/logic.js` : **toutes les règles de calcul**, sans accès au DOM, donc testables : poids restant, nombre de pelotes, niveaux de stock, marge, réservation des fils, candidats pour un patron, fils connus et épaisseurs, helpers de sécurité (`safeHttpUrl`, `safeServerUrl`, `safeBlobType`).
- `js/patternParse.js` : lecture des patrons PDF par règles. C'est une heuristique : elle se trompe sur certains PDF, on l'améliore avec des cas réels et des tests.
- `js/media.js` : photos réduites, lecture et rendu des PDF, OCR.
- `js/views/` : un fichier par écran (`stock`, `yarn`, `patterns`, `projects`, `calendar`, `settings`).
- `tests/` : tests Node (`npm test`).

## Modèle des fils (à ne pas casser)
`skeins`, `gramsPerSkein`, `metersPerSkein`, `usedGrams`, `weighedGrams` (poids restant pesé, prioritaire sur le calcul, valable pour toute la ligne), `inStock`. `openedGrams` est un ancien champ, converti à la modification. Le nombre de pelotes affiché (`skeinsText`) se déduit du poids restant, pour être identique partout.

## Décisions de Kora (à respecter)
- Marge de fil : 10 %.
- Un reste de moins de 20 g sort du stock (réglage `restThreshold`).
- Fils d'un projet en pause : réservés ou non, réglable projet par projet.
- Le budget d'un projet compte seulement le coût du projet.
- Fichiers de patrons conservés jusqu'à 50 Mo.
- Compteur de rangs : prévu en version 2, pas avant.
- Synchro par lien ou code secret, sur son propre Supabase.

## Sécurité
- Le code secret de synchro (16 caractères ou plus) est le seul identifiant. Il ne faut jamais le journaliser, l'afficher dans une erreur ni le mettre dans un fichier du dépôt.
- La clé Supabase côté appli est la clé publique (`sb_publishable_…` ou `anon`). Ne jamais demander ni utiliser la clé `secret` / `service_role`.
- Les tables ne sont accessibles que par les fonctions `crochet_push` et `crochet_pull`. Le stockage `crochet-files` est en lecture publique par adresse aléatoire, et en écriture seulement par ajout.
- Un domaine Supabase personnalisé doit être ajouté à `connect-src` dans la CSP de `index.html`.

## Avant chaque livraison
1. `npm test` doit passer entièrement.
2. Incrémenter `VERSION` dans `sw.js`.
3. Vérifier l'écran touché en format téléphone (Playwright avec `service_workers: 'block'`, serveur local `python3 -m http.server 8765`).
4. Commit en français, une idée par commit, puis push (la publication se fait toute seule).

## Pistes non faites
Lecture des PDF par IA avec la propre clé de Kora, champ « déjà utilisé avant l'ajout » pour les projets, historique des séances et export agenda, compteur de rangs, remise en stock et effacement de la date de fin quand un projet « Terminé » repasse « En cours », libellé « Clé publique » pour la clé Supabase.

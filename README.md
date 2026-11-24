# Mes fils 🧶

Petite appli web mobile (PWA) pour gérer ton stock de fils, tes patrons et tes projets de crochet.
Aucun build : ce sont des fichiers statiques (HTML, CSS, JS). Les données vivent sur ton téléphone
(IndexedDB) et, si tu actives la synchro, sont aussi copiées dans ton propre projet Supabase pour
retrouver la même chose sur l'ordinateur.

## Ce que fait l'appli

- **Stock** : fils avec couleur, matière, épaisseur, pelotes, poids, métrage, boîte, photo. Filtres, tri, recherche, pesée du reste.
- **Projets et patrons** : on part toujours d'un « Nouveau projet » (import d'un PDF ou de photos (lecture automatique du matériel : fils, crochets, accessoires, tailles du patron), ou saisie rapide. Un patron garde plusieurs fichiers (PDF et photos, 50 Mo max par PDF) qui se lisent dans l'appli en livret (page par page) ou en défilement, écran allumé. Le patron s'enregistre tout seul avec le projet ; « Refaire ce patron » en crée un nouveau sans rien réimporter.
- **Projets** : un projet = un patron + des fils choisis. L'appli calcule le besoin avec marge (10 %, réglable), propose les fils en stock suffisants ou à combiner, réserve les fils, et indique « Assez / Il manque / À choisir ».
- **En pause** : un interrupteur par projet décide si les fils restent réservés.
- **Fin de projet** : tu pèses ce qui reste ; un reste de moins de 20 g sort du stock (seuil réglable). Coût du projet calculé avec le prix des fils.
- **Sauvegarde** JSON, données d'exemple, tout effacer : dans Réglages.

## Mise en route

### 1. Héberger les fichiers (HTTPS obligatoire pour installer l'appli)

Le dossier est tel quel un site statique. Au choix :

- **GitHub Pages** : pousse le dossier dans un dépôt, active Pages sur la branche principale.
- **Netlify / Cloudflare Pages** : glisse-dépose le dossier, aucune commande de build.

Pour tester en local : `python3 -m http.server 8765` puis http://localhost:8765 (la synchro et
l'installation demandent HTTPS, sauf sur localhost).

### 2. Créer le projet Supabase (seulement pour la synchro)

1. Crée un projet gratuit sur supabase.com.
2. Ouvre **SQL Editor**, colle le contenu de `supabase/setup.sql`, lance-le. Il crée la table,
   les deux fonctions d'accès et le bucket `crochet-files` (fichiers : photos et PDF).
3. Dans **Project Settings → API**, copie l'**URL du projet** et la clé **anon public**.

La table n'est pas accessible directement : tout passe par deux fonctions qui exigent ton code
secret (16 caractères minimum). Sans ce code, personne ne peut lire ni écrire tes données.

### 3. Installer sur le Samsung S25

Ouvre l'adresse du site dans Chrome → menu ⋮ → **Ajouter à l'écran d'accueil / Installer**.

### 4. Activer la synchro

1. Réglages → Synchronisation : colle l'URL et la clé anon, clique **Générer un code**, puis **Activer**.
2. Clique **Copier le lien de connexion** et ouvre-le sur l'autre appareil (l'ordinateur) : il se
   relie tout seul, sans rien retaper.

Fonctionnement : chaque modification est enregistrée localement puis envoyée en arrière-plan ;
en cas de modification des deux côtés, la plus récente gagne.

## À savoir

- Le plan gratuit de Supabase **met en pause un projet inactif** (environ une semaine sans activité) : il se réveille depuis le tableau de bord Supabase. Les données locales restent intactes.
- Les fichiers (photos, PDF) sont dans un bucket public mais sous des adresses aléatoires impossibles à deviner ; le code secret n'apparaît jamais dans l'adresse.
- La **sauvegarde JSON ne contient pas les photos ni les PDF** (seulement les données). Ils sont conservés par la synchro.
- La lecture des **PDF** ne marche que sur ceux qui contiennent du texte. Les **photos** sont lues par une reconnaissance de texte intégrée (français et anglais, sur l'appareil, sans réseau, environ 12 Mo de fichiers) : elle est fiable sur des captures d'écran ou des pages nettes, moins sur des photos penchées ou manuscrites. Vérifie toujours les chiffres avant d'enregistrer.
- Ressaisie à la main depuis Notion (pas d'import prévu).

## Mettre à jour l'appli

Après chaque modification des fichiers, **change `VERSION` dans `sw.js`** (par exemple `v2`) : sinon
le téléphone garde l'ancienne version en cache. Au prochain lancement, l'appli se met à jour.

## Développement

```
npm test        # règles de calcul (stock, marge, réservations) et lecture des patrons
```

Structure : `js/logic.js` (règles), `js/patternParse.js` (lecture des matériaux), `js/store.js`
(IndexedDB), `js/sync.js` (Supabase), `js/views/` (écrans), `vendor/pdfjs/` (lecture de PDF).

## Pour plus tard (V2)

Compteur de rangs, import par photo / code-barres / lien de site, « surprends-moi », liste de
courses et d'envies, suivi des cadeaux.

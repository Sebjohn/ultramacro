# Ultra Macro — Pilotage des chantiers

Application de suivi des chantiers par pôle : **priorités sur une seule page**, échéances,
responsables, Kanban et calendrier. Interface « executive » sombre, sans étape de build.

> Reprise et refonte professionnelle de l'outil interne Ultra Macro.

---

## ✨ Fonctionnalités

- **Vue d'ensemble** — chaque pôle sur une carte, avec ses **priorités** (triées par
  importance puis échéance), sa progression et le détail À venir / En cours / Terminé.
- **Kanban par pôle** et **Kanban général** (tous pôles confondus) — colonnes
  À venir / En cours / Terminé, **glisser-déposer** pour changer un statut.
- **Calendrier / échéances** — chantiers regroupés par urgence (En retard, Cette semaine,
  Ce mois-ci, Plus tard).
- **Pôles configurables** — nom, couleur, icône (sélecteur visuel), ajout / édition / suppression.
- **Chantiers** — statut, priorité, responsable, échéance, avancement (%), notes.
- **Recherche** globale et tris (ordre défini / urgence / charge).
- **Thème clair & sombre** (identité Ultra) avec bascule mémorisée, suit la préférence système par défaut.
- **Assigné par défaut** par pôle (pré-remplit le responsable des nouveaux chantiers).
- **Sauvegarde fiable** — local par défaut, **Firebase Realtime Database** (temps réel +
  hors-ligne), export / import JSON.

---

## 🏗️ Architecture

Application statique **sans build** (aucun Node/npm requis) : HTML + CSS + JavaScript
« vanilla » en modules classiques partageant un espace de noms global `window.Ultra`.
Elle fonctionne aussi bien par double-clic (`file://`) qu'hébergée sur un serveur.

```
index.html                → structure + points de montage
src/styles/app.css         → design system (thème sombre)
src/js/constants.js        → constantes (statuts, priorités, thèmes) + helpers
src/js/store.js            → état en mémoire, sélecteurs, mutations
src/js/persistence.js      → couche de sauvegarde (local ⇄ Realtime Database)
src/js/ui.js               → toasts, modales, formulaires, réglages
src/js/views.js            → rendu Dashboard / Kanban / Calendrier
src/js/app.js              → navigation + démarrage
```

### Pourquoi « sans build » ?

Pour garantir **zéro bug de sauvegarde** et une prise en main immédiate :
- la logique de persistance est **testable et vérifiable** directement dans le navigateur ;
- écritures **par entité** (chaque chantier / pôle est un document) → jamais d'écrasement global ;
- la Realtime Database fournit la **synchro temps réel** et la **file d'attente hors-ligne** ;
- repli **localStorage transparent** si Firebase n'est pas configuré.

Migration ultérieure possible vers Vite/React sans changer le modèle de données.

---

## ▶️ Lancer en local

- **Le plus simple :** ouvrir `index.html` dans un navigateur (double-clic).
- **Avec un petit serveur** (recommandé pour Firebase, à cause des restrictions `file://`) :

  ```bash
  # Node
  npx serve .
  # ou Python
  python -m http.server 8080
  ```

  puis ouvrir <http://localhost:8080>.

---

## ☁️ Synchronisation temps réel — Firebase Realtime Database

Par défaut l'app fonctionne **en local** (aucune connexion automatique). Pour activer la
synchro temps réel : bouton **Réglages** (⚙️) → *Base de données temps réel* → l'URL est
**déjà pré-remplie** (`src/js/persistence.js` → `SUGGESTED_DB_URL`) → choisir l'espace de
travail → **Connecter**. Données stockées sous `workspaces/{espace}/{poles|chantiers}`,
synchronisées en temps réel entre tous les navigateurs connectés à la même URL + espace.

> Connecte-toi **depuis le navigateur qui contient déjà tes données** : au premier
> branchement, si le cloud est vide, tes données locales y sont téléversées. Ensuite,
> tous les autres appareils partagent ce cloud. **Déconnecter** revient en local.

### ⚠️ Règles à publier (indispensable)

Une base Firebase est **verrouillée par défaut** → tant que les règles ne sont pas
publiées, l'app affiche `permission_denied` et reste en local.

**Règles ouvertes (accès partout)** — contenu de [`database.rules.json`](database.rules.json) :

```json
{ "rules": { ".read": true, ".write": true } }
```

**Le plus simple (console web, sans CLI) :**
1. <https://console.firebase.google.com> → ton projet → **Realtime Database** → onglet **Règles**.
2. Colle les règles ci-dessus → **Publier**.

**Ou en ligne de commande :**

```bash
npm i -g firebase-tools
firebase login
firebase use <ton-projet>
firebase deploy --only database
```

> Ces règles sont **totalement ouvertes** (lecture/écriture publiques). Adapté à un outil
> interne tant que l'URL de la base reste privée. Pour verrouiller plus tard : ajoute
> **Firebase Auth** et remplace par `".read"/".write": "auth != null"`.

---

## 🚀 Déploiement sur Netlify

Site statique, **aucune commande de build**.

1. Pousser le dépôt sur GitHub (voir plus bas).
2. Sur <https://app.netlify.com> → **Add new site → Import an existing project** → sélectionner
   le dépôt.
3. Laisser **Build command** vide et **Publish directory** = `.` (déjà défini dans
   [`netlify.toml`](netlify.toml)).
4. **Deploy**. La configuration Firebase se fait ensuite depuis l'app (aucune variable
   d'environnement nécessaire).

Alternative sans GitHub : glisser-déposer le dossier sur Netlify Drop
(<https://app.netlify.com/drop>).

---

## 🐙 GitHub

Dépôt : <https://github.com/Sebjohn/ultramacro>

```bash
git remote add origin https://github.com/Sebjohn/ultramacro.git
git branch -M main
git push -u origin main
```

---

## ⌨️ Raccourcis

| Touche | Action                    |
| ------ | ------------------------- |
| `/`    | Focus sur la recherche    |
| `n`    | Nouveau chantier          |
| `Échap`| Fermer une fenêtre        |

---

## 📄 Licence

Usage interne. Adapter librement.

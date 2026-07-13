# Ultra Macro — Pilotage des chantiers

Application de suivi des chantiers par pôle : **priorités sur une seule page**, échéances,
responsables, Kanban et calendrier. Interface « executive » sombre, sans étape de build.

> Reprise et refonte professionnelle de l'outil interne Ultra Macro.

---

## ✨ Fonctionnalités

- **Vue d'ensemble** — chaque pôle sur une carte, avec ses **priorités** (triées par
  importance puis échéance), sa progression et le détail À venir / En cours / Terminé.
- **Kanban par pôle** — colonnes À venir / En cours / Terminé, **glisser-déposer** pour
  changer un statut.
- **Calendrier / échéances** — chantiers regroupés par urgence (En retard, Cette semaine,
  Ce mois-ci, Plus tard).
- **Pôles configurables** — nom, couleur, icône (sélecteur visuel), ajout / édition / suppression.
- **Chantiers** — statut, priorité, responsable, échéance, avancement (%), notes.
- **Recherche** globale et tris (ordre défini / urgence / charge).
- **Sauvegarde fiable** — local par défaut, **Firebase Firestore** en option (temps réel +
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
src/js/persistence.js      → couche de sauvegarde (local ⇄ Firestore)
src/js/ui.js               → toasts, modales, formulaires, réglages
src/js/views.js            → rendu Dashboard / Kanban / Calendrier
src/js/app.js              → navigation + démarrage
```

### Pourquoi « sans build » ?

Pour garantir **zéro bug de sauvegarde** et une prise en main immédiate :
- la logique de persistance est **testable et vérifiable** directement dans le navigateur ;
- écritures **par entité** (chaque chantier / pôle est un document) → jamais d'écrasement global ;
- Firestore fournit la **synchro temps réel** et la **persistance hors-ligne** ;
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

## ☁️ Activer la synchronisation Firebase (optionnel)

Par défaut, les données restent dans le navigateur. Pour synchroniser entre appareils / équipe :

1. Créer un projet sur <https://console.firebase.google.com> puis une base **Firestore**
   (mode production).
2. Dans **Paramètres du projet → Vos applications → Web**, copier l'objet `firebaseConfig`.
3. Dans l'app : bouton **Réglages** (⚙️) → coller la configuration → choisir un
   **identifiant d'espace de travail** (ex. `ultra-mastermind`) → **Connecter**.
   > Toutes les personnes utilisant le même identifiant partagent les mêmes chantiers.
   > Au premier branchement, les données locales existantes sont téléversées automatiquement.
4. Publier les règles de sécurité (`firestore.rules`) — voir ci-dessous.

La configuration web Firebase n'est **pas** un secret (elle est publique côté client) : la
sécurité repose sur les **règles Firestore** et, idéalement, **App Check**.

### Règles Firestore

Le fichier [`firestore.rules`](firestore.rules) confine les accès à la collection
`workspaces/**`. Pour un usage réellement protégé, activez **App Check** (bloque les clients
hors application, sans imposer de connexion utilisateur) ou une authentification.

Déploiement des règles :

```bash
npm i -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

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

## 🐙 Mettre le projet sur GitHub

Le dépôt est déjà initialisé avec un premier commit. Pour le publier :

```bash
# Créer un dépôt vide sur github.com, puis :
git remote add origin https://github.com/<votre-compte>/ultra-macro.git
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

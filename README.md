# MDEA Business Card — déploiement 100% Netlify (sans Firebase)

Toutes les fonctionnalités d'origine sont conservées : thèmes, profils,
projets, réseaux sociaux, pitchs, factures, génération PDF réelle,
programmation NFC, sauvegarde automatique, partage par lien — y compris
pour des fichiers volumineux. Seule la brique "backend" a changé :

| Avant (Firebase)        | Maintenant (Netlify)                        |
|--------------------------|----------------------------------------------|
| Firebase Auth             | Netlify Identity (`/netlify-auth.js`)        |
| Firestore (`shares`, `users`) | Netlify Blobs (`shares-meta` store)      |
| Firebase Storage (`owners/`, `public-cards/`) | Netlify Blobs via `netlify/functions/*` (JSON, petit volume) |
| Firebase Storage (`shares/` — fichiers PDF/vCard/images) | Netlify Blobs via `netlify/edge-functions/*` (streaming, gros fichiers) |

Aucune clé API, aucun `firebase-config.js` n'est plus nécessaire.

## Pourquoi deux types de fonctions ?

- **`netlify/functions/`** (fonctions "classiques") : parfaites pour du
  JSON léger (sauvegarde du store, métadonnées de partage). Limite
  pratique d'environ 6 Mo par requête/réponse — largement suffisant ici.
- **`netlify/edge-functions/`** : utilisées uniquement pour l'envoi et
  le téléchargement des **fichiers réels** partagés (PDF, vCard,
  images, portfolios lourds…). Elles tournent sur un runtime différent
  (Deno, à la périphérie du réseau) qui n'a pas cette limite de ~6 Mo —
  l'upload/téléchargement se fait en flux (streaming), fichier brut,
  sans passer par du base64. Netlify Blobs accepte des objets jusqu'à
  **5 Go**, donc tu es large.

## 1. Déployer

Pousse tout ce dossier (`netlify/functions/`, `netlify/edge-functions/`,
`netlify.toml`, `package.json`) sur un repo GitHub, puis connecte ce
repo à Netlify ("Add new site → Import an existing project"). Le
drag-and-drop simple ne suffit pas ici — il faut que Netlify installe
les dépendances et déploie fonctions + edge functions — passe par Git.

## 2. Activer Netlify Identity

Dans le dashboard du site → **Site configuration → Identity → Enable
Identity**. Recommandé : "Invite only" (c'est toi qui gères les comptes).

## 3. Créer tes utilisateurs

Dashboard → **Identity → Invite users** → renseigne l'email. La
personne reçoit un email pour définir son mot de passe, puis se
connecte via `/login`.

### Définir le `username` (pour le lien public de la carte)

Le code lit `user.user_metadata.username`. Pour le définir :
Dashboard → Identity → clique sur l'utilisateur → **Metadata** →
ajoute `{"username": "jean-dupont"}`.

## 4. Netlify Blobs — rien à faire

Aucune étape de provisioning : dès que les fonctions tournent,
`getStore(...)` crée les stores automatiquement au premier écrit.

## 5. Limites à connaître

- Fichiers partagés (factures PDF, vCards, images) : jusqu'à 5 Go par
  fichier (limite Netlify Blobs), envoyés/servis en streaming via les
  Edge Functions — pas de souci pour des fichiers "lourds".
- Sauvegarde automatique du store (profils/projets/factures en JSON) :
  passe par une fonction classique, limite ~6 Mo — sans rapport avec
  tes documents, donc non contraignant en pratique.
- Edge Functions : selon ton forfait Netlify, un quota d'invocations
  s'applique (généreux sur le plan gratuit). Vérifie ton usage dans le
  dashboard si tu prévois un très gros volume de partages.

## Fichiers ajoutés

```
netlify-auth.js                          ← client Identity (remplace le SDK Firebase Auth)
netlify.toml                             ← config Netlify (dossier des fonctions)
package.json                             ← dépendances @netlify/blobs + @netlify/identity

netlify/functions/save-data.mjs          ← sauvegarde du store (autosave, JSON)
netlify/functions/load-data.mjs          ← rechargement du store à l'ouverture
netlify/functions/create-share.mjs       ← enregistre les métadonnées d'un partage
netlify/functions/get-share.mjs          ← lecture publique d'un partage (share.html)

netlify/edge-functions/upload-share-file.mjs  ← reçoit et stocke un fichier partagé (streaming, gros fichiers)
netlify/edge-functions/get-shared-file.mjs    ← sert un fichier partagé (streaming, gros fichiers)
```

## Flux de partage (résumé technique)

1. Le navigateur génère un `shareId`.
2. Pour chaque fichier sélectionné, il l'envoie en `multipart/form-data`
   directement à `/api/upload-file?share={shareId}` (Edge Function) —
   le fichier part tel quel, sans conversion, avec le token Identity en
   en-tête `Authorization`.
3. Une fois tous les fichiers envoyés, le navigateur appelle
   `/.netlify/functions/create-share` avec le titre, le texte et la
   liste des fichiers (juste les métadonnées, pas leur contenu).
4. Le lien final (`share.html?id={shareId}`) est programmé sur la carte
   NFC. À l'ouverture, `share.html` appelle `/.netlify/functions/get-share`
   (public) qui renvoie les métadonnées + une URL par fichier pointant
   vers `/api/shared-file` (Edge Function, streaming).

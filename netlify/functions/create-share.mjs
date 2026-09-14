import { connectLambda, getStore } from '@netlify/blobs';

// Crée un enregistrement de partage IMMUABLE, sous un shareId qui n'est
// JAMAIS réutilisé entre deux "programmations" différentes.
//
// Avant, cette fonction pouvait écraser un enregistrement existant quand
// on lui redonnait le même id (le fameux "id stable de la carte"), ce qui
// cassait les liens déjà distribués : la personne qui avait déjà reçu ce
// lien voyait le contenu changer sous ses pieds à la prochaine
// reprogrammation. Ce n'est plus le cas : chaque appel de create-share
// reçoit désormais un id FRAIS (généré côté client, voir generateId()
// dans index.html) et écrit un fichier distinct dans Netlify Blobs. Ce
// fichier ne sera plus jamais modifié après coup.
//
// PARAMÈTRE OPTIONNEL "cardId" : quand il est fourni (cas de la carte NFC
// physique et du QR "carte"), on met en plus à jour un petit registre
// séparé — mdea-card-pointers — qui retient "quel est le shareId ACTUEL
// de cette carte ?". C'est ce registre que consulte l'edge function
// resolve-card.mjs à chaque tap NFC / scan QR pour rediriger vers le bon
// lien immuable du moment, sans jamais avoir à réécrire la puce physique.
//
// IMPORTANT : les fichiers ne sont plus envoyés en base64 dans ce payload.
// Ils sont uploadés SÉPARÉMENT vers /api/upload-file (edge function
// upload-share-file.mjs) AVANT cet appel, sous CE MÊME shareId. On ne
// reçoit ici que les métadonnées + l'URL de récupération
// (/api/shared-file?...), ce qui garde ce document minuscule et évite la
// limite de ~6 Mo des fonctions classiques (Lambda) sur le corps de la
// requête/réponse.
export const handler = async (event, context) => {
  connectLambda(event);
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const { id, title, text, files, extra, cardId } = payload;
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'id manquant' }) };

  const filesMeta = (files || []).map(f => ({
    name: f.name,
    type: f.type,
    size: f.size,
    url: f.url || ''
  }));

  const record = {
    title: title || 'MDEA Business Card',
    text: text || '',
    files: filesMeta,
    extra: extra || {},
    ownerId: user.sub,
    cardId: cardId || null,
    updatedAt: Date.now()
  };

  try {
    const store = getStore('mdea-shares', { consistency: 'strong' });
    await store.setJSON(id, record);

    // Met à jour le pointeur de la carte physique, s'il y en a une pour
    // cette programmation. Un registre séparé et minuscule (juste
    // "quel est le shareId courant ?"), jamais mélangé avec le contenu
    // des partages eux-mêmes.
    if (cardId) {
      const pointerStore = getStore('mdea-card-pointers', { consistency: 'strong' });
      await pointerStore.setJSON(cardId, {
        currentShareId: id,
        ownerId: user.sub,
        updatedAt: Date.now()
      });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, id })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

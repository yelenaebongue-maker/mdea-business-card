import { connectLambda, getStore } from '@netlify/blobs';

// Crée OU met à jour (si le même id est réutilisé, ex: carte NFC stable)
// un enregistrement de partage : { title, text, files:[{name,type,size,url}] }
//
// IMPORTANT : les fichiers ne sont plus envoyés en base64 dans ce payload.
// Ils sont uploadés SÉPARÉMENT vers /api/upload-file (edge function
// upload-share-file.mjs) AVANT cet appel. On ne reçoit ici que les
// métadonnées + l'URL de récupération (/api/shared-file?...), ce qui
// garde ce document minuscule et évite la limite de ~6 Mo des fonctions
// classiques (Lambda) sur le corps de la requête/réponse.
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

  const { id, title, text, files, extra } = payload;
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
    updatedAt: Date.now()
  };

  try {
    const store = getStore('mdea-shares', { consistency: 'strong' });
    await store.setJSON(id, record);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, id })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

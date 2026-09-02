import { connectLambda, getStore } from '@netlify/blobs';

// Sauvegarde les données de l'utilisateur connecté :
// - "full" (tout, y compris ce qui reste privé comme les factures)
// - "public" (le sous-ensemble affichable publiquement)
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

  const uid = user.sub;
  try {
    const store = getStore('mdea-data');
    await store.setJSON(`owners/${uid}/data.json`, payload.full || {});
    await store.setJSON(`public-cards/${uid}/card.json`, payload.public || {});
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

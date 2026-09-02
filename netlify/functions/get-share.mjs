import { connectLambda, getStore } from '@netlify/blobs';

// Public (pas d'authentification) : c'est ce que lit share.html quand
// quelqu'un tape la carte NFC ou ouvre le lien.
export const handler = async (event) => {
  connectLambda(event);
  const id = event.queryStringParameters && event.queryStringParameters.id;
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'id manquant' }) };

  try {
    const store = getStore('mdea-shares', { consistency: 'strong' });
    const data = await store.get(id, { type: 'json' });
    if (!data) return { statusCode: 404, body: JSON.stringify({ error: 'introuvable' }) };
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return { statusCode: 404, body: JSON.stringify({ error: 'introuvable' }) };
  }
};

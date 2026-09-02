import { connectLambda, getStore } from '@netlify/blobs';

// Recharge les données complètes de l'utilisateur connecté
// (profils, projets, réseaux, pitches, factures, nom d'entreprise).
export const handler = async (event, context) => {
  connectLambda(event);
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
  }

  const uid = user.sub;
  try {
    const store = getStore('mdea-data');
    const data = await store.get(`owners/${uid}/data.json`, { type: 'json' });
    if (!data) return { statusCode: 404, body: JSON.stringify({ error: 'Aucune donnée' }) };
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Aucune donnée' }) };
  }
};

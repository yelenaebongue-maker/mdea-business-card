import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';

// Remplace : storage.ref().child(`owners/${uid}/data.json`).getDownloadURL() + fetch(url)
export default async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const user = await getUser();
  if (!user) return new Response('Non authentifié', { status: 401 });

  const owners = getStore({ name: 'owners', consistency: 'strong' });
  const data = await owners.get(`${user.id}/data.json`, { type: 'json' });

  if (!data) return new Response('Aucune donnée sauvegardée', { status: 404 });
  return Response.json(data);
};

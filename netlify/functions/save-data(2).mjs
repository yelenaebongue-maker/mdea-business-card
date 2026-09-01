import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';

// Remplace : storage.ref().child(`owners/${uid}/data.json`).put(...)
//        et  storage.ref().child(`public-cards/${uid}/card.json`).put(...)
export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const user = await getUser();
  if (!user) return new Response('Non authentifié', { status: 401 });

  let body;
  try { body = await req.json(); }
  catch (e) { return new Response('JSON invalide', { status: 400 }); }

  const { full, public: publicSnapshot } = body || {};
  if (!full || !publicSnapshot) return new Response('Données manquantes', { status: 400 });

  const owners = getStore({ name: 'owners', consistency: 'strong' });
  const publicCards = getStore({ name: 'public-cards', consistency: 'strong' });

  await owners.setJSON(`${user.id}/data.json`, full);
  await publicCards.setJSON(`${user.id}/card.json`, publicSnapshot);

  // Si un username est défini sur le profil Identity, on publie aussi
  // sous ce nom pour permettre une page publique tondomaine.com/{username}.
  const username = user.user_metadata && user.user_metadata.username;
  if (username) {
    await publicCards.setJSON(`by-username/${username}.json`, publicSnapshot);
  }

  return Response.json({ ok: true });
};

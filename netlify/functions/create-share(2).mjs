import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';

// Remplace : db.collection('shares').doc(id).set({...})
// Les fichiers eux-mêmes sont déjà dans Blobs à ce stade — envoyés en amont,
// en streaming, par netlify/edge-functions/upload-share-file.mjs (pas de
// limite de taille pratique, contrairement à cette fonction "classique").
export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const user = await getUser();
  if (!user) return new Response('Non authentifié', { status: 401 });

  let body;
  try { body = await req.json(); }
  catch (e) { return new Response('JSON invalide', { status: 400 }); }

  const { id, title = 'MDEA Business Card', text = '', files = [], extra = {} } = body || {};
  if (!id) return new Response('id manquant', { status: 400 });

  const sharesMeta = getStore({ name: 'shares-meta', consistency: 'strong' });
  await sharesMeta.setJSON(id, {
    createdAt: Date.now(),
    ownerId: user.id,
    title,
    text,
    files, // [{ name, type, size }]
    ...extra
  });

  return Response.json({ id });
};

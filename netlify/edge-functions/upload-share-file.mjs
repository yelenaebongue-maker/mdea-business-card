import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';

// Remplace : storage.ref().child(`shares/${id}/${name}`).put(...)
// Tourne en Edge Function (runtime Deno) plutôt qu'en fonction classique
// (runtime Lambda) précisément pour éviter la limite pratique de ~6 Mo
// sur le corps des requêtes des fonctions "normales". Netlify Blobs
// accepte des objets jusqu'à 5 Go.
export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const user = await getUser();
  if (!user) return new Response('Non authentifié', { status: 401 });

  const url = new URL(req.url);
  const shareId = url.searchParams.get('share');
  if (!shareId) return new Response('Paramètre share manquant', { status: 400 });

  let form;
  try { form = await req.formData(); }
  catch (e) { return new Response('multipart/form-data attendu', { status: 400 }); }

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return new Response('Champ "file" manquant', { status: 400 });
  }

  const safeName = (file.name || 'fichier').replace(/[^\w.\-]+/g, '_');
  const contentType = file.type || 'application/octet-stream';

  const store = getStore({ name: 'shares', consistency: 'strong' });
  await store.set(`${shareId}/${safeName}`, file, { metadata: { contentType } });

  return Response.json({ ok: true, name: safeName, type: contentType, size: file.size });
};

export const config = { path: '/api/upload-file' };

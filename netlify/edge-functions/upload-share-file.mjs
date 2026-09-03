import { getStore } from '@netlify/blobs';

// Remplace : storage.ref().child(`shares/${id}/${name}`).put(...)
// Tourne en Edge Function (runtime Deno) plutôt qu'en fonction classique
// (runtime Lambda) précisément pour éviter la limite pratique de ~6 Mo
// sur le corps des requêtes des fonctions "normales". Netlify Blobs
// accepte des objets jusqu'à 5 Go.

// Vérifie le token Identity envoyé par NetlifyAuth.authedFetch dans
// l'en-tête "Authorization: Bearer ...". On ne peut PAS utiliser
// `@netlify/identity` ici : ce paquet est le SDK CLIENT (navigateur), il
// n'expose aucune fonction serveur capable de lire la requête entrante
// d'une Edge Function (runtime Deno). La façon fiable de vérifier le
// token côté serveur est d'interroger l'endpoint Identity du site
// lui-même, /.netlify/identity/user, avec ce même token.
async function getAuthedUser(req) {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(`${origin}/.netlify/identity/user`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    return await res.json(); // { id, email, ... }
  } catch (e) {
    return null;
  }
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const user = await getAuthedUser(req);
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

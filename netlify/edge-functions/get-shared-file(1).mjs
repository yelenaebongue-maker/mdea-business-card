import { getStore } from '@netlify/blobs';

// Remplace : storage.ref().child(`shares/${id}/${name}`).getDownloadURL()
// Public volontairement (le tag NFC doit s'ouvrir sans compte). Tourne en
// Edge Function pour pouvoir servir de gros fichiers (factures scannées,
// portfolios PDF, vidéos de présentation, etc.) sans les limites de
// réponse des fonctions classiques.
export default async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const name = url.searchParams.get('name');
  if (!id || !name) return new Response('Paramètres id/name manquants', { status: 400 });

  const store = getStore({ name: 'shares', consistency: 'strong' });
  const entry = await store.getWithMetadata(`${id}/${name}`, { type: 'blob' });

  if (!entry || !entry.data) return new Response('Fichier introuvable', { status: 404 });

  const contentType = (entry.metadata && entry.metadata.contentType) || 'application/octet-stream';

  return new Response(entry.data, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${name}"`,
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
};

export const config = { path: '/api/shared-file' };

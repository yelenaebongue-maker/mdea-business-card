import { getStore } from '@netlify/blobs';

// Remplace : db.collection('shares').doc(id).get()
// Public volontairement : n'importe quel téléphone qui tape la carte NFC
// doit pouvoir ouvrir share.html sans être connecté.
export default async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response('Paramètre id manquant', { status: 400 });

  const sharesMeta = getStore({ name: 'shares-meta', consistency: 'strong' });
  const data = await sharesMeta.get(id, { type: 'json' });
  if (!data) return new Response('Partage introuvable', { status: 404 });

  // On transforme chaque fichier en URL réellement récupérable : l'Edge
  // Function get-shared-file sert les octets stockés dans Blobs, sans
  // limite de taille pratique (streaming).
  const files = (data.files || []).map(f => ({
    ...f,
    url: `/api/shared-file?id=${encodeURIComponent(id)}&name=${encodeURIComponent(f.name)}`
  }));

  return Response.json({ ...data, files });
};

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

  const realContentType = (entry.metadata && entry.metadata.contentType) || 'application/octet-stream';

  // Le forçage du téléchargement ("attachment") n'est appliqué QUE quand
  // l'appelant le demande explicitement via ?dl=1 — c'est share.html qui
  // ajoute ce paramètre sur les liens "Télécharger" (factures, pitchs,
  // documents). Sans ce paramètre, le fichier reste "inline" comme avant :
  // les <img src="/api/shared-file?...">  utilisées ailleurs dans
  // l'application (photo de profil, images de portfolio, logos
  // partenaires) continuent de s'afficher normalement, et ne se
  // retrouvent jamais forcées en téléchargement par erreur.
  const forceDownload = url.searchParams.get('dl') === '1';
  const disposition = forceDownload ? 'attachment' : 'inline';
  // "dn" (display name) : nom "humain" à afficher dans la boîte de
  // dialogue "Voulez-vous télécharger ?", distinct du nom de stockage
  // "name" utilisé pour retrouver le fichier. Sans ça, un pitch/document
  // stocké en interne sous "pitch_173948..._id.pdf" s'affichait sous ce
  // nom technique au téléchargement au lieu de son vrai nom d'origine
  // (ex: "Pitch_Deck_MonEntreprise.pdf") — beaucoup de navigateurs
  // mobiles utilisent le nom de l'en-tête Content-Disposition plutôt que
  // l'attribut HTML "download" du lien cliqué.
  const displayName = url.searchParams.get('dn') || name;
  const safeName = displayName.replace(/"/g, "'");

  // Quand on force le téléchargement, on sert le fichier avec un type
  // générique (application/octet-stream) au lieu de son vrai type
  // (application/pdf, image/jpeg...). C'est volontaire : certains
  // navigateurs/webviews mobiles ignorent parfois l'en-tête
  // Content-Disposition: attachment quand ils reconnaissent un type
  // qu'ils savent prévisualiser nativement (PDF notamment), et ouvrent le
  // fichier au lieu de le télécharger. Un type générique et inconnu ne
  // peut, par définition, pas être prévisualisé : le navigateur n'a alors
  // plus d'autre choix que de proposer/déclencher le téléchargement. Ça
  // ne change rien pour l'utilisateur final — le nom de fichier (donc
  // son extension .pdf, .jpg, etc.) est conservé via Content-Disposition,
  // donc le fichier reste ouvrable normalement une fois téléchargé.
  const contentType = forceDownload ? 'application/octet-stream' : realContentType;

  return new Response(entry.data, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${safeName}"`,
      // Empêche le navigateur d'essayer quand même de deviner/afficher le
      // contenu à partir de son contenu réel plutôt que du Content-Type
      // annoncé — encore une protection contre la prévisualisation.
      'X-Content-Type-Options': 'nosniff',
      // IMPORTANT : PAS de cache long/"immutable" ici. Le contenu à cette
      // URL n'est PAS réellement figé : une photo de profil, une facture
      // ou un pitch peuvent être remplacés sous le même id+nom. Un cache
      // "immutable" d'un an ferait servir indéfiniment une ancienne
      // réponse mise en cache par le CDN — notamment une vieille version
      // en "inline" d'avant ce correctif, empêchant le téléchargement de
      // fonctionner même après un nouveau déploiement. "no-cache" oblige
      // le navigateur/CDN à revalider à chaque fois (rapide, ce n'est
      // qu'une vérification, pas un nouveau téléchargement complet si le
      // contenu n'a pas changé).
      'Cache-Control': 'no-cache, must-revalidate'
    }
  });
};

export const config = { path: '/api/shared-file' };

import { getStore } from '@netlify/blobs';

// C'est CETTE url (/api/card?id=card-XXX) qui est écrite UNE SEULE FOIS
// sur la puce NFC physique (et encodée dans le QR "carte" affiché dans
// l'app) — jamais le lien direct d'un partage précis.
//
// À chaque tap / scan, cette fonction regarde dans le registre
// "mdea-card-pointers" quel est le shareId ACTUELLEMENT programmé pour
// cette carte (mis à jour par create-share.mjs à chaque "Programmer la
// carte NFC" / "Copier le lien"), et redirige (302) vers le lien final
// et FIGÉ de ce partage : /share.html?id=<shareId>.
//
// Pourquoi une redirection plutôt que de servir le contenu directement ?
// Parce que c'est ce qui permet à chaque personne qui tape la carte
// d'obtenir une URL FINALE différente et propre à elle (celle du shareId
// courant à cet instant précis) dans la barre d'adresse de son
// navigateur. Si elle enregistre ce lien ou le rouvre plus tard, elle
// retombe directement sur share.html?id=<CE shareId précis>, qui n'est
// JAMAIS réécrit ensuite — même si vous reprogrammez la carte pour
// quelqu'un d'autre entre-temps. Servir le contenu directement depuis
// /api/card aurait, au contraire, recréé exactement le bug qu'on corrige
// (un seul point d'accès dont le contenu change sous les pieds de tout
// le monde).
export default async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const url = new URL(req.url);
  const cardId = url.searchParams.get('id');
  if (!cardId) return new Response('Paramètre id manquant', { status: 400 });

  try {
    const store = getStore({ name: 'mdea-card-pointers', consistency: 'strong' });
    const pointer = await store.get(cardId, { type: 'json' });

    if (!pointer || !pointer.currentShareId) {
      // Carte jamais programmée (ou pointeur introuvable) : on retombe
      // sur share.html avec un indicateur dédié, pour un message clair
      // plutôt qu'une redirection vers un id inexistant.
      return Response.redirect(`${url.origin}/share.html?empty=1`, 302);
    }

    return Response.redirect(
      `${url.origin}/share.html?id=${encodeURIComponent(pointer.currentShareId)}`,
      302
    );
  } catch (e) {
    return Response.redirect(`${url.origin}/share.html?empty=1`, 302);
  }
};

export const config = { path: '/api/card' };

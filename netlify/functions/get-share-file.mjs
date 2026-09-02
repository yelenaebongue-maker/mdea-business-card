import { connectLambda, getStore } from '@netlify/blobs';

// Public : sert le contenu réel (vCard, PDF, image...) référencé dans un partage.
export const handler = async (event) => {
  connectLambda(event);
  const shareId = event.queryStringParameters && event.queryStringParameters.share;
  const name = event.queryStringParameters && event.queryStringParameters.name;
  if (!shareId || !name) return { statusCode: 400, body: 'Paramètres manquants' };

  try {
    const store = getStore('mdea-share-files');
    const blob = await store.getWithMetadata(`${shareId}/${name}`, { type: 'arrayBuffer' });
    if (!blob) return { statusCode: 404, body: 'Introuvable' };
    const type = (blob.metadata && blob.metadata.type) || 'application/octet-stream';
    return {
      statusCode: 200,
      headers: {
        'Content-Type': type,
        'Content-Disposition': `inline; filename="${name}"`,
        'Cache-Control': 'no-store'
      },
      isBase64Encoded: true,
      body: Buffer.from(blob.data).toString('base64')
    };
  } catch (e) {
    return { statusCode: 404, body: 'Introuvable' };
  }
};

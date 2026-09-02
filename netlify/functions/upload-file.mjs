import { connectLambda, getStore } from '@netlify/blobs';
import Busboy from 'busboy';

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    const busboy = Busboy({ headers: { 'content-type': contentType } });
    let chunks = [];
    let filename = 'fichier';
    let mimeType = 'application/octet-stream';

    busboy.on('file', (fieldname, file, info) => {
      filename = info.filename || filename;
      mimeType = info.mimeType || info.mimetype || mimeType;
      file.on('data', (data) => chunks.push(data));
    });
    busboy.on('error', reject);
    busboy.on('finish', () => resolve({ fileBuffer: Buffer.concat(chunks), filename, mimeType }));

    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'utf8');
    busboy.end(bodyBuffer);
  });
}

export const handler = async (event, context) => {
  connectLambda(event);
  const user = context.clientContext && context.clientContext.user;
  if (!user) return { statusCode: 401, body: JSON.stringify({ error: 'Non authentifié' }) };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const shareId = event.queryStringParameters && event.queryStringParameters.share;
  if (!shareId) return { statusCode: 400, body: JSON.stringify({ error: 'share manquant' }) };

  try {
    const { fileBuffer, filename, mimeType } = await parseMultipart(event);
    // @netlify/blobs n'accepte que ArrayBuffer | Blob | string — un Buffer
    // Node brut n'est PAS reconnu et provoque un fichier vide/corrompu.
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    );
    const store = getStore('mdea-share-files', { consistency: 'strong' });
    await store.set(`${shareId}/${filename}`, arrayBuffer, { metadata: { type: mimeType } });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, name: filename, type: mimeType, size: fileBuffer.length })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

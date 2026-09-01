/* ============================================================
   NETLIFY AUTH — petit client "maison" pour Netlify Identity.
   Remplace le SDK Firebase Auth. Ne dépend d'aucune librairie
   externe : parle directement à l'API GoTrue intégrée à Netlify
   (/.netlify/identity/*), automatiquement disponible dès que
   Identity est activé sur le site — aucune clé/config à fournir.

   Persistance : le token est gardé dans localStorage, comme le
   faisait `auth.setPersistence(...Persistence.LOCAL)` côté Firebase.
   ============================================================ */
(function (window) {
  const STORAGE_KEY = 'mdea_identity_session';

  function readSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function writeSession(session) {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  }

  async function login(email, password) {
    const res = await fetch('/.netlify/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'password', username: email, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error_description || 'Identifiants invalides');
    }
    const token = await res.json();
    const session = {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: Date.now() + (token.expires_in || 3600) * 1000
    };
    writeSession(session);
    return getUser(true);
  }

  async function refreshIfNeeded() {
    const session = readSession();
    if (!session) return null;
    if (session.expires_at - Date.now() > 60000) return session; // encore valide 60s+
    const res = await fetch('/.netlify/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refresh_token })
    });
    if (!res.ok) { writeSession(null); return null; }
    const token = await res.json();
    const fresh = {
      access_token: token.access_token,
      refresh_token: token.refresh_token || session.refresh_token,
      expires_at: Date.now() + (token.expires_in || 3600) * 1000
    };
    writeSession(fresh);
    return fresh;
  }

  async function getToken() {
    const session = await refreshIfNeeded();
    return session ? session.access_token : null;
  }

  // force=true : revalide toujours contre le serveur (juste après un login)
  async function getUser(force) {
    const token = await getToken();
    if (!token) return null;
    const res = await fetch('/.netlify/identity/user', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) { writeSession(null); return null; }
    return res.json(); // { id, email, user_metadata, app_metadata, ... }
  }

  async function recoverPassword(email) {
    const res = await fetch('/.netlify/identity/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!res.ok) throw new Error("Impossible d'envoyer l'email de réinitialisation.");
  }

  // Finalise une invitation ("Rejoindre") ou une récupération de mot de
  // passe ("Mot de passe oublié") à partir du token présent dans l'URL
  // (ex: #invite_token=xxx ou #recovery_token=xxx envoyé par email).
  // type doit valoir 'signup' (invitation) ou 'recovery'.
  // IMPORTANT : pour une INVITATION (type 'signup'), GoTrue exige que
  // le token ET le mot de passe soient envoyés dans le MÊME appel
  // /verify (c'est ce que fait acceptInvite() côté @netlify/identity
  // officiel). Séparer verify puis PUT /user fait échouer /verify côté
  // serveur, qui répond alors par une erreur générique interprétée à
  // tort comme "lien expiré". Pour une RÉCUPÉRATION (type 'recovery'),
  // le token seul suffit à /verify (l'utilisateur existe déjà) ; le
  // mot de passe se change ensuite via un second appel PUT /user.
  async function setPasswordFromToken(token, type, password) {
    const verifyBody = type === 'signup'
      ? { type, token, password }   // invitation : tout en un seul appel
      : { type, token };            // récupération : token seul ici

    const verifyRes = await fetch('/.netlify/identity/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(verifyBody)
    });
    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      throw new Error(err.error_description || 'Ce lien est invalide ou a expiré.');
    }
    const tokenData = await verifyRes.json();
    const session = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000
    };
    writeSession(session);

    if (type === 'signup') {
      // Le mot de passe a déjà été posé par /verify ci-dessus.
      return tokenData;
    }

    const setPwRes = await fetch('/.netlify/identity/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ password })
    });
    if (!setPwRes.ok) throw new Error("Impossible d'enregistrer le mot de passe.");
    return setPwRes.json();
  }

  // Lit un token d'invitation/récupération/confirmation dans le hash de
  // l'URL (#invite_token=..., #recovery_token=..., #confirmation_token=...).
  // Retourne { token, type } ou null si aucun n'est présent.
  function readAuthTokenFromUrl() {
    const hash = window.location.hash || '';
    const inviteMatch = hash.match(/(?:invite|confirmation)_token=([^&]+)/);
    if (inviteMatch) return { token: inviteMatch[1], type: 'signup' };
    const recoveryMatch = hash.match(/recovery_token=([^&]+)/);
    if (recoveryMatch) return { token: recoveryMatch[1], type: 'recovery' };
    return null;
  }

  async function logout() {
    writeSession(null);
  }

  // Wrapper fetch qui ajoute automatiquement le token Identity.
  // Les fonctions Netlify le lisent tout seul dans context.clientContext.user.
  async function authedFetch(url, options = {}) {
    const token = await getToken();
    const headers = Object.assign({}, options.headers, { 'Content-Type': 'application/json' });
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(url, Object.assign({}, options, { headers }));
  }

  window.NetlifyAuth = { login, logout, getUser, getToken, recoverPassword, authedFetch, setPasswordFromToken, readAuthTokenFromUrl };
})(window);

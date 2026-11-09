/**
 * #13 — Login Lichess opcional para site estático.
 * Authorization Code + PKCE S256. Nada é persistido além do desafio/estado
 * temporários da transação OAuth; o access token existe APENAS nesta instância.
 */
export const LICHESS_CLIENT_ID = 'leumattiello.github.io-SiteDoCampeonato';
export const LICHESS_SCOPE = 'challenge:write';
const PENDING_KEY = 'reinos-xadrez-lichess-pkce-v1';
const MAX_AGE_MS = 10 * 60 * 1000;
const HOST = 'https://lichess.org';

export function loginAllowedAt(loc) {
  if (!loc || !loc.hostname || !loc.pathname) return false;
  const production = loc.protocol === 'https:' &&
    loc.hostname === 'leumattiello.github.io' &&
    /^\/SiteDoCampeonato\/(?:index\.html)?$/.test(loc.pathname);
  const local = (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') &&
    (loc.protocol === 'http:' || loc.protocol === 'https:');
  return production || local;
}
export function oauthRedirectUri(loc) {
  return loc.origin + loc.pathname; // sem query ou fragmento
}
function base64url(bytes) {
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function randomToken(cryptoProvider) {
  const bytes = new Uint8Array(32);
  cryptoProvider.getRandomValues(bytes);
  return base64url(bytes);
}
export function authorizationUrl({state, challenge, redirectUri}) {
  const query = new URLSearchParams({
    response_type: 'code', client_id: LICHESS_CLIENT_ID,
    redirect_uri: redirectUri, scope: LICHESS_SCOPE, state,
    code_challenge: challenge, code_challenge_method: 'S256',
  });
  return HOST + '/oauth?' + query;
}
export class LichessAuth {
  #token = null;
  #account = null;
  constructor({
    location = globalThis.location,
    history = globalThis.history,
    storage = globalThis.sessionStorage,
    cryptoProvider = globalThis.crypto,
    fetcher = globalThis.fetch,
    navigate = url => globalThis.location.assign(url),
    now = () => Date.now(),
  } = {}) {
    this.location = location;
    this.history = history;
    this.storage = storage;
    this.cryptoProvider = cryptoProvider;
    this.fetcher = fetcher;
    this.navigate = navigate;
    this.now = now;
  }
  get account() { return this.#account ? {...this.#account} : null; }
  get connected() { return !!this.#account; }
  get available() {
    return loginAllowedAt(this.location) &&
      !!this.cryptoProvider?.subtle?.digest &&
      !!this.cryptoProvider?.getRandomValues && !!this.storage;
  }
  #forgetPending() {
    try { this.storage?.removeItem(PENDING_KEY); } catch { /* não expor conteúdo */ }
  }
  async beginLogin() {
    if (!this.available) return {status: 'unavailable'};
    if (this.connected) return {status: 'connected'};
    const verifier = randomToken(this.cryptoProvider);
    const state = randomToken(this.cryptoProvider);
    const digest = await this.cryptoProvider.subtle.digest(
      'SHA-256', new TextEncoder().encode(verifier));
    const challenge = base64url(new Uint8Array(digest));
    const redirectUri = oauthRedirectUri(this.location);
    const pending = {verifier, state, redirectUri, createdAt: this.now()};
    try { this.storage.setItem(PENDING_KEY, JSON.stringify(pending)); }
    catch { return {status: 'storage-unavailable'}; }
    try { this.navigate(authorizationUrl({state, challenge, redirectUri})); }
    catch { this.#forgetPending(); return {status: 'navigation-failed'}; }
    return {status: 'redirecting'};
  }
  #eraseCallbackQuery() {
    // Antes de qualquer chamada de rede: não deixar code/state em URLs ou histórico.
    this.history.replaceState(null, '', this.location.pathname + (this.location.hash || ''));
  }
  async #revoke(token) {
    const response = await this.fetcher(HOST + '/api/token', {
      method: 'DELETE',
      headers: {Authorization: 'Bearer ' + token},
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    });
    return response.ok;
  }
  async completeRedirect() {
    const params = new URLSearchParams(this.location.search || '');
    if (!params.has('code') && !params.has('error')) return {status: 'none'};
    // A callback nunca é usada em hosts de prévia/terceiros.
    try { this.#eraseCallbackQuery(); } catch { return {status: 'error'}; }
    let pending;
    try { pending = JSON.parse(this.storage?.getItem(PENDING_KEY) || 'null'); }
    catch { pending = null; }
    this.#forgetPending(); // estado/verifier de uso único
    if (!this.available || !pending || typeof pending !== 'object' ||
        !Number.isFinite(pending.createdAt) ||
        this.now() < pending.createdAt ||
        this.now() - pending.createdAt > MAX_AGE_MS ||
        pending.redirectUri !== oauthRedirectUri(this.location) ||
        !/^[A-Za-z0-9_-]{32,128}$/.test(pending.verifier || '') ||
        !/^[A-Za-z0-9_-]{32,128}$/.test(pending.state || '') ||
        params.getAll('state').length !== 1 ||
        params.get('state') !== pending.state) {
      return {status: 'invalid-state'};
    }
    if (params.has('error')) return {status: 'cancelled'};
    if (params.getAll('code').length !== 1 ||
        !/^[A-Za-z0-9_]{5,256}$/.test(params.get('code') || '')) {
      return {status: 'error'};
    }
    let token = null;
    try {
      const response = await this.fetcher(HOST + '/api/token', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({
          grant_type: 'authorization_code', code: params.get('code'),
          code_verifier: pending.verifier, redirect_uri: pending.redirectUri,
          client_id: LICHESS_CLIENT_ID,
        }).toString(),
        cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      });
      if (!response.ok) return {status: 'error'};
      const grant = await response.json();
      if (!/^[A-Za-z0-9_]{8,256}$/.test(grant?.access_token || '')) return {status:'error'};
      token = grant.access_token;
      const accountResponse = await this.fetcher(HOST + '/api/account', {
        headers: {Authorization: 'Bearer ' + token},
        cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      });
      if (!accountResponse.ok) throw new Error('Falha ao validar conta');
      const account = await accountResponse.json();
      if (typeof account?.username !== 'string' ||
          !/^[A-Za-z0-9_-]{2,30}$/.test(account.username)) throw new Error('Conta inválida');
      this.#token = token;
      this.#account = {username: account.username};
      return {status: 'connected', account: this.account};
    } catch {
      if (token) { try { await this.#revoke(token); } catch { /* sem token local */ } }
      return {status: 'error'};
    }
  }
  async logout() {
    const token = this.#token;
    this.#token = null; this.#account = null;
    this.#forgetPending();
    if (!token) return {status: 'disconnected'};
    try {
      const revoked = await this.#revoke(token);
      return {status: revoked ? 'disconnected' : 'revoke-failed'};
    } catch { return {status: 'revoke-failed'}; }
  }
}

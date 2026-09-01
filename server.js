'use strict';

/**
 * HACKLAB — tableau de bord d'un labo de pentest auto-hébergé.
 *
 * Serveur HTTP sans aucune dépendance externe (Node.js >= 18).
 *  - sert l'interface web (public/)
 *  - pilote les conteneurs du labo via `docker` (liste d'autorisation stricte)
 *  - relaie (proxy authentifié) les cibles et le terminal web (ttyd)
 *  - sauvegarde la progression et les notes dans data/lab.json
 *
 * Tout est cadré sur un labo LOCAL et volontairement vulnérable. Le but est
 * l'apprentissage sur ses propres machines, jamais l'attaque de tiers.
 */

const http = require('http');
const net = require('net');
const tls = require('tls');
const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const { TARGETS, ROADMAP, TOOLS, MISSION_CHECKLIST, SEVERITIES, MISSION_STATUSES } = require('./lab-data');
const MISSION_STATUS_IDS = MISSION_STATUSES.map((s) => s.id);
const SEVERITY_IDS = SEVERITIES.map((s) => s.id);

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const STORE_FILE = path.join(DATA_DIR, 'lab.json');
const PASSWORD_FILE = path.join(DATA_DIR, 'mot-de-passe.txt');

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';
const TTYD_PORT = Number(process.env.TTYD_PORT || 7681);
const SESSION_TTL = 1000 * 60 * 60 * 12; // 12 h

const TARGET_BY_ID = new Map(TARGETS.map((t) => [t.id, t]));
const ALLOWED_CONTAINERS = new Set(TARGETS.map((t) => t.container));

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

const uid = (p = '') => p + crypto.randomBytes(16).toString('hex');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') };
}
function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const a = Buffer.from(crypto.scryptSync(String(password), record.salt, 64).toString('hex'));
  const b = Buffer.from(record.hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/* Stockage (fichier JSON)                                             */
/* ------------------------------------------------------------------ */

let db = null;

function loadStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(STORE_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      if (!Array.isArray(db.missions)) db.missions = []; // migration
    } catch (err) {
      fs.renameSync(STORE_FILE, STORE_FILE + '.corrompu-' + Date.now());
      db = null;
    }
  }
  if (!db) {
    const generated = crypto.randomBytes(6).toString('base64url');
    const password = process.env.DASHBOARD_PASSWORD || generated;
    db = {
      password: hashPassword(password),
      passwordIsGenerated: !process.env.DASHBOARD_PASSWORD,
      progress: {}, // { moduleId: { itemIndex: true } }
      notes: {}, // { key: "texte" }
      missions: [],
      createdAt: new Date().toISOString(),
    };
    saveStore();
    if (db.passwordIsGenerated) {
      fs.writeFileSync(
        PASSWORD_FILE,
        'Mot de passe du tableau de bord HACKLAB\n---------------------------------------\n' +
          password +
          '\n\nChange-le après la première connexion (Réglages), puis supprime ce fichier.\n',
        'utf8'
      );
      console.log('\n=====================================================');
      console.log('  Mot de passe du tableau de bord : ' + password);
      console.log('  (aussi dans data/mot-de-passe.txt)');
      console.log('=====================================================\n');
    }
  }
}

function saveStore() {
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, STORE_FILE);
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

const sessions = new Map();
const loginAttempts = new Map();

function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}
function validSession(token) {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function throttled(ip) {
  const e = loginAttempts.get(ip);
  if (!e) return false;
  if (Date.now() - e.at > 15 * 60 * 1000) {
    loginAttempts.delete(ip);
    return false;
  }
  return e.count >= 8;
}
function noteFail(ip) {
  const e = loginAttempts.get(ip) || { count: 0, at: Date.now() };
  e.count += 1;
  e.at = Date.now();
  loginAttempts.set(ip, e);
}
function requestToken(req) {
  return parseCookies(req).hacklab;
}

/* ------------------------------------------------------------------ */
/* Réponses HTTP                                                       */
/* ------------------------------------------------------------------ */

function sendJSON(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}
function sendText(res, status, text, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, ...headers });
  res.end(text);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1024 * 512) {
        reject(new Error('Corps trop volumineux'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------ */
/* Fichiers statiques                                                  */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};
function serveFile(res, relativePath, cache) {
  const safe = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) return sendText(res, 403, 'Accès refusé');
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return sendText(res, 404, 'Introuvable');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': cache || 'public, max-age=300',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ------------------------------------------------------------------ */
/* Docker (liste d'autorisation stricte, aucune entrée utilisateur)   */
/* ------------------------------------------------------------------ */

function docker(args) {
  return new Promise((resolve) => {
    execFile('docker', args, { timeout: 20000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
    });
  });
}

async function dockerAvailable() {
  const r = await docker(['version', '--format', '{{.Server.Version}}']);
  return r.ok;
}

async function targetStatus() {
  const available = await dockerAvailable();
  const result = {};
  if (!available) {
    TARGETS.forEach((t) => (result[t.id] = { state: 'docker-absent' }));
    return { available: false, targets: result };
  }
  // Un seul appel : état de tous les conteneurs du labo.
  const r = await docker(['ps', '-a', '--format', '{{.Names}}\t{{.State}}\t{{.Status}}']);
  const byName = {};
  if (r.ok) {
    r.stdout
      .split('\n')
      .filter(Boolean)
      .forEach((line) => {
        const [name, state, status] = line.split('\t');
        byName[name] = { state, status };
      });
  }
  TARGETS.forEach((t) => {
    const info = byName[t.container];
    result[t.id] = info ? { state: info.state, status: info.status } : { state: 'absent' };
  });
  return { available: true, targets: result };
}

async function dockerAction(action, container) {
  if (!ALLOWED_CONTAINERS.has(container)) return { ok: false, stderr: 'Conteneur non autorisé' };
  if (!['start', 'stop', 'restart'].includes(action)) return { ok: false, stderr: 'Action inconnue' };
  return docker([action, container]);
}

/* ------------------------------------------------------------------ */
/* Proxy HTTP + WebSocket vers une cible locale ou ttyd               */
/* ------------------------------------------------------------------ */

function resolveUpstream(pathname) {
  // /terminal/...  → ttyd (lancé avec -b /terminal : on transmet le chemin complet)
  if (pathname === '/terminal' || pathname.startsWith('/terminal/')) {
    return { port: TTYD_PORT, base: '/terminal', kind: 'terminal', stripBase: false };
  }
  // /target/<id>/... → cible du labo (on retire le préfixe pour l'appli en dessous)
  const m = /^\/target\/([a-z0-9]+)(\/.*)?$/.exec(pathname);
  if (m) {
    const target = TARGET_BY_ID.get(m[1]);
    if (target) return { port: target.port, base: '/target/' + target.id, kind: 'target', stripBase: true };
  }
  return null;
}

function upstreamPath(req, upstream) {
  return upstream.stripBase ? req.url.slice(upstream.base.length) || '/' : req.url;
}

function proxyHTTP(req, res, upstream) {
  const subPath = upstreamPath(req, upstream);
  const isTarget = upstream.kind === 'target';
  const headers = { ...req.headers, host: '127.0.0.1:' + upstream.port };
  // Pour les cibles, on réécrit le HTML : on évite donc la compression en amont.
  if (isTarget) headers['accept-encoding'] = 'identity';
  const options = { host: '127.0.0.1', port: upstream.port, method: req.method, path: subPath, headers };

  const proxyReq = http.request(options, (proxyRes) => {
    const outHeaders = { ...proxyRes.headers };

    if (isTarget && outHeaders.location) {
      outHeaders.location = rewriteLocation(outHeaders.location, upstream);
    }

    const ct = String(outHeaders['content-type'] || '');
    if (isTarget && ct.includes('text/html')) {
      // On bufferise le HTML pour injecter une balise <base> : ainsi les
      // liens relatifs de la cible (DVWA, WebGoat…) restent sous /target/<id>/.
      delete outHeaders['content-length'];
      const chunks = [];
      proxyRes.on('data', (c) => chunks.push(c));
      proxyRes.on('end', () => {
        const html = injectBase(Buffer.concat(chunks).toString('utf8'), upstream.base + '/');
        res.writeHead(proxyRes.statusCode, outHeaders);
        res.end(html);
      });
      proxyRes.on('error', () => res.destroy());
    } else {
      res.writeHead(proxyRes.statusCode, outHeaders);
      proxyRes.pipe(res);
    }
  });
  proxyReq.on('error', () => {
    if (!res.headersSent) {
      sendText(res, 502, 'Cible injoignable. Le conteneur est-il démarré ? (onglet Labo)', 'text/plain; charset=utf-8');
    }
  });
  req.pipe(proxyReq);
}

function rewriteLocation(location, upstream) {
  let loc = String(location);
  // Adresse absolue vers la cible interne → chemin relatif au proxy.
  loc = loc.replace(/^https?:\/\/127\.0\.0\.1:\d+/i, '');
  if (loc.startsWith('/') && !loc.startsWith('//') && !loc.startsWith(upstream.base + '/')) {
    return upstream.base + loc;
  }
  return loc;
}

function injectBase(html, baseHref) {
  const tag = '<base href="' + baseHref + '">';
  if (/<base\s/i.test(html)) return html; // déjà présent
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + tag);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + tag);
  return tag + html;
}

function proxyUpgrade(req, socket, head, upstream) {
  const subPath = upstreamPath(req, upstream);
  const upstreamSocket = net.connect(upstream.port, '127.0.0.1', () => {
    const headers = { ...req.headers, host: '127.0.0.1:' + upstream.port };
    let raw = req.method + ' ' + subPath + ' HTTP/1.1\r\n';
    for (const [k, v] of Object.entries(headers)) {
      const values = Array.isArray(v) ? v : [v];
      values.forEach((val) => (raw += k + ': ' + val + '\r\n'));
    }
    raw += '\r\n';
    upstreamSocket.write(raw);
    if (head && head.length) upstreamSocket.write(head);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });
  upstreamSocket.on('error', () => socket.destroy());
  socket.on('error', () => upstreamSocket.destroy());
}

/* ------------------------------------------------------------------ */
/* Scan passif automatisé (requêtes web bénignes, non intrusives)      */
/* ------------------------------------------------------------------ */

function isPrivateIP(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip === '0.0.0.0') return true;
  if (/^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^f[cd]/i.test(ip) || /^fe80/i.test(ip)) return true; // IPv6 privé / lien-local
  return false;
}

// Analyse des en-têtes HTTP — fonction pure, facile à tester.
function analyzeHeaders(protocol, get, setCookies) {
  const findings = [];
  const tech = [];
  const add = (severity, title, detail, solution) => findings.push({ severity, title, detail, solution });
  const https = protocol === 'https:';

  if (get('server')) {
    tech.push('Serveur : ' + get('server'));
    if (/\d/.test(get('server'))) add('faible', 'Version du serveur exposée', 'En-tête « Server: ' + get('server') + ' ».', 'Masquer la version du serveur (ex. « server_tokens off » sur Nginx).');
  }
  if (get('x-powered-by')) {
    tech.push(get('x-powered-by'));
    add('faible', 'Technologie exposée (X-Powered-By)', 'En-tête « X-Powered-By: ' + get('x-powered-by') + ' ».', "Supprimer l'en-tête X-Powered-By côté serveur.");
  }
  if (get('x-generator')) tech.push(get('x-generator'));

  if (https && !get('strict-transport-security')) add('moyenne', 'HSTS manquant', 'En-tête Strict-Transport-Security absent : le navigateur peut être forcé en HTTP.', 'Ajouter « Strict-Transport-Security: max-age=31536000; includeSubDomains ».');
  if (!get('content-security-policy')) add('moyenne', 'Content-Security-Policy manquante', 'Aucune CSP : la protection contre le XSS est fortement réduite.', 'Définir une Content-Security-Policy adaptée au site.');
  if (!get('x-frame-options') && !/frame-ancestors/i.test(get('content-security-policy') || '')) add('faible', 'Protection clickjacking manquante', 'Ni X-Frame-Options ni directive frame-ancestors.', "Ajouter « X-Frame-Options: DENY » ou une directive frame-ancestors dans la CSP.");
  if (!get('x-content-type-options')) add('faible', 'X-Content-Type-Options manquant', 'nosniff absent : risque de MIME sniffing.', 'Ajouter « X-Content-Type-Options: nosniff ».');
  if (!get('referrer-policy')) add('info', 'Referrer-Policy manquante', 'Politique de référent non définie.', 'Ajouter « Referrer-Policy: strict-origin-when-cross-origin ».');

  (setCookies || []).forEach((c) => {
    const name = (c.split('=')[0] || 'cookie').trim();
    const flags = c.toLowerCase();
    const missing = [];
    if (https && !flags.includes('secure')) missing.push('Secure');
    if (!flags.includes('httponly')) missing.push('HttpOnly');
    if (!flags.includes('samesite')) missing.push('SameSite');
    if (missing.length) add('moyenne', 'Cookie peu sécurisé : ' + name, 'Attributs manquants : ' + missing.join(', ') + '.', 'Ajouter les attributs ' + missing.join(', ') + ' à ce cookie.');
  });

  return { findings, tech };
}

const SCAN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const headers = { 'User-Agent': SCAN_UA, Accept: '*/*', ...(options.headers || {}) };
  return fetch(url, { ...options, headers, signal: ctrl.signal, redirect: options.redirect || 'follow' }).finally(() => clearTimeout(t));
}

function getPeerCert(host, port) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: Number(port) || 443, servername: host, timeout: 6000, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert && cert.valid_to ? cert : null);
    });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

async function scanTarget(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch (e) {
    throw new Error('URL invalide.');
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Seuls http/https sont supportés.');

  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => null);
  if (!addrs || !addrs.length) throw new Error('Domaine introuvable (DNS).');
  if (addrs.some((a) => isPrivateIP(a.address))) throw new Error('Cible interne/privée refusée (protection SSRF).');

  const findings = [];
  const tech = [];
  const add = (severity, title, detail, solution) => findings.push({ severity, title, detail, solution });

  // Redirection HTTP → HTTPS
  if (u.protocol === 'https:') {
    try {
      const r = await fetchWithTimeout('http://' + u.hostname + '/', { redirect: 'manual' }, 6000);
      const loc = r.headers.get('location') || '';
      if (!(r.status >= 300 && r.status < 400 && /^https:/i.test(loc))) {
        add('elevee', 'Pas de redirection HTTP → HTTPS', 'Le site répond en HTTP sans forcer le HTTPS.', 'Rediriger tout le trafic du port 80 vers HTTPS (301).');
      }
    } catch (e) {
      /* HTTP peut-être fermé : tant mieux */
    }
  }

  let res;
  try {
    res = await fetchWithTimeout(u.toString(), { redirect: 'follow' }, 9000);
  } catch (e1) {
    // Repli : beaucoup de petits sites sont en HTTP seul, ou ont un certificat cassé.
    if (u.protocol === 'https:') {
      try {
        res = await fetchWithTimeout('http://' + u.hostname + u.pathname, { redirect: 'follow' }, 9000);
        u.protocol = 'http:';
        add('elevee', 'Site accessible en HTTP', "La cible n'a pas répondu en HTTPS mais répond en HTTP : trafic non chiffré.", 'Installer un certificat TLS (Let’s Encrypt, gratuit) et forcer le HTTPS.');
      } catch (e2) {
        throw new Error("Cible injoignable. Vérifie le domaine (fautes, site en ligne ?). Un pare-feu type Cloudflare peut aussi bloquer le scan.");
      }
    } else {
      throw new Error("Cible injoignable. Vérifie le domaine (fautes, site en ligne ?).");
    }
  }
  const get = (n) => res.headers.get(n);
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : (get('set-cookie') ? [get('set-cookie')] : []);
  const analysis = analyzeHeaders(u.protocol, get, setCookies);
  analysis.findings.forEach((f) => findings.push(f));
  analysis.tech.forEach((t) => tech.push(t));

  // Certificat TLS
  if (u.protocol === 'https:') {
    const cert = await getPeerCert(u.hostname, u.port || 443);
    if (cert) {
      const exp = Date.parse(cert.valid_to);
      const now = Date.now();
      if (exp < now) add('elevee', 'Certificat TLS expiré', 'Expiré le ' + cert.valid_to + '.', 'Renouveler immédiatement le certificat.');
      else if (exp - now < 15 * 86400000) add('moyenne', 'Certificat TLS bientôt expiré', 'Expire le ' + cert.valid_to + '.', 'Renouveler le certificat (Let’s Encrypt automatise le renouvellement).');
    }
  }

  if (!findings.length) add('info', 'Aucun problème passif détecté', 'Le scan passif (en-têtes, HTTPS, cookies, TLS) n’a rien relevé.', 'Poursuivre par des tests actifs autorisés (nmap, nuclei) depuis une machine autorisée.');

  return { findings, tech };
}

/* ------------------------------------------------------------------ */
/* Analyse IA (nocturai) — la clé n'est JAMAIS dans le dépôt           */
/* ------------------------------------------------------------------ */

const NOCTURAI_URL = process.env.NOCTURAI_URL || 'https://nocturai.com/api/chat';
const NOCTURAI_KEY_FILE = path.join(DATA_DIR, 'nocturai-key.txt');

function nocturaiKey() {
  if (process.env.NOCTURAI_API_KEY) return process.env.NOCTURAI_API_KEY.trim();
  try {
    if (fs.existsSync(NOCTURAI_KEY_FILE)) return fs.readFileSync(NOCTURAI_KEY_FILE, 'utf8').trim();
  } catch (e) {
    /* ignore */
  }
  return null;
}

async function callNocturai(message) {
  const key = nocturaiKey();
  if (!key) throw new Error('Clé API nocturai absente. Ajoute-la dans data/nocturai-key.txt sur le serveur.');

  // La doc et le serveur ne s'accordent pas sur le format : on essaie les
  // formes les plus courantes jusqu'à ce que l'une soit acceptée.
  const candidates = [
    { messages: [message], model: 'code' },
    { messages: [{ role: 'user', content: message }], model: 'code' },
    { message, model: 'code' },
    { messages: [{ role: 'user', content: message }] },
  ];

  let res = null;
  let lastText = '';
  for (const body of candidates) {
    try {
      res = await fetchWithTimeout(NOCTURAI_URL, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, 45000);
    } catch (e) {
      throw new Error('API nocturai injoignable : ' + e.message);
    }
    lastText = await res.text();
    if (res.ok) break;
    if (res.status !== 400) throw new Error('API nocturai a répondu ' + res.status + ' : ' + lastText.slice(0, 200));
    res = null; // 400 : on tente la forme suivante
  }
  if (!res) throw new Error('API nocturai a refusé toutes les formes de requête. Dernier message : ' + lastText.slice(0, 200));

  const text = lastText;
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return text; // réponse déjà en texte brut
  }
  // On accepte plusieurs formes de réponse courantes.
  return (
    data.reply ||
    data.response ||
    data.message ||
    data.content ||
    data.answer ||
    data.text ||
    (data.choices && data.choices[0] && (data.choices[0].message ? data.choices[0].message.content : data.choices[0].text)) ||
    JSON.stringify(data)
  );
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function handleAPI(req, res, pathname) {
  const ip = req.socket.remoteAddress || '?';

  if (pathname === '/api/login' && req.method === 'POST') {
    if (throttled(ip)) return sendJSON(res, 429, { error: 'Trop de tentatives. Attends 15 minutes.' });
    const body = await readBody(req);
    if (!verifyPassword(body.password, db.password)) {
      noteFail(ip);
      return sendJSON(res, 401, { error: 'Mot de passe incorrect.' });
    }
    loginAttempts.delete(ip);
    const token = createSession();
    return sendJSON(res, 200, { ok: true }, {
      'Set-Cookie': 'hacklab=' + token + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=' + SESSION_TTL / 1000,
    });
  }

  const authed = validSession(requestToken(req));

  if (pathname === '/api/session' && req.method === 'GET') {
    return sendJSON(res, 200, { authenticated: authed });
  }
  if (pathname === '/api/logout' && req.method === 'POST') {
    sessions.delete(requestToken(req));
    return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': 'hacklab=; HttpOnly; Path=/; Max-Age=0' });
  }

  if (!authed) return sendJSON(res, 401, { error: 'Non authentifié.' });

  if (pathname === '/api/lab' && req.method === 'GET') {
    const status = await targetStatus();
    return sendJSON(res, 200, {
      dockerAvailable: status.available,
      targets: TARGETS.map((t) => ({ ...t, runtime: status.targets[t.id] })),
      passwordIsGenerated: db.passwordIsGenerated,
    });
  }

  if (pathname === '/api/lab/action' && req.method === 'POST') {
    const body = await readBody(req);
    const target = TARGET_BY_ID.get(body.id);
    if (!target) return sendJSON(res, 400, { error: 'Cible inconnue.' });
    const r = await dockerAction(body.action, target.container);
    if (!r.ok) return sendJSON(res, 500, { error: r.stderr || 'Action échouée.' });
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/roadmap' && req.method === 'GET') {
    return sendJSON(res, 200, { roadmap: ROADMAP, progress: db.progress, notes: db.notes });
  }

  if (pathname === '/api/progress' && req.method === 'POST') {
    const body = await readBody(req);
    const mod = ROADMAP.find((m) => m.id === body.moduleId);
    if (!mod || typeof body.itemIndex !== 'number' || body.itemIndex < 0 || body.itemIndex >= mod.items.length) {
      return sendJSON(res, 400, { error: 'Élément inconnu.' });
    }
    if (!db.progress[body.moduleId]) db.progress[body.moduleId] = {};
    if (body.done) db.progress[body.moduleId][body.itemIndex] = true;
    else delete db.progress[body.moduleId][body.itemIndex];
    saveStore();
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/notes' && req.method === 'POST') {
    const body = await readBody(req);
    const key = String(body.key || '').slice(0, 64);
    if (!/^[a-z0-9_-]+$/i.test(key)) return sendJSON(res, 400, { error: 'Clé invalide.' });
    db.notes[key] = String(body.text || '').slice(0, 20000);
    saveStore();
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/tools' && req.method === 'GET') {
    return sendJSON(res, 200, { tools: TOOLS });
  }

  /* --- missions (prestations autorisées) --- */
  if (pathname === '/api/missions' && req.method === 'GET') {
    return sendJSON(res, 200, {
      missions: db.missions,
      checklist: MISSION_CHECKLIST,
      severities: SEVERITIES,
      statuses: MISSION_STATUSES,
    });
  }

  if (pathname === '/api/missions' && req.method === 'POST') {
    const body = await readBody(req);
    if (!String(body.client || '').trim()) return sendJSON(res, 400, { error: 'Le nom du client est obligatoire.' });
    const mission = {
      id: uid('msn-'),
      client: String(body.client).trim().slice(0, 200),
      discord: String(body.discord || '').trim().slice(0, 120),
      domain: String(body.domain || '').trim().slice(0, 200),
      window: String(body.window || '').trim().slice(0, 200),
      scope: String(body.scope || '').slice(0, 4000),
      status: 'brouillon',
      checklist: {},
      notes: '',
      findings: [],
      createdAt: new Date().toISOString(),
    };
    db.missions.unshift(mission);
    saveStore();
    return sendJSON(res, 201, { mission });
  }

  const missionMatch = /^\/api\/missions\/([\w-]+)$/.exec(pathname);
  if (missionMatch) {
    const mission = db.missions.find((m) => m.id === missionMatch[1]);
    if (!mission) return sendJSON(res, 404, { error: 'Mission introuvable.' });

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      ['client', 'discord', 'domain', 'window'].forEach((f) => {
        if (typeof body[f] === 'string') mission[f] = body[f].trim().slice(0, 200);
      });
      if (typeof body.scope === 'string') mission.scope = body.scope.slice(0, 4000);
      if (typeof body.notes === 'string') mission.notes = body.notes.slice(0, 20000);
      if (body.status && MISSION_STATUS_IDS.includes(body.status)) mission.status = body.status;
      if (body.checklist && typeof body.checklist === 'object') {
        const clean = {};
        MISSION_CHECKLIST.forEach((_, i) => {
          if (body.checklist[i]) clean[i] = true;
        });
        mission.checklist = clean;
      }
      if (Array.isArray(body.findings)) {
        mission.findings = body.findings.slice(0, 200).map((f) => ({
          title: String(f.title || '').slice(0, 200),
          severity: SEVERITY_IDS.includes(f.severity) ? f.severity : 'info',
          detail: String(f.detail || '').slice(0, 4000),
          solution: String(f.solution || '').slice(0, 2000),
        }));
      }
      saveStore();
      return sendJSON(res, 200, { mission });
    }

    if (req.method === 'DELETE') {
      db.missions = db.missions.filter((m) => m.id !== mission.id);
      saveStore();
      return sendJSON(res, 200, { ok: true });
    }
  }

  const aiMatch = /^\/api\/missions\/([\w-]+)\/ai$/.exec(pathname);
  if (aiMatch && req.method === 'POST') {
    const mission = db.missions.find((m) => m.id === aiMatch[1]);
    if (!mission) return sendJSON(res, 404, { error: 'Mission introuvable.' });
    const findings = (mission.findings || [])
      .map((f) => '- [' + f.severity + '] ' + f.title + (f.detail ? ' — ' + f.detail : ''))
      .join('\n');
    const prompt =
      "Tu es un expert en cybersécurité. Voici les résultats d'un scan de sécurité passif du site « " +
      (mission.domain || 'inconnu') + " ».\n\n" +
      (findings || '(aucune faille listée pour le moment)') +
      "\n\nEn français : 1) résume le niveau de risque global, 2) classe les problèmes du plus critique au moins grave, " +
      "3) pour chacun donne un correctif concret et actionnable. Sois clair et concis.";
    try {
      const analysis = await callNocturai(prompt);
      mission.aiAnalysis = { text: String(analysis).slice(0, 20000), at: new Date().toISOString() };
      saveStore();
      return sendJSON(res, 200, { analysis: mission.aiAnalysis.text });
    } catch (e) {
      return sendJSON(res, 502, { error: e.message });
    }
  }

  if (pathname === '/api/ai/status' && req.method === 'GET') {
    return sendJSON(res, 200, { configured: !!nocturaiKey() });
  }

  const scanMatch = /^\/api\/missions\/([\w-]+)\/scan$/.exec(pathname);
  if (scanMatch && req.method === 'POST') {
    const mission = db.missions.find((m) => m.id === scanMatch[1]);
    if (!mission) return sendJSON(res, 404, { error: 'Mission introuvable.' });
    if (Object.keys(mission.checklist || {}).length < MISSION_CHECKLIST.length) {
      return sendJSON(res, 403, { error: 'Coche toute la checklist (autorisation) avant de scanner.' });
    }
    let url = (mission.domain || '').trim();
    if (!url) return sendJSON(res, 400, { error: 'Renseigne le domaine de la mission.' });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      const { findings, tech } = await scanTarget(url);
      // Fusion dans les failles de la mission (dédup par titre).
      const existing = new Set((mission.findings || []).map((f) => f.title));
      let added = 0;
      findings.forEach((f) => {
        if (f.severity === 'info' && f.title.startsWith('Aucun')) return;
        if (!existing.has(f.title)) {
          mission.findings.push(f);
          existing.add(f.title);
          added++;
        }
      });
      saveStore();
      return sendJSON(res, 200, { findings, tech, added, mission });
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
  }

  if (pathname === '/api/password' && req.method === 'POST') {
    const body = await readBody(req);
    if (String(body.newPassword || '').length < 8) {
      return sendJSON(res, 400, { error: 'Au moins 8 caractères.' });
    }
    if (!verifyPassword(body.currentPassword, db.password)) {
      return sendJSON(res, 400, { error: 'Mot de passe actuel incorrect.' });
    }
    db.password = hashPassword(body.newPassword);
    db.passwordIsGenerated = false;
    saveStore();
    if (fs.existsSync(PASSWORD_FILE)) fs.unlinkSync(PASSWORD_FILE);
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 404, { error: 'Route inconnue.' });
}

/* ------------------------------------------------------------------ */
/* Serveur                                                             */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch (err) {
    return sendText(res, 400, 'Requête invalide');
  }
  const pathname = decodeURIComponent(url.pathname);

  try {
    // Proxy (cible / terminal) — authentifié par cookie.
    const upstream = resolveUpstream(pathname);
    if (upstream) {
      if (!validSession(requestToken(req))) {
        return sendText(res, 401, 'Connecte-toi au tableau de bord d\'abord.');
      }
      return proxyHTTP(req, res, upstream);
    }

    if (pathname.startsWith('/api/')) return await handleAPI(req, res, pathname);

    if (pathname === '/' || pathname === '/index.html') return serveFile(res, 'index.html', 'no-cache');
    if (path.extname(pathname)) return serveFile(res, pathname.slice(1), 'no-cache');
    return serveFile(res, 'index.html', 'no-cache');
  } catch (err) {
    console.error('[hacklab] erreur :', err.message);
    if (!res.headersSent) sendJSON(res, 500, { error: 'Erreur serveur.' });
  }
});

// WebSocket : terminal (ttyd) et cibles qui en utilisent.
server.on('upgrade', (req, socket, head) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (err) {
    return socket.destroy();
  }
  const upstream = resolveUpstream(pathname);
  if (!upstream) return socket.destroy();
  if (!validSession(requestToken(req))) return socket.destroy();
  proxyUpgrade(req, socket, head, upstream);
});

loadStore();
server.listen(PORT, HOST, () => {
  console.log('[hacklab] tableau de bord → http://localhost:' + PORT);
  console.log('[hacklab] terminal web attendu sur 127.0.0.1:' + TTYD_PORT + ' (ttyd)');
  console.log('[hacklab] données → ' + STORE_FILE);
});

['SIGINT', 'SIGTERM'].forEach((sig) =>
  process.on(sig, () => {
    try {
      saveStore();
    } catch (err) {
      /* ignore */
    }
    process.exit(0);
  })
);

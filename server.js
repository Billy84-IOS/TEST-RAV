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
        mission.findings = body.findings.slice(0, 100).map((f) => ({
          title: String(f.title || '').slice(0, 200),
          severity: SEVERITY_IDS.includes(f.severity) ? f.severity : 'info',
          detail: String(f.detail || '').slice(0, 4000),
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
    if (path.extname(pathname)) return serveFile(res, pathname.slice(1), 'public, max-age=300');
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

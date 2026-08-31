'use strict';

/**
 * RAVI — boutique en ligne + espace d'administration.
 * Serveur HTTP sans aucune dependance externe (Node.js >= 18).
 * Lancement : node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const PASSWORD_FILE = path.join(DATA_DIR, 'mot-de-passe-admin.txt');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_TTL = 1000 * 60 * 60 * 12; // 12 h
const MAX_BODY = 6 * 1024 * 1024; // 6 Mo (upload d'images en base64)

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

const nowISO = () => new Date().toISOString();
const uid = (prefix = '') => prefix + crypto.randomBytes(8).toString('hex');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function slugify(str) {
  const base = String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || uid('item-');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const candidate = crypto.scryptSync(String(password), record.salt, 64).toString('hex');
  const a = Buffer.from(candidate);
  const b = Buffer.from(record.hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/* Statuts de commande                                                 */
/* ------------------------------------------------------------------ */

const ORDER_STATUSES = [
  { id: 'nouvelle', label: 'Nouvelle', tone: 'info' },
  { id: 'payee', label: 'Payée', tone: 'ok' },
  { id: 'commandee', label: 'Commandée chez le fournisseur', tone: 'warn' },
  { id: 'expediee', label: 'Expédiée', tone: 'warn' },
  { id: 'livree', label: 'Livrée', tone: 'ok' },
  { id: 'annulee', label: 'Annulée', tone: 'bad' },
  { id: 'remboursee', label: 'Remboursée', tone: 'bad' },
];
const STATUS_IDS = ORDER_STATUSES.map((s) => s.id);
const CANCELLED = ['annulee', 'remboursee'];

/* ------------------------------------------------------------------ */
/* Base de donnees (fichier JSON)                                      */
/* ------------------------------------------------------------------ */

let db = null;

function ph(emoji, tone) {
  return '/ph.svg?e=' + encodeURIComponent(emoji) + '&t=' + tone;
}

function seedData() {
  const generated = crypto.randomBytes(6).toString('base64url');
  const password = process.env.ADMIN_PASSWORD || generated;

  const categories = [
    { id: uid('cat-'), slug: 'animaux', name: 'Animaux', emoji: '🐾', description: 'Accessoires pour chiens et chats' },
    { id: uid('cat-'), slug: 'jeux-video', name: 'Jeux vidéo', emoji: '🎮', description: 'Manettes, accessoires et setup' },
    { id: uid('cat-'), slug: 'deco-interieure', name: 'Déco intérieure', emoji: '🛋️', description: 'Lampes, miroirs, rangement' },
    { id: uid('cat-'), slug: 'deco-exterieure', name: 'Déco extérieure', emoji: '🪴', description: 'Jardin, terrasse, balcon' },
  ];
  const catId = (slug) => categories.find((c) => c.slug === slug).id;

  const products = [
    {
      name: 'Harnais respirant anti-fugue — chien & chat',
      slug: 'harnais-respirant-chien-chat',
      categoryId: catId('animaux'),
      price: 19.9,
      costPrice: 2.5,
      stock: 50,
      featured: true,
      images: ['/img/harnais.jpg'],
      colors: ['Rouge', 'Noir', 'Vert', 'Rose', 'Bleu'],
      sizes: ['S', 'M', 'L', 'XL'],
      supplierUrl: '',
      supplierNote: 'AliExpress — vérifier le tableau des tailles avant expédition.',
      description:
        "Harnais en maille polyester respirante, forme enveloppante qui répartit la pression sur le poitrail plutôt que sur le cou. Bande réfléchissante pour les sorties du soir, boucle clic réglable, laisse assortie incluse.",
    },
    {
      name: 'Gamelle anti-glouton',
      slug: 'gamelle-anti-glouton',
      categoryId: catId('animaux'),
      price: 14.9,
      costPrice: 3.2,
      stock: 40,
      featured: false,
      images: [ph('🐶', 1)],
      colors: ['Bleu', 'Vert', 'Rose'],
      sizes: [],
      description: "Ralentit le repas de votre animal grâce à un labyrinthe interne. Base antidérapante, passe au lave-vaisselle.",
    },
    {
      name: 'Manette rétro sans fil',
      slug: 'manette-retro-sans-fil',
      categoryId: catId('jeux-video'),
      price: 29.9,
      costPrice: 8.4,
      stock: 25,
      featured: true,
      images: [ph('🎮', 2)],
      colors: ['Gris', 'Noir'],
      sizes: [],
      description: "Manette Bluetooth compatible PC, Switch et mobile. Autonomie 12 h, vibration intégrée, finition mate.",
    },
    {
      name: 'Support casque gaming LED',
      slug: 'support-casque-gaming-led',
      categoryId: catId('jeux-video'),
      price: 24.9,
      costPrice: 6.1,
      stock: 30,
      featured: false,
      images: [ph('🎧', 2)],
      colors: ['Noir', 'Blanc'],
      sizes: [],
      description: "Support de casque avec éclairage RGB et port USB intégré. Base lestée, ne bascule pas.",
    },
    {
      name: 'Lampe champignon en verre',
      slug: 'lampe-champignon-verre',
      categoryId: catId('deco-interieure'),
      price: 22.9,
      costPrice: 5.5,
      stock: 35,
      featured: true,
      images: [ph('🍄', 3)],
      colors: ['Ambre', 'Vert', 'Transparent'],
      sizes: [],
      description: "Lampe d'appoint en verre soufflé, lumière chaude tamisée. Interrupteur tactile, alimentation USB-C.",
    },
    {
      name: 'Miroir mural forme organique',
      slug: 'miroir-mural-organique',
      categoryId: catId('deco-interieure'),
      price: 34.9,
      costPrice: 9.8,
      stock: 18,
      featured: false,
      images: [ph('🪞', 3)],
      colors: ['Noir', 'Doré'],
      sizes: ['40 cm', '60 cm'],
      description: "Miroir aux courbes irrégulières, cadre métal fin. Fixation murale fournie.",
    },
    {
      name: 'Guirlande solaire extérieure 10 m',
      slug: 'guirlande-solaire-10m',
      categoryId: catId('deco-exterieure'),
      price: 18.9,
      costPrice: 4.3,
      stock: 60,
      featured: true,
      images: [ph('✨', 4)],
      colors: ['Blanc chaud', 'Multicolore'],
      sizes: ['10 m', '20 m'],
      description: "Guirlande étanche IP65 à recharge solaire, 8 modes d'éclairage, allumage automatique à la tombée du jour.",
    },
    {
      name: 'Fontaine de jardin solaire',
      slug: 'fontaine-jardin-solaire',
      categoryId: catId('deco-exterieure'),
      price: 27.9,
      costPrice: 7.6,
      stock: 22,
      featured: false,
      images: [ph('⛲', 4)],
      colors: [],
      sizes: [],
      description: "Pompe flottante alimentée par panneau solaire, 6 embouts fournis. Aucun branchement électrique nécessaire.",
    },
  ].map((p) => ({
    id: uid('prd-'),
    active: true,
    createdAt: nowISO(),
    ...p,
  }));

  return {
    version: 1,
    settings: {
      storeName: 'RAVI',
      tagline: 'Des trouvailles pour la maison, le jardin, le gaming et vos animaux.',
      heroTitle: 'Les bons objets,\nsans le prix des magasins.',
      heroSubtitle: 'Sélection testée, livraison suivie, retour gratuit sous 30 jours.',
      contactEmail: 'contact@example.com',
      currency: '€',
      shippingFee: 4.9,
      freeShippingThreshold: 39,
      deliveryDelay: '7 à 15 jours ouvrés',
      adminPassword: hashPassword(password),
      passwordIsGenerated: !process.env.ADMIN_PASSWORD,
    },
    categories,
    products,
    orders: [],
    customers: [],
    counters: { order: 1 },
    _generatedPassword: process.env.ADMIN_PASSWORD ? null : password,
  };
}

function loadStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  if (fs.existsSync(STORE_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      return;
    } catch (err) {
      const backup = STORE_FILE + '.corrompu-' + Date.now();
      fs.renameSync(STORE_FILE, backup);
      console.error('[ravi] store.json illisible, sauvegardé sous ' + backup);
    }
  }

  const seeded = seedData();
  const generatedPassword = seeded._generatedPassword;
  delete seeded._generatedPassword;
  db = seeded;
  saveStore();

  if (generatedPassword) {
    fs.writeFileSync(
      PASSWORD_FILE,
      'Mot de passe de l\'espace admin RAVI\n' +
        '-----------------------------------\n' +
        generatedPassword +
        '\n\nChangez-le depuis Admin > Réglages, puis supprimez ce fichier.\n',
      'utf8'
    );
    console.log('\n============================================');
    console.log(' Mot de passe admin : ' + generatedPassword);
    console.log(' (aussi enregistré dans data/mot-de-passe-admin.txt)');
    console.log('============================================\n');
  }
}

function saveStore() {
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, STORE_FILE);
}

/* ------------------------------------------------------------------ */
/* Sessions admin                                                      */
/* ------------------------------------------------------------------ */

const sessions = new Map();
const loginAttempts = new Map();

function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}

function isValidSession(token) {
  if (!token) return false;
  const expiry = sessions.get(token);
  if (!expiry) return false;
  if (expiry < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function throttled(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.at > 15 * 60 * 1000) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= 8;
}

function noteFailedLogin(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, at: Date.now() };
  entry.count += 1;
  entry.at = Date.now();
  loginAttempts.set(ip, entry);
}

/* ------------------------------------------------------------------ */
/* Reponses HTTP                                                       */
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
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Corps de requête trop volumineux'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
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
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function serveFile(res, baseDir, relativePath, cache) {
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(baseDir, safePath);
  if (!filePath.startsWith(baseDir)) return sendText(res, 403, 'Accès refusé');

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return sendText(res, 404, 'Introuvable');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': cache || 'public, max-age=300',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const PLACEHOLDER_TONES = {
  1: ['#F3E7CE', '#E2C88C'],
  2: ['#DDE4F2', '#A9BCE0'],
  3: ['#EFE3E8', '#DCBCC8'],
  4: ['#DFEBDD', '#AECBA8'],
};

function placeholderSVG(emoji, tone) {
  const [c1, c2] = PLACEHOLDER_TONES[tone] || PLACEHOLDER_TONES[1];
  const safe = String(emoji || '📦').replace(/[<>&"]/g, '');
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/>' +
    '</linearGradient></defs>' +
    '<rect width="600" height="600" fill="url(#g)"/>' +
    '<text x="300" y="300" font-size="230" text-anchor="middle" dominant-baseline="central">' + safe + '</text>' +
    '</svg>'
  );
}

/* ------------------------------------------------------------------ */
/* Vues publiques des donnees (sans infos fournisseur)                 */
/* ------------------------------------------------------------------ */

function publicProduct(p) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    price: p.price,
    images: p.images && p.images.length ? p.images : [ph('📦', 1)],
    colors: p.colors || [],
    sizes: p.sizes || [],
    categoryId: p.categoryId,
    stock: p.stock,
    featured: !!p.featured,
  };
}

function publicOrder(o) {
  return {
    number: o.number,
    status: o.status,
    statusHistory: o.statusHistory,
    items: o.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, color: i.color, size: i.size })),
    subtotal: o.subtotal,
    shipping: o.shipping,
    total: o.total,
    tracking: o.tracking || '',
    createdAt: o.createdAt,
    customerName: o.shippingAddress.name,
  };
}

/* ------------------------------------------------------------------ */
/* API publique                                                        */
/* ------------------------------------------------------------------ */

function handleCatalog(res) {
  const settings = db.settings;
  sendJSON(res, 200, {
    settings: {
      storeName: settings.storeName,
      tagline: settings.tagline,
      heroTitle: settings.heroTitle,
      heroSubtitle: settings.heroSubtitle,
      currency: settings.currency,
      shippingFee: settings.shippingFee,
      freeShippingThreshold: settings.freeShippingThreshold,
      deliveryDelay: settings.deliveryDelay,
      contactEmail: settings.contactEmail,
    },
    categories: db.categories,
    products: db.products.filter((p) => p.active).map(publicProduct),
  });
}

function nextOrderNumber() {
  const n = db.counters.order++;
  const d = new Date();
  const stamp =
    String(d.getFullYear()).slice(2) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
  return 'RV-' + stamp + '-' + String(n).padStart(4, '0');
}

async function handleCreateOrder(req, res) {
  const body = await readBody(req);
  const items = Array.isArray(body.items) ? body.items : [];
  const addr = body.address || {};

  const required = ['name', 'email', 'phone', 'line1', 'city', 'zip'];
  const missing = required.filter((f) => !String(addr[f] || '').trim());
  if (missing.length) return sendJSON(res, 400, { error: 'Champs manquants : ' + missing.join(', ') });
  if (!items.length) return sendJSON(res, 400, { error: 'Le panier est vide.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(addr.email))) {
    return sendJSON(res, 400, { error: 'Adresse e-mail invalide.' });
  }

  // Les prix sont toujours recalcules cote serveur.
  const lines = [];
  for (const item of items) {
    const product = db.products.find((p) => p.id === item.productId && p.active);
    if (!product) return sendJSON(res, 400, { error: 'Produit indisponible dans le panier.' });
    const qty = Math.max(1, Math.min(20, parseInt(item.qty, 10) || 1));
    lines.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      costPrice: product.costPrice || 0,
      qty,
      color: item.color || '',
      size: item.size || '',
      image: (product.images || [])[0] || '',
    });
  }

  const subtotal = round2(lines.reduce((sum, l) => sum + l.price * l.qty, 0));
  const threshold = Number(db.settings.freeShippingThreshold) || 0;
  const shipping = threshold && subtotal >= threshold ? 0 : round2(db.settings.shippingFee);
  const total = round2(subtotal + shipping);
  const cost = round2(lines.reduce((sum, l) => sum + l.costPrice * l.qty, 0));

  const email = String(addr.email).trim().toLowerCase();
  let customer = db.customers.find((c) => c.email === email);
  if (!customer) {
    customer = {
      id: uid('cus-'),
      email,
      name: String(addr.name).trim(),
      phone: String(addr.phone).trim(),
      address: { line1: addr.line1, line2: addr.line2 || '', city: addr.city, zip: addr.zip, country: addr.country || 'France' },
      createdAt: nowISO(),
      orderCount: 0,
      totalSpent: 0,
    };
    db.customers.push(customer);
  } else {
    customer.name = String(addr.name).trim();
    customer.phone = String(addr.phone).trim();
    customer.address = { line1: addr.line1, line2: addr.line2 || '', city: addr.city, zip: addr.zip, country: addr.country || 'France' };
  }

  const order = {
    id: uid('ord-'),
    number: nextOrderNumber(),
    customerId: customer.id,
    items: lines,
    subtotal,
    shipping,
    total,
    cost,
    status: 'nouvelle',
    statusHistory: [{ status: 'nouvelle', at: nowISO() }],
    paymentMethod: body.paymentMethod === 'virement' ? 'virement' : 'a-la-livraison',
    tracking: '',
    supplierRef: '',
    adminNote: '',
    customerNote: String(body.note || '').slice(0, 500),
    shippingAddress: {
      name: String(addr.name).trim(),
      email,
      phone: String(addr.phone).trim(),
      line1: String(addr.line1).trim(),
      line2: String(addr.line2 || '').trim(),
      city: String(addr.city).trim(),
      zip: String(addr.zip).trim(),
      country: String(addr.country || 'France').trim(),
    },
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  customer.orderCount += 1;
  customer.totalSpent = round2(customer.totalSpent + total);

  db.orders.unshift(order);
  db.products.forEach((p) => {
    const line = lines.find((l) => l.productId === p.id);
    if (line && typeof p.stock === 'number') p.stock = Math.max(0, p.stock - line.qty);
  });
  saveStore();

  sendJSON(res, 201, { order: publicOrder(order) });
}

function handleTrackOrder(res, query) {
  const number = String(query.get('number') || '').trim().toUpperCase();
  const email = String(query.get('email') || '').trim().toLowerCase();
  const order = db.orders.find((o) => o.number.toUpperCase() === number);
  if (!order || order.shippingAddress.email !== email) {
    return sendJSON(res, 404, { error: 'Aucune commande ne correspond à ce numéro et cet e-mail.' });
  }
  sendJSON(res, 200, { order: publicOrder(order) });
}

/* ------------------------------------------------------------------ */
/* API admin                                                           */
/* ------------------------------------------------------------------ */

function adminStats() {
  const valid = db.orders.filter((o) => !CANCELLED.includes(o.status));
  const revenue = round2(valid.reduce((s, o) => s + o.total, 0));
  const cost = round2(valid.reduce((s, o) => s + (o.cost || 0), 0));
  const shipping = round2(valid.reduce((s, o) => s + (o.shipping || 0), 0));

  const byStatus = {};
  STATUS_IDS.forEach((id) => (byStatus[id] = 0));
  db.orders.forEach((o) => (byStatus[o.status] = (byStatus[o.status] || 0) + 1));

  const sales = {};
  valid.forEach((o) =>
    o.items.forEach((i) => {
      sales[i.name] = (sales[i.name] || 0) + i.qty;
    })
  );
  const topProducts = Object.entries(sales)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayOrders = valid.filter((o) => o.createdAt.slice(0, 10) === key);
    days.push({ date: key, orders: dayOrders.length, revenue: round2(dayOrders.reduce((s, o) => s + o.total, 0)) });
  }

  return {
    revenue,
    cost,
    margin: round2(revenue - cost - shipping),
    orderCount: db.orders.length,
    validOrderCount: valid.length,
    averageBasket: valid.length ? round2(revenue / valid.length) : 0,
    customerCount: db.customers.length,
    productCount: db.products.length,
    activeProductCount: db.products.filter((p) => p.active).length,
    pending: (byStatus.nouvelle || 0) + (byStatus.payee || 0),
    lowStock: db.products.filter((p) => p.active && typeof p.stock === 'number' && p.stock <= 5).length,
    byStatus,
    topProducts,
    days,
  };
}

function ordersWithCustomer() {
  return db.orders.map((o) => {
    const customer = db.customers.find((c) => c.id === o.customerId);
    return { ...o, customer: customer ? { id: customer.id, name: customer.name, email: customer.email } : null };
  });
}

function toCSV(rows) {
  const escape = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  return rows.map((r) => r.map(escape).join(',')).join('\r\n');
}

function saveUpload(dataUrl) {
  const match = /^data:(image\/(png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error("Format d'image non supporté (png, jpg, webp ou gif attendu).");
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.length > 4 * 1024 * 1024) throw new Error('Image trop lourde (4 Mo maximum).');
  const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
  const name = uid('img-') + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buffer);
  return '/uploads/' + name;
}

async function handleAdminAPI(req, res, pathname, query) {
  const ip = req.socket.remoteAddress || 'inconnu';

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    if (throttled(ip)) return sendJSON(res, 429, { error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
    const body = await readBody(req);
    if (!verifyPassword(body.password, db.settings.adminPassword)) {
      noteFailedLogin(ip);
      return sendJSON(res, 401, { error: 'Mot de passe incorrect.' });
    }
    loginAttempts.delete(ip);
    const token = createSession();
    return sendJSON(res, 200, { ok: true }, {
      'Set-Cookie': 'ravi_admin=' + token + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=' + SESSION_TTL / 1000,
    });
  }

  const token = parseCookies(req).ravi_admin;
  const authed = isValidSession(token);

  if (pathname === '/api/admin/session' && req.method === 'GET') {
    return sendJSON(res, 200, { authenticated: authed, statuses: ORDER_STATUSES });
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    sessions.delete(token);
    return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': 'ravi_admin=; HttpOnly; Path=/; Max-Age=0' });
  }

  if (!authed) return sendJSON(res, 401, { error: 'Non authentifié.' });

  /* --- tableau de bord --- */
  if (pathname === '/api/admin/overview' && req.method === 'GET') {
    return sendJSON(res, 200, {
      stats: adminStats(),
      statuses: ORDER_STATUSES,
      settings: { ...db.settings, adminPassword: undefined },
      recentOrders: ordersWithCustomer().slice(0, 6),
    });
  }

  /* --- commandes --- */
  if (pathname === '/api/admin/orders' && req.method === 'GET') {
    let list = ordersWithCustomer();
    const status = query.get('status');
    const search = String(query.get('q') || '').trim().toLowerCase();
    if (status && STATUS_IDS.includes(status)) list = list.filter((o) => o.status === status);
    if (search) {
      list = list.filter(
        (o) =>
          o.number.toLowerCase().includes(search) ||
          o.shippingAddress.name.toLowerCase().includes(search) ||
          o.shippingAddress.email.includes(search)
      );
    }
    return sendJSON(res, 200, { orders: list, statuses: ORDER_STATUSES });
  }

  const orderMatch = /^\/api\/admin\/orders\/([\w-]+)$/.exec(pathname);
  if (orderMatch) {
    const order = db.orders.find((o) => o.id === orderMatch[1] || o.number === orderMatch[1]);
    if (!order) return sendJSON(res, 404, { error: 'Commande introuvable.' });

    if (req.method === 'GET') {
      const customer = db.customers.find((c) => c.id === order.customerId);
      return sendJSON(res, 200, { order, customer: customer || null });
    }

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      if (body.status && STATUS_IDS.includes(body.status) && body.status !== order.status) {
        order.status = body.status;
        order.statusHistory.push({ status: body.status, at: nowISO() });
      }
      if (typeof body.tracking === 'string') order.tracking = body.tracking.trim();
      if (typeof body.supplierRef === 'string') order.supplierRef = body.supplierRef.trim();
      if (typeof body.adminNote === 'string') order.adminNote = body.adminNote.slice(0, 2000);
      order.updatedAt = nowISO();
      saveStore();
      return sendJSON(res, 200, { order });
    }

    if (req.method === 'DELETE') {
      db.orders = db.orders.filter((o) => o.id !== order.id);
      saveStore();
      return sendJSON(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/admin/orders.csv' && req.method === 'GET') {
    const rows = [['Numéro', 'Date', 'Client', 'E-mail', 'Total', 'Coût', 'Marge', 'Statut', 'Suivi']];
    db.orders.forEach((o) =>
      rows.push([
        o.number,
        o.createdAt.slice(0, 10),
        o.shippingAddress.name,
        o.shippingAddress.email,
        o.total,
        o.cost || 0,
        round2(o.total - (o.cost || 0) - (o.shipping || 0)),
        o.status,
        o.tracking || '',
      ])
    );
    return sendText(res, 200, '﻿' + toCSV(rows), 'text/csv; charset=utf-8', {
      'Content-Disposition': 'attachment; filename="commandes-ravi.csv"',
    });
  }

  /* --- produits --- */
  if (pathname === '/api/admin/products' && req.method === 'GET') {
    return sendJSON(res, 200, { products: db.products, categories: db.categories });
  }

  if (pathname === '/api/admin/products' && req.method === 'POST') {
    const body = await readBody(req);
    if (!String(body.name || '').trim()) return sendJSON(res, 400, { error: 'Le nom du produit est obligatoire.' });
    const product = {
      id: uid('prd-'),
      slug: slugify(body.slug || body.name),
      name: String(body.name).trim(),
      description: String(body.description || '').trim(),
      price: round2(body.price),
      costPrice: round2(body.costPrice),
      stock: Number.isFinite(Number(body.stock)) ? Number(body.stock) : 0,
      categoryId: body.categoryId || (db.categories[0] && db.categories[0].id) || '',
      images: Array.isArray(body.images) ? body.images.filter(Boolean) : [],
      colors: Array.isArray(body.colors) ? body.colors.filter(Boolean) : [],
      sizes: Array.isArray(body.sizes) ? body.sizes.filter(Boolean) : [],
      supplierUrl: String(body.supplierUrl || '').trim(),
      supplierNote: String(body.supplierNote || '').trim(),
      active: body.active !== false,
      featured: !!body.featured,
      createdAt: nowISO(),
    };
    if (db.products.some((p) => p.slug === product.slug)) product.slug += '-' + crypto.randomBytes(2).toString('hex');
    if (!product.images.length) product.images = [ph('📦', 1)];
    db.products.unshift(product);
    saveStore();
    return sendJSON(res, 201, { product });
  }

  const productMatch = /^\/api\/admin\/products\/([\w-]+)$/.exec(pathname);
  if (productMatch) {
    const product = db.products.find((p) => p.id === productMatch[1]);
    if (!product) return sendJSON(res, 404, { error: 'Produit introuvable.' });

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const fields = ['name', 'description', 'supplierUrl', 'supplierNote'];
      fields.forEach((f) => {
        if (typeof body[f] === 'string') product[f] = body[f].trim();
      });
      if (body.slug) product.slug = slugify(body.slug);
      if (body.price !== undefined) product.price = round2(body.price);
      if (body.costPrice !== undefined) product.costPrice = round2(body.costPrice);
      if (body.stock !== undefined) product.stock = Number(body.stock) || 0;
      if (body.categoryId !== undefined) product.categoryId = body.categoryId;
      if (Array.isArray(body.images)) product.images = body.images.filter(Boolean);
      if (Array.isArray(body.colors)) product.colors = body.colors.filter(Boolean);
      if (Array.isArray(body.sizes)) product.sizes = body.sizes.filter(Boolean);
      if (body.active !== undefined) product.active = !!body.active;
      if (body.featured !== undefined) product.featured = !!body.featured;
      if (!product.images.length) product.images = [ph('📦', 1)];
      saveStore();
      return sendJSON(res, 200, { product });
    }

    if (req.method === 'DELETE') {
      db.products = db.products.filter((p) => p.id !== product.id);
      saveStore();
      return sendJSON(res, 200, { ok: true });
    }
  }

  /* --- upload d'image --- */
  if (pathname === '/api/admin/upload' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      return sendJSON(res, 201, { url: saveUpload(body.dataUrl) });
    } catch (err) {
      return sendJSON(res, 400, { error: err.message });
    }
  }

  /* --- categories --- */
  if (pathname === '/api/admin/categories' && req.method === 'GET') {
    return sendJSON(res, 200, { categories: db.categories });
  }

  if (pathname === '/api/admin/categories' && req.method === 'POST') {
    const body = await readBody(req);
    if (!String(body.name || '').trim()) return sendJSON(res, 400, { error: 'Le nom de la catégorie est obligatoire.' });
    const category = {
      id: uid('cat-'),
      slug: slugify(body.slug || body.name),
      name: String(body.name).trim(),
      emoji: String(body.emoji || '📦').slice(0, 4),
      description: String(body.description || '').trim(),
    };
    db.categories.push(category);
    saveStore();
    return sendJSON(res, 201, { category });
  }

  const categoryMatch = /^\/api\/admin\/categories\/([\w-]+)$/.exec(pathname);
  if (categoryMatch) {
    const category = db.categories.find((c) => c.id === categoryMatch[1]);
    if (!category) return sendJSON(res, 404, { error: 'Catégorie introuvable.' });

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      if (typeof body.name === 'string') category.name = body.name.trim();
      if (typeof body.emoji === 'string') category.emoji = body.emoji.slice(0, 4);
      if (typeof body.description === 'string') category.description = body.description.trim();
      if (body.slug) category.slug = slugify(body.slug);
      saveStore();
      return sendJSON(res, 200, { category });
    }

    if (req.method === 'DELETE') {
      if (db.products.some((p) => p.categoryId === category.id)) {
        return sendJSON(res, 400, { error: 'Cette catégorie contient encore des produits.' });
      }
      db.categories = db.categories.filter((c) => c.id !== category.id);
      saveStore();
      return sendJSON(res, 200, { ok: true });
    }
  }

  /* --- clients --- */
  if (pathname === '/api/admin/customers' && req.method === 'GET') {
    const customers = db.customers.map((c) => ({
      ...c,
      orders: db.orders.filter((o) => o.customerId === c.id).map((o) => ({ number: o.number, total: o.total, status: o.status, createdAt: o.createdAt })),
    }));
    return sendJSON(res, 200, { customers });
  }

  const customerMatch = /^\/api\/admin\/customers\/([\w-]+)$/.exec(pathname);
  if (customerMatch && req.method === 'DELETE') {
    db.customers = db.customers.filter((c) => c.id !== customerMatch[1]);
    saveStore();
    return sendJSON(res, 200, { ok: true });
  }

  /* --- reglages --- */
  if (pathname === '/api/admin/settings' && req.method === 'GET') {
    return sendJSON(res, 200, { settings: { ...db.settings, adminPassword: undefined } });
  }

  if (pathname === '/api/admin/settings' && req.method === 'PATCH') {
    const body = await readBody(req);
    const text = ['storeName', 'tagline', 'heroTitle', 'heroSubtitle', 'contactEmail', 'currency', 'deliveryDelay'];
    text.forEach((f) => {
      if (typeof body[f] === 'string') db.settings[f] = body[f];
    });
    if (body.shippingFee !== undefined) db.settings.shippingFee = round2(body.shippingFee);
    if (body.freeShippingThreshold !== undefined) db.settings.freeShippingThreshold = round2(body.freeShippingThreshold);

    if (body.newPassword) {
      if (String(body.newPassword).length < 8) {
        return sendJSON(res, 400, { error: 'Le nouveau mot de passe doit faire au moins 8 caractères.' });
      }
      if (!verifyPassword(body.currentPassword, db.settings.adminPassword)) {
        return sendJSON(res, 400, { error: 'Mot de passe actuel incorrect.' });
      }
      db.settings.adminPassword = hashPassword(body.newPassword);
      db.settings.passwordIsGenerated = false;
      if (fs.existsSync(PASSWORD_FILE)) fs.unlinkSync(PASSWORD_FILE);
    }

    saveStore();
    return sendJSON(res, 200, { settings: { ...db.settings, adminPassword: undefined } });
  }

  return sendJSON(res, 404, { error: 'Route admin inconnue.' });
}

/* ------------------------------------------------------------------ */
/* Serveur                                                             */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname === '/ph.svg') {
      const svg = placeholderSVG(url.searchParams.get('e'), url.searchParams.get('t'));
      return sendText(res, 200, svg, 'image/svg+xml', { 'Cache-Control': 'public, max-age=86400' });
    }

    if (pathname.startsWith('/api/admin')) return await handleAdminAPI(req, res, pathname, url.searchParams);

    if (pathname === '/api/catalog' && req.method === 'GET') return handleCatalog(res);
    if (pathname === '/api/orders' && req.method === 'POST') return await handleCreateOrder(req, res);
    if (pathname === '/api/orders/track' && req.method === 'GET') return handleTrackOrder(res, url.searchParams);
    if (pathname.startsWith('/api/')) return sendJSON(res, 404, { error: 'Route inconnue.' });

    if (pathname.startsWith('/uploads/')) {
      return serveFile(res, UPLOADS_DIR, pathname.slice('/uploads/'.length), 'public, max-age=31536000');
    }

    if (pathname === '/admin' || pathname === '/admin/') {
      return serveFile(res, PUBLIC_DIR, 'admin.html', 'no-cache');
    }

    if (pathname === '/') return serveFile(res, PUBLIC_DIR, 'index.html', 'no-cache');

    if (path.extname(pathname)) return serveFile(res, PUBLIC_DIR, pathname.slice(1), 'public, max-age=300');

    return serveFile(res, PUBLIC_DIR, 'index.html', 'no-cache');
  } catch (err) {
    console.error('[ravi] erreur :', err.message);
    if (!res.headersSent) sendJSON(res, 500, { error: 'Erreur serveur : ' + err.message });
  }
});

loadStore();

server.listen(PORT, HOST, () => {
  console.log('[ravi] boutique   → http://localhost:' + PORT);
  console.log('[ravi] admin      → http://localhost:' + PORT + '/admin');
  console.log('[ravi] données    → ' + STORE_FILE);
});

['SIGINT', 'SIGTERM'].forEach((sig) =>
  process.on(sig, () => {
    console.log('\n[ravi] arrêt, sauvegarde des données…');
    try {
      saveStore();
    } catch (err) {
      console.error('[ravi] échec de sauvegarde :', err.message);
    }
    process.exit(0);
  })
);

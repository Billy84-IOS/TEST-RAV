/* ==================================================================
   RAVI — boutique (SPA sans dépendance, routage par #hash)
   ================================================================== */
'use strict';

const state = {
  settings: {},
  categories: [],
  products: [],
  loaded: false,
};

const CART_KEY = 'ravi_cart_v1';
const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

/* ------------------------------ utilitaires ------------------------------ */

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const money = (n) => (Number(n) || 0).toFixed(2).replace('.', ',') + ' ' + (state.settings.currency || '€');

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

async function api(path, options) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Une erreur est survenue.');
  return data;
}

const categoryById = (id) => state.categories.find((c) => c.id === id);
const productBySlug = (slug) => state.products.find((p) => p.slug === slug);

/* ------------------------------ panier ------------------------------ */

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (err) {
    return [];
  }
}

function setCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  refreshCartCount();
}

function cartLines() {
  return getCart()
    .map((line) => {
      const product = state.products.find((p) => p.id === line.productId);
      return product ? { ...line, product } : null;
    })
    .filter(Boolean);
}

function cartTotals() {
  const lines = cartLines();
  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const threshold = Number(state.settings.freeShippingThreshold) || 0;
  const shipping = lines.length === 0 || (threshold && subtotal >= threshold) ? 0 : Number(state.settings.shippingFee) || 0;
  return { lines, subtotal, shipping, total: subtotal + shipping, threshold };
}

function addToCart(productId, qty, color, size) {
  const cart = getCart();
  const existing = cart.find((l) => l.productId === productId && l.color === color && l.size === size);
  if (existing) existing.qty = Math.min(20, existing.qty + qty);
  else cart.push({ productId, qty, color, size });
  setCart(cart);
  toast('Ajouté au panier ✓');
}

function refreshCartCount() {
  const count = getCart().reduce((sum, l) => sum + l.qty, 0);
  const el = document.getElementById('cartCount');
  el.textContent = count;
  el.classList.toggle('hidden', count === 0);
}

/* ------------------------------ vues ------------------------------ */

function productCard(p) {
  const category = categoryById(p.categoryId);
  return `
    <a class="product-card" href="#/p/${esc(p.slug)}">
      <img class="thumb" src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">
      <div class="body">
        <div class="cat">${esc(category ? category.emoji + ' ' + category.name : '')}</div>
        <div class="name">${esc(p.name)}</div>
        <div class="price">${money(p.price)}</div>
      </div>
    </a>`;
}

function viewHome() {
  const featured = state.products.filter((p) => p.featured);
  const rest = state.products.filter((p) => !p.featured);
  const hero = state.settings;

  return `
    <section class="hero">
      <h1>${esc(hero.heroTitle || 'Bienvenue')}</h1>
      <p>${esc(hero.heroSubtitle || '')}</p>
      <a class="btn btn-primary" href="#/c/toutes">Voir la boutique</a>
    </section>

    ${
      featured.length
        ? `<div class="section-head"><h2>Nos coups de cœur</h2><a class="small muted" href="#/c/toutes">Tout voir</a></div>
           <div class="product-grid">${featured.map(productCard).join('')}</div>`
        : ''
    }

    <div class="section-head"><h2>Toute la boutique</h2><span class="small muted">${state.products.length} articles</span></div>
    <div class="product-grid">${rest.map(productCard).join('')}</div>

    <div class="trust-grid">
      <div><span class="ic">📦</span>Livraison<br>${esc(state.settings.deliveryDelay || '7 à 15 jours')}</div>
      <div><span class="ic">↩️</span>Retour gratuit<br>sous 30 jours</div>
      <div><span class="ic">🔒</span>Paiement<br>sécurisé</div>
    </div>`;
}

function viewCategory(slug) {
  const all = slug === 'toutes';
  const category = all ? null : state.categories.find((c) => c.slug === slug);
  if (!all && !category) return viewNotFound();

  const products = all ? state.products : state.products.filter((p) => p.categoryId === category.id);
  return `
    <div class="section-head">
      <div>
        <h1>${esc(all ? 'Toute la boutique' : category.emoji + ' ' + category.name)}</h1>
        ${!all && category.description ? `<p class="small muted" style="margin-top:6px">${esc(category.description)}</p>` : ''}
      </div>
      <span class="small muted">${products.length} article${products.length > 1 ? 's' : ''}</span>
    </div>
    ${
      products.length
        ? `<div class="product-grid">${products.map(productCard).join('')}</div>`
        : `<div class="empty"><div class="ic">📭</div>Aucun produit dans cette catégorie pour l'instant.</div>`
    }`;
}

function viewSearch(query) {
  const q = query.toLowerCase().trim();
  const results = state.products.filter(
    (p) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
  );
  return `
    <div class="section-head">
      <h1>Recherche</h1>
      <span class="small muted">${results.length} résultat${results.length > 1 ? 's' : ''}</span>
    </div>
    <p class="small muted" style="margin-bottom:14px">Pour « ${esc(query)} »</p>
    ${
      results.length
        ? `<div class="product-grid">${results.map(productCard).join('')}</div>`
        : `<div class="empty"><div class="ic">🔍</div>Aucun produit ne correspond à cette recherche.</div>`
    }`;
}

function viewProduct(slug) {
  const p = productBySlug(slug);
  if (!p) return viewNotFound();
  const category = categoryById(p.categoryId);
  const related = state.products.filter((x) => x.categoryId === p.categoryId && x.id !== p.id).slice(0, 4);

  return `
    <a class="small muted" href="#/c/${esc(category ? category.slug : 'toutes')}" style="display:inline-block;margin:14px 0 12px">← ${esc(category ? category.name : 'Boutique')}</a>

    <div class="pdp-layout">
      <div>
        <div class="pdp-gallery"><img id="pdpMain" src="${esc(p.images[0])}" alt="${esc(p.name)}"></div>
        ${
          p.images.length > 1
            ? `<div class="pdp-thumbs">${p.images
                .map((src, i) => `<img src="${esc(src)}" data-img="${esc(src)}" class="${i === 0 ? 'active' : ''}" alt="">`)
                .join('')}</div>`
            : ''
        }
      </div>

      <div class="stack" style="gap:18px">
        <div>
          <div class="eyebrow">${esc(category ? category.emoji + ' ' + category.name : '')}</div>
          <h1 style="margin-top:8px">${esc(p.name)}</h1>
          <div class="price-lg" style="margin-top:12px">${money(p.price)}</div>
          <p class="small muted">${
            p.stock > 0 ? 'En stock — expédition sous 24 h' : '<span style="color:var(--bad)">Rupture de stock</span>'
          }</p>
        </div>

        ${
          p.colors.length
            ? `<div class="stack" style="gap:9px">
                 <span class="lbl">Couleur — <span id="colorLabel">${esc(p.colors[0])}</span></span>
                 <div class="opt-chips" id="colorChips">
                   ${p.colors.map((c, i) => `<button class="opt-chip ${i === 0 ? 'active' : ''}" data-color="${esc(c)}">${esc(c)}</button>`).join('')}
                 </div>
               </div>`
            : ''
        }

        ${
          p.sizes.length
            ? `<div class="stack" style="gap:9px">
                 <span class="lbl">Taille</span>
                 <div class="opt-chips" id="sizeChips">
                   ${p.sizes.map((s, i) => `<button class="opt-chip ${i === 0 ? 'active' : ''}" data-size="${esc(s)}">${esc(s)}</button>`).join('')}
                 </div>
               </div>`
            : ''
        }

        <div class="row" style="gap:12px">
          <div class="qty-box">
            <button id="qtyMinus" aria-label="Diminuer">−</button>
            <span id="qtyVal">1</span>
            <button id="qtyPlus" aria-label="Augmenter">+</button>
          </div>
          <button class="btn btn-primary grow" id="addBtn" ${p.stock > 0 ? '' : 'disabled'}>Ajouter au panier</button>
        </div>

        <div class="card">
          <h3 style="margin-bottom:8px">Description</h3>
          <p class="small muted">${esc(p.description)}</p>
        </div>

        <div class="trust-grid" style="margin-top:0">
          <div><span class="ic">📦</span>${esc(state.settings.deliveryDelay || '7 à 15 j')}</div>
          <div><span class="ic">↩️</span>Retour 30 j</div>
          <div><span class="ic">🔒</span>Paiement sûr</div>
        </div>
      </div>
    </div>

    ${
      related.length
        ? `<div class="section-head"><h2>Dans la même catégorie</h2></div>
           <div class="product-grid">${related.map(productCard).join('')}</div>`
        : ''
    }`;
}

function viewCart() {
  const { lines, subtotal, shipping, total, threshold } = cartTotals();
  if (!lines.length) {
    return `<div class="empty"><div class="ic">🛒</div><p>Votre panier est vide.</p>
      <a class="btn btn-primary" style="margin-top:16px" href="#/">Découvrir la boutique</a></div>`;
  }

  return `
    <div class="section-head"><h1>Mon panier</h1></div>
    <div id="cartLines">
      ${lines
        .map(
          (l, i) => `
        <div class="cart-line">
          <img src="${esc(l.product.images[0])}" alt="">
          <div>
            <div style="font-weight:600;font-size:.92rem">${esc(l.product.name)}</div>
            <div class="tiny muted">${[l.color, l.size].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div>
            <div class="row" style="margin-top:7px;gap:8px">
              <button class="btn btn-sm" data-dec="${i}">−</button>
              <span class="mono">${l.qty}</span>
              <button class="btn btn-sm" data-inc="${i}">+</button>
              <button class="btn btn-sm btn-danger" data-del="${i}">Retirer</button>
            </div>
          </div>
          <div style="font-weight:700">${money(l.product.price * l.qty)}</div>
        </div>`
        )
        .join('')}
    </div>

    <div class="totals">
      <div class="line"><span>Sous-total</span><span>${money(subtotal)}</span></div>
      <div class="line"><span>Livraison</span><span>${shipping === 0 ? 'Offerte' : money(shipping)}</span></div>
      ${
        threshold && subtotal < threshold
          ? `<div class="line tiny">Plus que ${money(threshold - subtotal)} pour la livraison offerte.</div>`
          : ''
      }
      <div class="line grand"><span>Total</span><span>${money(total)}</span></div>
    </div>

    <a class="btn btn-primary btn-block" style="margin-top:18px" href="#/commande">Passer la commande</a>
    <a class="btn btn-ghost btn-block" style="margin-top:10px" href="#/">Continuer mes achats</a>`;
}

function viewCheckout() {
  const { lines, subtotal, shipping, total } = cartTotals();
  if (!lines.length) return viewCart();

  return `
    <div class="section-head"><h1>Commande</h1></div>

    <form id="checkoutForm" class="stack" style="gap:14px">
      <div class="card stack" style="gap:12px">
        <h3>Vos coordonnées</h3>
        <div class="field"><label for="f-name">Nom complet</label><input id="f-name" name="name" type="text" required autocomplete="name"></div>
        <div class="grid-2">
          <div class="field"><label for="f-email">E-mail</label><input id="f-email" name="email" type="email" required autocomplete="email"></div>
          <div class="field"><label for="f-phone">Téléphone</label><input id="f-phone" name="phone" type="tel" required autocomplete="tel"></div>
        </div>
      </div>

      <div class="card stack" style="gap:12px">
        <h3>Adresse de livraison</h3>
        <div class="field"><label for="f-line1">Adresse</label><input id="f-line1" name="line1" type="text" required autocomplete="address-line1"></div>
        <div class="field"><label for="f-line2">Complément (optionnel)</label><input id="f-line2" name="line2" type="text" autocomplete="address-line2"></div>
        <div class="grid-2">
          <div class="field"><label for="f-zip">Code postal</label><input id="f-zip" name="zip" type="text" required autocomplete="postal-code"></div>
          <div class="field"><label for="f-city">Ville</label><input id="f-city" name="city" type="text" required autocomplete="address-level2"></div>
        </div>
        <div class="field"><label for="f-country">Pays</label><input id="f-country" name="country" type="text" value="France" autocomplete="country-name"></div>
        <div class="field"><label for="f-note">Note pour la livraison (optionnel)</label><textarea id="f-note" name="note"></textarea></div>
      </div>

      <div class="card stack" style="gap:12px">
        <h3>Paiement</h3>
        <div class="field">
          <label for="f-payment">Mode de paiement</label>
          <select id="f-payment" name="paymentMethod">
            <option value="a-la-livraison">À la livraison</option>
            <option value="virement">Virement bancaire</option>
          </select>
        </div>
        <p class="tiny muted">Le paiement par carte n'est pas encore activé sur cette boutique : la commande est enregistrée et vous êtes recontacté pour le règlement.</p>
      </div>

      <div class="card">
        <h3 style="margin-bottom:10px">Récapitulatif</h3>
        ${lines
          .map(
            (l) =>
              `<div class="kv"><span class="k">${esc(l.product.name)} × ${l.qty}</span><span class="v">${money(
                l.product.price * l.qty
              )}</span></div>`
          )
          .join('')}
        <div class="kv"><span class="k">Livraison</span><span class="v">${shipping === 0 ? 'Offerte' : money(shipping)}</span></div>
        <div class="kv" style="border:0"><span class="k" style="font-weight:700;color:var(--ink)">Total</span><span class="v" style="font-size:1.1rem">${money(total)}</span></div>
      </div>

      <p class="small" id="checkoutError" style="color:var(--bad)"></p>
      <button class="btn btn-primary btn-block" type="submit" id="submitOrder">Valider ma commande — ${money(total)}</button>
      <p class="tiny muted center">Sous-total ${money(subtotal)} · Livraison ${shipping === 0 ? 'offerte' : money(shipping)}</p>
    </form>`;
}

function statusLabel(id) {
  const map = {
    nouvelle: 'Nouvelle commande',
    payee: 'Paiement reçu',
    commandee: 'Commandée chez le fournisseur',
    expediee: 'Expédiée',
    livree: 'Livrée',
    annulee: 'Annulée',
    remboursee: 'Remboursée',
  };
  return map[id] || id;
}

function orderTimeline(order) {
  const flow = ['nouvelle', 'payee', 'commandee', 'expediee', 'livree'];
  if (['annulee', 'remboursee'].includes(order.status)) {
    return `<div class="badge badge-bad" style="margin-top:12px">${statusLabel(order.status)}</div>`;
  }
  const currentIndex = flow.indexOf(order.status);
  return `<div class="timeline">
    ${flow
      .map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        const entry = (order.statusHistory || []).find((h) => h.status === step);
        return `<div class="step ${done ? 'done' : ''} ${current ? 'current' : ''}">
          <div class="dot">${done ? '✓' : i + 1}</div>
          <div>
            <div style="font-weight:${current ? 700 : 600};font-size:.92rem">${statusLabel(step)}</div>
            ${entry ? `<div class="tiny muted">${new Date(entry.at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}</div>` : ''}
          </div>
        </div>`;
      })
      .join('')}
  </div>`;
}

function viewConfirmation(number) {
  let order = null;
  try {
    order = JSON.parse(sessionStorage.getItem('ravi_last_order'));
  } catch (err) {
    order = null;
  }
  if (!order || order.number !== number) {
    return `<div class="empty"><div class="ic">✅</div><p>Commande <strong class="mono">${esc(number)}</strong> enregistrée.</p>
      <a class="btn btn-primary" style="margin-top:16px" href="#/suivi">Suivre ma commande</a></div>`;
  }

  return `
    <div class="card" style="margin-top:18px;text-align:center;padding:26px 18px">
      <div style="font-size:2.4rem">🎉</div>
      <h1 style="margin-top:10px">Merci ${esc(order.customerName.split(' ')[0])} !</h1>
      <p class="muted small" style="margin-top:10px">Votre commande est enregistrée. Un e-mail de confirmation vous sera envoyé.</p>
      <div class="badge" style="margin-top:14px;font-size:.9rem">N° <span class="mono">${esc(order.number)}</span></div>
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Suivi</h3>
      ${orderTimeline(order)}
    </div>

    <div class="card" style="margin-top:12px">
      <h3 style="margin-bottom:10px">Détail</h3>
      ${order.items.map((i) => `<div class="kv"><span class="k">${esc(i.name)} × ${i.qty}</span><span class="v">${money(i.price * i.qty)}</span></div>`).join('')}
      <div class="kv"><span class="k">Livraison</span><span class="v">${order.shipping === 0 ? 'Offerte' : money(order.shipping)}</span></div>
      <div class="kv" style="border:0"><span class="k" style="font-weight:700;color:var(--ink)">Total</span><span class="v" style="font-size:1.05rem">${money(order.total)}</span></div>
    </div>

    <a class="btn btn-ghost btn-block" style="margin-top:16px" href="#/">Retour à la boutique</a>`;
}

function viewTracking() {
  return `
    <div class="section-head"><h1>Suivre ma commande</h1></div>
    <form id="trackForm" class="card stack" style="gap:12px">
      <div class="field"><label for="t-number">Numéro de commande</label><input id="t-number" type="text" placeholder="RV-260831-0001" required></div>
      <div class="field"><label for="t-email">E-mail utilisé</label><input id="t-email" type="email" required></div>
      <button class="btn btn-primary btn-block" type="submit">Voir le statut</button>
      <p class="small" id="trackError" style="color:var(--bad)"></p>
    </form>
    <div id="trackResult"></div>`;
}

function viewInfos() {
  const s = state.settings;
  return `
    <div class="section-head"><h1>Livraison, retours &amp; mentions</h1></div>
    <div class="stack">
      <div class="card">
        <h3>Livraison</h3>
        <p class="small muted" style="margin-top:8px">Délai indicatif : ${esc(s.deliveryDelay || '7 à 15 jours ouvrés')}.
        Livraison ${money(s.shippingFee)}, offerte dès ${money(s.freeShippingThreshold)} d'achat.
        Un numéro de suivi est communiqué dès l'expédition.</p>
      </div>
      <div class="card">
        <h3>Retours</h3>
        <p class="small muted" style="margin-top:8px">Vous disposez de 30 jours après réception pour retourner un article non utilisé,
        dans son emballage d'origine. Écrivez-nous pour obtenir la procédure.</p>
      </div>
      <div class="card">
        <h3>Contact &amp; mentions légales</h3>
        <p class="small muted" style="margin-top:8px">${esc(s.storeName)} — ${esc(s.contactEmail || 'à compléter')}.<br>
        Numéro SIRET, adresse de l'entreprise et conditions générales de vente : à compléter avant l'ouverture réelle de la boutique.</p>
      </div>
    </div>`;
}

function viewNotFound() {
  return `<div class="empty"><div class="ic">🧭</div><p>Cette page n'existe pas.</p>
    <a class="btn btn-primary" style="margin-top:16px" href="#/">Retour à l'accueil</a></div>`;
}

/* ------------------------------ interactions par vue ------------------------------ */

function bindProduct(slug) {
  const product = productBySlug(slug);
  if (!product) return;

  let qty = 1;
  let color = product.colors[0] || '';
  let size = product.sizes[0] || '';

  const qtyVal = document.getElementById('qtyVal');
  document.getElementById('qtyMinus').onclick = () => {
    qty = Math.max(1, qty - 1);
    qtyVal.textContent = qty;
  };
  document.getElementById('qtyPlus').onclick = () => {
    qty = Math.min(20, qty + 1);
    qtyVal.textContent = qty;
  };

  const colorChips = document.getElementById('colorChips');
  if (colorChips) {
    colorChips.onclick = (e) => {
      const btn = e.target.closest('[data-color]');
      if (!btn) return;
      colorChips.querySelectorAll('.opt-chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      color = btn.dataset.color;
      document.getElementById('colorLabel').textContent = color;
    };
  }

  const sizeChips = document.getElementById('sizeChips');
  if (sizeChips) {
    sizeChips.onclick = (e) => {
      const btn = e.target.closest('[data-size]');
      if (!btn) return;
      sizeChips.querySelectorAll('.opt-chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      size = btn.dataset.size;
    };
  }

  const thumbs = document.querySelector('.pdp-thumbs');
  if (thumbs) {
    thumbs.onclick = (e) => {
      const img = e.target.closest('[data-img]');
      if (!img) return;
      document.getElementById('pdpMain').src = img.dataset.img;
      thumbs.querySelectorAll('img').forEach((t) => t.classList.remove('active'));
      img.classList.add('active');
    };
  }

  document.getElementById('addBtn').onclick = () => addToCart(product.id, qty, color, size);
}

function bindCart() {
  const container = document.getElementById('cartLines');
  if (!container) return;
  container.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const cart = getCart();
    if (btn.dataset.inc !== undefined) cart[+btn.dataset.inc].qty = Math.min(20, cart[+btn.dataset.inc].qty + 1);
    else if (btn.dataset.dec !== undefined) cart[+btn.dataset.dec].qty = Math.max(1, cart[+btn.dataset.dec].qty - 1);
    else if (btn.dataset.del !== undefined) cart.splice(+btn.dataset.del, 1);
    else return;
    setCart(cart);
    render();
  };
}

function bindCheckout() {
  const form = document.getElementById('checkoutForm');
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = document.getElementById('submitOrder');
    const errorEl = document.getElementById('checkoutError');
    errorEl.textContent = '';
    button.disabled = true;
    button.textContent = 'Envoi en cours…';

    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const payload = {
        items: getCart(),
        address: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          line1: data.line1,
          line2: data.line2,
          city: data.city,
          zip: data.zip,
          country: data.country,
        },
        note: data.note,
        paymentMethod: data.paymentMethod,
      };
      const { order } = await api('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
      sessionStorage.setItem('ravi_last_order', JSON.stringify(order));
      setCart([]);
      location.hash = '#/merci/' + order.number;
    } catch (err) {
      errorEl.textContent = err.message;
      button.disabled = false;
      button.textContent = 'Valider ma commande';
    }
  };
}

function bindTracking() {
  const form = document.getElementById('trackForm');
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('trackError');
    const resultEl = document.getElementById('trackResult');
    errorEl.textContent = '';
    resultEl.innerHTML = '';
    try {
      const number = encodeURIComponent(document.getElementById('t-number').value.trim());
      const email = encodeURIComponent(document.getElementById('t-email').value.trim());
      const { order } = await api('/api/orders/track?number=' + number + '&email=' + email);
      resultEl.innerHTML = `
        <div class="card" style="margin-top:14px">
          <div class="spread"><h3>Commande ${esc(order.number)}</h3><span class="badge">${money(order.total)}</span></div>
          ${orderTimeline(order)}
          ${order.tracking ? `<p class="small" style="margin-top:12px">Numéro de suivi : <span class="mono">${esc(order.tracking)}</span></p>` : ''}
        </div>`;
    } catch (err) {
      errorEl.textContent = err.message;
    }
  };
}

/* ------------------------------ routeur ------------------------------ */

function renderCategoryStrip(activeSlug) {
  const strip = document.getElementById('catStrip');
  strip.innerHTML =
    `<a class="cat-chip ${activeSlug === 'toutes' ? 'active' : ''}" href="#/c/toutes">✨ Tout</a>` +
    state.categories
      .map(
        (c) =>
          `<a class="cat-chip ${activeSlug === c.slug ? 'active' : ''}" href="#/c/${esc(c.slug)}">${esc(c.emoji)} ${esc(c.name)}</a>`
      )
      .join('');
}

function render() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  let html = '';
  let activeCategory = '';

  if (parts.length === 0) {
    html = viewHome();
  } else if (parts[0] === 'c') {
    activeCategory = parts[1] || 'toutes';
    html = viewCategory(activeCategory);
  } else if (parts[0] === 'p') {
    html = viewProduct(parts[1]);
  } else if (parts[0] === 'panier') {
    html = viewCart();
  } else if (parts[0] === 'commande') {
    html = viewCheckout();
  } else if (parts[0] === 'merci') {
    html = viewConfirmation(decodeURIComponent(parts[1] || ''));
  } else if (parts[0] === 'suivi') {
    html = viewTracking();
  } else if (parts[0] === 'recherche') {
    html = viewSearch(decodeURIComponent(parts[1] || ''));
  } else if (parts[0] === 'infos') {
    html = viewInfos();
  } else {
    html = viewNotFound();
  }

  app.innerHTML = html;
  renderCategoryStrip(activeCategory);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  if (parts[0] === 'p') bindProduct(parts[1]);
  if (parts[0] === 'panier') bindCart();
  if (parts[0] === 'commande') bindCheckout();
  if (parts[0] === 'suivi') bindTracking();
}

/* ------------------------------ démarrage ------------------------------ */

async function boot() {
  try {
    const data = await api('/api/catalog');
    state.settings = data.settings;
    state.categories = data.categories;
    state.products = data.products;
    state.loaded = true;
  } catch (err) {
    app.innerHTML = `<div class="empty"><div class="ic">⚠️</div><p>Impossible de charger la boutique.</p><p class="small">${esc(err.message)}</p></div>`;
    return;
  }

  document.title = state.settings.storeName + ' — ' + state.settings.tagline;
  document.querySelectorAll('.wordmark').forEach((el) => (el.textContent = state.settings.storeName));
  document.getElementById('footerTagline').textContent = state.settings.tagline || '';
  const contact = document.getElementById('contactLink');
  if (state.settings.contactEmail) contact.href = 'mailto:' + state.settings.contactEmail;

  refreshCartCount();
  render();
}

const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');
document.getElementById('searchToggle').onclick = () => {
  searchBar.classList.toggle('hidden');
  if (!searchBar.classList.contains('hidden')) searchInput.focus();
};
searchInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const value = searchInput.value.trim();
  if (value) location.hash = '#/recherche/' + encodeURIComponent(value);
});

window.addEventListener('hashchange', render);
boot();

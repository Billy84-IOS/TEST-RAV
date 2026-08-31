/* ==================================================================
   RAVI — espace d'administration
   ================================================================== */
'use strict';

const loginShell = document.getElementById('loginShell');
const adminShell = document.getElementById('adminShell');
const adminMain = document.getElementById('adminMain');
const sheetHost = document.getElementById('sheetHost');
const toastEl = document.getElementById('toast');

let STATUSES = [];
let SETTINGS = { currency: '€' };
let currentTab = 'resume';
let orderFilter = { status: '', q: '' };

/* ------------------------------ utilitaires ------------------------------ */

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const money = (n) => (Number(n) || 0).toFixed(2).replace('.', ',') + ' ' + (SETTINGS.currency || '€');

const dateFR = (iso) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

async function api(path, options) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (res.status === 401) {
    showLogin();
    throw new Error('Session expirée, reconnectez-vous.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur serveur.');
  return data;
}

function statusMeta(id) {
  return STATUSES.find((s) => s.id === id) || { label: id, tone: 'info' };
}

function statusBadge(id) {
  const meta = statusMeta(id);
  return `<span class="badge badge-${meta.tone}">${esc(meta.label)}</span>`;
}

function loading() {
  adminMain.innerHTML = '<div class="empty">Chargement…</div>';
}

/* ------------------------------ panneaux (sheets) ------------------------------ */

function openSheet(title, bodyHTML, onMount) {
  sheetHost.innerHTML = `
    <div class="sheet-backdrop" id="sheetBackdrop">
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="sheet-head">
          <h2>${esc(title)}</h2>
          <button id="sheetClose" aria-label="Fermer">✕</button>
        </div>
        <div id="sheetBody">${bodyHTML}</div>
      </div>
    </div>`;
  document.body.style.overflow = 'hidden';
  document.getElementById('sheetClose').onclick = closeSheet;
  document.getElementById('sheetBackdrop').onclick = (e) => {
    if (e.target.id === 'sheetBackdrop') closeSheet();
  };
  if (onMount) onMount();
}

function closeSheet() {
  sheetHost.innerHTML = '';
  document.body.style.overflow = '';
}

/* ------------------------------ connexion ------------------------------ */

function showLogin() {
  loginShell.classList.remove('hidden');
  adminShell.classList.add('hidden');
}

function showAdmin() {
  loginShell.classList.add('hidden');
  adminShell.classList.remove('hidden');
  renderTab();
}

document.getElementById('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const button = document.getElementById('loginBtn');
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';
  button.disabled = true;
  button.textContent = 'Connexion…';
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: document.getElementById('pw').value }) });
    document.getElementById('pw').value = '';
    showAdmin();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Se connecter';
  }
};

document.getElementById('logoutBtn').onclick = async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  showLogin();
};

document.getElementById('viewShopBtn').onclick = () => (location.href = '/');

document.getElementById('tabbar').onclick = (e) => {
  const button = e.target.closest('[data-tab]');
  if (!button) return;
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.remove('active'));
  button.classList.add('active');
  currentTab = button.dataset.tab;
  renderTab();
};

/* ------------------------------ onglet : résumé ------------------------------ */

async function renderResume() {
  loading();
  const { stats, statuses, settings, recentOrders } = await api('/api/admin/overview');
  STATUSES = statuses;
  SETTINGS = settings;
  const maxRevenue = Math.max(1, ...stats.days.map((d) => d.revenue));

  adminMain.innerHTML = `
    ${
      settings.passwordIsGenerated
        ? `<div class="banner">⚠️ Le mot de passe admin est encore celui généré automatiquement. Changez-le dans l'onglet Réglages.</div>`
        : ''
    }

    <div class="stat-grid">
      <div class="stat accent"><div class="k">Chiffre d'affaires</div><div class="v">${money(stats.revenue)}</div><div class="s">${stats.validOrderCount} commande${stats.validOrderCount > 1 ? 's' : ''}</div></div>
      <div class="stat"><div class="k">Marge estimée</div><div class="v">${money(stats.margin)}</div><div class="s">après coût fournisseur</div></div>
      <div class="stat"><div class="k">Panier moyen</div><div class="v">${money(stats.averageBasket)}</div><div class="s">par commande</div></div>
      <div class="stat"><div class="k">À traiter</div><div class="v">${stats.pending}</div><div class="s">commandes en attente</div></div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="spread"><h3>14 derniers jours</h3><span class="small muted">${money(stats.days.reduce((s, d) => s + d.revenue, 0))}</span></div>
      <div class="chart">
        ${stats.days
          .map(
            (d) =>
              `<div class="bar ${d.revenue > 0 ? 'has' : ''}" style="height:${Math.max(3, (d.revenue / maxRevenue) * 100)}%" title="${d.date} — ${money(d.revenue)}"></div>`
          )
          .join('')}
      </div>
    </div>

    <div class="stat-grid" style="margin-top:14px">
      <div class="stat"><div class="k">Clients</div><div class="v">${stats.customerCount}</div></div>
      <div class="stat"><div class="k">Produits actifs</div><div class="v">${stats.activeProductCount}</div><div class="s">sur ${stats.productCount}</div></div>
      <div class="stat"><div class="k">Stock faible</div><div class="v">${stats.lowStock}</div><div class="s">≤ 5 unités</div></div>
      <div class="stat"><div class="k">Coût fournisseur</div><div class="v">${money(stats.cost)}</div></div>
    </div>

    ${
      stats.topProducts.length
        ? `<div class="card" style="margin-top:14px">
            <h3 style="margin-bottom:8px">Meilleures ventes</h3>
            ${stats.topProducts.map((p) => `<div class="kv"><span class="k">${esc(p.name)}</span><span class="v">${p.qty} vendu${p.qty > 1 ? 's' : ''}</span></div>`).join('')}
           </div>`
        : ''
    }

    <div class="section-head"><h2>Dernières commandes</h2></div>
    ${
      recentOrders.length
        ? `<div class="list">${recentOrders.map(orderRow).join('')}</div>`
        : `<div class="empty"><div class="ic">🧾</div>Aucune commande pour le moment.<br><span class="small">Passez une commande test depuis la boutique pour vérifier le circuit.</span></div>`
    }`;

  bindOrderRows();
}

/* ------------------------------ onglet : commandes ------------------------------ */

function orderRow(o) {
  return `
    <button class="list-item" data-order="${esc(o.id)}">
      <div class="grow">
        <div class="t">${esc(o.shippingAddress.name)} <span class="mono tiny muted">${esc(o.number)}</span></div>
        <div class="m">${dateFR(o.createdAt)} · ${o.items.reduce((s, i) => s + i.qty, 0)} article(s)</div>
        <div style="margin-top:6px">${statusBadge(o.status)}</div>
      </div>
      <div class="r"><div style="font-weight:750">${money(o.total)}</div><div class="tiny muted">marge ${money(o.total - (o.cost || 0) - (o.shipping || 0))}</div></div>
    </button>`;
}

function bindOrderRows() {
  adminMain.querySelectorAll('[data-order]').forEach((el) => {
    el.onclick = () => openOrder(el.dataset.order);
  });
}

async function renderCommandes() {
  loading();
  const params = new URLSearchParams();
  if (orderFilter.status) params.set('status', orderFilter.status);
  if (orderFilter.q) params.set('q', orderFilter.q);
  const { orders, statuses } = await api('/api/admin/orders?' + params.toString());
  STATUSES = statuses;

  adminMain.innerHTML = `
    <div class="spread" style="margin-bottom:12px">
      <h1>Commandes</h1>
      <a class="btn btn-sm btn-ghost" href="/api/admin/orders.csv">⬇ CSV</a>
    </div>

    <input type="search" id="orderSearch" placeholder="Rechercher : nom, e-mail, n° de commande…" value="${esc(orderFilter.q)}" style="margin-bottom:12px">

    <div class="filters">
      <button class="${orderFilter.status === '' ? 'active' : ''}" data-status="">Toutes</button>
      ${STATUSES.map((s) => `<button class="${orderFilter.status === s.id ? 'active' : ''}" data-status="${s.id}">${esc(s.label)}</button>`).join('')}
    </div>

    ${
      orders.length
        ? `<div class="list">${orders.map(orderRow).join('')}</div>`
        : `<div class="empty"><div class="ic">🧾</div>Aucune commande ne correspond.</div>`
    }`;

  adminMain.querySelector('.filters').onclick = (e) => {
    const button = e.target.closest('[data-status]');
    if (!button) return;
    orderFilter.status = button.dataset.status;
    renderCommandes();
  };

  const search = document.getElementById('orderSearch');
  let timer;
  search.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      orderFilter.q = search.value.trim();
      renderCommandes();
    }, 350);
  };

  bindOrderRows();
}

async function openOrder(id) {
  const { order, customer } = await api('/api/admin/orders/' + id);
  const margin = order.total - (order.cost || 0) - (order.shipping || 0);

  openSheet(
    'Commande ' + order.number,
    `
    <div class="stack" style="gap:14px">
      <div class="card">
        <div class="spread"><span class="lbl">Statut</span>${statusBadge(order.status)}</div>
        <div class="opt-chips" style="margin-top:10px" id="statusChips">
          ${STATUSES.map(
            (s) => `<button class="opt-chip ${s.id === order.status ? 'active' : ''}" data-set-status="${s.id}">${esc(s.label)}</button>`
          ).join('')}
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:8px">Articles</h3>
        ${order.items
          .map(
            (i) => `<div class="kv">
              <span class="k">${esc(i.name)}${[i.color, i.size].filter(Boolean).length ? ' <span class="tiny">(' + esc([i.color, i.size].filter(Boolean).join(' / ')) + ')</span>' : ''} × ${i.qty}</span>
              <span class="v">${money(i.price * i.qty)}</span>
            </div>`
          )
          .join('')}
        <div class="kv"><span class="k">Livraison</span><span class="v">${order.shipping === 0 ? 'Offerte' : money(order.shipping)}</span></div>
        <div class="kv"><span class="k">Total client</span><span class="v" style="font-size:1.05rem">${money(order.total)}</span></div>
        <div class="kv"><span class="k">Coût fournisseur</span><span class="v">${money(order.cost || 0)}</span></div>
        <div class="kv" style="border:0"><span class="k" style="color:var(--ok);font-weight:700">Marge</span><span class="v" style="color:var(--ok)">${money(margin)}</span></div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:8px">Client &amp; livraison</h3>
        <div class="kv"><span class="k">Nom</span><span class="v">${esc(order.shippingAddress.name)}</span></div>
        <div class="kv"><span class="k">E-mail</span><span class="v"><a href="mailto:${esc(order.shippingAddress.email)}">${esc(order.shippingAddress.email)}</a></span></div>
        <div class="kv"><span class="k">Téléphone</span><span class="v"><a href="tel:${esc(order.shippingAddress.phone)}">${esc(order.shippingAddress.phone)}</a></span></div>
        <div class="kv"><span class="k">Adresse</span><span class="v">${esc(order.shippingAddress.line1)}${order.shippingAddress.line2 ? '<br>' + esc(order.shippingAddress.line2) : ''}<br>${esc(order.shippingAddress.zip)} ${esc(order.shippingAddress.city)}<br>${esc(order.shippingAddress.country)}</span></div>
        <div class="kv"><span class="k">Paiement</span><span class="v">${order.paymentMethod === 'virement' ? 'Virement' : 'À la livraison'}</span></div>
        ${customer ? `<div class="kv" style="border:0"><span class="k">Historique</span><span class="v">${customer.orderCount} commande(s) · ${money(customer.totalSpent)}</span></div>` : ''}
        ${order.customerNote ? `<p class="small muted" style="margin-top:10px">Note du client : ${esc(order.customerNote)}</p>` : ''}
        <button class="btn btn-sm btn-ghost btn-block" style="margin-top:12px" id="copyAddress">📋 Copier l'adresse</button>
      </div>

      <div class="card stack" style="gap:12px">
        <h3>Suivi &amp; fournisseur</h3>
        <div class="field"><label for="o-tracking">Numéro de suivi</label><input id="o-tracking" type="text" value="${esc(order.tracking || '')}" placeholder="Ex. LX123456789FR"></div>
        <div class="field"><label for="o-supplier">Référence commande fournisseur</label><input id="o-supplier" type="text" value="${esc(order.supplierRef || '')}" placeholder="N° de commande AliExpress"></div>
        <div class="field"><label for="o-note">Note interne</label><textarea id="o-note">${esc(order.adminNote || '')}</textarea></div>
        <button class="btn btn-primary btn-block" id="saveOrder">Enregistrer</button>
      </div>

      <div class="card">
        <h3 style="margin-bottom:8px">Historique</h3>
        ${order.statusHistory.map((h) => `<div class="kv"><span class="k">${esc(statusMeta(h.status).label)}</span><span class="v tiny">${dateFR(h.at)}</span></div>`).join('')}
      </div>

      <button class="btn btn-danger btn-block" id="deleteOrder">Supprimer cette commande</button>
    </div>`,
    () => {
      document.getElementById('statusChips').onclick = async (e) => {
        const button = e.target.closest('[data-set-status]');
        if (!button) return;
        await api('/api/admin/orders/' + order.id, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.setStatus }) });
        toast('Statut mis à jour');
        closeSheet();
        renderTab();
      };

      document.getElementById('copyAddress').onclick = () => {
        const a = order.shippingAddress;
        const text = [a.name, a.line1, a.line2, a.zip + ' ' + a.city, a.country, a.phone].filter(Boolean).join('\n');
        navigator.clipboard.writeText(text).then(
          () => toast('Adresse copiée'),
          () => toast('Copie impossible sur ce navigateur')
        );
      };

      document.getElementById('saveOrder').onclick = async () => {
        await api('/api/admin/orders/' + order.id, {
          method: 'PATCH',
          body: JSON.stringify({
            tracking: document.getElementById('o-tracking').value,
            supplierRef: document.getElementById('o-supplier').value,
            adminNote: document.getElementById('o-note').value,
          }),
        });
        toast('Commande enregistrée');
        closeSheet();
        renderTab();
      };

      document.getElementById('deleteOrder').onclick = async () => {
        if (!confirm('Supprimer définitivement la commande ' + order.number + ' ?')) return;
        await api('/api/admin/orders/' + order.id, { method: 'DELETE' });
        toast('Commande supprimée');
        closeSheet();
        renderTab();
      };
    }
  );
}

/* ------------------------------ onglet : produits ------------------------------ */

async function renderProduits() {
  loading();
  const { products, categories } = await api('/api/admin/products');

  adminMain.innerHTML = `
    <div class="spread" style="margin-bottom:12px">
      <h1>Produits</h1>
      <button class="btn btn-sm btn-primary" id="newProduct">+ Ajouter</button>
    </div>
    ${
      products.length
        ? `<div class="list">${products
            .map(
              (p) => `
        <button class="list-item" data-product="${esc(p.id)}">
          <img class="thumb" src="${esc((p.images || [])[0] || '')}" alt="">
          <div class="grow">
            <div class="t">${esc(p.name)}</div>
            <div class="m">${esc((categories.find((c) => c.id === p.categoryId) || {}).name || 'Sans rayon')} · stock ${p.stock}</div>
            <div style="margin-top:6px">
              ${p.active ? '<span class="badge badge-ok">En ligne</span>' : '<span class="badge">Masqué</span>'}
              ${p.featured ? '<span class="badge badge-warn">Coup de cœur</span>' : ''}
            </div>
          </div>
          <div class="r">
            <div style="font-weight:750">${money(p.price)}</div>
            <div class="tiny muted">achat ${money(p.costPrice)}</div>
            <div class="tiny" style="color:var(--ok)">+${money(p.price - p.costPrice)}</div>
          </div>
        </button>`
            )
            .join('')}</div>`
        : `<div class="empty"><div class="ic">📦</div>Aucun produit.</div>`
    }`;

  document.getElementById('newProduct').onclick = () => openProductEditor(null, categories);
  adminMain.querySelectorAll('[data-product]').forEach((el) => {
    el.onclick = () => openProductEditor(products.find((p) => p.id === el.dataset.product), categories);
  });
}

function openProductEditor(product, categories) {
  const p = product || { name: '', description: '', price: 0, costPrice: 0, stock: 0, images: [], colors: [], sizes: [], active: true, featured: false, categoryId: (categories[0] || {}).id, supplierUrl: '', supplierNote: '' };
  const isNew = !product;
  let images = [...(p.images || [])];

  const imageList = () =>
    images.length
      ? images
          .map(
            (src, i) => `<div class="row" style="gap:8px;margin-bottom:8px">
              <img src="${esc(src)}" style="width:52px;height:52px;border-radius:8px;object-fit:cover">
              <span class="tiny muted grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(src)}</span>
              <button type="button" class="btn btn-sm btn-danger" data-rm-img="${i}">✕</button>
            </div>`
          )
          .join('')
      : '<p class="tiny muted">Aucune image. Une vignette par défaut sera utilisée.</p>';

  openSheet(
    isNew ? 'Nouveau produit' : 'Modifier le produit',
    `
    <div class="stack" style="gap:12px">
      <div class="field"><label for="p-name">Nom</label><input id="p-name" type="text" value="${esc(p.name)}" placeholder="Ex. Harnais respirant chien & chat"></div>

      <div class="field">
        <label for="p-cat">Rayon</label>
        <select id="p-cat">${categories.map((c) => `<option value="${esc(c.id)}" ${c.id === p.categoryId ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select>
      </div>

      <div class="grid-2">
        <div class="field"><label for="p-price">Prix de vente</label><input id="p-price" type="number" step="0.01" min="0" value="${p.price}"></div>
        <div class="field"><label for="p-cost">Prix d'achat</label><input id="p-cost" type="number" step="0.01" min="0" value="${p.costPrice}"></div>
      </div>
      <p class="tiny muted" id="marginHint"></p>

      <div class="field"><label for="p-stock">Stock</label><input id="p-stock" type="number" min="0" value="${p.stock}"></div>
      <div class="field"><label for="p-desc">Description</label><textarea id="p-desc">${esc(p.description)}</textarea></div>

      <div class="field">
        <label>Images</label>
        <div id="imageList">${imageList()}</div>
        <div class="row" style="gap:8px;margin-top:6px">
          <input id="p-imgurl" type="text" placeholder="Coller l'URL d'une image" class="grow">
          <button type="button" class="btn btn-sm" id="addImgUrl">Ajouter</button>
        </div>
        <label class="btn btn-sm btn-ghost btn-block" style="margin-top:8px;cursor:pointer">
          📷 Depuis mon téléphone
          <input type="file" id="p-imgfile" accept="image/*" hidden>
        </label>
      </div>

      <div class="grid-2">
        <div class="field"><label for="p-colors">Couleurs</label><input id="p-colors" type="text" value="${esc((p.colors || []).join(', '))}" placeholder="Rouge, Noir, Bleu"></div>
        <div class="field"><label for="p-sizes">Tailles</label><input id="p-sizes" type="text" value="${esc((p.sizes || []).join(', '))}" placeholder="S, M, L"></div>
      </div>
      <p class="tiny muted">Séparez les variantes par des virgules.</p>

      <div class="field"><label for="p-supplier">Lien fournisseur (privé)</label><input id="p-supplier" type="text" value="${esc(p.supplierUrl || '')}" placeholder="https://aliexpress.com/…"></div>
      <div class="field"><label for="p-suppliernote">Note fournisseur (privée)</label><textarea id="p-suppliernote">${esc(p.supplierNote || '')}</textarea></div>

      <label class="row" style="gap:10px"><input type="checkbox" id="p-active" ${p.active ? 'checked' : ''} style="width:auto"> Visible dans la boutique</label>
      <label class="row" style="gap:10px"><input type="checkbox" id="p-featured" ${p.featured ? 'checked' : ''} style="width:auto"> Mettre en coup de cœur</label>

      <button class="btn btn-primary btn-block" id="saveProduct">${isNew ? 'Créer le produit' : 'Enregistrer'}</button>
      ${isNew ? '' : '<button class="btn btn-danger btn-block" id="deleteProduct">Supprimer</button>'}
    </div>`,
    () => {
      const refreshImages = () => {
        document.getElementById('imageList').innerHTML = imageList();
        bindImageRemoval();
      };
      const bindImageRemoval = () => {
        document.querySelectorAll('[data-rm-img]').forEach((b) => {
          b.onclick = () => {
            images.splice(Number(b.dataset.rmImg), 1);
            refreshImages();
          };
        });
      };
      bindImageRemoval();

      const updateMargin = () => {
        const price = Number(document.getElementById('p-price').value) || 0;
        const cost = Number(document.getElementById('p-cost').value) || 0;
        const margin = price - cost;
        const ratio = cost > 0 ? (price / cost).toFixed(1) + '×' : '—';
        document.getElementById('marginHint').innerHTML =
          `Marge brute : <strong style="color:var(--ok)">${money(margin)}</strong> · coefficient ${ratio}`;
      };
      document.getElementById('p-price').oninput = updateMargin;
      document.getElementById('p-cost').oninput = updateMargin;
      updateMargin();

      document.getElementById('addImgUrl').onclick = () => {
        const input = document.getElementById('p-imgurl');
        const value = input.value.trim();
        if (!value) return;
        images.push(value);
        input.value = '';
        refreshImages();
      };

      document.getElementById('p-imgfile').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 4 * 1024 * 1024) return toast('Image trop lourde (4 Mo max)');
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const { url } = await api('/api/admin/upload', { method: 'POST', body: JSON.stringify({ dataUrl: reader.result }) });
            images.push(url);
            refreshImages();
            toast('Image ajoutée');
          } catch (err) {
            toast(err.message);
          }
        };
        reader.readAsDataURL(file);
      };

      document.getElementById('saveProduct').onclick = async () => {
        const payload = {
          name: document.getElementById('p-name').value,
          categoryId: document.getElementById('p-cat').value,
          price: document.getElementById('p-price').value,
          costPrice: document.getElementById('p-cost').value,
          stock: document.getElementById('p-stock').value,
          description: document.getElementById('p-desc').value,
          images,
          colors: document.getElementById('p-colors').value.split(',').map((s) => s.trim()).filter(Boolean),
          sizes: document.getElementById('p-sizes').value.split(',').map((s) => s.trim()).filter(Boolean),
          supplierUrl: document.getElementById('p-supplier').value,
          supplierNote: document.getElementById('p-suppliernote').value,
          active: document.getElementById('p-active').checked,
          featured: document.getElementById('p-featured').checked,
        };
        if (!payload.name.trim()) return toast('Le nom est obligatoire');
        try {
          if (isNew) await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
          else await api('/api/admin/products/' + p.id, { method: 'PATCH', body: JSON.stringify(payload) });
          toast(isNew ? 'Produit créé' : 'Produit enregistré');
          closeSheet();
          renderTab();
        } catch (err) {
          toast(err.message);
        }
      };

      const deleteBtn = document.getElementById('deleteProduct');
      if (deleteBtn) {
        deleteBtn.onclick = async () => {
          if (!confirm('Supprimer « ' + p.name + ' » ?')) return;
          await api('/api/admin/products/' + p.id, { method: 'DELETE' });
          toast('Produit supprimé');
          closeSheet();
          renderTab();
        };
      }
    }
  );
}

/* ------------------------------ onglet : clients ------------------------------ */

async function renderClients() {
  loading();
  const { customers } = await api('/api/admin/customers');
  const sorted = [...customers].sort((a, b) => b.totalSpent - a.totalSpent);

  adminMain.innerHTML = `
    <div class="spread" style="margin-bottom:12px"><h1>Clients</h1><span class="small muted">${customers.length}</span></div>
    ${
      sorted.length
        ? `<div class="list">${sorted
            .map(
              (c) => `
        <button class="list-item" data-customer="${esc(c.id)}">
          <div class="grow">
            <div class="t">${esc(c.name)}</div>
            <div class="m">${esc(c.email)} · ${esc(c.address ? c.address.city : '')}</div>
          </div>
          <div class="r"><div style="font-weight:750">${money(c.totalSpent)}</div><div class="tiny muted">${c.orderCount} commande(s)</div></div>
        </button>`
            )
            .join('')}</div>`
        : `<div class="empty"><div class="ic">👤</div>Aucun client pour l'instant.</div>`
    }`;

  adminMain.querySelectorAll('[data-customer]').forEach((el) => {
    el.onclick = () => {
      const c = customers.find((x) => x.id === el.dataset.customer);
      openSheet(
        c.name,
        `<div class="stack" style="gap:14px">
          <div class="card">
            <div class="kv"><span class="k">E-mail</span><span class="v"><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></span></div>
            <div class="kv"><span class="k">Téléphone</span><span class="v"><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></span></div>
            <div class="kv"><span class="k">Adresse</span><span class="v">${esc(c.address.line1)}<br>${esc(c.address.zip)} ${esc(c.address.city)}<br>${esc(c.address.country)}</span></div>
            <div class="kv"><span class="k">Client depuis</span><span class="v">${dateFR(c.createdAt)}</span></div>
            <div class="kv" style="border:0"><span class="k">Total dépensé</span><span class="v">${money(c.totalSpent)}</span></div>
          </div>
          <div class="card">
            <h3 style="margin-bottom:8px">Commandes</h3>
            ${c.orders.map((o) => `<div class="kv"><span class="k mono">${esc(o.number)}</span><span class="v">${money(o.total)} ${statusBadge(o.status)}</span></div>`).join('') || '<p class="tiny muted">Aucune commande.</p>'}
          </div>
          <button class="btn btn-danger btn-block" id="deleteCustomer">Supprimer la fiche client</button>
        </div>`,
        () => {
          document.getElementById('deleteCustomer').onclick = async () => {
            if (!confirm('Supprimer la fiche de ' + c.name + ' ? Les commandes sont conservées.')) return;
            await api('/api/admin/customers/' + c.id, { method: 'DELETE' });
            toast('Fiche supprimée');
            closeSheet();
            renderTab();
          };
        }
      );
    };
  });
}

/* ------------------------------ onglet : rayons ------------------------------ */

async function renderCategories() {
  loading();
  const { categories } = await api('/api/admin/categories');

  adminMain.innerHTML = `
    <div class="spread" style="margin-bottom:12px">
      <h1>Rayons</h1>
      <button class="btn btn-sm btn-primary" id="newCategory">+ Ajouter</button>
    </div>
    <div class="list">
      ${categories
        .map(
          (c) => `<button class="list-item" data-cat="${esc(c.id)}">
            <div style="font-size:1.5rem">${esc(c.emoji)}</div>
            <div class="grow"><div class="t">${esc(c.name)}</div><div class="m">${esc(c.description || '')}</div></div>
            <div class="r tiny muted">modifier ›</div>
          </button>`
        )
        .join('')}
    </div>`;

  const editor = (category) => {
    const c = category || { name: '', emoji: '📦', description: '' };
    openSheet(
      category ? 'Modifier le rayon' : 'Nouveau rayon',
      `<div class="stack" style="gap:12px">
        <div class="grid-2">
          <div class="field"><label for="c-emoji">Icône</label><input id="c-emoji" type="text" value="${esc(c.emoji)}" maxlength="4"></div>
          <div class="field"><label for="c-name">Nom</label><input id="c-name" type="text" value="${esc(c.name)}"></div>
        </div>
        <div class="field"><label for="c-desc">Description</label><input id="c-desc" type="text" value="${esc(c.description || '')}"></div>
        <button class="btn btn-primary btn-block" id="saveCat">${category ? 'Enregistrer' : 'Créer'}</button>
        ${category ? '<button class="btn btn-danger btn-block" id="delCat">Supprimer</button>' : ''}
      </div>`,
      () => {
        document.getElementById('saveCat').onclick = async () => {
          const payload = {
            name: document.getElementById('c-name').value,
            emoji: document.getElementById('c-emoji').value,
            description: document.getElementById('c-desc').value,
          };
          if (!payload.name.trim()) return toast('Le nom est obligatoire');
          try {
            if (category) await api('/api/admin/categories/' + category.id, { method: 'PATCH', body: JSON.stringify(payload) });
            else await api('/api/admin/categories', { method: 'POST', body: JSON.stringify(payload) });
            toast('Rayon enregistré');
            closeSheet();
            renderTab();
          } catch (err) {
            toast(err.message);
          }
        };
        const del = document.getElementById('delCat');
        if (del) {
          del.onclick = async () => {
            if (!confirm('Supprimer le rayon « ' + category.name + ' » ?')) return;
            try {
              await api('/api/admin/categories/' + category.id, { method: 'DELETE' });
              toast('Rayon supprimé');
              closeSheet();
              renderTab();
            } catch (err) {
              toast(err.message);
            }
          };
        }
      }
    );
  };

  document.getElementById('newCategory').onclick = () => editor(null);
  adminMain.querySelectorAll('[data-cat]').forEach((el) => {
    el.onclick = () => editor(categories.find((c) => c.id === el.dataset.cat));
  });
}

/* ------------------------------ onglet : réglages ------------------------------ */

async function renderReglages() {
  loading();
  const { settings } = await api('/api/admin/settings');
  SETTINGS = settings;

  adminMain.innerHTML = `
    <h1 style="margin-bottom:14px">Réglages</h1>

    <div class="card stack" style="gap:12px">
      <h3>Identité de la boutique</h3>
      <div class="field"><label for="s-name">Nom</label><input id="s-name" type="text" value="${esc(settings.storeName)}"></div>
      <div class="field"><label for="s-tagline">Phrase de présentation</label><input id="s-tagline" type="text" value="${esc(settings.tagline)}"></div>
      <div class="field"><label for="s-herotitle">Titre d'accueil</label><textarea id="s-herotitle">${esc(settings.heroTitle)}</textarea></div>
      <div class="field"><label for="s-herosub">Sous-titre d'accueil</label><input id="s-herosub" type="text" value="${esc(settings.heroSubtitle)}"></div>
      <div class="field"><label for="s-email">E-mail de contact</label><input id="s-email" type="email" value="${esc(settings.contactEmail || '')}"></div>
    </div>

    <div class="card stack" style="gap:12px;margin-top:12px">
      <h3>Livraison</h3>
      <div class="grid-2">
        <div class="field"><label for="s-ship">Frais de port</label><input id="s-ship" type="number" step="0.01" min="0" value="${settings.shippingFee}"></div>
        <div class="field"><label for="s-free">Offerte dès</label><input id="s-free" type="number" step="1" min="0" value="${settings.freeShippingThreshold}"></div>
      </div>
      <div class="field"><label for="s-delay">Délai annoncé</label><input id="s-delay" type="text" value="${esc(settings.deliveryDelay || '')}"></div>
      <div class="field"><label for="s-currency">Symbole monétaire</label><input id="s-currency" type="text" value="${esc(settings.currency)}" maxlength="3"></div>
      <button class="btn btn-primary btn-block" id="saveSettings">Enregistrer les réglages</button>
    </div>

    <div class="card stack" style="gap:12px;margin-top:12px">
      <h3>Mot de passe admin</h3>
      ${settings.passwordIsGenerated ? '<div class="banner" style="margin:0">Mot de passe généré automatiquement — changez-le.</div>' : ''}
      <div class="field"><label for="s-pwold">Mot de passe actuel</label><input id="s-pwold" type="password" autocomplete="current-password"></div>
      <div class="field"><label for="s-pwnew">Nouveau mot de passe (8 caractères min.)</label><input id="s-pwnew" type="password" autocomplete="new-password"></div>
      <button class="btn btn-dark btn-block" id="savePassword">Changer le mot de passe</button>
    </div>

    <div class="card stack" style="gap:10px;margin-top:12px">
      <h3>Données</h3>
      <a class="btn btn-ghost btn-block" href="/api/admin/orders.csv">⬇ Exporter les commandes (CSV)</a>
      <p class="tiny muted">Toutes les données sont stockées dans le fichier <span class="mono">data/store.json</span> sur votre serveur. Sauvegardez ce fichier régulièrement.</p>
    </div>`;

  document.getElementById('saveSettings').onclick = async () => {
    try {
      const { settings: updated } = await api('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          storeName: document.getElementById('s-name').value,
          tagline: document.getElementById('s-tagline').value,
          heroTitle: document.getElementById('s-herotitle').value,
          heroSubtitle: document.getElementById('s-herosub').value,
          contactEmail: document.getElementById('s-email').value,
          shippingFee: document.getElementById('s-ship').value,
          freeShippingThreshold: document.getElementById('s-free').value,
          deliveryDelay: document.getElementById('s-delay').value,
          currency: document.getElementById('s-currency').value,
        }),
      });
      SETTINGS = updated;
      toast('Réglages enregistrés');
    } catch (err) {
      toast(err.message);
    }
  };

  document.getElementById('savePassword').onclick = async () => {
    try {
      await api('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: document.getElementById('s-pwold').value,
          newPassword: document.getElementById('s-pwnew').value,
        }),
      });
      toast('Mot de passe modifié');
      renderReglages();
    } catch (err) {
      toast(err.message);
    }
  };
}

/* ------------------------------ routeur d'onglets ------------------------------ */

async function renderTab() {
  try {
    if (currentTab === 'resume') await renderResume();
    else if (currentTab === 'commandes') await renderCommandes();
    else if (currentTab === 'produits') await renderProduits();
    else if (currentTab === 'clients') await renderClients();
    else if (currentTab === 'categories') await renderCategories();
    else if (currentTab === 'reglages') await renderReglages();
  } catch (err) {
    adminMain.innerHTML = `<div class="empty"><div class="ic">⚠️</div>${esc(err.message)}</div>`;
  }
}

async function boot() {
  try {
    const { authenticated, statuses } = await api('/api/admin/session');
    STATUSES = statuses;
    if (authenticated) showAdmin();
    else showLogin();
  } catch (err) {
    showLogin();
  }
}

boot();

/* ==================================================================
   HACKLAB — tableau de bord (front-end, sans dépendance)
   ================================================================== */
'use strict';

const loginShell = document.getElementById('loginShell');
const appEl = document.getElementById('app');
const view = document.getElementById('view');
const toastEl = document.getElementById('toast');

let currentTab = 'labo';
let labData = null;

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 2000);
}

async function api(path, options) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (res.status === 401 && !path.endsWith('/login')) {
    showLogin();
    throw new Error('Session expirée.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur.');
  return data;
}

const LEGAL = `<div class="legal">⚖️<div><b>Ce labo n'attaque que lui-même.</b> Toutes les cibles tournent sur ce serveur. N'utilise jamais ces outils contre un système que tu ne possèdes pas ou sans autorisation écrite — c'est un délit (jusqu'à 3 ans de prison en France).</div></div>`;

/* ------------------------------ connexion ------------------------------ */

function showLogin() {
  loginShell.classList.remove('hidden');
  appEl.classList.add('hidden');
}
function showApp() {
  loginShell.classList.add('hidden');
  appEl.classList.remove('hidden');
  renderTab();
}

document.getElementById('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginErr');
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Connexion…';
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password: document.getElementById('pw').value }) });
    document.getElementById('pw').value = '';
    showApp();
  } catch (e2) {
    err.textContent = e2.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrer';
  }
};

document.getElementById('logoutBtn').onclick = async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  showLogin();
};

document.getElementById('tabbar').onclick = (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  document.querySelectorAll('#tabbar button').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  currentTab = b.dataset.tab;
  renderTab();
};

/* ------------------------------ onglet : labo ------------------------------ */

function stateBadge(runtime) {
  if (!runtime) return '<span class="badge stop"><span class="dot"></span>inconnu</span>';
  if (runtime.state === 'running') return '<span class="badge run"><span class="dot"></span>en marche</span>';
  if (runtime.state === 'docker-absent') return '<span class="badge warn"><span class="dot"></span>docker absent</span>';
  if (runtime.state === 'absent') return '<span class="badge warn"><span class="dot"></span>non installé</span>';
  return '<span class="badge stop"><span class="dot"></span>arrêté</span>';
}

async function renderLabo() {
  view.innerHTML = LEGAL + '<div class="empty">Chargement du labo…</div>';
  labData = await api('/api/lab');

  const dockerWarn = labData.dockerAvailable
    ? ''
    : `<div class="card" style="border-color:var(--warn)"><b>Docker n'est pas accessible.</b><p class="small muted" style="margin-top:6px">Lance <code class="mono">./install.sh</code> sur le VPS, ou vérifie que le service dashboard tourne avec les droits Docker.</p></div>`;

  const cards = labData.targets
    .map((t) => {
      const running = t.runtime && t.runtime.state === 'running';
      const installed = t.runtime && t.runtime.state !== 'absent' && t.runtime.state !== 'docker-absent';
      return `
      <div class="card target">
        <div class="head">
          <div>
            <div class="name">${esc(t.name)}</div>
            <div class="tiny muted mono">127.0.0.1:${t.port} · ${esc(t.difficulty)}</div>
          </div>
          ${stateBadge(t.runtime)}
        </div>
        <div>${t.tags.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
        <div class="blurb">${esc(t.blurb)}</div>
        <div class="creds">🔑 ${esc(t.creds)}</div>
        <div class="tip">💡 ${esc(t.tip)}</div>
        <div class="btn-row">
          ${
            running
              ? `<a class="btn btn-primary btn-sm" href="/target/${t.id}/" target="_blank" rel="noopener">Ouvrir ↗</a>
                 <button class="btn btn-sm" data-act="restart" data-id="${t.id}">Redémarrer</button>
                 <button class="btn btn-danger btn-sm" data-act="stop" data-id="${t.id}">Arrêter</button>`
              : `<button class="btn btn-primary btn-sm" data-act="start" data-id="${t.id}" ${installed || labData.dockerAvailable ? '' : 'disabled'}>Démarrer</button>`
          }
        </div>
      </div>`;
    })
    .join('');

  view.innerHTML =
    LEGAL +
    dockerWarn +
    `<div class="section-title"><h1>Cibles du labo</h1><button class="btn btn-sm" id="refreshLab">↻ Rafraîchir</button></div>
     <div class="grid cols-2">${cards}</div>
     <div class="card" style="margin-top:14px">
       <h2>Comment voir une cible depuis ton téléphone</h2>
       <p class="small muted" style="margin-top:8px"><b>Le plus simple :</b> le bouton « Ouvrir » (passe par ce tableau de bord, déjà authentifié). Fonctionne bien pour DVWA.</p>
       <p class="small muted" style="margin-top:8px"><b>Pour Juice Shop & WebGoat</b> (applications modernes), utilise un tunnel SSH depuis l'app Termius :</p>
       <div class="cmd"><code class="mono">ssh -L 3001:127.0.0.1:3001 user@TON_VPS</code></div>
       <p class="tiny muted" style="margin-top:8px">Puis ouvre <code class="mono">http://localhost:3001</code> dans Safari.</p>
     </div>`;

  document.getElementById('refreshLab').onclick = renderLabo;
  view.querySelectorAll('[data-act]').forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = '…';
      try {
        await api('/api/lab/action', { method: 'POST', body: JSON.stringify({ id: btn.dataset.id, action: btn.dataset.act }) });
        toast('Commande envoyée');
        setTimeout(renderLabo, 1200);
      } catch (e) {
        toast(e.message);
        renderLabo();
      }
    };
  });
}

/* ------------------------------ onglet : terminal ------------------------------ */

function renderTerminal() {
  view.innerHTML =
    LEGAL +
    `<div class="section-title"><h1>Terminal</h1></div>
     <iframe class="term-frame" src="/terminal/" title="Terminal web"></iframe>
     <div class="card term-hint">
       <p class="small muted">Ce terminal tourne <b>sur ton VPS</b>. C'est là que tu lances nmap, sqlmap, tes scripts Python… Copie les commandes depuis l'onglet <b>Outils</b>.</p>
       <p class="tiny muted" style="margin-top:8px">Écran noir ou erreur ? Le service <code class="mono">ttyd</code> n'est peut-être pas démarré : <code class="mono">sudo systemctl status hacklab-ttyd</code></p>
     </div>`;
}

/* ------------------------------ onglet : parcours ------------------------------ */

let roadmapCache = null;

async function renderParcours() {
  view.innerHTML = LEGAL + '<div class="empty">Chargement…</div>';
  roadmapCache = await api('/api/roadmap');
  const { roadmap, progress } = roadmapCache;

  let totalItems = 0;
  let doneItems = 0;
  roadmap.forEach((m) => {
    totalItems += m.items.length;
    doneItems += Object.keys(progress[m.id] || {}).length;
  });
  const pct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;

  const modules = roadmap
    .map((m, i) => {
      const done = progress[m.id] || {};
      const doneCount = Object.keys(done).length;
      const items = m.items
        .map(
          (it, idx) => `
        <label class="check ${done[idx] ? 'done' : ''}">
          <input type="checkbox" data-mod="${m.id}" data-idx="${idx}" ${done[idx] ? 'checked' : ''}>
          <span>${esc(it)}</span>
        </label>`
        )
        .join('');
      const links = m.resources
        .map((r) => `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>`)
        .join('');
      return `
      <details class="module card" ${i === 0 ? 'open' : ''}>
        <summary>
          <span class="mnum">${String(i).padStart(2, '0')}</span>
          <span class="mtitle">${esc(m.title)}</span>
          <span class="mcount">${doneCount}/${m.items.length}</span>
        </summary>
        <div class="body">
          <div class="phase-tag">${esc(m.phase)}</div>
          <div class="goal">${esc(m.goal)}</div>
          ${items}
          <div class="res-links">${links}</div>
        </div>
      </details>`;
    })
    .join('');

  view.innerHTML =
    LEGAL +
    `<div class="section-title"><h1>Parcours</h1><span class="mono small muted">${doneItems}/${totalItems} · ${pct}%</span></div>
     <div class="card" style="margin-bottom:14px">
       <div class="small muted">Ta progression est sauvegardée sur le serveur — elle te suit d'un appareil à l'autre.</div>
       <div class="progress-outer"><div class="progress-inner" style="width:${pct}%"></div></div>
     </div>
     ${modules}`;

  view.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.onchange = async () => {
      try {
        await api('/api/progress', {
          method: 'POST',
          body: JSON.stringify({ moduleId: cb.dataset.mod, itemIndex: Number(cb.dataset.idx), done: cb.checked }),
        });
        cb.closest('.check').classList.toggle('done', cb.checked);
        // Met à jour les compteurs sans tout recharger.
        const details = cb.closest('.module');
        const checked = details.querySelectorAll('input:checked').length;
        const total = details.querySelectorAll('input').length;
        details.querySelector('.mcount').textContent = checked + '/' + total;
      } catch (e) {
        toast(e.message);
        cb.checked = !cb.checked;
      }
    };
  });
}

/* ------------------------------ onglet : outils ------------------------------ */

async function renderOutils() {
  view.innerHTML = LEGAL + '<div class="empty">Chargement…</div>';
  const { tools } = await api('/api/tools');

  const cards = tools
    .map(
      (t) => `
    <div class="card tool">
      <h2 class="mono">${esc(t.name)}</h2>
      <div class="role">${esc(t.role)}</div>
      ${t.commands
        .map(
          (c) => `
        <div class="lbl" style="margin-top:10px">${esc(c.label)}</div>
        <div class="cmd">
          <code class="mono">${esc(c.cmd)}</code>
          <button class="btn btn-sm copy" data-cmd="${esc(c.cmd)}">Copier</button>
        </div>`
        )
        .join('')}
    </div>`
    )
    .join('');

  view.innerHTML =
    LEGAL +
    `<div class="section-title"><h1>Aide-mémoire</h1></div>
     <p class="small muted" style="margin-bottom:14px">Commandes déjà cadrées sur les cibles du labo (127.0.0.1). Copie-les dans le Terminal. Adapte les ports et paramètres selon la cible.</p>
     <div class="grid">${cards}</div>`;

  view.querySelectorAll('.copy').forEach((b) => {
    b.onclick = () => {
      navigator.clipboard.writeText(b.dataset.cmd).then(
        () => toast('Commande copiée'),
        () => toast('Copie impossible')
      );
    };
  });
}

/* ------------------------------ onglet : réglages ------------------------------ */

function renderReglages() {
  const warn = labData && labData.passwordIsGenerated
    ? `<div class="legal" style="background:var(--danger-bg);border-color:var(--danger);color:var(--danger)">⚠️<div>Ton mot de passe est encore celui généré automatiquement. Change-le maintenant.</div></div>`
    : '';

  view.innerHTML = `
    ${warn}
    <div class="section-title"><h1>Réglages</h1></div>

    <div class="card" style="margin-bottom:14px">
      <h2>Mot de passe du tableau de bord</h2>
      <div class="field" style="margin-top:12px"><label for="pwOld">Actuel</label><input id="pwOld" type="password" autocomplete="current-password"></div>
      <div class="field"><label for="pwNew">Nouveau (8 caractères min.)</label><input id="pwNew" type="password" autocomplete="new-password"></div>
      <button class="btn btn-primary btn-block" id="savePw">Changer le mot de passe</button>
      <p class="err" id="pwErr"></p>
    </div>

    <div class="card" style="margin-bottom:14px">
      <h2>Apparence</h2>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-sm" data-theme-set="dark">🌙 Sombre</button>
        <button class="btn btn-sm" data-theme-set="light">☀️ Clair</button>
      </div>
    </div>

    <div class="card">
      <h2>À propos du labo</h2>
      <p class="small muted" style="margin-top:10px">Toutes tes données (progression, notes, mot de passe) sont dans <code class="mono">data/lab.json</code> sur ton VPS. Sauvegarde ce fichier de temps en temps.</p>
      <p class="small muted" style="margin-top:10px">Gérer les services : <br>
        <code class="mono">sudo systemctl restart hacklab</code><br>
        <code class="mono">docker compose ps</code> (état des cibles)</p>
    </div>`;

  document.getElementById('savePw').onclick = async () => {
    const err = document.getElementById('pwErr');
    err.textContent = '';
    try {
      await api('/api/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: document.getElementById('pwOld').value,
          newPassword: document.getElementById('pwNew').value,
        }),
      });
      toast('Mot de passe changé');
      if (labData) labData.passwordIsGenerated = false;
      renderReglages();
    } catch (e) {
      err.textContent = e.message;
    }
  };

  view.querySelectorAll('[data-theme-set]').forEach((b) => {
    b.onclick = () => {
      const theme = b.dataset.themeSet;
      document.documentElement.setAttribute('data-theme', theme);
      try {
        localStorage.setItem('hacklab_theme', theme);
      } catch (e) {
        /* ignore */
      }
      toast('Thème ' + (theme === 'dark' ? 'sombre' : 'clair'));
    };
  });
}

/* ------------------------------ routeur ------------------------------ */

async function renderTab() {
  try {
    if (currentTab === 'labo') await renderLabo();
    else if (currentTab === 'terminal') renderTerminal();
    else if (currentTab === 'parcours') await renderParcours();
    else if (currentTab === 'outils') await renderOutils();
    else if (currentTab === 'reglages') renderReglages();
  } catch (e) {
    view.innerHTML = `<div class="empty"><div class="ic">⚠️</div>${esc(e.message)}</div>`;
  }
}

/* ------------------------------ démarrage ------------------------------ */

(function initTheme() {
  try {
    const saved = localStorage.getItem('hacklab_theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  } catch (e) {
    /* ignore */
  }
})();

(async function boot() {
  try {
    const { authenticated } = await api('/api/session');
    if (authenticated) showApp();
    else showLogin();
  } catch (e) {
    showLogin();
  }
})();

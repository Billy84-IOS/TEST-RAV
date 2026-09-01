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

let termState = {};
let pendingTerminalCmd = null;

function goTerminalWith(cmd) {
  pendingTerminalCmd = cmd;
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'terminal'));
  currentTab = 'terminal';
  renderTab();
}

function teardownTerm() {
  if (termState.onResize) window.removeEventListener('resize', termState.onResize);
  if (termState.ws) {
    try {
      termState.ws.onclose = null;
      termState.ws.close();
    } catch (e) {
      /* ignore */
    }
  }
  if (termState.term) {
    try {
      termState.term.dispose();
    } catch (e) {
      /* ignore */
    }
  }
  termState = {};
}

function renderTerminal() {
  if (typeof Terminal === 'undefined' || typeof FitAddon === 'undefined') {
    view.innerHTML = LEGAL + `<div class="empty"><div class="ic">⚠️</div>Le terminal n'a pas pu se charger (xterm manquant). Recharge la page.</div>`;
    return;
  }

  view.innerHTML =
    LEGAL +
    `<div class="section-title"><h1>Terminal</h1><span class="term-status badge" id="termStatus">connexion…</span></div>
     <div class="term-host" id="termHost"></div>
     <div class="cmdbar">
       <input id="cmdInput" type="text" placeholder="Tape ou colle une commande, puis Envoyer" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false">
       <button class="btn btn-primary" id="cmdSend">Envoyer</button>
     </div>
     <div class="term-controls">
       <button class="btn btn-sm" data-key="tab">⇥ Tab</button>
       <button class="btn btn-sm" data-key="up">↑ Précédente</button>
       <button class="btn btn-sm" data-key="ctrlc">Ctrl-C</button>
       <button class="btn btn-sm" data-key="clear">Effacer</button>
       <button class="btn btn-sm" id="termReconnect">↻ Reconnecter</button>
     </div>
     <div class="card term-hint">
       <p class="small muted">💡 Sur mobile : tape ou <b>colle</b> ta commande dans le champ ci-dessus (le coller marche là), puis <b>Envoyer</b>. Tu peux aussi écrire directement dans le terminal noir.</p>
     </div>`;

  initTerm();
}

function initTerm() {
  const host = document.getElementById('termHost');
  const statusEl = document.getElementById('termStatus');
  const setStatus = (txt, cls) => {
    statusEl.textContent = txt;
    statusEl.className = 'term-status badge ' + (cls || '');
  };

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    scrollback: 3000,
    theme: { background: '#0d1117', foreground: '#e6edf3', cursor: '#4fd6a8', selectionBackground: '#264f78' },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(host);
  setTimeout(() => {
    try {
      fit.fit();
    } catch (e) {
      /* ignore */
    }
  }, 30);

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(proto + '://' + location.host + '/terminal/ws', ['tty']);
  ws.binaryType = 'arraybuffer';
  const dec = new TextDecoder();

  const sendInput = (data) => {
    if (ws.readyState === 1) ws.send('0' + data);
  };
  const sendResize = () => {
    if (ws.readyState === 1) ws.send('1' + JSON.stringify({ columns: term.cols, rows: term.rows }));
  };

  ws.onopen = () => {
    ws.send(JSON.stringify({ AuthToken: '', columns: term.cols, rows: term.rows }));
    sendResize();
    setStatus('connecté', 'run');
  };
  ws.onmessage = (ev) => {
    const b = new Uint8Array(ev.data);
    if (b.length && String.fromCharCode(b[0]) === '0') term.write(dec.decode(b.subarray(1)));
  };
  ws.onclose = () => setStatus('déconnecté', 'stop');
  ws.onerror = () => setStatus('erreur', 'bad');

  term.onData((d) => sendInput(d));

  const onResize = () => {
    try {
      fit.fit();
      sendResize();
    } catch (e) {
      /* ignore */
    }
  };
  window.addEventListener('resize', onResize);

  termState = { term, ws, fit, send: sendInput, onResize };

  // Barre de commande (le champ où le coller iOS fonctionne).
  const input = document.getElementById('cmdInput');
  if (pendingTerminalCmd) {
    input.value = pendingTerminalCmd;
    pendingTerminalCmd = null;
    setTimeout(() => input.focus(), 100);
  }
  const runFromInput = () => {
    const value = input.value;
    if (!value) {
      sendInput('\n');
      return;
    }
    sendInput(value + '\n');
    input.value = '';
    input.focus();
  };
  document.getElementById('cmdSend').onclick = runFromInput;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runFromInput();
    }
  });

  const keys = { tab: '\t', up: '\x1b[A', ctrlc: '\x03', clear: '\x0c' };
  view.querySelectorAll('[data-key]').forEach((btn) => {
    btn.onclick = () => {
      sendInput(keys[btn.dataset.key]);
      input.focus();
    };
  });
  document.getElementById('termReconnect').onclick = () => renderTerminal();
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

/* ------------------------------ onglet : missions ------------------------------ */

let missionsData = null;
let openMissionId = null;

const MISSION_LEGAL = `<div class="legal" style="background:var(--danger-bg);border-color:var(--danger);color:var(--danger)">🛑<div><b>Avant toute mission, coche toute la checklist.</b> Un « ok » sur Discord n'est PAS une autorisation. Il te faut l'accord écrit du vrai propriétaire, l'accord de l'hébergeur, et une machine autorisée à tester (ton VPS interdit probablement d'attaquer vers l'extérieur — il te couperait). Sans ça, c'est un délit.</div></div>`;

function severityMeta(id) {
  return (missionsData.severities || []).find((s) => s.id === id) || { label: id, tone: 'off' };
}
function missionStatusMeta(id) {
  return (missionsData.statuses || []).find((s) => s.id === id) || { label: id, tone: 'off' };
}

function genAuthorization(m) {
  return (
    "AUTORISATION DE TEST D'INTRUSION\n" +
    '================================\n\n' +
    "Je soussigné(e) ____________________________ (nom et prénom),\n" +
    "agissant en qualité de propriétaire ou représentant légal du site :\n\n" +
    '    ' + (m.domain || '____________________') + '\n\n' +
    "autorise [TON NOM / TON ENTREPRISE] à réaliser un test de sécurité\n" +
    "(test d'intrusion) sur le périmètre défini ci-dessous.\n\n" +
    'PÉRIMÈTRE AUTORISÉ :\n' +
    (m.scope ? m.scope : '    (à préciser : domaines / URL autorisés, et ce qui est HORS-scope)') + '\n\n' +
    'FENÊTRE DE TEST CONVENUE : ' + (m.window || '____________________') + '\n\n' +
    'CONDITIONS :\n' +
    '- Les tests se limitent strictement au périmètre ci-dessus.\n' +
    '- Aucun test destructif ni déni de service (DoS).\n' +
    "- Aucune donnée personnelle de client n'est copiée, conservée ou divulguée.\n" +
    '- Un rapport confidentiel est remis ; les failles ne sont divulguées à personne d’autre.\n' +
    "- Le propriétaire confirme disposer des droits nécessaires (y compris l'accord\n" +
    "  de l'hébergeur si requis) et avoir effectué une sauvegarde du site.\n" +
    '- Cette autorisation peut être révoquée à tout moment par écrit.\n\n' +
    'Fait à ____________________, le ____________________\n\n' +
    'Le propriétaire (nom + signature) :        Le prestataire (nom + signature) :\n\n' +
    '____________________________              ____________________________'
  );
}

function genReport(m) {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const bySev = {};
  (m.findings || []).forEach((f) => (bySev[f.severity] = (bySev[f.severity] || 0) + 1));
  const breakdown =
    Object.keys(bySev).length
      ? Object.entries(bySev).map(([s, n]) => n + ' ' + severityMeta(s).label.toLowerCase()).join(', ')
      : 'aucune';

  let out =
    'RAPPORT DE TEST D’INTRUSION — CONFIDENTIEL\n' +
    '==========================================\n\n' +
    'Client        : ' + (m.client || '') + '\n' +
    'Cible         : ' + (m.domain || '') + '\n' +
    'Période       : ' + (m.window || '') + '\n' +
    'Date du rapport : ' + today + '\n\n' +
    '1. RÉSUMÉ\n---------\n' +
    (m.findings || []).length + ' faille(s) identifiée(s) : ' + breakdown + '.\n\n' +
    '2. PÉRIMÈTRE\n------------\n' + (m.scope || '(non précisé)') + '\n\n' +
    '3. FAILLES IDENTIFIÉES\n----------------------\n';

  if (!(m.findings || []).length) {
    out += 'Aucune faille identifiée dans le périmètre testé.\n';
  } else {
    m.findings.forEach((f, i) => {
      out +=
        '\n[' + severityMeta(f.severity).label.toUpperCase() + '] ' + (i + 1) + '. ' + (f.title || 'Sans titre') + '\n' +
        'Description : ' + (f.detail || '(à compléter)') + '\n' +
        (f.solution ? 'Correctif   : ' + f.solution + '\n' : '');
    });
  }
  out +=
    '\n4. RECOMMANDATIONS\n------------------\n' +
    '- Corriger en priorité les failles critiques et élevées.\n' +
    '- Mettre à jour les composants (CMS, extensions, dépendances).\n' +
    '- Vérifier la validation des entrées et la gestion des sessions.\n\n' +
    '5. CONCLUSION\n-------------\n' +
    'Rapport remis à titre confidentiel. Un nouveau test est conseillé après correction.\n';
  return out;
}

async function renderMissions() {
  view.innerHTML = MISSION_LEGAL + '<div class="empty">Chargement…</div>';
  missionsData = await api('/api/missions');

  if (openMissionId) {
    const m = missionsData.missions.find((x) => x.id === openMissionId);
    if (m) return renderMissionDetail(m);
    openMissionId = null;
  }

  const list = missionsData.missions
    .map((m) => {
      const done = Object.keys(m.checklist || {}).length;
      const total = missionsData.checklist.length;
      const meta = missionStatusMeta(m.status);
      return `
      <button class="list-item" data-mission="${esc(m.id)}">
        <div class="grow">
          <div class="t">${esc(m.client)}</div>
          <div class="m">${esc(m.domain || 'domaine à définir')}</div>
          <div style="margin-top:6px" class="btn-row">
            <span class="badge badge-${meta.tone}">${esc(meta.label)}</span>
            <span class="badge">checklist ${done}/${total}</span>
            ${(m.findings || []).length ? `<span class="badge">${m.findings.length} faille(s)</span>` : ''}
          </div>
        </div>
        <div class="r tiny muted">ouvrir ›</div>
      </button>`;
    })
    .join('');

  view.innerHTML =
    MISSION_LEGAL +
    `<div class="section-title"><h1>Missions</h1></div>
     <div class="card" style="margin-bottom:14px">
       <h2>Nouvelle mission</h2>
       <div class="field" style="margin-top:12px"><label for="ms-client">Client (nom / boutique)</label><input id="ms-client" type="text" placeholder="Ex. Boutique FiveM de Kévin"></div>
       <div class="field"><label for="ms-discord">Contact Discord</label><input id="ms-discord" type="text" placeholder="pseudo#0000"></div>
       <div class="field"><label for="ms-domain">Domaine / URL du site</label><input id="ms-domain" type="text" placeholder="https://exemple.tld"></div>
       <button class="btn btn-primary btn-block" id="ms-create">Créer la mission</button>
     </div>
     ${missionsData.missions.length ? `<div class="list">${list}</div>` : `<div class="empty"><div class="ic">📋</div>Aucune mission. Crée-en une quand tu as un client sérieux.</div>`}`;

  document.getElementById('ms-create').onclick = async () => {
    const client = document.getElementById('ms-client').value.trim();
    if (!client) return toast('Nom du client obligatoire');
    try {
      const { mission } = await api('/api/missions', {
        method: 'POST',
        body: JSON.stringify({
          client,
          discord: document.getElementById('ms-discord').value,
          domain: document.getElementById('ms-domain').value,
        }),
      });
      openMissionId = mission.id;
      renderMissions();
    } catch (e) {
      toast(e.message);
    }
  };

  view.querySelectorAll('[data-mission]').forEach((b) => {
    b.onclick = () => {
      openMissionId = b.dataset.mission;
      renderMissions();
    };
  });
}

function renderMissionDetail(m) {
  const total = missionsData.checklist.length;
  const done = Object.keys(m.checklist || {}).length;
  const allChecked = done === total;

  const checklistHtml = missionsData.checklist
    .map(
      (item, i) => `
      <label class="check ${m.checklist[i] ? 'done' : ''}">
        <input type="checkbox" data-check="${i}" ${m.checklist[i] ? 'checked' : ''}>
        <span>${esc(item)}</span>
      </label>`
    )
    .join('');

  const statusOptions = missionsData.statuses
    .map((s) => `<option value="${esc(s.id)}" ${s.id === m.status ? 'selected' : ''}>${esc(s.label)}</option>`)
    .join('');

  const findingsHtml = (m.findings || [])
    .map(
      (f, i) => `
      <div class="card" style="padding:12px;margin-bottom:8px">
        <div class="spread"><span class="badge badge-${severityMeta(f.severity).tone}">${esc(severityMeta(f.severity).label)}</span>
          <button class="btn btn-sm btn-danger" data-del-finding="${i}">Retirer</button></div>
        <div style="font-weight:650;margin-top:8px">${esc(f.title || 'Sans titre')}</div>
        <div class="small muted" style="margin-top:4px;white-space:pre-wrap">${esc(f.detail || '')}</div>
        ${f.solution ? `<div class="small" style="margin-top:6px"><span style="color:var(--ok)">✔ Solution :</span> ${esc(f.solution)}</div>` : ''}
      </div>`
    )
    .join('');

  const sevOptions = missionsData.severities.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('');

  view.innerHTML =
    `<button class="btn btn-sm" id="ms-back" style="margin:14px 0">← Toutes les missions</button>
     ${
       allChecked
         ? `<div class="legal" style="background:var(--ok-bg);border-color:var(--ok);color:var(--ok)">✅<div><b>Checklist complète.</b> Tu as le cadre pour tester ce périmètre. Reste dedans, documente tout.</div></div>`
         : MISSION_LEGAL
     }

     <div class="card" style="margin-bottom:12px">
       <div class="field"><label>Client</label><input id="ms-d-client" type="text" value="${esc(m.client)}"></div>
       <div class="field"><label>Contact Discord</label><input id="ms-d-discord" type="text" value="${esc(m.discord || '')}"></div>
       <div class="field"><label>Domaine / URL</label><input id="ms-d-domain" type="text" value="${esc(m.domain || '')}"></div>
       <div class="field"><label>Fenêtre de test</label><input id="ms-d-window" type="text" value="${esc(m.window || '')}" placeholder="Ex. samedi 20h–23h"></div>
       <div class="field"><label>Statut</label><select id="ms-d-status">${statusOptions}</select></div>
     </div>

     <div class="card" style="margin-bottom:12px">
       <h2>Périmètre</h2>
       <p class="tiny muted" style="margin:6px 0 8px">Ce que tu as le droit de tester, ET ce qui est hors-scope. Sois précis.</p>
       <textarea id="ms-d-scope" placeholder="Autorisé : https://exemple.tld (site vitrine + boutique)&#10;Hors-scope : serveur de jeu, base de données, sous-domaines, e-mails">${esc(m.scope || '')}</textarea>
     </div>

     <div class="card" style="margin-bottom:12px">
       <h2>Autorisation à faire signer</h2>
       <p class="tiny muted" style="margin:6px 0 8px">Envoie ce document au propriétaire. Tant qu'il n'est pas signé, tu ne testes rien.</p>
       <textarea id="ms-auth" readonly style="min-height:200px">${esc(genAuthorization(m))}</textarea>
       <button class="btn btn-sm btn-block" id="ms-copy-auth" style="margin-top:8px">📋 Copier l'autorisation</button>
     </div>

     <div class="card" style="margin-bottom:12px">
       <div class="spread"><h2>Checklist avant tests</h2><span class="mono small muted">${done}/${total}</span></div>
       <div style="margin-top:8px">${checklistHtml}</div>
     </div>

     ${renderReconSection(m, allChecked)}

     <div class="card" style="margin-bottom:12px">
       <h2>Failles trouvées</h2>
       <div style="margin-top:10px">${findingsHtml || '<p class="tiny muted">Aucune faille notée.</p>'}</div>
       <div class="field" style="margin-top:12px"><label>Titre de la faille</label><input id="ms-f-title" type="text" placeholder="Ex. Injection SQL sur /produit?id="></div>
       <div class="field"><label>Gravité</label><select id="ms-f-sev">${sevOptions}</select></div>
       <div class="field"><label>Description</label><textarea id="ms-f-detail" placeholder="Où, comment reproduire, impact…"></textarea></div>
       <button class="btn btn-sm btn-block" id="ms-add-finding">+ Ajouter la faille</button>
     </div>

     <div class="card" style="margin-bottom:12px">
       <h2>Rapport</h2>
       <button class="btn btn-block" id="ms-gen-report" style="margin-top:10px">Générer le rapport</button>
       <textarea id="ms-report" readonly class="hidden" style="min-height:220px;margin-top:10px"></textarea>
       <button class="btn btn-sm btn-block hidden" id="ms-copy-report" style="margin-top:8px">📋 Copier le rapport</button>
     </div>

     <button class="btn btn-primary btn-block" id="ms-save">Enregistrer la mission</button>
     <button class="btn btn-danger btn-block" id="ms-delete" style="margin-top:10px">Supprimer la mission</button>`;

  document.getElementById('ms-back').onclick = () => {
    openMissionId = null;
    renderMissions();
  };

  view.querySelectorAll('[data-copy-cmd]').forEach((b) => {
    b.onclick = () => {
      navigator.clipboard.writeText(b.dataset.copyCmd).then(
        () => toast('Commande copiée — colle-la sur ta machine autorisée'),
        () => toast('Copie impossible')
      );
    };
  });

  const scanBtn = document.getElementById('ms-scan');
  if (scanBtn) {
    scanBtn.onclick = () => runMissionScan(m);
  }

  const aiBtn = document.getElementById('ms-ai');
  if (aiBtn) {
    aiBtn.onclick = async () => {
      const box = document.getElementById('ms-ai-result');
      aiBtn.disabled = true;
      aiBtn.textContent = '🤖 Analyse en cours…';
      box.classList.remove('hidden');
      box.innerHTML = '<div class="card" style="padding:12px"><span class="muted small">L\'IA analyse les résultats…</span></div>';
      try {
        const { analysis } = await api('/api/missions/' + m.id + '/ai', { method: 'POST' });
        const cmds = extractCommands(analysis);
        const cmdBlock = cmds.length
          ? '<div class="lbl" style="margin:12px 0 6px">Commandes proposées — un tap les envoie dans ton Terminal (tu les lances toi-même)</div>' +
            cmds
              .map(
                (c) =>
                  '<div class="cmd" style="margin-top:6px"><code class="mono">' + esc(c) + '</code>' +
                  '<button class="btn btn-sm copy" data-ai-cmd="' + esc(c) + '">▶ Terminal</button></div>'
              )
              .join('')
          : '';
        box.innerHTML =
          '<div class="card" style="padding:14px"><div class="row" style="gap:8px;margin-bottom:8px"><span class="badge badge-info">🤖 Analyse IA</span></div>' +
          '<div class="small" style="white-space:pre-wrap;line-height:1.55">' + esc(analysis) + '</div>' + cmdBlock + '</div>';
        box.querySelectorAll('[data-ai-cmd]').forEach((b) => {
          b.onclick = () => goTerminalWith(b.dataset.aiCmd);
        });
      } catch (e) {
        box.innerHTML = '<div class="legal" style="margin:0">⚠️<div>' + esc(e.message) + '</div></div>';
      } finally {
        aiBtn.disabled = false;
        aiBtn.textContent = '🤖 Analyse IA des résultats';
      }
    };
  }

  // Coche/décoche : sauvegarde immédiate.
  view.querySelectorAll('[data-check]').forEach((cb) => {
    cb.onchange = async () => {
      const i = Number(cb.dataset.check);
      if (cb.checked) m.checklist[i] = true;
      else delete m.checklist[i];
      await saveMission(m, false);
      renderMissions();
    };
  });

  view.querySelectorAll('[data-del-finding]').forEach((b) => {
    b.onclick = async () => {
      m.findings.splice(Number(b.dataset.delFinding), 1);
      await saveMission(m, false);
      renderMissions();
    };
  });

  document.getElementById('ms-add-finding').onclick = async () => {
    const title = document.getElementById('ms-f-title').value.trim();
    if (!title) return toast('Titre de la faille obligatoire');
    m.findings = m.findings || [];
    m.findings.push({
      title,
      severity: document.getElementById('ms-f-sev').value,
      detail: document.getElementById('ms-f-detail').value,
    });
    collectMissionFields(m);
    await saveMission(m, false);
    renderMissions();
  };

  document.getElementById('ms-copy-auth').onclick = () => {
    navigator.clipboard.writeText(genAuthorization(collectMissionFields(m))).then(
      () => toast('Autorisation copiée'),
      () => toast('Copie impossible')
    );
  };

  document.getElementById('ms-gen-report').onclick = () => {
    const report = genReport(collectMissionFields(m));
    const ta = document.getElementById('ms-report');
    ta.value = report;
    ta.classList.remove('hidden');
    document.getElementById('ms-copy-report').classList.remove('hidden');
  };
  document.getElementById('ms-copy-report').onclick = () => {
    navigator.clipboard.writeText(document.getElementById('ms-report').value).then(
      () => toast('Rapport copié'),
      () => toast('Copie impossible')
    );
  };

  document.getElementById('ms-save').onclick = async () => {
    collectMissionFields(m);
    await saveMission(m, true);
    renderMissions();
  };

  document.getElementById('ms-delete').onclick = async () => {
    if (!confirm('Supprimer la mission « ' + m.client + ' » ?')) return;
    await api('/api/missions/' + m.id, { method: 'DELETE' });
    openMissionId = null;
    toast('Mission supprimée');
    renderMissions();
  };
}

function extractCommands(text) {
  const cmds = [];
  const seen = new Set();
  const tools = 'sudo|nmap|sqlmap|ffuf|gobuster|nuclei|whatweb|nikto|hydra|curl|wget|dig|whois|openssl|dirb|wpscan|feroxbuster|amass|subfinder|httpx|nc|ncat';
  const re = new RegExp('^\\s*\\$?\\s*((?:' + tools + ')\\b.*)$');
  const push = (c) => {
    c = c.replace(/^\s*\$\s*/, '').trim();
    if (c && c.length < 400 && !seen.has(c)) {
      seen.add(c);
      cmds.push(c);
    }
  };
  // Blocs de code ``` … ```
  const fence = /```(?:[a-z]*)\n?([\s\S]*?)```/g;
  let m;
  while ((m = fence.exec(text))) {
    m[1].split(/\r?\n/).forEach((l) => {
      const mm = re.exec(l);
      if (mm) push(mm[1]);
    });
  }
  // Lignes isolées
  text.split(/\r?\n/).forEach((l) => {
    const mm = re.exec(l);
    if (mm) push(mm[1]);
  });
  return cmds.slice(0, 15);
}

async function runMissionScan(m) {
  const btn = document.getElementById('ms-scan');
  const prog = document.getElementById('ms-scan-progress');
  const fill = document.getElementById('ms-scan-fill');
  const pct = document.getElementById('ms-scan-pct');
  const step = document.getElementById('ms-scan-step');
  const resultEl = document.getElementById('ms-scan-result');

  btn.disabled = true;
  prog.classList.remove('hidden');
  resultEl.classList.add('hidden');

  const steps = ['Résolution DNS…', 'Requête HTTPS…', 'Analyse des en-têtes…', 'Vérification du certificat TLS…'];
  let p = 0;
  let si = 0;
  step.textContent = steps[0];
  const timer = setInterval(() => {
    p = Math.min(92, p + 4 + Math.random() * 6);
    fill.style.width = p + '%';
    pct.textContent = Math.round(p) + '%';
    si = Math.min(steps.length - 1, Math.floor((p / 92) * steps.length));
    step.textContent = steps[si];
  }, 220);

  try {
    const data = await api('/api/missions/' + m.id + '/scan', { method: 'POST' });
    clearInterval(timer);
    fill.style.width = '100%';
    pct.textContent = '100%';
    step.textContent = 'Terminé';

    if (data.mission) m.findings = data.mission.findings;

    const order = { critique: 0, elevee: 1, moyenne: 2, faible: 3, info: 4 };
    const sorted = [...data.findings].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
    const counts = {};
    data.findings.forEach((f) => (counts[f.severity] = (counts[f.severity] || 0) + 1));
    const summary = missionsData.severities
      .filter((s) => counts[s.id])
      .map((s) => `<span class="badge badge-${s.tone}">${counts[s.id]} ${esc(s.label.toLowerCase())}</span>`)
      .join(' ');

    resultEl.innerHTML =
      `<div class="spread" style="margin-bottom:10px"><b>Résultat du scan</b><span>${summary || '<span class="badge">RAS</span>'}</span></div>` +
      sorted
        .map(
          (f) => `
        <div class="card" style="padding:12px;margin-bottom:8px">
          <div class="row" style="gap:8px"><span class="badge badge-${severityMeta(f.severity).tone}">${esc(severityMeta(f.severity).label)}</span><b style="font-size:0.92rem">${esc(f.title)}</b></div>
          <div class="small muted" style="margin-top:6px">${esc(f.detail || '')}</div>
          ${f.solution ? `<div class="small" style="margin-top:6px"><span style="color:var(--ok)">✔ Solution :</span> ${esc(f.solution)}</div>` : ''}
        </div>`
        )
        .join('');
    resultEl.classList.remove('hidden');
    toast(data.added ? data.added + ' faille(s) ajoutée(s) au rapport' : 'Scan terminé');
    setTimeout(() => {
      prog.classList.add('hidden');
    }, 800);
  } catch (e) {
    clearInterval(timer);
    prog.classList.add('hidden');
    resultEl.classList.remove('hidden');
    resultEl.innerHTML = `<div class="legal" style="margin:0">⚠️<div>${esc(e.message)}</div></div>`;
  } finally {
    btn.disabled = false;
  }
}

function renderReconSection(m, allChecked) {
  const recon = reconCommands(m);
  if (!allChecked) {
    return `<div class="card" style="margin-bottom:12px">
       <h2>Reconnaissance</h2>
       <p class="small muted" style="margin-top:8px">🔒 Les boutons de test apparaîtront quand toute la checklist ci-dessus sera cochée (autorisation confirmée).</p>
     </div>`;
  }
  if (!recon) {
    return `<div class="card" style="margin-bottom:12px">
       <h2>Reconnaissance</h2>
       <p class="small muted" style="margin-top:8px">Renseigne le domaine de la cible plus haut pour activer les boutons.</p>
     </div>`;
  }
  const copyBtns = (arr) =>
    arr.map((c) => `<button class="btn btn-sm" data-copy-cmd="${esc(c.cmd)}">${esc(c.label)}</button>`).join('');
  return `<div class="card" style="margin-bottom:12px">
     <h2>Scan automatique</h2>
     <p class="tiny muted" style="margin:6px 0 10px">Analyse passive de la cible (en-têtes, HTTPS, cookies, certificat) — requêtes web normales, sans risque. Les failles se remplissent toutes seules ci-dessous.</p>
     <button class="btn btn-primary btn-block" id="ms-scan">▶ Lancer le scan automatique</button>
     <div id="ms-scan-progress" class="hidden" style="margin-top:12px">
       <div class="spread"><span class="small" id="ms-scan-step">Préparation…</span><span class="mono small muted" id="ms-scan-pct">0%</span></div>
       <div class="progress-bar"><div class="progress-fill" id="ms-scan-fill" style="width:0%"></div></div>
     </div>
     <div id="ms-scan-result" class="hidden" style="margin-top:12px"></div>

     <button class="btn btn-block" id="ms-ai" style="margin-top:10px">🤖 Analyse IA des résultats</button>
     <div id="ms-ai-result" class="hidden" style="margin-top:10px"></div>

     <div class="lbl" style="margin:18px 0 6px">Tests actifs — à copier, uniquement depuis une machine autorisée</div>
     <div class="legal" style="margin:0 0 8px;padding:8px 10px;font-size:0.78rem">⚠️<div>nmap / nuclei / ffuf frappent le serveur. Ne les lance PAS depuis ton VPS (coupure possible). Copie et exécute depuis une machine autorisée.</div></div>
     <div class="btn-row">${copyBtns(recon.actives)}</div>
   </div>`;
}

function missionURL(m) {
  let d = (m.domain || '').trim();
  if (!d) return null;
  if (!/^https?:\/\//i.test(d)) d = 'https://' + d;
  return d;
}
function missionHost(m) {
  const u = missionURL(m);
  if (!u) return null;
  try {
    return new URL(u).host;
  } catch (e) {
    return (m.domain || '').replace(/^https?:\/\//i, '').split('/')[0];
  }
}

function reconCommands(m) {
  const url = missionURL(m);
  const host = missionHost(m);
  if (!url || !host) return null;
  return {
    passives: [
      { label: 'En-têtes HTTP', cmd: 'curl -sSI ' + url },
      { label: 'Technologies', cmd: 'whatweb ' + url },
      { label: 'DNS', cmd: 'dig ' + host + ' +short; dig MX ' + host + ' +short' },
      { label: 'WHOIS', cmd: 'whois ' + host },
      { label: 'Certificat TLS', cmd: 'echo | openssl s_client -connect ' + host + ':443 -servername ' + host + ' 2>/dev/null | openssl x509 -noout -subject -issuer -dates' },
    ],
    actives: [
      { label: 'Ports & services (nmap)', cmd: 'nmap -sV ' + host },
      { label: 'Vulns connues (nuclei)', cmd: 'nuclei -u ' + url },
      { label: 'Répertoires (ffuf)', cmd: 'ffuf -u ' + url + '/FUZZ -w /usr/share/seclists/Discovery/Web-Content/common.txt' },
    ],
  };
}

function collectMissionFields(m) {
  const g = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : undefined;
  };
  if (g('ms-d-client') !== undefined) m.client = g('ms-d-client').trim() || m.client;
  if (g('ms-d-discord') !== undefined) m.discord = g('ms-d-discord');
  if (g('ms-d-domain') !== undefined) m.domain = g('ms-d-domain');
  if (g('ms-d-window') !== undefined) m.window = g('ms-d-window');
  if (g('ms-d-scope') !== undefined) m.scope = g('ms-d-scope');
  if (g('ms-d-status') !== undefined) m.status = g('ms-d-status');
  return m;
}

async function saveMission(m, notify) {
  try {
    await api('/api/missions/' + m.id, {
      method: 'PATCH',
      body: JSON.stringify({
        client: m.client,
        discord: m.discord,
        domain: m.domain,
        window: m.window,
        scope: m.scope,
        status: m.status,
        checklist: m.checklist,
        findings: m.findings,
      }),
    });
    if (notify) toast('Mission enregistrée');
  } catch (e) {
    toast(e.message);
  }
}

/* ------------------------------ routeur ------------------------------ */

async function renderTab() {
  teardownTerm();
  try {
    if (currentTab === 'labo') await renderLabo();
    else if (currentTab === 'terminal') renderTerminal();
    else if (currentTab === 'parcours') await renderParcours();
    else if (currentTab === 'outils') await renderOutils();
    else if (currentTab === 'missions') await renderMissions();
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

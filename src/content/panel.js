/* Video Boost — the panel.
 * Two modes, one shadow-DOM shell:
 *   edit   → studio.youtube.com/video/<id>/edit : Chat · Vidéo · Réglages (+ header button "Mes vidéos")
 *   global → rest of Studio and www.youtube.com  : Vidéos · Chat · Réglages (channel stats, what works, watched video)
 * Nothing is written to Studio without a click from the user, and nothing is ever saved on their behalf. */
(function () {
  if (window.__videoBoost) return;
  window.__videoBoost = true;

  const S = window.VBStudio;
  const YT = window.VBYouTube;
  const AI = window.VBAI;
  const T = window.VBTools;
  const PROVIDERS = window.VB_PROVIDERS;
  const ON_STUDIO = location.hostname === 'studio.youtube.com';

  /* ---------- Icons (Lucide paths) ---------- */
  const ICONS = {
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4V8z"/>',
    list: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><path d="M14 4h7"/><path d="M14 9h7"/><path d="M14 15h7"/><path d="M14 20h7"/>',
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    flask: '<path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="M5.52 16h12.96"/>'
  };
  const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => (n == null ? '—' : new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
  function ago(date) {
    const t = Date.parse(date);
    if (!t) return String(date || '');
    const days = Math.round((t - Date.now()) / 864e5);
    const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
    return Math.abs(days) < 30 ? rtf.format(days, 'day') : Math.abs(days) < 365 ? rtf.format(Math.round(days / 30), 'month') : rtf.format(Math.round(days / 365), 'year');
  }
  const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

  // Tiny, escape-first markdown: paragraphs, bullet lists, **bold**, `code`.
  function md(src) {
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const out = [];
    let list = null;
    for (const line of String(src).split('\n')) {
      const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
      if (li) { (list ||= []).push(`<li>${inline(li[1])}</li>`); continue; }
      if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
      if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
    if (list) out.push(`<ul>${list.join('')}</ul>`);
    return out.join('');
  }

  /* ---------- State ---------- */
  const TABS = {
    edit: [['chat', 'chat', 'Chat'], ['video', 'video', 'Vidéo'], ['settings', 'sliders', 'Réglages']],
    global: [['videos', 'list', 'Vidéos'], ['chat', 'chat', 'Chat'], ['settings', 'sliders', 'Réglages']]
  };
  const QUICK = {
    edit: [['all', 'Tout optimiser', true], ['tags', 'Tags'], ['titles', 'Titres'], ['description', 'Description'], ['hashtags', 'Hashtags'], ['category', 'Catégorie'],
      ['pinned', 'Commentaire épinglé'], ['thumb', 'Texte miniature'], ['hook', 'Hooks'], ['chapters', 'Chapitres'], ['translate', 'Traduire'], ['shorts', 'Idées de Shorts'], ['works', 'Ma chaîne']],
    global: [['works', 'Qu’est-ce qui marche ?', true], ['ideas', 'Idées de vidéos'], ['when', 'Quand publier ?']],
    watched: [['analyze', 'Analyser cette vidéo', true], ['steal', 'Tags pour moi']]
  };

  const state = {
    mode: null,        // 'edit' | 'global'
    surfaceKey: '',
    open: false,
    view: 'chat',
    settings: { ...window.VB_DEFAULT_SETTINGS },
    videoId: null,
    watchedId: null,
    watched: null,     // public video info on www.youtube.com
    channel: null,     // { channel, videos, source, at }
    history: [],
    ui: {},
    stream: null,
    lastVideoSnap: '',
    models: [],
    tester: null,      // title tester run
    testerCtrl: null
  };

  /* ---------- Mount ---------- */
  const host = document.createElement('div');
  host.id = 'video-boost-root';
  host.hidden = true;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <link rel="stylesheet" href="${chrome.runtime.getURL('src/content/panel.css')}">
    <button class="launcher" data-action="open" title="Video Boost (Alt+B)" hidden>${icon('zap')}<span>Boost</span></button>
    <aside class="panel" role="complementary" aria-label="Video Boost" hidden>
      <div class="head">
        <div class="brand"><span class="mark">${icon('zap')}</span>Video Boost</div>
        <span class="model" data-ref="model"></span>
        <button class="icon-btn" data-action="my-videos" data-ref="videosBtn" title="Mes vidéos" aria-label="Mes vidéos">${icon('list')}</button>
        <button class="icon-btn" data-action="close" title="Fermer (Alt+B)" aria-label="Fermer">${icon('x')}</button>
      </div>
      <div class="tabs" role="tablist" data-ref="tabs"></div>
      <section class="view" data-view="chat" hidden>
        <div class="scroll" data-ref="chatScroll"><div class="msgs" data-ref="msgs"></div></div>
        <div class="composer-wrap">
          <div class="quick" data-ref="quick"></div>
          <form class="composer" data-ref="composer">
            <textarea rows="1" data-ref="input" placeholder="Demande un titre, des tags, une stat…"></textarea>
            <button class="btn primary" type="submit" data-ref="sendBtn" aria-label="Envoyer">${icon('send')}</button>
          </form>
        </div>
      </section>
      <section class="view" data-view="video" hidden><div class="scroll" data-ref="videoBody"></div></section>
      <section class="view" data-view="videos" hidden><div class="scroll" data-ref="videosBody"></div></section>
      <section class="view" data-view="settings" hidden><div class="scroll" data-ref="settingsBody"></div></section>
      <div data-ref="toastSlot"></div>
    </aside>`;
  (document.body || document.documentElement).appendChild(host);

  const ref = n => root.querySelector(`[data-ref="${n}"]`);
  const panel = root.querySelector('.panel');
  const launcher = root.querySelector('.launcher');

  let toastTimer;
  function toast(msg, isErr = false) {
    clearTimeout(toastTimer);
    ref('toastSlot').innerHTML = `<div class="toast${isErr ? ' err' : ''}" role="status">${esc(msg)}</div>`;
    toastTimer = setTimeout(() => (ref('toastSlot').innerHTML = ''), isErr ? 4500 : 2600);
  }
  const copy = t => navigator.clipboard.writeText(t).then(() => toast('Copié'), () => toast('Copie impossible', true));

  /* ---------- Storage ---------- */
  const withDefaults = s => ({ ...window.VB_DEFAULT_SETTINGS, ...(s || {}), prefs: { ...window.VB_DEFAULT_SETTINGS.prefs, ...(s?.prefs || {}) } });

  async function loadSettings() {
    const { settings } = await chrome.storage.local.get('settings');
    state.settings = withDefaults(settings);
  }
  let saveTimer;
  function saveSettings() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => chrome.storage.local.set({ settings: state.settings }), 250);
    renderModelLabel();
  }
  const chatKey = () => (state.mode === 'edit' ? `chat:${state.videoId}` : 'chat:global');
  async function loadHistory() {
    const key = chatKey();
    const data = await chrome.storage.local.get(key);
    state.history = data[key] || [];
    state.ui = {};
  }
  function saveHistory() {
    chrome.storage.local.set({ [chatKey()]: state.history.slice(-40) });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings?.newValue) {
      state.settings = withDefaults(changes.settings.newValue);
      renderModelLabel();
    }
  });

  /* ---------- Channel data ---------- */
  // Studio's "Contenu" table when visible (views, comments, likes), else the public feed (15 latest, views).
  async function loadChannel(force) {
    if (ON_STUDIO) {
      const rows = S.readContentRows();
      if (rows.length) {
        state.channel = { channel: state.channel?.channel || '', videos: rows, source: 'Studio · page Contenu', at: Date.now() };
        chrome.storage.local.set({ channelCache: state.channel });
        return state.channel;
      }
    }
    if (!force) {
      const { channelCache } = await chrome.storage.local.get('channelCache');
      if (channelCache && Date.now() - channelCache.at < 10 * 60e3) return (state.channel = channelCache);
    }
    const id = state.settings.channelId;
    if (!id) return (state.channel = null);
    const res = await chrome.runtime.sendMessage({ type: 'channel', channelId: id });
    if (!res?.ok) throw new Error(res?.error || 'Chaîne illisible.');
    state.channel = { channel: res.channel, videos: res.videos, source: `flux public · ${res.videos.length} dernières`, at: Date.now() };
    chrome.storage.local.set({ channelCache: state.channel });
    return state.channel;
  }

  /* ---------- Shell ---------- */
  function currentModel() {
    const id = state.settings.provider;
    return state.settings.models?.[id] || PROVIDERS[id]?.model || '';
  }
  function renderModelLabel() {
    const id = state.settings.provider;
    ref('model').textContent = state.settings.keys?.[id] ? `${PROVIDERS[id]?.label} · ${currentModel()}` : 'Aucune clé API';
  }

  async function setOpen(open) {
    state.open = open;
    chrome.storage.local.set({ [`open:${state.mode}`]: open });
    applyVisibility();
    if (open) switchView(state.view);
  }

  function applyVisibility() {
    const hiddenOnYt = !ON_STUDIO && !state.settings.showOnYoutube;
    host.hidden = !state.mode || hiddenOnYt;
    panel.hidden = !state.open;
    launcher.hidden = state.open;
    ref('videosBtn').hidden = state.mode !== 'edit';
  }

  function renderTabs() {
    const tabs = TABS[state.mode] || [];
    const bar = ref('tabs');
    // Rebuild only when the mode changes, so the indicator keeps its glide between tabs.
    if (bar.dataset.mode !== state.mode) {
      bar.dataset.mode = state.mode;
      bar.innerHTML = '<span class="tab-ind"></span>' +
        tabs.map(([id, ic, label]) => `<button class="tab" role="tab" data-tab="${id}">${icon(ic)}${label}</button>`).join('');
    }
    const idx = tabs.findIndex(t => t[0] === state.view);
    bar.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === state.view)));
    const ind = bar.querySelector('.tab-ind');
    ind.style.transform = `translateX(${Math.max(0, idx) * 100}%)`;
    ind.style.opacity = idx < 0 ? '0' : '1';
  }

  function renderQuick() {
    const list = state.mode === 'edit' ? QUICK.edit : [...(state.watchedId ? QUICK.watched : []), ...QUICK.global];
    ref('quick').innerHTML = list.map(([k, label, main]) => `<button class="chip" data-quick="${k}">${main ? icon('zap') : ''}${label}</button>`).join('');
  }

  function switchView(view) {
    state.view = view;
    renderTabs();
    ref('videosBtn').setAttribute('aria-pressed', String(view === 'videos'));
    root.querySelectorAll('.view').forEach(v => (v.hidden = v.dataset.view !== view));
    if (view === 'chat') { renderQuick(); renderChat(); ref('input').focus(); }
    if (view === 'video') renderVideo(true);
    if (view === 'videos') renderVideos();
    if (view === 'settings') renderSettings();
  }

  /* ---------- Chat ---------- */
  function renderChat() {
    const box = ref('msgs');
    if (!state.history.length && !state.stream) {
      const noKey = !state.settings.keys?.[state.settings.provider];
      const edit = state.mode === 'edit';
      const title = edit ? `Booste cette ${S.read().isShort ? 'Short' : 'vidéo'}` : state.watched ? 'Analyse cette vidéo' : 'Ton coach YouTube';
      const text = edit
        ? 'L’IA lit le titre, la description, les tags, vidIQ et tes stats, puis propose. Tu valides d’un clic.'
        : 'Pose une question sur ta chaîne : ce qui marche, quoi publier, quand. Les chiffres viennent de tes vidéos.';
      const cta = edit ? ['all', 'Tout optimiser'] : state.watched ? ['analyze', 'Analyser cette vidéo'] : ['works', 'Qu’est-ce qui marche ?'];
      box.innerHTML = `<div class="empty"><h3>${esc(title)}</h3>
        <p>${noKey ? 'Connecte d’abord une IA dans Réglages.' : text}</p>
        ${noKey
          ? `<button class="btn primary" data-action="goto-settings">${icon('sliders')}Connecter une IA</button>`
          : `<button class="btn primary" data-quick="${cta[0]}">${icon('zap')}${cta[1]}</button>`}</div>`;
      return;
    }
    box.innerHTML = state.history.map((m, i) => renderMsg(m, i)).join('') + (state.stream ? `<div class="msg ai" data-ref="live"></div>` : '');
    if (state.stream) renderLive();
    scrollChat();
  }

  function renderMsg(m, i) {
    if (m.role === 'user') return `<div class="msg user">${esc(m.content)}</div>`;
    if (m.role === 'error') return `<div class="msg err">${esc(m.content)}</div>`;
    const { prose, proposal } = AI.parse(m.content);
    return `<div class="msg ai" data-idx="${i}"><div class="prose">${md(prose)}</div>${proposal ? renderProposal(proposal, i) : ''}</div>`;
  }

  function renderLive() {
    const el = ref('live');
    if (!el || !state.stream) return;
    const { prose, pending } = AI.parse(state.stream.raw);
    el.innerHTML = prose
      ? `<div class="prose">${md(prose)}</div>${pending ? `<div class="preparing"><span class="typing"><i></i><i></i><i></i></span> Préparation des propositions…</div>` : ''}`
      : '<span class="typing"><i></i><i></i><i></i></span>';
  }

  const scrollChat = () => { const s = ref('chatScroll'); s.scrollTop = s.scrollHeight; };
  const uiFor = i => (state.ui[i] ||= { applied: new Set(), tags: null, expanded: false });

  // Default tag selection: every new tag that still fits in the 500-char budget, in the model's order.
  function tagPlan(p, i, existing) {
    const u = uiFor(i);
    const have = new Set(existing.map(t => t.toLowerCase()));
    const fresh = p.tags.filter(t => !have.has(t.toLowerCase()));
    if (!u.tags) {
      u.tags = new Set();
      for (const t of fresh) if (S.tagsLength([...existing, ...u.tags, t]) <= S.LIMITS.tags) u.tags.add(t);
    }
    const chosen = fresh.filter(t => u.tags.has(t));
    return { fresh, chosen, total: S.tagsLength([...existing, ...chosen]), already: p.tags.length - fresh.length };
  }

  function renderProposal(p, i) {
    const u = uiFor(i);
    const can = state.mode === 'edit';       // outside the edit page, proposals are copy-only
    const existing = can ? S.read().tags || [] : [];
    const doneBtn = label => `<button class="btn sm done" disabled>${icon('check')}${label}</button>`;
    const parts = [];

    if (p.titles.length) {
      parts.push(`<div class="sect"><div class="label">Titres</div>${p.titles.map((t, k) => {
        const n = t.length;
        const action = !can ? `<button class="btn sm ghost" data-action="copy-text" data-text="${esc(t)}" aria-label="Copier">${icon('copy')}</button>`
          : u.applied.has(`title:${k}`) ? doneBtn('') : `<button class="btn sm" data-apply="title" data-i="${i}" data-k="${k}">Appliquer</button>`;
        return `<div class="opt"><span class="t">${esc(t)}</span><span class="count ${n > 100 ? 'over' : n > 70 ? 'warn' : ''}">${n}</span>${action}</div>`;
      }).join('')}</div>`);
    }

    if (p.description) {
      parts.push(`<div class="sect"><div class="label">Description <span class="count">${p.description.length}/5000</span></div>
        <div class="box ${u.expanded ? '' : 'clamp'}">${esc(p.description)}</div>
        <div class="row end" style="margin-top:8px">
          <button class="btn sm ghost" data-action="expand" data-i="${i}">${u.expanded ? 'Réduire' : 'Tout voir'}</button>
          <button class="btn sm ghost" data-action="copy-desc" data-i="${i}" aria-label="Copier">${icon('copy')}</button>
          ${!can ? '' : u.applied.has('description') ? doneBtn('Remplacée') : `<button class="btn sm" data-apply="description" data-i="${i}">Remplacer</button>`}
        </div></div>`);
    }

    if (p.tags.length) {
      const plan = tagPlan(p, i, existing);
      const over = plan.total > S.LIMITS.tags;
      parts.push(`<div class="sect"><div class="label">Tags <span class="count ${over ? 'over' : ''}">${plan.total}/500</span></div>
        <div class="chips">${plan.fresh.map(t => {
          const on = u.tags.has(t);
          const fits = on || S.tagsLength([...existing, ...plan.chosen, t]) <= S.LIMITS.tags;
          return `<button class="chip ${fits ? '' : 'nofit'}" aria-pressed="${on}" data-tag="${esc(t)}" data-i="${i}" title="${fits ? 'Cliquer pour (dé)sélectionner' : 'Dépasse la limite de 500 caractères'}">${esc(t)}</button>`;
        }).join('') || '<span class="muted">Tous ces tags sont déjà sur la vidéo.</span>'}</div>
        <div class="meter ${over ? 'over' : ''}"><i style="transform:scaleX(${Math.min(1, plan.total / 500)})"></i></div>
        <div class="row" style="margin-top:10px">
          <span class="muted" style="font-size:12px">${plan.already ? `${plan.already} déjà présent${plan.already > 1 ? 's' : ''}` : ''}</span>
          <span class="spacer"></span>
          ${plan.fresh.length ? `<button class="btn sm ghost" data-action="tags-toggle-all" data-i="${i}">${plan.chosen.length === plan.fresh.length ? 'Aucun' : 'Tous'}</button>` : ''}
          ${!can ? `<button class="btn sm primary" data-action="copy-tags" data-i="${i}" ${plan.chosen.length ? '' : 'disabled'}>${icon('copy')}Copier ${plan.chosen.length}</button>`
            : u.applied.has('tags') ? doneBtn('Ajoutés') : `<button class="btn sm primary" data-apply="tags" data-i="${i}" ${plan.chosen.length && !over ? '' : 'disabled'}>${icon('plus')}Ajouter ${plan.chosen.length}</button>`}
        </div></div>`);
    }

    if (p.hashtags.length) {
      parts.push(`<div class="sect"><div class="label">Hashtags</div>
        <div class="chips">${p.hashtags.map(h => `<span class="chip static">${esc(h)}</span>`).join('')}</div>
        <div class="row end" style="margin-top:10px">
          <button class="btn sm ghost" data-action="copy-hash" data-i="${i}" aria-label="Copier">${icon('copy')}</button>
          ${!can ? '' : u.applied.has('hashtags') ? doneBtn('Ajoutés') : `<button class="btn sm" data-apply="hashtags" data-i="${i}">Ajouter à la description</button>`}
        </div></div>`);
    }

    if (p.category) {
      const ci = S.categoryIndex(p.category);
      parts.push(`<div class="sect row"><span class="label" style="margin:0">Catégorie</span><span>${esc(ci >= 0 ? S.CATEGORIES[ci][0] : p.category)}</span><span class="spacer"></span>
        ${!can || ci < 0 ? '' : u.applied.has('category') ? doneBtn('') : `<button class="btn sm" data-apply="category" data-i="${i}">Appliquer</button>`}</div>`);
    }

    const kinds = [p.titles.length, p.description, p.tags.length, p.hashtags.length].filter(Boolean).length;
    const allDone = ['description', 'tags', 'hashtags'].every(k => !p[k].length || u.applied.has(k)) && (!p.titles.length || [...u.applied].some(k => k.startsWith('title')));
    return `<div class="card">
      <div class="card-head">${icon('zap')}Propositions<span class="spacer"></span>
        ${can && kinds > 1 ? (allDone ? `<span class="badge on">${icon('check')}Appliqué</span>` : `<button class="btn sm primary" data-apply="all" data-i="${i}">Tout appliquer</button>`) : ''}
      </div>${parts.join('')}</div>`;
  }

  const proposalAt = i => (state.history[i] ? AI.parse(state.history[i].content).proposal : null);

  async function apply(kind, i, k) {
    const p = proposalAt(i);
    if (!p || state.mode !== 'edit') return;
    const u = uiFor(i);
    try {
      if (kind === 'title') {
        S.setTitle(p.titles[k]);
        [...u.applied].filter(x => x.startsWith('title:')).forEach(x => u.applied.delete(x));
        u.applied.add(`title:${k}`);
        toast('Titre appliqué · pense à Enregistrer');
      } else if (kind === 'description') {
        S.setDescription(p.description);
        u.applied.add('description');
        toast('Description remplacée · pense à Enregistrer');
      } else if (kind === 'hashtags') {
        const n = S.appendHashtags(p.hashtags);
        u.applied.add('hashtags');
        toast(n ? `${n} hashtag${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}` : 'Hashtags déjà présents');
      } else if (kind === 'category') {
        await S.setCategory(S.categoryIndex(p.category));
        u.applied.add('category');
        toast('Catégorie appliquée · pense à Enregistrer');
      } else if (kind === 'tags') {
        await S.ensureTagsVisible();
        const plan = tagPlan(p, i, S.read().tags || []);
        const { added, skipped } = await S.addTags(plan.chosen);
        u.applied.add('tags');
        toast(`${added.length} tag${added.length > 1 ? 's' : ''} ajouté${added.length > 1 ? 's' : ''}${skipped.length ? ` · ${skipped.length} hors limite` : ''} · pense à Enregistrer`);
      } else if (kind === 'all') {
        // Description first, then hashtags appended to it, then title and tags.
        if (p.description && !u.applied.has('description')) { S.setDescription(p.description); u.applied.add('description'); }
        if (p.hashtags.length && !u.applied.has('hashtags')) { S.appendHashtags(p.hashtags); u.applied.add('hashtags'); }
        if (p.titles.length && ![...u.applied].some(x => x.startsWith('title:'))) { S.setTitle(p.titles[0]); u.applied.add('title:0'); }
        if (p.tags.length && !u.applied.has('tags')) {
          await S.ensureTagsVisible();
          await S.addTags(tagPlan(p, i, S.read().tags || []).chosen);
          u.applied.add('tags');
        }
        toast('Tout est appliqué · pense à Enregistrer');
      }
    } catch (e) {
      toast(e.message || String(e), true);
    }
    rerenderMsg(i);
  }

  function rerenderMsg(i) {
    const el = root.querySelector(`.msg.ai[data-idx="${i}"]`);
    if (el) el.outerHTML = renderMsg(state.history[i], i);
  }

  async function systemMessage() {
    const channel = await loadChannel(false).catch(() => state.channel);
    if (state.mode === 'edit') return AI.systemPrompt(S.read(), state.settings, channel);
    if (state.watchedId && !state.watched) state.watched = await YT.readWatched().catch(() => null);
    return AI.channelPrompt(channel, state.watched, state.settings);
  }

  async function send(text) {
    text = text.trim();
    if (!text || state.stream) return;
    if (!state.settings.keys?.[state.settings.provider]) {
      toast('Ajoute une clé API dans Réglages', true);
      switchView('settings');
      return;
    }
    if (state.view !== 'chat') switchView('chat');
    state.history.push({ role: 'user', content: text });
    const port = chrome.runtime.connect({ name: 'vb-chat' });
    state.stream = { port, raw: '' };
    setStreaming(true);
    renderChat();

    let raf = 0;
    const finish = errMsg => {
      if (!state.stream || state.stream.port !== port) return;
      const raw = state.stream.raw;
      state.stream = null;
      try { port.disconnect(); } catch { /* already closed */ }
      if (raw.trim()) state.history.push({ role: 'assistant', content: raw });
      if (errMsg) state.history.push({ role: 'error', content: errMsg });
      saveHistory();
      setStreaming(false);
      renderChat();
    };
    port.onMessage.addListener(msg => {
      if (msg.type === 'delta' && state.stream?.port === port) {
        state.stream.raw += msg.text;
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderLive(); scrollChat(); });
      } else if (msg.type === 'done') finish();
      else if (msg.type === 'error') finish(msg.message);
    });
    port.onDisconnect.addListener(() => finish(state.stream && !state.stream.raw ? 'Connexion interrompue.' : undefined));

    const convo = state.history.filter(m => m.role !== 'error').slice(-12);
    port.postMessage({ type: 'chat', messages: [{ role: 'system', content: await systemMessage() }, ...convo] });
  }

  function stop() {
    if (!state.stream) return;
    const { port, raw } = state.stream;
    state.stream = null;
    port.disconnect(); // aborts the fetch in the service worker
    if (raw.trim()) state.history.push({ role: 'assistant', content: raw });
    saveHistory();
    setStreaming(false);
    renderChat();
  }

  function setStreaming(on) {
    const b = ref('sendBtn');
    b.innerHTML = icon(on ? 'stop' : 'send');
    b.setAttribute('aria-label', on ? 'Arrêter' : 'Envoyer');
  }

  /* ---------- Vidéo (edit page) ---------- */
  function checklist(ctx) {
    const t = ctx.title, d = ctx.description, tags = ctx.tags;
    const words = (t.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []);
    const head = d.slice(0, 150).toLowerCase();
    const hashtags = d.match(/#[\p{L}\p{N}_]+/gu) || [];
    const items = [
      [t.length >= 20 && t.length <= 70, `Titre entre 20 et 70 caractères (${t.length})`],
      [words.some(w => head.includes(w)), 'Un mot-clé du titre dans les 150 premiers caractères de la description'],
      [d.length >= 250, `Description d’au moins 250 caractères (${d.length})`],
      [hashtags.length >= 3 && hashtags.length <= 5, `3 à 5 hashtags (${hashtags.length})`]
    ];
    if (tags) {
      items.push([tags.length >= 8, `Au moins 8 tags (${tags.length})`]);
      items.push([S.tagsLength(tags) >= 200, `Budget tags utilisé ≥ 200/500 (${S.tagsLength(tags)})`]);
    }
    if (ctx.isShort) items.push([/#shorts\b/i.test(d + ' ' + t), '#shorts présent']);
    return items;
  }

  const seg = (name, val, a = 'Oui', b = 'Non') =>
    `<div class="seg"><button data-param="${name}" data-val="1" aria-pressed="${val === true}">${a}</button><button data-param="${name}" data-val="0" aria-pressed="${val === false}">${b}</button></div>`;

  function renderParams(pm) {
    const prefs = state.settings.prefs;
    const cat = pm.categoryIndex;
    return `<div class="field">
      <div class="label">Paramètres <button class="btn sm" data-action="apply-prefs" title="Applique les préférences de Réglages">Appliquer mes préférences</button></div>
      <div class="params">
        <label class="param"><span>Catégorie</span>
          <select class="input sm" data-ref="catSelect">
            ${cat < 0 ? `<option value="-1" selected>${esc(pm.category || '—')}</option>` : ''}
            ${S.CATEGORIES.map((c, k) => `<option value="${k}" ${k === cat ? 'selected' : ''}>${esc(c[0])}</option>`).join('')}
          </select></label>
        <div class="param"><span>Conçue pour les enfants</span>${seg('kids', pm.madeForKids)}</div>
        <div class="param"><span>Promotion payée</span>${seg('promo', pm.paidPromo)}</div>
        <div class="param"><span>Contenu modifié / IA</span>${seg('altered', pm.altered)}</div>
      </div>
      <div class="help">Préférences : enfants ${prefs.madeForKids ? 'oui' : 'non'} · promo ${prefs.paidPromo ? 'oui' : 'non'} · IA ${prefs.altered ? 'oui' : 'non'}${prefs.category >= 0 ? ` · ${esc(S.CATEGORIES[prefs.category][0])}` : ''}. Un choix vide = réglage non trouvé sur la page.</div>
    </div>`;
  }

  function renderTester(ctx) {
    const r = state.tester;
    const vid = ctx.vidiq.detected;
    const row = (x, best) => `<div class="opt ${best ? 'best' : ''}"><span class="score ${x.score >= 80 ? 'hi' : x.score >= 50 ? 'mid' : ''}">${x.score ?? '—'}</span>
      <span class="t">${esc(x.title)}</span>${r?.done && !x.original ? `<button class="btn sm ghost" data-action="tester-apply" data-text="${esc(x.title)}">Appliquer</button>` : ''}</div>`;
    return `<div class="field" data-ref="tester">
      <div class="label">Testeur de titres <span class="count">${vid ? 'score vidIQ' : 'score local'}</span></div>
      <div class="help" style="margin:0 0 8px">${vid
        ? 'Chaque titre est tapé dans Studio, vidIQ le note, et ça continue jusqu’à 100 ou mieux que l’actuel.'
        : 'vidIQ non détecté : les titres sont notés par un score local (longueur, mot-clé, chiffre, accroche).'}</div>
      ${r ? `<div class="tester">
          <div class="row" style="margin-bottom:6px"><span class="muted" style="font-size:12px;flex:1">${esc(r.status)}</span>
            ${r.done ? '' : `<button class="btn sm" data-action="tester-stop">${icon('stop')}Arrêter</button>`}</div>
          ${row({ title: r.original, score: r.current.score, original: true }, false).replace('<span class="t">', '<span class="t"><span class="muted">Actuel · </span>')}
          ${[...r.tried].sort((a, b) => b.score - a.score).map(x => row(x, x.title === r.best.title && !r.best.original)).join('')}
        </div>` : ''}
      ${!r || r.done ? `<button class="btn ${r ? '' : 'primary'}" style="width:100%;margin-top:8px" data-action="tester-start">${icon('flask')}${r ? 'Relancer le test' : 'Tester les meilleurs titres'}</button>` : ''}
    </div>`;
  }

  function renderVideo(force) {
    const ctx = S.read();
    const pm = S.readParams();
    const snap = JSON.stringify([ctx.title, ctx.description, ctx.tags, ctx.vidiq.detected, ctx.isShort, pm]);
    if (!force && snap === state.lastVideoSnap) return;
    state.lastVideoSnap = snap;
    const body = ref('videoBody');
    const scrollTop = body.scrollTop;
    const tagLen = ctx.tags ? S.tagsLength(ctx.tags) : 0;
    const counter = (n, max) => `<span class="count ${n > max ? 'over' : n > max * 0.9 ? 'warn' : ''}">${n}/${max}</span>`;
    const checks = checklist(ctx);
    const score = checks.filter(c => c[0]).length;

    body.innerHTML = `
      <div class="row wrap" style="margin-bottom:16px">
        <span class="badge">${ctx.isShort ? 'Short' : 'Vidéo'}</span>
        ${pm.category ? `<span class="badge">${esc(pm.category)}</span>` : ''}
        <span class="badge ${ctx.vidiq.detected ? 'on' : ''}" title="${ctx.vidiq.detected ? 'Les données vidIQ de la page sont envoyées à l’IA' : 'Extension vidIQ non détectée sur cette page'}"><span class="dot"></span>vidIQ</span>
        <span class="spacer"></span>
        <button class="icon-btn" data-action="refresh" title="Relire la page" aria-label="Relire">${icon('refresh')}</button>
      </div>

      <div class="field">
        <div class="label">Titre ${counter(ctx.title.length, 100)}</div>
        <div class="box">${esc(ctx.title) || '<span class="muted">Vide</span>'}</div>
      </div>

      ${renderTester(ctx)}

      <div class="field">
        <div class="label">Description ${counter(ctx.description.length, 5000)}</div>
        <div class="box ${state.descOpen ? '' : 'clamp'}">${esc(ctx.description) || '<span class="muted">Vide</span>'}</div>
        <div class="row end" style="margin-top:6px">
          ${ctx.description.length > 300 ? `<button class="btn sm ghost" data-action="desc-toggle">${state.descOpen ? 'Réduire' : 'Tout voir'}</button>` : ''}
          <button class="btn sm ghost" data-action="copy" data-what="description">${icon('copy')}Copier</button>
        </div>
      </div>

      <div class="field">
        <div class="label">Tags ${ctx.tags ? counter(tagLen, 500) : ''}</div>
        ${ctx.tags
          ? `${ctx.tags.length ? `<div class="chips">${ctx.tags.map(t => `<span class="chip static">${esc(t)}<button class="x" data-remove-tag="${esc(t)}" aria-label="Retirer ${esc(t)}">${icon('x')}</button></span>`).join('')}</div>` : '<div class="box muted">Aucun tag</div>'}
             <div class="meter ${tagLen > 500 ? 'over' : ''}"><i style="transform:scaleX(${Math.min(1, tagLen / 500)})"></i></div>
             <div class="row end" style="margin-top:6px"><button class="btn sm ghost" data-action="copy" data-what="tags" ${ctx.tags.length ? '' : 'disabled'}>${icon('copy')}Copier</button>
             <button class="btn sm" data-quick="tags">${icon('zap')}Proposer des tags</button></div>`
          : `<button class="btn sm" data-action="show-tags">${icon('eye')}Afficher les tags</button>`}
      </div>

      ${renderParams(pm)}

      <div class="field">
        <div class="label">Checklist SEO <span class="count">${score}/${checks.length}</span></div>
        <div class="checks">${checks.map(([ok, label]) => `<div class="check ${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'alert')}<span>${esc(label)}</span></div>`).join('')}</div>
      </div>

      <button class="btn primary" style="width:100%" data-quick="all">${icon('zap')}Optimiser avec l’IA</button>`;
    body.scrollTop = scrollTop;
  }

  async function setParam(name, yes) {
    try {
      if (name === 'kids') S.setMadeForKids(yes);
      if (name === 'promo') await S.setPaidPromo(yes);
      if (name === 'altered') await S.setAltered(yes);
      toast('Paramètre modifié · pense à Enregistrer');
    } catch (e) { toast(e.message, true); }
    setTimeout(() => renderVideo(true), 250);
  }

  async function applyPrefs() {
    const p = state.settings.prefs;
    const errors = [];
    const step = async fn => { try { await fn(); } catch (e) { errors.push(e.message); } };
    await step(() => S.setMadeForKids(p.madeForKids));
    await step(() => S.setPaidPromo(p.paidPromo));
    await step(() => S.setAltered(p.altered));
    if (p.category >= 0) await step(() => S.setCategory(p.category));
    toast(errors.length ? errors[0] : 'Préférences appliquées · pense à Enregistrer', !!errors.length);
    setTimeout(() => renderVideo(true), 300);
  }

  async function startTester() {
    if (!state.settings.keys?.[state.settings.provider]) { toast('Ajoute une clé API dans Réglages', true); return switchView('settings'); }
    state.testerCtrl = new AbortController();
    const channel = await loadChannel(false).catch(() => null);
    await T.titleTester({
      settings: state.settings,
      channel,
      signal: state.testerCtrl.signal,
      onUpdate: run => {
        state.tester = run;
        const slot = ref('tester');
        if (slot && state.view === 'video') slot.outerHTML = renderTester(S.read());
      }
    });
    state.testerCtrl = null;
    if (state.view === 'video') renderVideo(true);
  }

  /* ---------- Vidéos (channel list, stats, video picker) ---------- */
  function parseVideoId(input) {
    const s = String(input || '').trim();
    return s.match(/(?:v=|youtu\.be\/|shorts\/|\/video\/|live\/)([\w-]{11})/)?.[1] || (/^[\w-]{11}$/.test(s) ? s : null);
  }

  function openVideo(id) {
    const url = `https://studio.youtube.com/video/${id}/edit`;
    if (ON_STUDIO) location.href = url;
    else window.open(url, '_blank', 'noopener');
  }

  function renderWatched() {
    if (!state.watchedId) return '';
    const w = state.watched;
    if (!w) return `<div class="field"><div class="label">Cette vidéo</div><div class="box muted">Lecture…</div></div>`;
    return `<div class="field">
      <div class="label">Cette vidéo <span class="count">${fmt(w.views)} vues</span></div>
      <div class="box" style="white-space:normal"><b style="font-weight:500">${esc(w.title)}</b><div class="muted" style="font-size:12px;margin-top:2px">${esc(w.channel)} · ${esc(w.category)} · ${esc(ago(w.published))}</div></div>
      <div class="label" style="margin-top:12px">Tags cachés <span class="count">${w.tags.length}</span></div>
      ${w.tags.length ? `<div class="chips">${w.tags.map(t => `<span class="chip static">${esc(t)}</span>`).join('')}</div>` : '<div class="box muted">Aucun tag</div>'}
      <div class="row end" style="margin-top:8px">
        <button class="btn sm ghost" data-action="copy-watched-tags" ${w.tags.length ? '' : 'disabled'}>${icon('copy')}Copier</button>
        <button class="btn sm primary" data-quick="analyze">${icon('zap')}Analyser</button>
      </div></div>`;
  }

  async function renderVideos(force) {
    const body = ref('videosBody');
    const head = `
      <form class="row" data-ref="pickForm" style="margin-bottom:16px">
        <input class="input" data-ref="pickInput" placeholder="Lien ou ID d’une vidéo à ouvrir" spellcheck="false">
        <button class="btn" type="submit">${icon('arrow')}Ouvrir</button>
      </form>`;
    body.innerHTML = head + renderWatched() + `<div data-ref="channelSlot"><div class="box muted">Chargement de la chaîne…</div></div>`;
    if (state.watchedId && !state.watched) {
      YT.readWatched().then(w => { state.watched = w; if (state.view === 'videos') renderVideos(); }, () => {});
    }
    let ch = null, err = '';
    try { ch = await loadChannel(force); } catch (e) { err = e.message; }
    const slot = ref('channelSlot');
    if (!slot) return;
    if (!ch?.videos?.length) {
      slot.innerHTML = `<div class="empty"><h3>Aucune vidéo chargée</h3>
        <p>${esc(err || 'Ouvre une page de ta chaîne dans YouTube Studio (tableau de bord ou Contenu) ou colle ton ID de chaîne dans Réglages.')}</p>
        <button class="btn" data-action="goto-settings">${icon('sliders')}Réglages</button></div>`;
      return;
    }
    const views = ch.videos.map(v => v.views || 0);
    const med = median(views) || 1;
    const max = Math.max(...views, 1);
    const top = ch.videos.reduce((a, b) => ((b.views || 0) > (a.views || 0) ? b : a));
    const shorts = ch.videos.filter(v => v.isShort), longs = ch.videos.filter(v => !v.isShort);
    const avg = a => (a.length ? Math.round(a.reduce((n, v) => n + (v.views || 0), 0) / a.length) : null);
    slot.innerHTML = `
      <div class="tiles">
        <div class="tile"><span>Vues</span><b>${fmt(views.reduce((a, b) => a + b, 0))}</b><small>${ch.videos.length} vidéos</small></div>
        <div class="tile"><span>Médiane</span><b>${fmt(med)}</b><small>par vidéo</small></div>
        <div class="tile"><span>Shorts</span><b>${fmt(avg(shorts))}</b><small>moy. · ${shorts.length}</small></div>
        <div class="tile"><span>Vidéos</span><b>${fmt(avg(longs))}</b><small>moy. · ${longs.length}</small></div>
      </div>
      <div class="row" style="margin:12px 0 16px;gap:6px">
        <button class="btn sm primary" data-quick="works">${icon('trophy')}Qu’est-ce qui marche ?</button>
        <button class="btn sm" data-quick="ideas">Idées</button>
        <span class="spacer"></span>
        <button class="icon-btn" data-action="reload-channel" title="Actualiser" aria-label="Actualiser">${icon('refresh')}</button>
      </div>
      <div class="label">${esc(ch.channel || 'Mes vidéos')} <span class="count">${esc(ch.source)}</span></div>
      <div class="vlist">${ch.videos.map(v => {
        const ratio = (v.views || 0) / med;
        return `<button class="vrow ${v.id === state.videoId ? 'current' : ''}" data-open="${esc(v.id)}" title="Ouvrir dans Studio">
          <img src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg" alt="" loading="lazy">
          <span class="vmeta"><span class="vtitle">${esc(v.title)}</span>
            <span class="vsub">${fmt(v.views)} vues${v.likes != null ? ` · ${typeof v.likes === 'number' ? fmt(v.likes) + ' j’aime' : esc(v.likes)}` : ''} · ${esc(ago(v.published || v.date))}${v.isShort ? ' · Short' : ''}</span>
            <span class="vbar"><i style="transform:scaleX(${(v.views || 0) / max})"></i></span></span>
          <span class="ratio ${ratio >= 1.5 ? 'hi' : ratio < 0.6 ? 'lo' : ''}" title="Vues vs médiane de la chaîne">×${ratio.toFixed(1)}</span>
        </button>`;
      }).join('')}</div>
      <div class="help">Meilleure : « ${esc(top.title)} » · ${fmt(top.views)} vues.</div>`;
  }

  /* ---------- Réglages ---------- */
  function renderSettings(note) {
    const s = state.settings;
    const id = s.provider;
    const prov = PROVIDERS[id];
    const key = s.keys?.[id] || '';
    const p = s.prefs;
    const langs = ['Français', 'English', 'Español', 'Deutsch', 'Português', 'Italiano', 'العربية', 'Türkçe'];
    const prefSeg = (name, val) => `<div class="seg"><button data-pref="${name}" data-val="1" aria-pressed="${val === true}">Oui</button><button data-pref="${name}" data-val="0" aria-pressed="${val === false}">Non</button></div>`;
    ref('settingsBody').innerHTML = `
      <div class="field">
        <div class="label">Fournisseur IA</div>
        <div class="providers" role="radiogroup">${Object.entries(PROVIDERS).map(([pid, pv]) => `
          <button class="prov" role="radio" aria-checked="${pid === id}" data-provider="${pid}">
            <span class="radio"></span><span><b>${esc(pv.label)}</b><small>${esc(pv.hint)}</small></span>
            ${s.keys?.[pid] ? `<span class="keyed">${icon('check')}</span>` : ''}
          </button>`).join('')}
        </div>
      </div>

      <div class="field">
        <div class="label">Clé API ${esc(prov.label)}</div>
        <input class="input" type="password" autocomplete="off" spellcheck="false" data-ref="key"
          placeholder="${key ? `Enregistrée · se termine par ${esc(key.slice(-4))}` : 'Colle ta clé ici'}">
        <div class="help">Stockée uniquement dans ce navigateur. <a href="${esc(prov.keyUrl)}" target="_blank" rel="noopener">Obtenir une clé</a>
          ${key ? ` · <a href="#" data-action="forget-key">Supprimer</a>` : ''}</div>
      </div>

      <div class="field">
        <div class="label">Modèle</div>
        <div class="row">
          <input class="input" list="vb-models" data-ref="modelInput" value="${esc(currentModel())}" spellcheck="false">
          <button class="btn" data-action="load-models" ${key ? '' : 'disabled'}>Tester</button>
        </div>
        <datalist id="vb-models">${state.models.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
        <div class="help ${note?.cls || ''}" data-ref="modelNote">${esc(note?.text || 'Tester vérifie la clé et charge la liste des modèles.')}</div>
      </div>

      <div class="field">
        <div class="label">Langue des titres et descriptions</div>
        <select class="input" data-ref="lang">${langs.map(l => `<option ${l === s.contentLang ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>

      <div class="field">
        <div class="label">Langue des tags</div>
        <div class="seg">
          <button data-tagmode="en" aria-pressed="${s.tagMode === 'en'}">Anglais</button>
          <button data-tagmode="mixed" aria-pressed="${s.tagMode === 'mixed'}">Anglais + langue vidéo</button>
        </div>
      </div>

      <div class="field">
        <div class="label">Créativité <span class="count" data-ref="tempVal">${s.temperature.toFixed(1)}</span></div>
        <input type="range" min="0" max="1.2" step="0.1" value="${s.temperature}" data-ref="temp">
      </div>

      <div class="sep"></div>
      <div class="field">
        <div class="label">Préférences vidéo par défaut</div>
        <div class="params">
          <div class="param"><span>Conçue pour les enfants</span>${prefSeg('madeForKids', p.madeForKids)}</div>
          <div class="param"><span>Promotion payée</span>${prefSeg('paidPromo', p.paidPromo)}</div>
          <div class="param"><span>Contenu modifié / IA</span>${prefSeg('altered', p.altered)}</div>
          <label class="param"><span>Catégorie</span>
            <select class="input sm" data-ref="prefCat"><option value="-1">Ne pas changer</option>${S.CATEGORIES.map((c, k) => `<option value="${k}" ${k === p.category ? 'selected' : ''}>${esc(c[0])}</option>`).join('')}</select></label>
        </div>
        <div class="help">Appliquées d’un clic depuis l’onglet Vidéo (« Appliquer mes préférences »), jamais automatiquement.</div>
      </div>

      <div class="sep"></div>
      <div class="field">
        <div class="label">ID de chaîne</div>
        <input class="input" data-ref="channelId" value="${esc(s.channelId)}" placeholder="UC… (rempli tout seul depuis Studio)" spellcheck="false">
        <div class="help">Sert à lister tes vidéos et leurs vues partout, même hors de Studio.</div>
      </div>

      <div class="field row">
        <div style="flex:1"><b style="font-weight:500">Utiliser vidIQ</b><div class="help" style="margin:2px 0 0">Envoie à l’IA les scores et tags affichés par vidIQ.</div></div>
        <button class="switch" role="switch" aria-checked="${s.useVidiq}" data-toggle="useVidiq" aria-label="Utiliser vidIQ"></button>
      </div>
      <div class="field row">
        <div style="flex:1"><b style="font-weight:500">Afficher sur youtube.com</b><div class="help" style="margin:2px 0 0">Bouton Boost sur YouTube : tags cachés et analyse des vidéos.</div></div>
        <button class="switch" role="switch" aria-checked="${s.showOnYoutube}" data-toggle="showOnYoutube" aria-label="Afficher sur youtube.com"></button>
      </div>

      <details class="adv">
        <summary>Avancé</summary>
        <div class="field" style="margin-top:12px">
          <div class="label">Tours du testeur de titres <span class="count" data-ref="roundsVal">${s.testerRounds}</span></div>
          <input type="range" min="1" max="5" step="1" value="${s.testerRounds}" data-ref="rounds">
        </div>
        <div class="field">
          <div class="label">Sélecteur CSS du score vidIQ</div>
          <input class="input" data-ref="scoreSel" value="${esc(s.vidiqScoreSelector)}" placeholder="Optionnel · détecté automatiquement" spellcheck="false">
          <div class="help">Si le testeur ne lit pas le score : clic droit sur le score vidIQ → Inspecter → copie un sélecteur ici.</div>
        </div>
      </details>

      <div class="field row">
        <div style="flex:1"><b style="font-weight:500">Historique du chat</b><div class="help" style="margin:2px 0 0">${state.mode === 'edit' ? 'De cette vidéo' : 'Du chat général'}, dans ce navigateur.</div></div>
        <button class="btn sm" data-action="clear-chat">${icon('trash')}Effacer</button>
      </div>`;
  }

  async function loadModels() {
    const note = ref('modelNote');
    note.className = 'help';
    note.textContent = 'Test en cours…';
    const res = await chrome.runtime.sendMessage({ type: 'models' });
    if (res?.ok) {
      state.models = res.models;
      const cur = currentModel();
      const ok = res.models.includes(cur);
      renderSettings({ cls: ok ? 'ok' : 'err', text: ok ? `Connecté · ${res.models.length} modèles disponibles.` : `Connecté, mais « ${cur} » n’est pas dans la liste : choisis un modèle.` });
    } else {
      renderSettings({ cls: 'err', text: res?.error || 'Échec du test.' });
    }
  }

  /* ---------- Events ---------- */
  root.addEventListener('click', e => {
    const t = e.target.closest('button, a');
    if (!t) return;
    const d = t.dataset;
    const i = d.i !== undefined ? Number(d.i) : null;

    if (d.tab) return switchView(d.tab);
    if (d.quick) return send(AI.QUICK[d.quick]);
    if (d.apply) return apply(d.apply, i, Number(d.k));
    if (d.open) return openVideo(d.open);
    if (d.param) return setParam(d.param, d.val === '1');
    if (d.pref) { state.settings.prefs = { ...state.settings.prefs, [d.pref]: d.val === '1' }; saveSettings(); return renderSettings(); }
    if (d.toggle) { state.settings[d.toggle] = !state.settings[d.toggle]; saveSettings(); applyVisibility(); return renderSettings(); }
    if (d.tag !== undefined && i !== null) {
      const u = uiFor(i);
      if (u.tags.has(d.tag)) u.tags.delete(d.tag);
      else if (!t.classList.contains('nofit')) u.tags.add(d.tag);
      return rerenderMsg(i);
    }
    if (d.removeTag) {
      return S.removeTag(d.removeTag).then(() => setTimeout(() => renderVideo(true), 150), err => toast(err.message, true));
    }
    if (d.provider) {
      state.settings.provider = d.provider;
      state.models = [];
      saveSettings();
      return renderSettings();
    }
    if (d.tagmode) { state.settings.tagMode = d.tagmode; saveSettings(); return renderSettings(); }

    switch (d.action) {
      case 'open': return setOpen(true);
      case 'close': return setOpen(false);
      case 'my-videos': return switchView(state.view === 'videos' ? 'video' : 'videos');
      case 'goto-settings': return switchView('settings');
      case 'refresh': return renderVideo(true);
      case 'reload-channel': return renderVideos(true);
      case 'desc-toggle': state.descOpen = !state.descOpen; return renderVideo(true);
      case 'show-tags': return S.ensureTagsVisible().then(() => renderVideo(true), err => toast(err.message, true));
      case 'apply-prefs': return applyPrefs();
      case 'tester-start': return startTester();
      case 'tester-stop': return state.testerCtrl?.abort();
      case 'tester-apply':
        S.setTitle(d.text);
        toast('Titre appliqué · pense à Enregistrer');
        return setTimeout(() => renderVideo(true), 100);
      case 'copy': {
        const ctx = S.read();
        return copy(d.what === 'tags' ? (ctx.tags || []).join(', ') : ctx.description);
      }
      case 'copy-text': return copy(d.text);
      case 'copy-desc': return copy(proposalAt(i)?.description || '');
      case 'copy-hash': return copy((proposalAt(i)?.hashtags || []).join(' '));
      case 'copy-tags': return copy([...uiFor(i).tags].join(', '));
      case 'copy-watched-tags': return copy((state.watched?.tags || []).join(', '));
      case 'expand': uiFor(i).expanded = !uiFor(i).expanded; return rerenderMsg(i);
      case 'tags-toggle-all': {
        const p = proposalAt(i);
        const existing = state.mode === 'edit' ? S.read().tags || [] : [];
        const plan = tagPlan(p, i, existing);
        const u = uiFor(i);
        if (plan.chosen.length === plan.fresh.length) u.tags.clear();
        else { u.tags = null; tagPlan(p, i, existing); }
        return rerenderMsg(i);
      }
      case 'load-models': return loadModels();
      case 'forget-key':
        e.preventDefault();
        delete state.settings.keys[state.settings.provider];
        saveSettings();
        return renderSettings();
      case 'clear-chat':
        state.history = []; state.ui = {}; saveHistory();
        toast('Historique effacé');
        return;
    }
  });

  root.addEventListener('submit', e => {
    if (e.target.dataset.ref !== 'pickForm') return;
    e.preventDefault();
    const id = parseVideoId(ref('pickInput').value);
    if (id) openVideo(id);
    else toast('Lien ou ID de vidéo non reconnu', true);
  });

  root.addEventListener('input', e => {
    const r = e.target.dataset.ref;
    const s = state.settings;
    if (r === 'key') {
      const v = e.target.value.trim();
      if (!v) return;
      s.keys = { ...s.keys, [s.provider]: v };
      saveSettings();
    } else if (r === 'modelInput') {
      s.models = { ...s.models, [s.provider]: e.target.value.trim() };
      saveSettings();
    } else if (r === 'temp') {
      s.temperature = Number(e.target.value);
      ref('tempVal').textContent = s.temperature.toFixed(1);
      saveSettings();
    } else if (r === 'rounds') {
      s.testerRounds = Number(e.target.value);
      ref('roundsVal').textContent = s.testerRounds;
      saveSettings();
    } else if (r === 'scoreSel') {
      s.vidiqScoreSelector = e.target.value.trim();
      saveSettings();
    } else if (r === 'channelId') {
      s.channelId = e.target.value.trim();
      chrome.storage.local.remove('channelCache');
      state.channel = null;
      saveSettings();
    } else if (r === 'input') {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px';
    }
  });

  root.addEventListener('change', e => {
    const r = e.target.dataset.ref;
    if (r === 'lang') { state.settings.contentLang = e.target.value; saveSettings(); }
    if (r === 'prefCat') { state.settings.prefs = { ...state.settings.prefs, category: Number(e.target.value) }; saveSettings(); }
    if (r === 'catSelect' && Number(e.target.value) >= 0) {
      S.setCategory(Number(e.target.value))
        .then(() => toast('Catégorie modifiée · pense à Enregistrer'), err => toast(err.message, true))
        .finally(() => setTimeout(() => renderVideo(true), 250));
    }
    if (r === 'key' && e.target.value.trim()) { e.target.value = ''; renderSettings(); toast('Clé enregistrée'); }
  });

  ref('composer').addEventListener('submit', e => {
    e.preventDefault();
    if (state.stream) return stop();
    const input = ref('input');
    send(input.value);
    input.value = '';
    input.style.height = 'auto';
  });
  ref('input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ref('composer').requestSubmit();
    }
  });
  // Keep Studio's / YouTube's own shortcuts from firing while typing in the panel.
  ['keydown', 'keyup', 'keypress'].forEach(t => root.addEventListener(t, e => e.stopPropagation()));

  document.addEventListener('keydown', e => {
    if (e.altKey && e.code === 'KeyB' && !host.hidden) { e.preventDefault(); setOpen(!state.open); }
  }, true);
  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.type === 'toggle' && state.mode) {
      if (!ON_STUDIO && !state.settings.showOnYoutube) { state.settings.showOnYoutube = true; saveSettings(); }
      setOpen(!state.open);
    }
  });

  /* ---------- Page watcher (Studio and YouTube are single-page apps) ---------- */
  async function tick() {
    host.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light';

    // Studio URLs under /channel/UC… belong to the signed-in creator: remember the channel.
    if (ON_STUDIO) {
      const cid = location.pathname.match(/\/channel\/(UC[\w-]{20,})/)?.[1];
      if (cid && cid !== state.settings.channelId) {
        state.settings.channelId = cid;
        chrome.storage.local.remove('channelCache');
        saveSettings();
      }
    }

    const videoId = S.videoId();
    const watchedId = YT.watchedId();
    const mode = videoId ? 'edit' : 'global';
    const key = `${mode}|${videoId}|${watchedId}`;
    if (key !== state.surfaceKey) {
      if (state.stream) stop();
      state.testerCtrl?.abort();
      const modeChanged = mode !== state.mode;
      state.surfaceKey = key;
      state.mode = mode;
      state.videoId = videoId;
      state.watchedId = watchedId;
      state.watched = null;
      state.tester = null;
      state.lastVideoSnap = '';
      if (modeChanged) {
        const stored = (await chrome.storage.local.get(`open:${mode}`))[`open:${mode}`];
        state.open = stored ?? mode === 'edit';
        state.view = mode === 'edit' ? 'chat' : 'videos';
      }
      await loadHistory();
      applyVisibility();
      if (state.open) switchView(state.view);
    } else if (state.open && state.view === 'video' && !state.testerCtrl) {
      renderVideo(false); // live refresh while the user edits in Studio
    }
  }

  loadSettings().then(() => {
    renderModelLabel();
    tick();
    setInterval(tick, 800);
  });
})();

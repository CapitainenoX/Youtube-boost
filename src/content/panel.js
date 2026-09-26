/* Video Boost — the panel (Chat · Vidéo · Réglages).
 * Lives in a shadow root so Studio's styles and ours never mix. Shown only on a video/Short edit page
 * (studio.youtube.com/video/<id>/edit). Nothing is written to Studio without a click from the user. */
(function () {
  if (window.__videoBoost) return;
  window.__videoBoost = true;

  const S = window.VBStudio;
  const AI = window.VBAI;
  const PROVIDERS = window.VB_PROVIDERS;

  /* ---------- Icons (Lucide paths) ---------- */
  const ICONS = {
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4V8z"/>',
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
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'
  };
  const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
  const state = {
    open: false,
    view: 'chat',
    settings: { ...window.VB_DEFAULT_SETTINGS },
    videoId: null,
    history: [],
    ui: {},            // per assistant message index: { applied: Set, tags: Set, expanded: bool }
    stream: null,      // { port, raw }
    lastVideoSnap: '',
    models: []
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
        <button class="icon-btn" data-action="close" title="Fermer (Alt+B)" aria-label="Fermer">${icon('x')}</button>
      </div>
      <div class="tabs" role="tablist">
        <span class="tab-ind" data-ref="ind"></span>
        <button class="tab" role="tab" data-tab="chat">${icon('chat')}Chat</button>
        <button class="tab" role="tab" data-tab="video">${icon('video')}Vidéo</button>
        <button class="tab" role="tab" data-tab="settings">${icon('sliders')}Réglages</button>
      </div>
      <section class="view" data-view="chat">
        <div class="scroll" data-ref="chatScroll"><div class="msgs" data-ref="msgs"></div></div>
        <div class="composer-wrap">
          <div class="quick">
            <button class="chip" data-quick="all">${icon('zap')}Tout optimiser</button>
            <button class="chip" data-quick="tags">Tags</button>
            <button class="chip" data-quick="titles">Titres</button>
            <button class="chip" data-quick="description">Description</button>
            <button class="chip" data-quick="hashtags">Hashtags</button>
          </div>
          <form class="composer" data-ref="composer">
            <textarea rows="1" data-ref="input" placeholder="Demande un titre, des tags, une idée…"></textarea>
            <button class="btn primary" type="submit" data-ref="sendBtn" aria-label="Envoyer">${icon('send')}</button>
          </form>
        </div>
      </section>
      <section class="view" data-view="video" hidden><div class="scroll" data-ref="videoBody"></div></section>
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
  async function loadSettings() {
    const { settings, open } = await chrome.storage.local.get(['settings', 'open']);
    state.settings = { ...window.VB_DEFAULT_SETTINGS, ...(settings || {}) };
    state.open = open !== false;
  }
  let saveTimer;
  function saveSettings() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => chrome.storage.local.set({ settings: state.settings }), 250);
    renderModelLabel();
  }
  async function loadHistory(id) {
    const key = `chat:${id}`;
    const data = await chrome.storage.local.get(key);
    state.history = data[key] || [];
    state.ui = {};
  }
  function saveHistory() {
    if (state.videoId) chrome.storage.local.set({ [`chat:${state.videoId}`]: state.history.slice(-40) });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings?.newValue) {
      state.settings = { ...window.VB_DEFAULT_SETTINGS, ...changes.settings.newValue };
      renderModelLabel();
    }
  });

  /* ---------- Shell ---------- */
  function currentModel() {
    const id = state.settings.provider;
    return state.settings.models?.[id] || PROVIDERS[id]?.model || '';
  }
  function renderModelLabel() {
    const id = state.settings.provider;
    const hasKey = !!state.settings.keys?.[id];
    ref('model').textContent = hasKey ? `${PROVIDERS[id]?.label} · ${currentModel()}` : 'Aucune clé API';
  }

  function setOpen(open) {
    state.open = open;
    chrome.storage.local.set({ open });
    applyVisibility();
    if (open) switchView(state.view);
  }

  function applyVisibility() {
    const onEditPage = !!state.videoId;
    host.hidden = !onEditPage;
    panel.hidden = !state.open;
    launcher.hidden = state.open;
  }

  function switchView(view) {
    state.view = view;
    const order = ['chat', 'video', 'settings'];
    root.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === view)));
    ref('ind').style.transform = `translateX(${order.indexOf(view) * 100}%)`;
    root.querySelectorAll('.view').forEach(v => (v.hidden = v.dataset.view !== view));
    if (view === 'chat') { renderChat(); ref('input').focus(); }
    if (view === 'video') renderVideo(true);
    if (view === 'settings') renderSettings();
  }

  /* ---------- Chat ---------- */
  function renderChat() {
    const box = ref('msgs');
    if (!state.history.length && !state.stream) {
      const noKey = !state.settings.keys?.[state.settings.provider];
      box.innerHTML = `<div class="empty">
        <h3>Booste cette ${S.read().isShort ? 'Short' : 'vidéo'}</h3>
        <p>${noKey ? 'Connecte d’abord une IA dans Réglages.' : 'L’IA lit le titre, la description, les tags et vidIQ, puis propose. Tu valides d’un clic.'}</p>
        ${noKey
          ? `<button class="btn primary" data-action="goto-settings">${icon('sliders')}Connecter une IA</button>`
          : `<button class="btn primary" data-quick="all">${icon('zap')}Tout optimiser</button>`}
      </div>`;
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

  function uiFor(i) {
    return (state.ui[i] ||= { applied: new Set(), tags: null, expanded: false });
  }

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
    const ctx = S.read();
    const existing = ctx.tags || [];
    const doneBtn = label => `<button class="btn sm done" disabled>${icon('check')}${label}</button>`;
    const parts = [];

    if (p.titles.length) {
      parts.push(`<div class="sect"><div class="label">Titres</div>${p.titles.map((t, k) => {
        const key = `title:${k}`;
        const n = t.length;
        return `<div class="opt"><span class="t">${esc(t)}</span><span class="count ${n > 100 ? 'over' : n > 70 ? 'warn' : ''}">${n}</span>
          ${u.applied.has(key) ? doneBtn('') : `<button class="btn sm" data-apply="title" data-i="${i}" data-k="${k}">Appliquer</button>`}</div>`;
      }).join('')}</div>`);
    }

    if (p.description) {
      parts.push(`<div class="sect"><div class="label">Description <span class="count">${p.description.length}/5000</span></div>
        <div class="box ${u.expanded ? '' : 'clamp'}">${esc(p.description)}</div>
        <div class="row end" style="margin-top:8px">
          <button class="btn sm ghost" data-action="expand" data-i="${i}">${u.expanded ? 'Réduire' : 'Tout voir'}</button>
          <button class="btn sm ghost" data-action="copy-desc" data-i="${i}">${icon('copy')}</button>
          ${u.applied.has('description') ? doneBtn('Remplacée') : `<button class="btn sm" data-apply="description" data-i="${i}">Remplacer</button>`}
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
          ${u.applied.has('tags') ? doneBtn('Ajoutés') : `<button class="btn sm primary" data-apply="tags" data-i="${i}" ${plan.chosen.length && !over ? '' : 'disabled'}>${icon('plus')}Ajouter ${plan.chosen.length}</button>`}
        </div></div>`);
    }

    if (p.hashtags.length) {
      parts.push(`<div class="sect"><div class="label">Hashtags</div>
        <div class="chips">${p.hashtags.map(h => `<span class="chip static">${esc(h)}</span>`).join('')}</div>
        <div class="row end" style="margin-top:10px">
          <button class="btn sm ghost" data-action="copy-hash" data-i="${i}">${icon('copy')}</button>
          ${u.applied.has('hashtags') ? doneBtn('Ajoutés') : `<button class="btn sm" data-apply="hashtags" data-i="${i}">Ajouter à la description</button>`}
        </div></div>`);
    }

    if (p.category) {
      parts.push(`<div class="sect row"><span class="label" style="margin:0">Catégorie</span><span>${esc(p.category)}</span>
        <span class="spacer"></span><span class="muted" style="font-size:12px">à choisir dans Studio</span></div>`);
    }

    const kinds = [p.titles.length, p.description, p.tags.length, p.hashtags.length].filter(Boolean).length;
    const allDone = ['description', 'tags', 'hashtags'].every(k => !p[k].length || u.applied.has(k)) && (!p.titles.length || [...u.applied].some(k => k.startsWith('title')));
    return `<div class="card">
      <div class="card-head">${icon('zap')}Propositions<span class="spacer"></span>
        ${kinds > 1 ? (allDone ? `<span class="badge on">${icon('check')}Appliqué</span>` : `<button class="btn sm primary" data-apply="all" data-i="${i}">Tout appliquer</button>`) : ''}
      </div>${parts.join('')}</div>`;
  }

  function proposalAt(i) {
    const m = state.history[i];
    return m ? AI.parse(m.content).proposal : null;
  }

  async function apply(kind, i, k) {
    const p = proposalAt(i);
    if (!p) return;
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

  function send(text) {
    text = text.trim();
    if (!text || state.stream) return;
    if (!state.settings.keys?.[state.settings.provider]) {
      toast('Ajoute une clé API dans Réglages', true);
      switchView('settings');
      return;
    }
    if (state.view !== 'chat') switchView('chat');
    state.history.push({ role: 'user', content: text });
    const ctx = S.read();
    const convo = state.history.filter(m => m.role !== 'error').slice(-12);
    const messages = [{ role: 'system', content: AI.systemPrompt(ctx, state.settings) }, ...convo];

    const port = chrome.runtime.connect({ name: 'vb-chat' });
    state.stream = { port, raw: '' };
    setStreaming(true);
    renderChat();

    let raf = 0;
    const finish = (errMsg) => {
      if (!state.stream) return;
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
      if (msg.type === 'delta' && state.stream) {
        state.stream.raw += msg.text;
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderLive(); scrollChat(); });
      } else if (msg.type === 'done') finish();
      else if (msg.type === 'error') finish(msg.message);
    });
    port.onDisconnect.addListener(() => finish(state.stream && !state.stream.raw ? 'Connexion interrompue.' : undefined));
    port.postMessage({ type: 'chat', messages });
  }

  function stop() {
    if (!state.stream) return;
    const { port } = state.stream;
    port.disconnect(); // aborts the fetch in the service worker
    const raw = state.stream.raw;
    state.stream = null;
    if (raw.trim()) state.history.push({ role: 'assistant', content: raw });
    saveHistory();
    setStreaming(false);
    renderChat();
  }

  function setStreaming(on) {
    const b = ref('sendBtn');
    b.innerHTML = icon(on ? 'stop' : 'send');
    b.setAttribute('aria-label', on ? 'Arrêter' : 'Envoyer');
    b.dataset.mode = on ? 'stop' : 'send';
  }

  /* ---------- Vidéo ---------- */
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

  function renderVideo(force) {
    const ctx = S.read();
    const snap = JSON.stringify([ctx.title, ctx.description, ctx.tags, ctx.category, ctx.vidiq.detected, ctx.isShort]);
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
        ${ctx.category ? `<span class="badge">${esc(ctx.category)}</span>` : ''}
        <span class="badge ${ctx.vidiq.detected ? 'on' : ''}" title="${ctx.vidiq.detected ? 'Les données vidIQ de la page sont envoyées à l’IA' : 'Extension vidIQ non détectée sur cette page'}"><span class="dot"></span>vidIQ</span>
        <span class="spacer"></span>
        <button class="icon-btn" data-action="refresh" title="Relire la page" aria-label="Relire">${icon('refresh')}</button>
      </div>

      <div class="field">
        <div class="label">Titre ${counter(ctx.title.length, 100)}</div>
        <div class="box">${esc(ctx.title) || '<span class="muted">Vide</span>'}</div>
      </div>

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

      <div class="field">
        <div class="label">Checklist SEO <span class="count">${score}/${checks.length}</span></div>
        <div class="checks">${checks.map(([ok, label]) => `<div class="check ${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'alert')}<span>${esc(label)}</span></div>`).join('')}</div>
      </div>

      <button class="btn primary" style="width:100%" data-quick="all">${icon('zap')}Optimiser avec l’IA</button>`;
    body.scrollTop = scrollTop;
  }

  /* ---------- Réglages ---------- */
  function renderSettings(note) {
    const s = state.settings;
    const id = s.provider;
    const prov = PROVIDERS[id];
    const key = s.keys?.[id] || '';
    const langs = ['Français', 'English', 'Español', 'Deutsch', 'Português', 'Italiano', 'العربية', 'Türkçe'];
    ref('settingsBody').innerHTML = `
      <div class="field">
        <div class="label">Fournisseur IA</div>
        <div class="providers" role="radiogroup">${Object.entries(PROVIDERS).map(([pid, p]) => `
          <button class="prov" role="radio" aria-checked="${pid === id}" data-provider="${pid}">
            <span class="radio"></span><span><b>${esc(p.label)}</b><small>${esc(p.hint)}</small></span>
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

      <div class="field row">
        <div style="flex:1"><b style="font-weight:500">Utiliser vidIQ</b><div class="help" style="margin:2px 0 0">Envoie à l’IA les scores et tags affichés par vidIQ.</div></div>
        <button class="switch" role="switch" aria-checked="${s.useVidiq}" data-action="vidiq" aria-label="Utiliser vidIQ"></button>
      </div>

      <div class="field row">
        <div style="flex:1"><b style="font-weight:500">Historique du chat</b><div class="help" style="margin:2px 0 0">Gardé par vidéo, dans ce navigateur.</div></div>
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
      case 'goto-settings': return switchView('settings');
      case 'refresh': return renderVideo(true);
      case 'desc-toggle': state.descOpen = !state.descOpen; return renderVideo(true);
      case 'show-tags': return S.ensureTagsVisible().then(() => renderVideo(true), err => toast(err.message, true));
      case 'copy': {
        const ctx = S.read();
        return copy(d.what === 'tags' ? (ctx.tags || []).join(', ') : ctx.description);
      }
      case 'copy-desc': return copy(proposalAt(i)?.description || '');
      case 'copy-hash': return copy((proposalAt(i)?.hashtags || []).join(' '));
      case 'expand': uiFor(i).expanded = !uiFor(i).expanded; return rerenderMsg(i);
      case 'tags-toggle-all': {
        const p = proposalAt(i);
        const plan = tagPlan(p, i, S.read().tags || []);
        const u = uiFor(i);
        if (plan.chosen.length === plan.fresh.length) u.tags.clear();
        else { u.tags = null; tagPlan(p, i, S.read().tags || []); }
        return rerenderMsg(i);
      }
      case 'load-models': return loadModels();
      case 'forget-key':
        e.preventDefault();
        delete state.settings.keys[state.settings.provider];
        saveSettings();
        return renderSettings();
      case 'vidiq': state.settings.useVidiq = !state.settings.useVidiq; saveSettings(); return renderSettings();
      case 'clear-chat':
        state.history = []; state.ui = {}; saveHistory();
        toast('Historique effacé');
        return;
    }
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
    } else if (r === 'input') {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px';
    }
  });

  root.addEventListener('change', e => {
    const r = e.target.dataset.ref;
    if (r === 'lang') { state.settings.contentLang = e.target.value; saveSettings(); }
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
  // Keep Studio's own shortcuts from firing while typing in the panel.
  ['keydown', 'keyup', 'keypress'].forEach(t => root.addEventListener(t, e => e.stopPropagation()));

  document.addEventListener('keydown', e => {
    if (e.altKey && e.code === 'KeyB' && state.videoId) { e.preventDefault(); setOpen(!state.open); }
  }, true);
  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.type === 'toggle' && state.videoId) setOpen(!state.open);
  });

  /* ---------- Page watcher (Studio is a single-page app) ---------- */
  async function tick() {
    const id = S.videoId();
    host.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light';
    if (id !== state.videoId) {
      if (state.stream) stop();
      state.videoId = id;
      state.lastVideoSnap = '';
      applyVisibility();
      if (id) {
        await loadHistory(id);
        if (state.open) switchView(state.view);
      }
    } else if (id && state.open && state.view === 'video') {
      renderVideo(false); // live refresh while the user edits in Studio
    }
  }

  loadSettings().then(() => {
    renderModelLabel();
    tick();
    setInterval(tick, 800);
  });
})();

/* Video Boost mobile — PWA.
 * Flow: upload normally in the YouTube app → Share → Video Boost. The shared link opens the video here,
 * the AI proposes title / description / tags / hashtags / category / audience, and one tap writes them
 * to the video through the official YouTube Data API (videos.update). Nothing is sent without that tap.
 * Settings and the AI key live in this phone's localStorage; the Google token only in memory. */
(function () {
  const PROVIDERS = window.VB_PROVIDERS;
  const AI = window.VBAI;
  const TAGS = window.VBStudio;
  const API = 'https://www.googleapis.com/youtube/v3';
  const SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';
  const TAG_LIMIT = 500;

  // Same order as the extension's category list; value = YouTube categoryId.
  const CATEGORIES = [
    ['1', 'Films et animations'], ['2', 'Auto/Moto'], ['10', 'Musique'], ['15', 'Animaux'], ['17', 'Sport'],
    ['19', 'Voyages et événements'], ['20', 'Jeux vidéo'], ['22', 'People et blogs'], ['23', 'Humour'],
    ['24', 'Divertissement'], ['25', 'Actualités et politique'], ['26', 'Vie pratique et style'],
    ['27', 'Éducation'], ['28', 'Science et technologie'], ['29', 'Organisations à but non lucratif']
  ];
  const CATEGORY_EN = { 1: 'Film & Animation', 2: 'Autos & Vehicles', 10: 'Music', 15: 'Pets & Animals', 17: 'Sports', 19: 'Travel & Events', 20: 'Gaming', 22: 'People & Blogs', 23: 'Comedy', 24: 'Entertainment', 25: 'News & Politics', 26: 'Howto & Style', 27: 'Education', 28: 'Science & Technology', 29: 'Nonprofits & Activism' };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const categoryIdFor = name => {
    const n = norm(name);
    const hit = CATEGORIES.find(([id, fr]) => norm(fr) === n || norm(CATEGORY_EN[id]) === n);
    return hit ? hit[0] : null;
  };
  const categoryName = id => CATEGORIES.find(c => c[0] === String(id))?.[1] || '—';

  /* ---------- Helpers ---------- */
  const $app = document.getElementById('app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = {
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    google: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8 12h8"/>'
  };
  const icon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
  const loading = text => `<div class="loading"><span class="dots"><i></i><i></i><i></i></span>${esc(text)}</div>`;

  let toastTimer;
  function toast(msg, err = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `show${err ? ' err' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = ''), err ? 4500 : 2600);
  }

  const store = {
    get() { try { return JSON.parse(localStorage.getItem('vb-mobile') || '{}'); } catch { return {}; } },
    set(v) { try { localStorage.setItem('vb-mobile', JSON.stringify(v)); } catch { /* private mode */ } }
  };
  const defaults = { ...window.VB_DEFAULT_SETTINGS, clientId: '', prefs: { ...window.VB_DEFAULT_SETTINGS.prefs, apply: true } };
  const saved = store.get();
  const settings = { ...defaults, ...saved, prefs: { ...defaults.prefs, ...(saved.prefs || {}) } };
  // One-time migration: titles/descriptions default to English unless the video is in another language.
  if (!saved.langV2) { settings.contentLang = 'Auto'; settings.langV2 = true; }
  const save = () => store.set(settings);

  function parseVideoId(text) {
    const s = String(text || '');
    return s.match(/(?:v=|youtu\.be\/|shorts\/|\/video\/|live\/|embed\/)([\w-]{11})/)?.[1] || (/^\s*([\w-]{11})\s*$/.exec(s)?.[1]) || null;
  }

  /* ---------- Google sign-in (token client, token kept in memory) ---------- */
  let token = null; // { value, exp }
  let tokenClient = null;

  function gisReady() {
    return new Promise((resolve, reject) => {
      let n = 0;
      const t = setInterval(() => {
        if (window.google?.accounts?.oauth2) { clearInterval(t); resolve(); }
        else if (++n > 50) { clearInterval(t); reject(new Error('Connexion Google indisponible (réseau ?).')); }
      }, 100);
    });
  }

  async function getToken(interactive) {
    if (token && Date.now() < token.exp) return token.value;
    if (!settings.clientId) throw new Error('Ajoute ton Client ID Google dans Réglages.');
    if (!interactive) throw Object.assign(new Error('Connecte-toi à Google.'), { needLogin: true });
    await gisReady();
    return new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: settings.clientId,
        scope: SCOPE,
        callback: r => {
          if (r.error) return reject(new Error(`Google : ${r.error_description || r.error}`));
          token = { value: r.access_token, exp: Date.now() + (Number(r.expires_in) - 60) * 1000 };
          resolve(token.value);
        },
        error_callback: e => reject(new Error(e?.type === 'popup_closed' ? 'Connexion annulée.' : 'Connexion Google impossible.'))
      });
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  async function yt(path, opts = {}, interactive = false) {
    const t = await getToken(interactive);
    const res = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    if (res.status === 401) { token = null; throw Object.assign(new Error('Session Google expirée.'), { needLogin: true }); }
    if (!res.ok) {
      let msg = `Erreur YouTube ${res.status}`;
      try { const j = await res.json(); msg = j.error?.message ? `YouTube : ${j.error.message}` : msg; } catch { /* no body */ }
      throw new Error(msg.replace(/<[^>]+>/g, ''));
    }
    return res.json();
  }

  /* ---------- AI (called from the phone, key in localStorage) ---------- */
  async function askAI(messages) {
    const id = settings.provider;
    const prov = PROVIDERS[id];
    const key = settings.keys?.[id];
    if (!key) throw new Error(`Ajoute ta clé ${prov.label} dans Réglages.`);
    const model = settings.models?.[id] || prov.model;
    let res;
    try {
      if (prov.kind === 'gemini') {
        res = await fetch(`${prov.base}/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n') }] },
            contents: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
            generationConfig: { temperature: settings.temperature }
          })
        });
      } else {
        res = await fetch(`${prov.base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, messages, temperature: settings.temperature })
        });
      }
    } catch {
      throw new Error(`${prov.label} refuse les appels depuis le téléphone (réseau ou CORS). Essaie Groq ou Gemini.`);
    }
    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = j.error?.message || ''; } catch { /* no body */ }
      throw new Error(`${prov.label} ${res.status}${res.status === 401 ? ' : clé invalide' : ''}${detail ? ' · ' + detail : ''}`);
    }
    const j = await res.json();
    return prov.kind === 'gemini'
      ? (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('')
      : j.choices?.[0]?.message?.content || '';
  }

  /* ---------- State ---------- */
  const state = { screen: 'home', video: null, proposal: null, draft: null, busy: false };

  function go(screen) {
    state.screen = screen;
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- Screens ---------- */
  function render() {
    if (state.screen === 'settings') return renderSettings();
    if (state.screen === 'video') return renderVideo();
    return renderHome();
  }

  async function renderHome() {
    const ready = settings.clientId && settings.keys?.[settings.provider];
    $app.innerHTML = `
      <h1>Boost ta vidéo</h1>
      <p class="lead">Après l’upload dans l’app YouTube : <b>Partager → Video Boost</b>. Ou colle le lien ici.</p>
      <form class="row field" id="pick">
        <input class="input grow" id="link" placeholder="Lien ou ID de la vidéo" autocomplete="off" inputmode="url">
        <button class="btn primary" type="submit" aria-label="Ouvrir">${icon('arrow')}</button>
      </form>
      ${ready ? '' : `<div class="card"><div class="card-body">
        <b>À configurer une fois</b>
        <p class="help" style="margin:4px 0 12px">${settings.clientId ? '' : 'Connexion Google (Client ID). '}${settings.keys?.[settings.provider] ? '' : 'Clé de l’IA.'}</p>
        <button class="btn block" data-go="settings">Ouvrir les réglages</button></div></div>`}
      <div class="label">Mes dernières vidéos</div>
      <div id="latest">${token ? loading('Chargement…') : `<button class="btn block" id="login" ${settings.clientId ? '' : 'disabled'}>${icon('google')}Se connecter à Google</button>`}</div>`;
    if (token) loadLatest();
  }

  async function loadLatest() {
    const box = document.getElementById('latest');
    try {
      const ch = await yt('/channels?part=contentDetails&mine=true');
      const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) { box.innerHTML = '<p class="muted">Aucune chaîne sur ce compte Google.</p>'; return; }
      const pl = await yt(`/playlistItems?part=snippet,contentDetails&maxResults=15&playlistId=${uploads}`);
      if (!document.body.contains(box)) return;
      box.innerHTML = `<div class="vlist">${(pl.items || []).map(it => {
        const id = it.contentDetails.videoId;
        return `<button class="vrow" data-open="${esc(id)}"><img src="https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg" alt="" loading="lazy">
          <span><span class="t">${esc(it.snippet.title)}</span><small>${esc(new Date(it.contentDetails.videoPublishedAt || it.snippet.publishedAt).toLocaleDateString('fr-FR'))}</small></span></button>`;
      }).join('') || '<p class="muted">Aucune vidéo.</p>'}</div>`;
    } catch (e) {
      box.innerHTML = `<p class="help err">${esc(e.message)}</p><button class="btn block" id="login">${icon('google')}Se reconnecter</button>`;
    }
  }

  async function openVideo(id, fromShare) {
    state.video = null;
    state.proposal = null;
    state.draft = null;
    state.screen = 'video';
    $app.innerHTML = loading('Lecture de la vidéo…');
    try {
      const r = await yt(`/videos?part=snippet,status,contentDetails,paidProductPlacementDetails&id=${encodeURIComponent(id)}`, {}, false);
      const v = r.items?.[0];
      if (!v) throw new Error('Vidéo introuvable, ou pas sur ta chaîne (elle peut mettre une minute à apparaître après l’upload).');
      const seconds = isoSeconds(v.contentDetails?.duration);
      state.video = { ...v, isShort: fromShare?.includes('/shorts/') || (seconds > 0 && seconds <= 180) };
      renderVideo();
      if (settings.keys?.[settings.provider]) generate();
    } catch (e) {
      if (e.needLogin) {
        $app.innerHTML = `<h1>Connexion Google</h1><p class="lead">Pour lire et modifier ta vidéo.</p>
          <button class="btn primary block" id="loginThen" data-id="${esc(id)}">${icon('google')}Se connecter</button>`;
      } else {
        $app.innerHTML = `<p class="help err">${esc(e.message)}</p><button class="btn block" data-open="${esc(id)}">${icon('refresh')}Réessayer</button>
          <button class="btn ghost block" data-go="home">Retour</button>`;
      }
    }
  }

  // BCP-47 code from the API ("fr", "pt-BR") → English language name for the prompt; '' when unset.
  function languageName(code) {
    if (!code) return '';
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; } catch { return code; }
  }

  function isoSeconds(d) {
    const m = String(d || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  }

  async function generate(extra) {
    const v = state.video;
    if (!v) return;
    state.busy = true;
    renderVideo();
    try {
      const ctx = {
        isShort: v.isShort,
        title: v.snippet.title,
        description: v.snippet.description || '',
        tags: v.snippet.tags || [],
        category: CATEGORY_EN[v.snippet.categoryId] || '',
        language: languageName(v.snippet.defaultAudioLanguage || v.snippet.defaultLanguage),
        vidiq: { detected: false, text: '' }
      };
      const ask = AI.QUICK.all + (extra ? `\nConsigne : ${extra}` : '');
      const raw = await askAI([{ role: 'system', content: AI.systemPrompt(ctx, settings) }, { role: 'user', content: ask }]);
      const p = AI.parse(raw).proposal;
      if (!p) throw new Error('L’IA n’a pas renvoyé de propositions. Réessaie.');
      state.proposal = p;
      state.draft = makeDraft(v, p);
    } catch (e) {
      toast(e.message, true);
    }
    state.busy = false;
    renderVideo();
  }

  // What will be written: starts from the video, proposal selected by default, preferences for the audience.
  function makeDraft(v, p) {
    const existing = v.snippet.tags || [];
    const have = new Set(existing.map(t => t.toLowerCase()));
    const fresh = p.tags.filter(t => !have.has(t.toLowerCase()));
    const chosen = new Set();
    for (const t of fresh) if (TAGS.tagsLength([...existing, ...chosen, t]) <= TAG_LIMIT) chosen.add(t);
    const prefs = settings.prefs;
    const catPref = prefs.category >= 0 ? CATEGORIES[prefs.category]?.[0] : null;
    return {
      titleIndex: p.titles.length ? 0 : -1,          // -1 = keep current title
      useDescription: !!p.description && !(v.snippet.description || '').trim(),
      useHashtags: p.hashtags.length > 0,
      fresh,
      tags: chosen,
      categoryId: categoryIdFor(p.category) || catPref || v.snippet.categoryId,
      madeForKids: prefs.apply ? prefs.madeForKids : v.status.selfDeclaredMadeForKids ?? false,
      altered: prefs.apply ? prefs.altered : v.status.containsSyntheticMedia ?? false,
      paidPromo: prefs.apply ? prefs.paidPromo : v.paidProductPlacementDetails?.hasPaidProductPlacement ?? false
    };
  }

  function renderVideo() {
    const v = state.video;
    if (!v) return;
    const p = state.proposal, d = state.draft;
    const existing = v.snippet.tags || [];
    const head = `<div class="vhead"><img src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg" alt="">
      <span><b>${esc(v.snippet.title)}</b><small>${v.isShort ? 'Short' : 'Vidéo'} · ${esc(v.status.privacyStatus)} · ${existing.length} tag${existing.length > 1 ? 's' : ''}</small></span></div>`;

    if (state.busy || !p) {
      $app.innerHTML = head + (state.busy
        ? loading('L’IA prépare le titre, les tags et la description…')
        : `<p class="lead">${settings.keys?.[settings.provider] ? 'Génère les propositions, choisis, applique.' : 'Ajoute une clé IA dans Réglages pour générer.'}</p>
           <button class="btn primary block" id="gen" ${settings.keys?.[settings.provider] ? '' : 'disabled'}>${icon('zap')}Générer avec l’IA</button>`);
      return;
    }

    const total = TAGS.tagsLength([...existing, ...d.fresh.filter(t => d.tags.has(t))]);
    const over = total > TAG_LIMIT;
    const opt = (k, text, n) => `<button class="opt" role="radio" aria-checked="${d.titleIndex === k}" data-title="${k}">
      <span class="radio"></span><span class="t">${text}</span>${n != null ? `<span class="count ${n > 100 ? 'over' : n > 70 ? 'warn' : ''}">${n}</span>` : ''}</button>`;
    const seg = (name, val) => `<div class="seg"><button data-flag="${name}" data-val="1" aria-pressed="${val === true}">Oui</button><button data-flag="${name}" data-val="0" aria-pressed="${val === false}">Non</button></div>`;

    $app.innerHTML = head + `
      <div class="field"><div class="label">Tags <span class="count ${over ? 'over' : ''}">${total}/${TAG_LIMIT}</span></div>
        ${existing.length ? `<div class="chips" style="margin-bottom:10px">${existing.map(t => `<span class="chip static">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="chips">${d.fresh.map(t => {
          const on = d.tags.has(t);
          const fits = on || TAGS.tagsLength([...existing, ...d.tags, t]) <= TAG_LIMIT;
          return `<button class="chip ${fits ? '' : 'nofit'}" aria-pressed="${on}" data-tag="${esc(t)}">${esc(t)}</button>`;
        }).join('') || '<span class="muted">Tous les tags proposés sont déjà là.</span>'}</div>
        <div class="meter ${over ? 'over' : ''}"><i style="transform:scaleX(${Math.min(1, total / TAG_LIMIT)})"></i></div>
        <p class="help">Les nouveaux s’ajoutent à la suite des tags existants. Touche un tag pour le retirer.</p></div>

      <div class="field"><div class="label">Titre</div>
        ${opt(-1, `<span class="muted">Garder :</span> ${esc(v.snippet.title)}`)}
        ${p.titles.map((t, k) => opt(k, esc(t), t.length)).join('')}</div>

      ${p.description ? `<div class="field"><div class="label">Description <span class="count">${p.description.length}/5000</span></div>
        <div class="box clamp">${esc(p.description)}</div>
        <div class="switch-row" style="margin-top:10px"><span class="grow" style="flex:1">Remplacer la description actuelle</span>
          <button class="switch" role="switch" aria-checked="${d.useDescription}" data-toggle="useDescription" aria-label="Remplacer la description"></button></div></div>` : ''}

      ${p.hashtags.length ? `<div class="field"><div class="label">Hashtags</div>
        <div class="chips">${p.hashtags.map(h => `<span class="chip static">${esc(h)}</span>`).join('')}</div>
        <div class="switch-row" style="margin-top:10px"><span style="flex:1">Ajouter en fin de description</span>
          <button class="switch" role="switch" aria-checked="${d.useHashtags}" data-toggle="useHashtags" aria-label="Ajouter les hashtags"></button></div></div>` : ''}

      <div class="field"><div class="label">Paramètres</div>
        <label class="param"><span>Catégorie</span><select class="input" id="cat">${CATEGORIES.map(([id, name]) => `<option value="${id}" ${id === String(d.categoryId) ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>
        <div class="param"><span>Conçue pour les enfants</span>${seg('madeForKids', d.madeForKids)}</div>
        <div class="param"><span>Promotion rémunérée</span>${seg('paidPromo', d.paidPromo)}</div>
        <div class="param"><span>Contenu modifié / IA</span>${seg('altered', d.altered)}</div>
        <p class="help">Titre et description en ${esc(AI.contentLang(settings, { language: languageName(v.snippet.defaultAudioLanguage || v.snippet.defaultLanguage) }))}.</p></div>

      <form class="row field" id="regen"><input class="input grow" id="extra" placeholder="Consigne (optionnel) : plus court, humour…" autocomplete="off">
        <button class="btn" type="submit" aria-label="Régénérer">${icon('refresh')}</button></form>

      <div class="bar"><div class="inner"><button class="btn primary block" id="apply" ${over ? 'disabled' : ''}>${icon('check')}Appliquer sur YouTube</button></div></div>`;
  }

  async function apply(btn) {
    const v = state.video, p = state.proposal, d = state.draft;
    btn.disabled = true;
    btn.innerHTML = `${loading('Envoi…')}`;
    try {
      // Re-read right before writing: snippet/status parts are replaced as a whole by videos.update.
      const fresh = (await yt(`/videos?part=snippet,status&id=${encodeURIComponent(v.id)}`)).items?.[0];
      if (!fresh) throw new Error('Vidéo introuvable.');
      const s = fresh.snippet, st = fresh.status;
      const tags = [...(s.tags || [])];
      for (const t of d.fresh) if (d.tags.has(t) && !tags.some(x => x.toLowerCase() === t.toLowerCase()) && TAGS.tagsLength([...tags, t]) <= TAG_LIMIT) tags.push(t);
      let description = d.useDescription ? p.description : (s.description || '');
      if (d.useHashtags) {
        const have = new Set((description.match(/#[\p{L}\p{N}_]+/gu) || []).map(h => h.toLowerCase()));
        const add = p.hashtags.filter(h => !have.has(h.toLowerCase()));
        if (add.length) description = `${description}${description ? '\n\n' : ''}${add.join(' ')}`;
      }
      const body = {
        id: v.id,
        snippet: {
          title: (d.titleIndex >= 0 ? p.titles[d.titleIndex] : s.title).slice(0, 100),
          description: description.slice(0, 5000),
          tags,
          categoryId: String(d.categoryId || s.categoryId),
          defaultLanguage: s.defaultLanguage,
          defaultAudioLanguage: s.defaultAudioLanguage
        },
        status: {
          privacyStatus: st.privacyStatus,
          publishAt: st.publishAt,
          license: st.license,
          embeddable: st.embeddable,
          publicStatsViewable: st.publicStatsViewable,
          selfDeclaredMadeForKids: d.madeForKids,
          containsSyntheticMedia: d.altered
        }
      };
      body.paidProductPlacementDetails = { hasPaidProductPlacement: d.paidPromo };
      let updated, promoSkipped = false;
      try {
        updated = await yt('/videos?part=snippet,status,paidProductPlacementDetails', { method: 'PUT', body: JSON.stringify(body) });
      } catch (err) {
        // If this API project may not write the paid-promotion part, save the rest and say so.
        if (!/paidProductPlacement/i.test(err.message)) throw err;
        delete body.paidProductPlacementDetails;
        updated = await yt('/videos?part=snippet,status', { method: 'PUT', body: JSON.stringify(body) });
        promoSkipped = true;
      }
      state.video = { ...state.video, snippet: updated.snippet, status: { ...state.video.status, ...updated.status } };
      btn.classList.add('done');
      btn.innerHTML = `${icon('check')}Appliqué sur YouTube`;
      toast(promoSkipped
        ? 'Appliqué, sauf la promotion rémunérée (refusée par YouTube) : règle-la dans Studio'
        : `${tags.length - (s.tags || []).length} tag(s) ajouté(s) · visible dans YouTube Studio`, promoSkipped);
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = `${icon('check')}Appliquer sur YouTube`;
      if (e.needLogin) { toast('Reconnecte-toi à Google puis réessaie', true); token = null; }
      else toast(e.message, true);
    }
  }

  function renderSettings() {
    const s = settings;
    const id = s.provider;
    const prov = PROVIDERS[id];
    const key = s.keys?.[id] || '';
    const origin = location.origin;
    const seg = (name, val) => `<div class="seg"><button data-pref="${name}" data-val="1" aria-pressed="${val === true}">Oui</button><button data-pref="${name}" data-val="0" aria-pressed="${val === false}">Non</button></div>`;
    $app.innerHTML = `
      <h1>Réglages</h1>
      <p class="lead">Enregistrés sur ce téléphone uniquement.</p>

      <div class="field"><div class="label">IA</div>
        <select class="input" id="provider">${Object.entries(PROVIDERS).map(([pid, p]) => `<option value="${pid}" ${pid === id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>
        <input class="input" id="key" type="password" autocomplete="off" style="margin-top:8px" placeholder="${key ? `Clé enregistrée · …${esc(key.slice(-4))}` : `Clé API ${esc(prov.label)}`}">
        <input class="input" id="model" style="margin-top:8px" value="${esc(s.models?.[id] || prov.model)}" placeholder="Modèle" autocomplete="off">
        <p class="help"><a href="${esc(prov.keyUrl)}" target="_blank" rel="noopener">Obtenir une clé ${esc(prov.label)}</a> · Groq et Gemini marchent depuis le téléphone.</p></div>

      <div class="field"><div class="label">Langue des titres et descriptions</div>
        <select class="input" id="lang">${[['Auto', 'Auto : anglais, sauf vidéo dans une autre langue'], ...['English', 'Français', 'Español', 'Deutsch', 'Português', 'Italiano'].map(l => [l, l])].map(([v, l]) => `<option value="${v}" ${v === s.contentLang ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <p class="help">La langue de la vidéo se règle dans YouTube Studio (Langue de la vidéo).</p></div>

      <div class="field"><div class="label">Préférences par défaut</div>
        <div class="param"><span>Conçue pour les enfants</span>${seg('madeForKids', s.prefs.madeForKids)}</div>
        <div class="param"><span>Promotion rémunérée</span>${seg('paidPromo', s.prefs.paidPromo)}</div>
        <div class="param"><span>Contenu modifié / IA</span>${seg('altered', s.prefs.altered)}</div>
        <label class="param"><span>Catégorie</span><select class="input" id="prefCat"><option value="-1">Choix de l’IA</option>${CATEGORIES.map(([, name], k) => `<option value="${k}" ${k === s.prefs.category ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label></div>

      <div class="field"><div class="label">Connexion Google</div>
        <input class="input" id="clientId" value="${esc(s.clientId)}" placeholder="Client ID OAuth (…apps.googleusercontent.com)" autocomplete="off">
        <details style="margin-top:10px"><summary class="muted">Comment l’obtenir (une seule fois, ~10 min)</summary>
          <ol class="steps" style="margin-top:10px">
            <li>Sur <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">console.cloud.google.com</a>, crée un projet.</li>
            <li>APIs et services → Bibliothèque → active <b>YouTube Data API v3</b>.</li>
            <li>Écran de consentement OAuth → type <b>Externe</b>, ajoute ton adresse Gmail dans <b>Utilisateurs test</b>.</li>
            <li>Identifiants → Créer → <b>ID client OAuth</b> → type <b>Application Web</b> → Origines JavaScript autorisées : <code>${esc(origin)}</code></li>
            <li>Copie le Client ID ici. Au premier login, Google affiche « application non validée » : c’est normal pour une app perso, continue.</li>
          </ol></details></div>

      <button class="btn block" data-go="home">Terminé</button>`;
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', async e => {
    const t = e.target.closest('button, a');
    if (!t) return;
    const d = t.dataset;
    if (d.go) return go(d.go);
    if (d.open) return openVideo(d.open);
    if (t.id === 'login') {
      try { await getToken(true); renderHome(); } catch (err) { toast(err.message, true); }
      return;
    }
    if (t.id === 'loginThen') {
      try { await getToken(true); openVideo(d.id); } catch (err) { toast(err.message, true); }
      return;
    }
    if (t.id === 'gen') return generate();
    if (t.id === 'apply') return apply(t);
    const dr = state.draft;
    if (d.title !== undefined && dr) { dr.titleIndex = Number(d.title); return renderVideo(); }
    if (d.tag !== undefined && dr) {
      if (dr.tags.has(d.tag)) dr.tags.delete(d.tag);
      else if (!t.classList.contains('nofit')) dr.tags.add(d.tag);
      return renderVideo();
    }
    if (d.toggle && dr) { dr[d.toggle] = !dr[d.toggle]; return renderVideo(); }
    if (d.flag && dr) { dr[d.flag] = d.val === '1'; return renderVideo(); }
    if (d.pref) { settings.prefs[d.pref] = d.val === '1'; save(); return renderSettings(); }
  });

  document.addEventListener('submit', e => {
    e.preventDefault();
    if (e.target.id === 'pick') {
      const id = parseVideoId(document.getElementById('link').value);
      if (id) openVideo(id); else toast('Lien ou ID non reconnu', true);
    }
    if (e.target.id === 'regen') generate(document.getElementById('extra').value.trim());
  });

  document.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'provider') { settings.provider = el.value; save(); return renderSettings(); }
    if (el.id === 'key' && el.value.trim()) { settings.keys = { ...settings.keys, [settings.provider]: el.value.trim() }; save(); toast('Clé enregistrée'); return renderSettings(); }
    if (el.id === 'model') { settings.models = { ...settings.models, [settings.provider]: el.value.trim() }; save(); }
    if (el.id === 'lang') { settings.contentLang = el.value; save(); }
    if (el.id === 'prefCat') { settings.prefs.category = Number(el.value); save(); }
    if (el.id === 'clientId') { settings.clientId = el.value.trim(); token = null; save(); toast('Client ID enregistré'); }
    if (el.id === 'cat' && state.draft) state.draft.categoryId = el.value;
  });

  /* ---------- Start: shared link (Web Share Target) or home ---------- */
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const q = new URLSearchParams(location.search);
  const shared = [q.get('url'), q.get('text'), q.get('title')].filter(Boolean).join(' ');
  const sharedId = parseVideoId(shared);
  if (sharedId) {
    history.replaceState(null, '', location.pathname);
    openVideo(sharedId, shared);
  } else {
    render();
  }
})();

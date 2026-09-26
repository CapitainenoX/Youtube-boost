/* Video Boost — YouTube Studio DOM adapter.
 * Reads and writes title / description / tags through Studio's own fields, so Studio's save button,
 * its validation and extensions watching those fields (vidIQ) all see the change as if typed by hand.
 * Studio's markup changes without notice: every lookup tries several selectors, first match wins. */
(function () {
  const $ = (sels, root = document) => {
    for (const s of sels) {
      const el = root.querySelector(s);
      if (el) return el;
    }
    return null;
  };

  const SEL = {
    title: ['ytcp-video-title #textbox', '#title-textarea #textbox', 'ytcp-social-suggestions-textbox[label*="itle"] #textbox'],
    description: ['ytcp-video-description #textbox', '#description-textarea #textbox'],
    tagsContainer: ['ytcp-video-metadata-editor-advanced #tags-container', '#tags-container', 'ytcp-free-text-chip-bar'],
    tagInput: ['input#text-input', 'input'],
    chip: ['ytcp-chip', 'ytcp-free-text-chip'],
    showMore: ['ytcp-video-metadata-editor #toggle-button', 'ytcp-button#toggle-button', '#toggle-button'],
    category: ['#category .dropdown-trigger-text', '#category ytcp-dropdown-trigger', 'ytcp-form-select#category']
  };

  const LIMITS = { title: 100, description: 5000, tags: 500 };

  function videoId() {
    if (location.hostname !== 'studio.youtube.com') return null;
    const m = location.pathname.match(/^\/video\/([\w-]{6,})\/(edit|details)/);
    return m ? m[1] : null;
  }

  function isShort() {
    return !!document.querySelector('a[href*="/shorts/"]');
  }

  const text = el => (el ? el.innerText.replace(/ /g, ' ').trim() : '');

  function tagsContainer() {
    return $(SEL.tagsContainer);
  }

  function readTags() {
    const box = tagsContainer();
    if (!box) return null; // advanced section not rendered yet
    return [...box.querySelectorAll(SEL.chip.join(','))]
      .map(c => text(c.querySelector('#chip-text, #text, .text') || c))
      .filter(Boolean);
  }

  // YouTube's 500-char budget: commas between tags count, and a tag with a space is stored quoted (+2).
  function tagCost(tag) {
    return tag.length + (/\s/.test(tag) ? 2 : 0);
  }
  function tagsLength(tags) {
    return tags.reduce((n, t) => n + tagCost(t), 0) + Math.max(0, tags.length - 1);
  }

  // vidIQ injects its own nodes into Studio. We read them as plain text context for the AI
  // (keyword scores, suggested tags, channel tags…) without depending on its exact markup.
  function readVidiq() {
    const nodes = [...document.querySelectorAll('[class*="vidiq" i], [id*="vidiq" i], [data-vidiq], vidiq-root, [class*="vidIQ"]')]
      .filter(n => !n.closest('#video-boost-root') && !/^(STYLE|SCRIPT|LINK|META|TEMPLATE)$/.test(n.tagName));
    const top = nodes.filter(n => !nodes.some(o => o !== n && o.contains(n)));
    const raw = top.map(n => n.innerText || '').join('\n').replace(/\n{2,}/g, '\n').trim();
    return { detected: nodes.length > 0, text: raw.slice(0, 2500) };
  }

  function read() {
    return {
      videoId: videoId(),
      isShort: isShort(),
      title: text($(SEL.title)),
      description: text($(SEL.description)),
      tags: readTags(),
      category: categoryText(),
      vidiq: readVidiq(),
      found: { title: !!$(SEL.title), description: !!$(SEL.description), tags: !!tagsContainer() }
    };
  }

  /* ---------- Writing ---------- */

  function replaceEditable(el, value) {
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    // insertText goes through the browser's editing pipeline → Studio registers a real edit (undo works too).
    const ok = document.execCommand('insertText', false, value);
    if (!ok || text(el) !== value.trim()) {
      el.textContent = value;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    }
    el.blur();
  }

  function setTitle(value) {
    const el = $(SEL.title);
    if (!el) throw new Error('Champ titre introuvable sur cette page.');
    replaceEditable(el, value.slice(0, LIMITS.title));
  }

  function setDescription(value) {
    const el = $(SEL.description);
    if (!el) throw new Error('Champ description introuvable sur cette page.');
    replaceEditable(el, value.slice(0, LIMITS.description));
  }

  function appendHashtags(hashtags) {
    const el = $(SEL.description);
    if (!el) throw new Error('Champ description introuvable sur cette page.');
    const current = text(el);
    const have = new Set((current.match(/#[\p{L}\p{N}_]+/gu) || []).map(h => h.toLowerCase()));
    const add = hashtags.filter(h => !have.has(h.toLowerCase()));
    if (!add.length) return 0;
    replaceEditable(el, `${current}${current ? '\n\n' : ''}${add.join(' ')}`.slice(0, LIMITS.description));
    return add.length;
  }

  // Opens Studio's "Show more" section, where the tags field lives.
  async function ensureTagsVisible() {
    if (tagsContainer()) return tagsContainer();
    const btn = $(SEL.showMore);
    if (btn) btn.click();
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (tagsContainer()) return tagsContainer();
    }
    throw new Error('Champ tags introuvable : ouvre « Afficher plus » dans Studio.');
  }

  function pressEnter(input) {
    for (const type of ['keydown', 'keypress', 'keyup']) {
      input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    }
  }

  // Appends tags after the existing ones, skipping duplicates and anything past the 500-char budget.
  async function addTags(tags) {
    const box = await ensureTagsVisible();
    const input = $(SEL.tagInput, box);
    if (!input) throw new Error('Saisie des tags introuvable.');
    const existing = readTags() || [];
    const seen = new Set(existing.map(t => t.toLowerCase()));
    const added = [];
    const skipped = [];
    for (const raw of tags) {
      const tag = cleanTag(raw);
      if (!tag || seen.has(tag.toLowerCase())) continue;
      if (tagsLength([...existing, ...added, tag]) > LIMITS.tags) { skipped.push(tag); continue; }
      input.focus();
      input.value = tag;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      pressEnter(input);
      // Fallback: some chip bars only commit on a trailing comma.
      if (input.value) {
        input.value = tag + ',';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      seen.add(tag.toLowerCase());
      added.push(tag);
      await new Promise(r => setTimeout(r, 30));
    }
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
    return { added, skipped };
  }

  async function removeTag(tag) {
    const box = await ensureTagsVisible();
    const chip = [...box.querySelectorAll(SEL.chip.join(','))]
      .find(c => text(c.querySelector('#chip-text, #text, .text') || c).toLowerCase() === tag.toLowerCase());
    const del = chip?.querySelector('#delete-icon, [icon*="clear"], [aria-label*="upprimer"], [aria-label*="emove"], [aria-label*="elete"]');
    if (!del) throw new Error('Impossible de retirer ce tag automatiquement.');
    del.click();
  }

  function cleanTag(t) {
    return String(t || '').replace(/^#/, '').replace(/[<>,"]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* ---------- Other parameters: category, audience, paid promotion, altered content ----------
   * Studio mixes Polymer (light DOM) and Lit components (shadow DOM), so these lookups walk every open
   * shadow root. Each control is found by name/id first, then by its visible label (FR + EN) or the
   * heading of its section. Every reader returns null when the control is not found. */

  // Studio's 15 categories, in Studio's order. Matching accepts either language.
  const CATEGORIES = [
    ['Films et animations', 'Film & Animation'], ['Auto/Moto', 'Autos & Vehicles'], ['Musique', 'Music'],
    ['Animaux', 'Pets & Animals'], ['Sport', 'Sports'], ['Voyages et événements', 'Travel & Events'],
    ['Jeux vidéo', 'Gaming'], ['People et blogs', 'People & Blogs'], ['Humour', 'Comedy'],
    ['Divertissement', 'Entertainment'], ['Actualités et politique', 'News & Politics'],
    ['Vie pratique et style', 'Howto & Style'], ['Éducation', 'Education'],
    ['Science et technologie', 'Science & Technology'], ['Organisations à but non lucratif', 'Nonprofits & Activism']
  ];
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function categoryIndex(name) {
    const n = norm(name);
    if (!n) return -1;
    return CATEGORIES.findIndex(pair => pair.some(c => norm(c) === n || (n.length > 3 && norm(c).startsWith(n))));
  }

  const inPanel = el => !!el.closest?.('#video-boost-root') || el.getRootNode?.().host?.id === 'video-boost-root';

  // Every open shadow root under `root` (ours excluded). The page-wide list is cached for 1 s because
  // the panel re-reads the parameters on a timer and a full DOM walk is the expensive part.
  function collectRoots(root) {
    const found = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let n = walker.currentNode; n; n = walker.nextNode()) {
      if (n.shadowRoot && n.id !== 'video-boost-root') found.push(n.shadowRoot, ...collectRoots(n.shadowRoot));
    }
    return found;
  }
  let rootsCache = { at: 0, roots: [] };
  function shadowRoots(root) {
    if (root !== document) return collectRoots(root);
    if (Date.now() - rootsCache.at > 1000) rootsCache = { at: Date.now(), roots: collectRoots(document) };
    return rootsCache.roots;
  }

  // querySelectorAll that also searches inside every open shadow root.
  function deepAll(selector, root = document) {
    const out = [...root.querySelectorAll(selector)];
    for (const r of shadowRoots(root)) if (r.host.isConnected) out.push(...r.querySelectorAll(selector));
    return out.filter(el => !inPanel(el));
  }
  const deep = (selector, root) => deepAll(selector, root)[0] || null;

  // Visible text of an element, including text rendered inside its shadow root.
  function deepText(el) {
    if (!el) return '';
    let t = '';
    const visit = node => {
      for (const c of node.childNodes) {
        if (c.nodeType === 3) t += c.data + ' ';
        else if (c.nodeType === 1 && !/^(STYLE|SCRIPT)$/.test(c.tagName)) visit(c);
      }
      if (node.shadowRoot) visit(node.shadowRoot);
    };
    visit(el);
    return `${el.getAttribute?.('aria-label') || ''} ${t}`.replace(/\s+/g, ' ').trim();
  }

  const visible = el => el && el.getClientRects().length > 0;

  const isChecked = el => {
    if (!el) return null;
    const a = el.getAttribute('aria-checked') ?? deep('[aria-checked]', el.shadowRoot || el)?.getAttribute('aria-checked');
    if (a != null) return a === 'true';
    return el.hasAttribute('checked') || el.checked === true;
  };

  const RADIO = 'tp-yt-paper-radio-button, ytcp-radio-button, [role="radio"], input[type="radio"]';
  const CHECKBOX = 'ytcp-checkbox-lit, tp-yt-paper-checkbox, ytcp-checkbox, [role="checkbox"], input[type="checkbox"]';
  const GROUP = 'tp-yt-paper-radio-group, ytcp-radio-group, [role="radiogroup"]';
  // Avoid a role="radio" inside a tp-yt-paper-radio-button being counted twice.
  const radios = root => deepAll(RADIO, root).filter(r => !r.parentElement?.closest?.('tp-yt-paper-radio-button, ytcp-radio-button'));

  const YES = /^(oui|yes)\b/i, NO = /^(non|no)\b/i;

  function kidsRadio(yes) {
    const byName = deep(`[name="${yes ? 'VIDEO_MADE_FOR_KIDS_MFK' : 'VIDEO_MADE_FOR_KIDS_NOT_MFK'}"]`);
    if (byName) return byName;
    const kids = /enfant|kids|children/i;
    return radios().find(r => { const t = deepText(r); return (yes ? YES : NO).test(t) && kids.test(t); }) || null;
  }

  // Studio (2026) asks a Yes/No question: VIDEO_PAID_PRODUCT_PLACEMENT_NOTIFY / _NO.
  function paidPromoRadio(yes) {
    const byName = deep(`[name="${yes ? 'VIDEO_PAID_PRODUCT_PLACEMENT_NOTIFY' : 'VIDEO_PAID_PRODUCT_PLACEMENT_NO'}"]`);
    if (byName) return byName;
    const re = /promotion (r[ée]mun[ée]r[ée]e|pay[ée]e)|paid promotion|placement de produit|product placement/i;
    return radios().find(r => { const t = deepText(r); return (yes ? YES : NO).test(t) && re.test(t); }) || null;
  }

  // Older layout: a single checkbox.
  function paidPromoBox() {
    const re = /paid promotion|promotion pay|communication commerciale|placement de produit|product placement|parrainage|sponsor/i;
    return deepAll(CHECKBOX).filter(c => !c.parentElement?.closest?.('ytcp-checkbox-lit, tp-yt-paper-checkbox'))
      .find(c => re.test(deepText(c)) || re.test(deepText(c.parentElement))) || null;
  }

  // The altered/synthetic question is a plain Yes/No group under a heading that mentions it.
  const ALTERED = /altered|synthetic|synth[ée]tique|contenu (modifi|alt[ée]r)|modifi[ée] ou synth|r[ée]aliste|g[ée]n[ée]r[ée]|\bIA\b|\bAI\b/i;
  function alteredRadio(yes) {
    const byName = deep(`[name="${yes ? 'VIDEO_HAS_ALTERED_CONTENT_YES' : 'VIDEO_HAS_ALTERED_CONTENT_NO'}"]`) ||
      deepAll(RADIO).find(r => /ALTER|SYNTH/i.test(r.getAttribute('name') || '') && (yes ? /_YES$/i : /_NO$/i).test(r.getAttribute('name')));
    if (byName) return byName;
    for (const g of deepAll(GROUP)) {
      const rs = radios(g);
      if (rs.some(r => /enfant|kids/i.test(deepText(r)) || /MADE_FOR_KIDS/.test(r.getAttribute('name') || ''))) continue;
      // Walk up while the ancestor holds only this group; the heading must be found there.
      let found = false;
      for (let a = g.parentElement, n = 0; a && n < 6 && !found; a = a.parentElement, n++) {
        if (a.querySelectorAll(GROUP).length > 1) break;
        found = ALTERED.test(deepText(a).slice(0, 1200));
      }
      if (!found) continue;
      const r = rs.find(x => (yes ? YES : NO).test(deepText(x)));
      if (r) return r;
    }
    return null;
  }

  function ageRadio(restricted) {
    const byName = deep(`[name="${restricted ? 'VIDEO_AGE_RESTRICTION_SELF' : 'VIDEO_AGE_RESTRICTION_NONE'}"]`);
    if (byName) return byName;
    return radios().find(r => { const t = deepText(r); return (restricted ? YES : NO).test(t) && /18 ans|over 18|18\+/i.test(t); }) || null;
  }

  const pick = (yesEl, noEl) => (yesEl && isChecked(yesEl) ? true : noEl && isChecked(noEl) ? false : null);

  const CATEGORY_TRIGGER = '#category ytcp-dropdown-trigger, ytcp-form-select#category, #category';
  function categoryField() {
    const byId = deep(CATEGORY_TRIGGER);
    if (byId) return byId;
    // Fallback: a select-like control whose label reads "Catégorie" / "Category".
    return deepAll('ytcp-form-select, ytcp-dropdown-trigger, ytcp-select')
      .find(el => /^\s*(cat[ée]gorie|category)\b/i.test(deepText(el))) || null;
  }
  function categoryText() {
    const f = categoryField();
    if (!f) return '';
    const inner = deep('.dropdown-trigger-text', f.shadowRoot || f) || deep('.dropdown-trigger-text', f);
    const t = inner ? deepText(inner) : deepText(f).replace(/^\s*(cat[ée]gorie|category)\s*/i, '');
    return t.split(/\s{2,}|\n/)[0].trim();
  }

  function readParams() {
    const cat = categoryText();
    const kidsYes = kidsRadio(true), kidsNo = kidsRadio(false);
    const promoYes = paidPromoRadio(true), promoNo = paidPromoRadio(false);
    return {
      category: cat,
      categoryIndex: categoryIndex(cat),
      madeForKids: pick(kidsYes, kidsNo),
      paidPromo: promoYes || promoNo ? pick(promoYes, promoNo) : isChecked(paidPromoBox()),
      altered: pick(alteredRadio(true), alteredRadio(false)),
      ageRestricted: pick(ageRadio(true), ageRadio(false))
    };
  }

  // Polymer radios listen to "tap"/click on the host; clicking the inner radio circle is the fallback.
  function clickControl(el) {
    el.scrollIntoView?.({ block: 'center' });
    el.click();
    if (isChecked(el) === false) (deep('#radioContainer, #checkboxContainer, [role="radio"], [role="checkbox"]', el.shadowRoot || el) || el).click();
  }

  async function withMore(find) {
    let el = find();
    if (!el) { await ensureTagsVisible().catch(() => {}); rootsCache.at = 0; el = find(); }
    return el;
  }

  async function setMadeForKids(yes) {
    const r = await withMore(() => kidsRadio(yes));
    if (!r) throw new Error('Choix « conçue pour les enfants » introuvable (Réglages → Avancé → Diagnostic).');
    if (isChecked(r) !== true) clickControl(r);
  }

  async function setPaidPromo(on) {
    const r = await withMore(() => paidPromoRadio(on));
    if (r) { if (isChecked(r) !== true) clickControl(r); return; }
    const box = paidPromoBox();
    if (!box) throw new Error('Question « promotion rémunérée » introuvable (Réglages → Avancé → Diagnostic).');
    if (isChecked(box) !== on) box.click();
  }

  async function setAgeRestricted(on) {
    const r = await withMore(() => ageRadio(on));
    if (!r) throw new Error('Question « limite d’âge » introuvable (Réglages → Avancé → Diagnostic).');
    if (isChecked(r) !== true) clickControl(r);
  }

  async function setAltered(yes) {
    const r = await withMore(() => alteredRadio(yes));
    if (!r) throw new Error('Question « contenu modifié / IA » introuvable (Réglages → Avancé → Diagnostic).');
    if (isChecked(r) !== true) clickControl(r);
  }

  // Opens Studio's category dropdown and clicks the option matching our index.
  async function setCategory(index) {
    const want = CATEGORIES[index];
    if (!want) throw new Error('Catégorie inconnue.');
    const trigger = await withMore(categoryField);
    if (!trigger) throw new Error('Menu catégorie introuvable (Réglages → Avancé → Diagnostic).');
    const targets = want.map(norm);
    trigger.scrollIntoView?.({ block: 'center' });
    const inner = deep('ytcp-dropdown-trigger, [role="button"], #container', trigger.shadowRoot || trigger);
    (inner || trigger).click();
    const matches = o => { const t = norm(deepText(o)); return targets.some(x => t === x || t.startsWith(x + ' ')); };
    for (let i = 0; i < 25; i++) {
      if (i === 10 && inner) trigger.click(); // nothing opened yet: try the outer element
      await new Promise(r => setTimeout(r, 80));
      rootsCache.at = 0; // the dropdown popup is created on open
      const opt = deepAll('tp-yt-paper-item, ytcp-text-menu tp-yt-paper-item, [role="option"], [role="menuitem"], [role="menuitemradio"]')
        .find(o => visible(o) && matches(o));
      if (opt) { opt.click(); return; }
    }
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    throw new Error(`Option « ${want[0]} » introuvable dans le menu catégorie.`);
  }

  /* ---------- Save ---------- */
  function saveButton() {
    return deep('ytcp-button#save, #save-button, ytcp-button[id="save"]') ||
      deepAll('ytcp-button, button').find(b => /^(enregistrer|save)$/i.test(deepText(b)) && visible(b)) || null;
  }
  const isDisabled = b => b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true';

  // Clicks Studio's own Save button (only ever called from the panel's Enregistrer button).
  async function save() {
    const b = saveButton();
    if (!b) throw new Error('Bouton Enregistrer de Studio introuvable.');
    if (isDisabled(b)) return 'nothing';
    (deep('button', b.shadowRoot || b) || b).click();
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 150));
      if (isDisabled(b) || !b.isConnected) return 'saved';
    }
    return 'pending';
  }

  /* ---------- Diagnostic: what the extension sees, to fix selectors on a real page ---------- */
  function diagnose() {
    const brief = el => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      name: el.getAttribute('name') || undefined,
      checked: isChecked(el),
      shadow: el.getRootNode() !== document || undefined,
      text: deepText(el).slice(0, 80)
    });
    const p = readParams();
    return {
      url: location.pathname,
      found: {
        title: !!$(SEL.title), description: !!$(SEL.description), tags: !!tagsContainer(),
        kidsYes: !!kidsRadio(true), kidsNo: !!kidsRadio(false), paidPromo: !!(paidPromoRadio(true) || paidPromoBox()), ageLimit: !!ageRadio(true),
        alteredYes: !!alteredRadio(true), alteredNo: !!alteredRadio(false), category: !!categoryField(), save: !!saveButton()
      },
      params: p,
      radios: radios().slice(0, 20).map(brief),
      groups: deepAll(GROUP).slice(0, 8).map(g => ({ tag: g.tagName.toLowerCase(), id: g.id || undefined, context: deepText(g.parentElement?.parentElement).slice(0, 160) })),
      checkboxes: deepAll(CHECKBOX).slice(0, 12).map(brief),
      selects: deepAll('ytcp-form-select, ytcp-dropdown-trigger, ytcp-select').slice(0, 10).map(brief),
      saveCandidates: deepAll('ytcp-button, button').filter(b => /enregistrer|save/i.test(deepText(b))).slice(0, 5).map(brief),
      vidiq: readVidiq().text.slice(0, 400)
    };
  }

  /* ---------- vidIQ score (used by the title tester) ----------
   * vidIQ's markup is not documented: a user CSS selector wins, otherwise the first "score"-looking
   * number in vidIQ's text. Returns null when nothing is readable. */
  function readVidiqScore(customSelector) {
    if (customSelector) {
      try {
        const el = document.querySelector(customSelector);
        const n = el && parseInt((el.innerText || el.textContent || '').match(/\d{1,3}/)?.[0], 10);
        if (Number.isFinite(n) && n <= 100) return n;
      } catch { /* invalid selector → fall through */ }
    }
    const t = readVidiq().text;
    const pats = [
      /title\s*score[^\d]{0,12}(\d{1,3})/i,
      /score\s*(?:du\s*)?titre[^\d]{0,12}(\d{1,3})/i,
      /(?:seo|vidiq|overall)\s*score[^\d]{0,12}(\d{1,3})/i,
      /score[^\d\n]{0,12}(\d{1,3})\s*\/\s*100/i,
      /(\d{1,3})\s*\/\s*100/
    ];
    for (const re of pats) {
      const m = t.match(re);
      const n = m && parseInt(m[1], 10);
      if (Number.isFinite(n) && n <= 100) return n;
    }
    return null;
  }

  /* ---------- Channel ---------- */
  function channelId() {
    const m = location.pathname.match(/\/channel\/(UC[\w-]{20,})/);
    if (m) return m[1];
    const a = document.querySelector('a[href*="/channel/UC"]:not(#video-boost-root *)');
    return a?.href.match(/\/channel\/(UC[\w-]{20,})/)?.[1] || null;
  }

  // Rows of Studio's "Contenu" table when it is on screen (richer than the public feed: likes, comments).
  function readContentRows() {
    const num = s => {
      const t = String(s || '').replace(/\s| | /g, '').replace(',', '.');
      const m = t.match(/([\d.]+)([kKmM]|k|M|Md)?/);
      if (!m) return null;
      const mult = /^[kK]$/.test(m[2]) ? 1e3 : /^[mM]$/.test(m[2]) ? 1e6 : 1;
      return Math.round(parseFloat(m[1]) * mult);
    };
    return [...document.querySelectorAll('ytcp-video-row')].map(r => {
      const link = r.querySelector('a[href*="/video/"]');
      const id = link?.getAttribute('href')?.match(/\/video\/([\w-]+)/)?.[1];
      if (!id) return null;
      return {
        id,
        title: text(r.querySelector('#video-title')) || text(link),
        views: num(text(r.querySelector('.tablecell-views'))),
        comments: num(text(r.querySelector('.tablecell-comments'))),
        likes: text(r.querySelector('.tablecell-likes')).split('\n')[0] || null,
        date: text(r.querySelector('.tablecell-date')).split('\n')[0] || '',
        isShort: /short/i.test(r.innerText)
      };
    }).filter(Boolean);
  }

  window.VBStudio = {
    read, videoId, setTitle, setDescription, appendHashtags, addTags, removeTag, ensureTagsVisible, tagCost, tagsLength, cleanTag, LIMITS,
    CATEGORIES, categoryIndex, readParams, setMadeForKids, setPaidPromo, setAltered, setCategory, save, saveButton, diagnose, setAgeRestricted,
    readVidiq, readVidiqScore, channelId, readContentRows
  };
})();

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
      .filter(n => !n.closest('#video-boost-root'));
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
      category: text($(SEL.category)).split('\n')[0] || '',
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
   * Found by name attribute first, then by their visible label (FR + EN), so a Studio redesign or the
   * interface language does not break them. Every reader returns null when the control is not found. */

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

  const isChecked = el => {
    if (!el) return null;
    const a = el.getAttribute('aria-checked') ?? el.querySelector('[aria-checked]')?.getAttribute('aria-checked');
    if (a != null) return a === 'true';
    return el.hasAttribute('checked') || el.checked === true;
  };
  const labelOf = el => `${el.getAttribute('aria-label') || ''} ${el.innerText || ''}`.replace(/\s+/g, ' ').trim();

  const RADIO = 'tp-yt-paper-radio-button, [role="radio"], input[type="radio"]';
  const CHECKBOX = 'ytcp-checkbox-lit, tp-yt-paper-checkbox, [role="checkbox"], input[type="checkbox"]';

  function kidsRadio(yes) {
    const byName = document.querySelector(`tp-yt-paper-radio-button[name="${yes ? 'VIDEO_MADE_FOR_KIDS_MFK' : 'VIDEO_MADE_FOR_KIDS_NOT_MFK'}"]`);
    if (byName) return byName;
    const re = yes ? /^(oui|yes)\b.*(enfant|kids)/i : /^(non|no)\b.*(enfant|kids)/i;
    return [...document.querySelectorAll(RADIO)].find(r => re.test(labelOf(r)) && !r.closest('#video-boost-root')) || null;
  }

  function paidPromoBox() {
    const re = /paid promotion|promotion pay|communication commerciale|placement de produit|product placement|sponsor/i;
    return [...document.querySelectorAll(CHECKBOX)].find(c => re.test(labelOf(c)) || re.test(labelOf(c.parentElement || c))) || null;
  }

  // The altered/synthetic content question is a Yes/No radio group under a heading that mentions it.
  function alteredRadio(yes) {
    const heading = /altered content|synthetic|contenu (modifi|alt[ée]r|synth[ée]tique)|g[ée]n[ée]r[ée] par (l'|l’)?ia/i;
    const GROUP = 'tp-yt-paper-radio-group, [role="radiogroup"]';
    // Walk up from each group while the ancestor holds only this group, and look for the heading there.
    const underHeading = g => {
      for (let a = g.parentElement, n = 0; a && n < 6; a = a.parentElement, n++) {
        if (a.querySelectorAll(GROUP).length > 1) return false;
        if (heading.test((a.innerText || '').slice(0, 800))) return true;
      }
      return false;
    };
    const groups = [...document.querySelectorAll(GROUP)]
      .filter(g => !g.closest('#video-boost-root') && !g.querySelector('[name*="MADE_FOR_KIDS"]'))
      .filter(underHeading);
    for (const g of groups) {
      const r = [...g.querySelectorAll(RADIO)].find(x => (yes ? /^(oui|yes)\b/i : /^(non|no)\b/i).test(labelOf(x)));
      if (r) return r;
    }
    return null;
  }

  function readParams() {
    const cat = text($(SEL.category)).split('\n')[0] || '';
    const kidsYes = kidsRadio(true), kidsNo = kidsRadio(false);
    const altYes = alteredRadio(true), altNo = alteredRadio(false);
    return {
      category: cat,
      categoryIndex: categoryIndex(cat),
      madeForKids: kidsYes && isChecked(kidsYes) ? true : kidsNo && isChecked(kidsNo) ? false : null,
      paidPromo: isChecked(paidPromoBox()),
      altered: altYes && isChecked(altYes) ? true : altNo && isChecked(altNo) ? false : null
    };
  }

  function setMadeForKids(yes) {
    const r = kidsRadio(yes);
    if (!r) throw new Error('Choix « conçue pour les enfants » introuvable.');
    r.click();
  }

  async function setPaidPromo(on) {
    let box = paidPromoBox();
    if (!box) { await ensureTagsVisible().catch(() => {}); box = paidPromoBox(); }
    if (!box) throw new Error('Case « promotion payée » introuvable (section Afficher plus).');
    if (isChecked(box) !== on) box.click();
  }

  async function setAltered(yes) {
    let r = alteredRadio(yes);
    if (!r) { await ensureTagsVisible().catch(() => {}); r = alteredRadio(yes); }
    if (!r) throw new Error('Question « contenu modifié / IA » introuvable.');
    r.click();
  }

  // Opens Studio's category dropdown and clicks the option matching our index.
  async function setCategory(index) {
    const want = CATEGORIES[index];
    if (!want) throw new Error('Catégorie inconnue.');
    let trigger = document.querySelector('#category ytcp-dropdown-trigger, ytcp-form-select#category, #category');
    if (!trigger) { await ensureTagsVisible().catch(() => {}); trigger = document.querySelector('#category ytcp-dropdown-trigger, ytcp-form-select#category, #category'); }
    if (!trigger) throw new Error('Menu catégorie introuvable (section Afficher plus).');
    trigger.click();
    const targets = want.map(norm);
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 80));
      const opt = [...document.querySelectorAll('tp-yt-paper-item, [role="option"], ytcp-ve[role="option"]')]
        .find(o => o.offsetParent !== null && targets.includes(norm(o.innerText)));
      if (opt) { opt.click(); return; }
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    throw new Error(`Option « ${want[0]} » introuvable dans le menu.`);
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
    CATEGORIES, categoryIndex, readParams, setMadeForKids, setPaidPromo, setAltered, setCategory,
    readVidiq, readVidiqScore, channelId, readContentRows
  };
})();

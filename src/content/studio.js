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

  window.VBStudio = { read, videoId, setTitle, setDescription, appendHashtags, addTags, removeTag, ensureTagsVisible, tagCost, tagsLength, cleanTag, LIMITS };
})();

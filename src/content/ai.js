/* Video Boost — prompt building and proposal parsing.
 * The model answers in short prose plus one fenced ```boost JSON block; the panel turns that block
 * into approve-able cards (titles, description, tags, hashtags). */
(function () {
  function systemPrompt(ctx, settings) {
    const tagLang = settings.tagMode === 'mixed'
      ? `mostly English, plus 2–4 tags in ${settings.contentLang} if the audience speaks it`
      : 'English only';
    const vidiq = settings.useVidiq && ctx.vidiq?.detected && ctx.vidiq.text
      ? `\n\nvidIQ DATA (scraped from the vidIQ extension on this page — use it: favour keywords with high search volume / high overall score and low competition, reuse its category signals, never copy low-score tags):\n"""\n${ctx.vidiq.text}\n"""`
      : '';

    return `You are Video Boost, a senior YouTube SEO strategist embedded in YouTube Studio.
Goal: maximise search + browse + suggested reach for THIS ${ctx.isShort ? 'YouTube Short' : 'video'} without clickbait that hurts retention.

CURRENT VIDEO
- Format: ${ctx.isShort ? 'Short (vertical, < 3 min)' : 'long-form video'}
- Title: ${ctx.title || '(empty)'}
- Description: ${ctx.description ? ctx.description.slice(0, 1800) : '(empty)'}
- Existing tags: ${ctx.tags?.length ? ctx.tags.join(', ') : '(none)'}
- Category: ${ctx.category || 'unknown'}${vidiq}

RULES
- Titles: in ${settings.contentLang}, ≤ 70 characters (hard max 100), main keyword in the first 40 characters, a clear hook or benefit, no ALL CAPS, max one emoji. Give 3 distinct angles.
- Description: in ${settings.contentLang}. First 150 characters = hook + main keyword (what shows in search). Then 2–4 short paragraphs of value, natural keywords, a call to action. No fake links, no placeholders like [LINK].
- Tags: ${tagLang}. 12–20 tags, each 1–3 words, lowercase, short and high-impact for the algorithm: exact main keyword first, then close variants, then specific long-tail, then 2–3 broad niche tags. No '#', no duplicates, nothing already in "Existing tags", total under 400 characters.
- Hashtags: 3–5, CamelCase or lowercase, relevant and searchable; the first 3 appear above the title.${ctx.isShort ? ' Include #shorts.' : ''}
- Category: suggest the best YouTube category if the current one looks wrong.
- Be concise: 1–3 short sentences of explanation, in French, then the block. Never invent statistics or search volumes; only cite numbers present in the vidIQ data.

OUTPUT FORMAT
When you propose anything applicable, end your answer with exactly one block:
\`\`\`boost
{"titles": ["..."], "description": "...", "tags": ["..."], "hashtags": ["#..."], "category": "..."}
\`\`\`
Include only the keys the user asked for (all of them for a full optimisation). Valid JSON, double quotes. If the user just chats, answer normally without a block.`;
  }

  const QUICK = {
    all: 'Optimise tout : 3 titres, une description, les tags et les hashtags.',
    titles: 'Propose 3 titres optimisés.',
    description: 'Réécris la description pour le SEO.',
    tags: 'Propose des tags courts et impactants à ajouter.',
    hashtags: 'Propose les meilleurs hashtags.'
  };

  const FENCE = '```boost';

  // Splits a (possibly partial) answer into visible prose and the proposal JSON.
  function parse(raw) {
    const start = raw.indexOf(FENCE);
    if (start < 0) return { prose: raw.trim(), proposal: null, pending: false };
    const prose = raw.slice(0, start).trim();
    const end = raw.indexOf('```', start + FENCE.length);
    if (end < 0) return { prose, proposal: null, pending: true };
    const json = raw.slice(start + FENCE.length, end).trim();
    return { prose, proposal: toProposal(json), pending: false };
  }

  function toProposal(json) {
    let o;
    try { o = JSON.parse(json); } catch {
      try { o = JSON.parse(json.replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
    }
    const S = window.VBStudio;
    const arr = v => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map(x => String(x).trim()).filter(Boolean);
    const p = {
      titles: arr(o.titles || o.title).slice(0, 5),
      description: typeof o.description === 'string' ? o.description.trim() : '',
      tags: [...new Set(arr(o.tags).map(S.cleanTag).filter(Boolean).map(t => t.toLowerCase()))],
      hashtags: [...new Set(arr(o.hashtags).map(h => '#' + h.replace(/^#+/, '').replace(/\s+/g, '')).filter(h => h.length > 1))],
      category: typeof o.category === 'string' ? o.category.trim() : ''
    };
    const empty = !p.titles.length && !p.description && !p.tags.length && !p.hashtags.length && !p.category;
    return empty ? null : p;
  }

  window.VBAI = { systemPrompt, parse, QUICK };
})();

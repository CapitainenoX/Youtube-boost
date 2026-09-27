/* Video Boost — prompt building and proposal parsing.
 * The model answers in short prose plus one fenced ```boost JSON block; the panel turns that block
 * into approve-able cards (titles, description, tags, hashtags). */
(function () {
  // Language of titles and descriptions. 'Auto' = English, unless the video itself is set to another
  // language (Studio's "Langue de la vidéo" / the API's defaultAudioLanguage), then that language.
  function contentLang(settings, ctx) {
    const pick = settings.contentLang && settings.contentLang !== 'Auto' ? settings.contentLang : '';
    if (pick) return pick;
    const v = String(ctx?.language || '').trim();
    return v && !/^(en|english|anglais)\b/i.test(v) ? v : 'English';
  }

  function systemPrompt(ctx, settings, channel) {
    const lang = contentLang(settings, ctx);
    const tagLang = settings.tagMode === 'mixed'
      ? `mostly English, plus 2–4 tags in ${lang} if the audience speaks it`
      : 'English only';
    const vidiq = settings.useVidiq && ctx.vidiq?.detected && ctx.vidiq.text
      ? `\n\nvidIQ DATA (scraped from the vidIQ extension on this page — use it: favour keywords with high search volume / high overall score and low competition, reuse its category signals, never copy low-score tags):\n"""\n${ctx.vidiq.text}\n"""`
      : '';

    return `You are Video Boost, a senior YouTube SEO strategist embedded in YouTube Studio.
Goal: maximise search + browse + suggested reach for THIS ${ctx.isShort ? 'YouTube Short' : 'video'} without clickbait that hurts retention.

CURRENT VIDEO
- Format: ${ctx.isShort ? 'Short (vertical, < 3 min)' : 'long-form video'}
- Video language: ${ctx.language || 'not set'} → write titles and descriptions in ${lang}
- Title: ${ctx.title || '(empty)'}
- Description: ${ctx.description ? ctx.description.slice(0, 1800) : '(empty)'}
- Existing tags: ${ctx.tags?.length ? ctx.tags.join(', ') : '(none)'}
- Category: ${ctx.category || 'unknown'}${vidiq}${channelBlock(channel)}

RULES
- Titles: in ${lang}, ≤ 70 characters (hard max 100), main keyword in the first 40 characters, a clear hook or benefit, no ALL CAPS, max one emoji. Give 3 distinct angles.
- Description: in ${lang}. First 150 characters = hook + main keyword (what shows in search). Then 2–4 short paragraphs of value, natural keywords, a call to action. No fake links, no placeholders like [LINK].
- Tags: ${tagLang}. 12–20 tags, each 1–3 words, lowercase, short and high-impact for the algorithm: exact main keyword first, then close variants, then specific long-tail, then 2–3 broad niche tags. No '#', no duplicates, nothing already in "Existing tags", total under 400 characters.
- Hashtags: 3–5, CamelCase or lowercase, relevant and searchable; the first 3 appear above the title.${ctx.isShort ? ' Include #shorts.' : ''}
- Category: if the current one looks wrong, suggest exactly one of: Film & Animation, Autos & Vehicles, Music, Pets & Animals, Sports, Travel & Events, Gaming, People & Blogs, Comedy, Entertainment, News & Politics, Howto & Style, Education, Science & Technology, Nonprofits & Activism.
- If channel data is given, reuse what already works on this channel (title patterns, topics) and say so briefly.
- Be concise: 1–3 short sentences of explanation, in French, then the block. Never invent statistics or search volumes; only cite numbers present in the vidIQ data.

OUTPUT FORMAT
When you propose anything applicable, end your answer with exactly one block:
\`\`\`boost
{"titles": ["..."], "description": "...", "tags": ["..."], "hashtags": ["#..."], "category": "..."}
\`\`\`
Include only the keys the user asked for (all of them for a full optimisation). Valid JSON, double quotes. If the user just chats, answer normally without a block.`;
  }

  // Compact channel table sent as context (edit page and global chat).
  function channelBlock(ch) {
    if (!ch?.videos?.length) return '';
    const rows = ch.videos.slice(0, 30).map(v =>
      `- ${v.isShort ? '[Short]' : '[Video]'} "${v.title}" · ${v.views ?? '?'} views${v.likes != null ? ` · ${v.likes} likes` : ''}${v.comments != null ? ` · ${v.comments} comments` : ''}${v.published || v.date ? ` · ${String(v.published || v.date).slice(0, 10)}` : ''}`);
    return `\n\nCHANNEL "${ch.channel || ''}" — latest uploads (source: ${ch.source}):\n${rows.join('\n')}`;
  }

  function channelPrompt(ch, watched, settings) {
    const w = watched
      ? `\n\nVIDEO OPEN ON YOUTUBE (may be a competitor):\n- "${watched.title}" by ${watched.channel} · ${watched.views} views · ${Math.round(watched.seconds / 60)} min · category ${watched.category || '?'} · published ${watched.published || '?'}\n- Tags: ${watched.tags.join(', ') || '(none)'}\n- Description: ${watched.description.slice(0, 800)}`
      : '';
    return `You are Video Boost, a senior YouTube growth strategist. Answer in French, short and concrete (bullets, max ~180 words unless asked).
Use ONLY the data below for numbers: never invent views, CTR, retention or trends you cannot see. When data is missing, say which Studio page to look at.
When asked "what works": compare views per video vs the channel median, contrast Shorts vs long videos, spot title patterns (length, numbers, words, format) of the top performers, then give 3 actionable next steps.${channelBlock(ch)}${w}

If you propose tags, titles or hashtags, you may end with a \`\`\`boost JSON block like: {"titles": [...], "tags": [...], "hashtags": [...]}. Tags: English, lowercase, 1–3 words. Content language for titles: ${contentLang(settings, watched)}.`;
  }

  // The title tester asks for plain JSON: {"titles": [...]}.
  function titleTesterPrompt(ctx, settings, tried) {
    const history = tried.length
      ? `\nAlready tested (score /100, higher is better) — learn from them, do not repeat:\n${tried.map(t => `- ${t.score ?? '?'} · ${t.title}`).join('\n')}`
      : '';
    return [
      { role: 'system', content: systemPrompt(ctx, settings) },
      { role: 'user', content: `Generate 6 NEW title candidates in ${contentLang(settings, ctx)} for this ${ctx.isShort ? 'Short' : 'video'}, each ≤ 70 characters, each a different angle, main keyword early, strongly optimised for the vidIQ title score (search keyword match, length, emotional hook, clarity).${history}\nReply ONLY with the block:\n\`\`\`boost\n{"titles": ["..."]}\n\`\`\`` }
    ];
  }

  const QUICK = {
    all: 'Optimise tout : 3 titres, une description, les tags et les hashtags.',
    titles: 'Propose 3 titres optimisés.',
    description: 'Réécris la description pour le SEO.',
    tags: 'Propose des tags courts et impactants à ajouter.',
    hashtags: 'Propose les meilleurs hashtags.',
    category: 'Quelle est la meilleure catégorie YouTube pour cette vidéo ? Mets-la dans le bloc.',
    // Complementary tools (prose answers)
    pinned: 'Écris 3 commentaires épinglés qui relancent l’engagement (question, CTA, lien vers une autre vidéo).',
    thumb: 'Propose 5 textes de miniature ultra courts (2–4 mots) qui complètent le titre sans le répéter, et une idée de visuel pour chacun.',
    chapters: 'À partir de la description, propose des chapitres horodatés (00:00 …) au format YouTube. S’il manque des infos, dis ce qu’il faut me donner.',
    translate: 'Traduis le titre et la description en anglais, espagnol et portugais, optimisés SEO pour chaque langue (pour l’onglet Traductions de Studio).',
    shorts: 'Propose 5 idées de Shorts à découper ou dériver de cette vidéo, avec un titre et un hook pour chacune.',
    hook: 'Écris 3 hooks pour les 5 premières secondes de la vidéo.',
    // Global panel
    works: 'Qu’est-ce qui marche sur ma chaîne ? Analyse mes dernières vidéos.',
    ideas: 'Donne-moi 5 idées de prochaines vidéos basées sur ce qui marche le mieux sur ma chaîne, avec un titre pour chacune.',
    when: 'D’après les dates et les vues de mes vidéos, quand devrais-je publier ? Sois honnête sur la fiabilité avec si peu de données.',
    analyze: 'Analyse cette vidéo YouTube : pourquoi elle marche (ou pas), son titre, ses tags, et ce que je peux en reprendre pour ma chaîne.',
    steal: 'À partir des tags et du titre de cette vidéo, propose-moi des tags anglais pour une vidéo similaire sur ma chaîne.'
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

  window.VBAI = { contentLang, systemPrompt, channelPrompt, channelBlock, titleTesterPrompt, parse, QUICK };
})();

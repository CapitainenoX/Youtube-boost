/* Video Boost — public YouTube (www.youtube.com) reader.
 * On a watch or Shorts page, fetches the page HTML (same origin) and reads ytInitialPlayerResponse:
 * title, channel, views, duration, description and the video's tags (keywords), which the page does not show. */
(function () {
  function watchedId() {
    if (location.hostname !== 'www.youtube.com') return null;
    if (location.pathname === '/watch') return new URLSearchParams(location.search).get('v');
    return location.pathname.match(/^\/shorts\/([\w-]{6,})/)?.[1] || null;
  }

  // Extracts the JSON object that follows `marker` by brace matching (the HTML is too large for a regex).
  function jsonAfter(html, marker) {
    const i = html.indexOf(marker);
    if (i < 0) return null;
    const start = html.indexOf('{', i);
    let depth = 0, inStr = false, escNext = false;
    for (let k = start; k < html.length; k++) {
      const c = html[k];
      if (inStr) {
        if (escNext) escNext = false;
        else if (c === '\\') escNext = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { return JSON.parse(html.slice(start, k + 1)); } catch { return null; }
      }
    }
    return null;
  }

  const cache = new Map();

  async function readWatched() {
    const id = watchedId();
    if (!id) return null;
    if (cache.has(id)) return cache.get(id);
    const res = await fetch(`/watch?v=${encodeURIComponent(id)}`, { credentials: 'omit' });
    if (!res.ok) throw new Error(`Page vidéo illisible (${res.status}).`);
    const html = await res.text();
    const player = jsonAfter(html, 'ytInitialPlayerResponse = ') || jsonAfter(html, '"playerResponse":');
    const d = player?.videoDetails;
    if (!d) throw new Error('Données de la vidéo introuvables.');
    const micro = player.microformat?.playerMicroformatRenderer || {};
    const info = {
      id,
      title: d.title || '',
      channel: d.author || '',
      channelId: d.channelId || '',
      views: Number(d.viewCount) || 0,
      seconds: Number(d.lengthSeconds) || 0,
      tags: d.keywords || [],
      description: (d.shortDescription || '').slice(0, 1500),
      category: micro.category || '',
      published: micro.publishDate || '',
      isShort: location.pathname.startsWith('/shorts/') || Number(d.lengthSeconds) <= 180 && /#shorts/i.test(d.shortDescription || '')
    };
    cache.set(id, info);
    return info;
  }

  window.VBYouTube = { watchedId, readWatched };
})();

/* Video Boost — service worker.
 * Owns every network call to the AI providers so API keys never enter the YouTube page.
 * Chat streams over a runtime Port ("vb-chat"); one-shot requests go through runtime messages. */
importScripts('shared/providers.js');

const P = self.VB_PROVIDERS;

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...self.VB_DEFAULT_SETTINGS, ...(settings || {}) };
}

function resolve(settings, override = {}) {
  const id = override.provider || settings.provider;
  const prov = P[id];
  if (!prov) throw new Error('Fournisseur inconnu.');
  const key = (override.key ?? settings.keys?.[id] ?? '').trim();
  if (!key) throw new Error(`Aucune clé API ${prov.label}. Ajoute-la dans Réglages.`);
  const model = (override.model || settings.models?.[id] || prov.model).replace(/^models\//, '');
  return { id, prov, key, model };
}

async function httpError(res) {
  let detail = '';
  try {
    const j = await res.json();
    detail = j.error?.message || j.message || JSON.stringify(j).slice(0, 200);
  } catch { /* body not JSON */ }
  const map = { 401: 'Clé API invalide.', 403: 'Accès refusé par le fournisseur.', 404: 'Modèle introuvable.', 429: 'Limite de requêtes atteinte, réessaie dans un instant.' };
  return new Error(`${map[res.status] || `Erreur ${res.status}.`}${detail ? ' ' + detail : ''}`);
}

/* ---------- Streaming ---------- */

// Reads an SSE body and yields each "data:" payload.
async function* sse(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
}

async function* streamChat({ prov, key, model }, messages, temperature, signal) {
  if (prov.kind === 'gemini') {
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    const res = await fetch(`${prov.base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature }
      })
    });
    if (!res.ok) throw await httpError(res);
    for await (const data of sse(res)) {
      try {
        const j = JSON.parse(data);
        const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
        if (text) yield text;
      } catch { /* partial line */ }
    }
    return;
  }

  const res = await fetch(`${prov.base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'X-Title': 'Video Boost'
    },
    body: JSON.stringify({ model, messages, temperature, stream: true })
  });
  if (!res.ok) throw await httpError(res);
  for await (const data of sse(res)) {
    if (data === '[DONE]') return;
    try {
      const text = JSON.parse(data).choices?.[0]?.delta?.content;
      if (text) yield text;
    } catch { /* keep-alive or partial */ }
  }
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'vb-chat') return;
  const ctrl = new AbortController();
  port.onDisconnect.addListener(() => ctrl.abort());
  port.onMessage.addListener(async msg => {
    if (msg.type !== 'chat') return;
    try {
      const settings = await getSettings();
      const target = resolve(settings);
      port.postMessage({ type: 'meta', provider: target.prov.label, model: target.model });
      for await (const text of streamChat(target, msg.messages, settings.temperature, ctrl.signal)) {
        port.postMessage({ type: 'delta', text });
      }
      port.postMessage({ type: 'done' });
    } catch (e) {
      if (e.name !== 'AbortError') {
        try { port.postMessage({ type: 'error', message: e.message || String(e) }); } catch { /* port closed */ }
      }
    }
  });
});

/* ---------- Models list (also used as the connection test) ---------- */

async function listModels(override) {
  const settings = await getSettings();
  const { prov, key } = resolve(settings, override);
  if (prov.kind === 'gemini') {
    const res = await fetch(`${prov.base}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
    if (!res.ok) throw await httpError(res);
    const j = await res.json();
    return (j.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
      .filter(id => /gemini/i.test(id));
  }
  const res = await fetch(`${prov.base}/models`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw await httpError(res);
  const j = await res.json();
  return (j.data || [])
    .map(m => m.id)
    .filter(id => !/whisper|tts|embed|guard|moderation|dall-e|image|audio|transcribe|realtime/i.test(id))
    .sort();
}

/* ---------- Channel videos (public RSS feed: the 15 latest uploads, with views) ---------- */

const xmlText = s => (s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');

async function channelFeed(channelId) {
  if (!/^UC[\w-]{20,}$/.test(channelId || '')) throw new Error('ID de chaîne invalide.');
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { credentials: 'omit' });
  if (!res.ok) throw new Error(`Flux de la chaîne indisponible (${res.status}).`);
  const xml = await res.text();
  const pick = (block, re) => xmlText(block.match(re)?.[1]);
  const channel = pick(xml.split('<entry>')[0], /<title>([\s\S]*?)<\/title>/);
  const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: pick(e, /<yt:videoId>([\s\S]*?)<\/yt:videoId>/),
    title: pick(e, /<title>([\s\S]*?)<\/title>/),
    published: pick(e, /<published>([\s\S]*?)<\/published>/),
    views: Number(pick(e, /<media:statistics views="(\d+)"/)) || 0,
    likes: Number(pick(e, /<media:starRating count="(\d+)"/)) || null,
    isShort: /\/shorts\//.test(pick(e, /<link rel="alternate" href="([^"]+)"/)),
    description: pick(e, /<media:description>([\s\S]*?)<\/media:description>/).slice(0, 300)
  })).filter(v => v.id);
  return { channel, videos };
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'channel') {
    channelFeed(msg.channelId)
      .then(data => reply({ ok: true, ...data }))
      .catch(e => reply({ ok: false, error: e.message || String(e) }));
    return true;
  }
  if (msg?.type === 'models') {
    listModels(msg.override)
      .then(models => reply({ ok: true, models }))
      .catch(e => reply({ ok: false, error: e.message || String(e) }));
    return true; // async reply
  }
});

// Toolbar icon toggles the panel on the current Studio / YouTube tab.
chrome.action.onClicked.addListener(tab => {
  if (tab.id && /^https:\/\/(studio|www)\.youtube\.com\//.test(tab.url || '')) {
    chrome.tabs.sendMessage(tab.id, { type: 'toggle' }).catch(() => {});
  } else {
    chrome.tabs.create({ url: 'https://studio.youtube.com/' });
  }
});

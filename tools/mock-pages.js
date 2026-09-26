// Mock pages for tools/e2e.js: Studio "Contenu" list, public watch page, channel RSS feed.
exports.contentPage = `<!doctype html><html><body><header style="height:64px">Studio</header><main>
${[['aaaaaaaaaa1', 'Minecraft maison facile', '12 k', '40'], ['aaaaaaaaaa2', 'Top 5 fermes Minecraft', '48 k', '210'], ['aaaaaaaaaa3', 'Survie jour 1', '3,1 k', '12']]
  .map(([id, t, v, c]) => `<ytcp-video-row><a href="/video/${id}/edit"><span id="video-title">${t}</span></a><div class="tablecell-views">${v}</div><div class="tablecell-comments">${c}</div><div class="tablecell-date">12 sept. 2026\nPubliée</div></ytcp-video-row>`).join('')}
</main></body></html>`;

const player = { videoDetails: { videoId: 'bbbbbbbbbb1', title: 'I Built the ULTIMATE Minecraft Base', author: 'Big Builder', channelId: 'UCzzzzzzzzzzzzzzzzzzzzzz', viewCount: '1840000', lengthSeconds: '812', keywords: ['minecraft base', 'minecraft', 'survival base', 'minecraft build'], shortDescription: 'Best base ever.' }, microformat: { playerMicroformatRenderer: { category: 'Gaming', publishDate: '2026-08-01' } } };
exports.watchPage = `<!doctype html><html><head><title>YouTube</title></head><body><div style="height:56px">YouTube</div><p>watch page</p>
<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};var meta = {};</script></body></html>`;

exports.feed = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/"><title>Capitaine Nox</title>
${[['ccccccccc01', 'Minecraft : maison en 5 min', 9000, false], ['ccccccccc02', 'Piège à XP facile #shorts', 52000, true], ['ccccccccc03', 'Mon PREMIER jour en hardcore', 4000, false]]
  .map(([id, t, v, s]) => `<entry><yt:videoId>${id}</yt:videoId><title>${t}</title><link rel="alternate" href="https://www.youtube.com/${s ? 'shorts/' + id : 'watch?v=' + id}"/><published>2026-09-1${id.slice(-1)}T10:00:00+00:00</published><media:group><media:description>d</media:description><media:community><media:starRating count="${v / 20}" average="5"/><media:statistics views="${v}"/></media:community></media:group></entry>`).join('')}
</feed>`;

/* Video Boost — complementary tools.
 * - ask(): one-shot AI call over the same streaming Port as the chat.
 * - titleTester: the AI proposes titles, each one is typed into Studio's title field, vidIQ re-scores it,
 *   and the loop keeps going until a title reaches 100 or beats the current one (max N rounds).
 *   Started by a click; the best title is left in the field (or the original restored), never saved.
 * - localTitleScore(): transparent fallback score when vidIQ's score can't be read. */
(function () {
  const S = window.VBStudio;
  const AI = window.VBAI;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function ask(messages, signal) {
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: 'vb-chat' });
      let raw = '';
      const abort = () => { try { port.disconnect(); } catch { /* closed */ } reject(new DOMException('Arrêté', 'AbortError')); };
      signal?.addEventListener('abort', abort, { once: true });
      port.onMessage.addListener(m => {
        if (m.type === 'delta') raw += m.text;
        else if (m.type === 'done') { port.disconnect(); resolve(raw); }
        else if (m.type === 'error') { port.disconnect(); reject(new Error(m.message)); }
      });
      port.onDisconnect.addListener(() => reject(new Error('Connexion interrompue.')));
      port.postMessage({ type: 'chat', messages });
    });
  }

  const POWER = /\b(secret|best|meilleur|facile|easy|rapide|fast|ultime|ultimate|incroyable|insane|jamais|never|pourquoi|why|comment|how|erreur|mistake|guide|tuto|tutorial|astuce|tips?|top|nouveau|new|vrai|real|gratuit|free)\b/i;

  // Heuristic 0–100 used only when vidIQ gives nothing. Each rule is shown to the user as-is.
  function localTitleScore(title, keyword) {
    const t = title.trim();
    const kw = (keyword || '').toLowerCase();
    let s = 0;
    s += t.length >= 30 && t.length <= 60 ? 25 : t.length >= 20 && t.length <= 70 ? 15 : 5;
    if (kw && t.toLowerCase().includes(kw)) s += 20 + (t.toLowerCase().indexOf(kw) < 40 ? 10 : 0);
    if (/\d/.test(t)) s += 10;
    if (POWER.test(t)) s += 10;
    if (!(t.match(/\b[A-ZÀ-Ý]{4,}\b/g) || []).length) s += 10;
    if ((t.match(/\p{Extended_Pictographic}/gu) || []).length <= 1) s += 5;
    if (!/[!?]{2,}/.test(t)) s += 10;
    return Math.min(100, s);
  }

  async function scoreNow(customSelector, previous, keyword, title) {
    // vidIQ re-scores after the edit: poll until the number changes or 3 s pass.
    let last = null;
    for (let i = 0; i < 15; i++) {
      await wait(200);
      last = S.readVidiqScore(customSelector);
      if (last != null && last !== previous && i >= 3) break;
    }
    return last != null ? { score: last, source: 'vidIQ' } : { score: localTitleScore(title, keyword), source: 'local' };
  }

  async function titleTester({ settings, channel, onUpdate, signal }) {
    const ctx = S.read();
    const original = ctx.title;
    const keyword = ctx.tags?.[0] || '';
    const custom = settings.vidiqScoreSelector;
    const base = S.readVidiqScore(custom);
    const current = base != null ? { score: base, source: 'vidIQ' } : { score: localTitleScore(original, keyword), source: 'local' };
    const run = { original, current, tried: [], best: { title: original, ...current, original: true }, status: 'Génération des titres…', done: false };
    onUpdate(run);

    let prev = current.score;
    try {
      for (let round = 1; round <= (settings.testerRounds || 3); round++) {
        run.status = `Tour ${round} · l’IA propose des titres…`;
        onUpdate(run);
        const raw = await ask(AI.titleTesterPrompt(S.read(), settings, run.tried), signal);
        const titles = (AI.parse(raw).proposal?.titles || [])
          .filter(t => t.length <= 100 && !run.tried.some(x => x.title.toLowerCase() === t.toLowerCase()));
        if (!titles.length) throw new Error('L’IA n’a pas renvoyé de titres exploitables.');

        for (const title of titles) {
          if (signal.aborted) throw new DOMException('Arrêté', 'AbortError');
          run.status = `Tour ${round} · test de « ${title.slice(0, 40)}… »`;
          onUpdate(run);
          S.setTitle(title);
          const r = await scoreNow(custom, prev, keyword, title);
          prev = r.score;
          run.tried.push({ title, ...r });
          if (r.score > run.best.score) run.best = { title, ...r };
          onUpdate(run);
          if (r.score >= 100) break;
        }
        if (run.best.score >= 100 || !run.best.original) break; // 100 reached, or better than the current title
      }
      run.status = run.best.original
        ? 'Aucun titre ne bat l’actuel : titre d’origine remis.'
        : `Meilleur titre appliqué (${run.best.score}/100) · clique Enregistrer.`;
    } catch (e) {
      run.status = e.name === 'AbortError' ? 'Test arrêté.' : e.message;
      run.error = e.name !== 'AbortError';
    } finally {
      S.setTitle(run.best.title);
      run.done = true;
      onUpdate(run);
    }
    return run;
  }

  window.VBTools = { ask, titleTester, localTitleScore };
})();

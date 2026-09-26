/* Video Boost — AI providers catalogue.
 * Shared by the service worker (importScripts) and the content scripts.
 * kind "openai" = OpenAI-compatible Chat Completions API, kind "gemini" = Google generateContent API.
 * Default models are starting points: "Charger les modèles" in Réglages lists what the key really has access to. */
(function (root) {
  root.VB_PROVIDERS = {
    groq: {
      label: 'Groq',
      kind: 'openai',
      base: 'https://api.groq.com/openai/v1',
      model: 'llama-3.3-70b-versatile',
      keyUrl: 'https://console.groq.com/keys',
      hint: 'Le plus rapide, clé gratuite.'
    },
    gemini: {
      label: 'Google Gemini',
      kind: 'gemini',
      base: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-2.5-flash',
      keyUrl: 'https://aistudio.google.com/apikey',
      hint: 'Très bon en SEO, clé gratuite.'
    },
    openrouter: {
      label: 'OpenRouter',
      kind: 'openai',
      base: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-4o-mini',
      keyUrl: 'https://openrouter.ai/keys',
      hint: 'Accès à Claude, GPT, Llama… avec une seule clé.'
    },
    openai: {
      label: 'OpenAI',
      kind: 'openai',
      base: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      keyUrl: 'https://platform.openai.com/api-keys',
      hint: 'Payant à l’usage.'
    },
    mistral: {
      label: 'Mistral',
      kind: 'openai',
      base: 'https://api.mistral.ai/v1',
      model: 'mistral-small-latest',
      keyUrl: 'https://console.mistral.ai/api-keys',
      hint: 'Modèles français.'
    }
  };

  root.VB_DEFAULT_SETTINGS = {
    provider: 'groq',
    keys: {},            // { providerId: apiKey } — stored in chrome.storage.local only
    models: {},          // { providerId: modelId }
    temperature: 0.7,
    contentLang: 'Français',   // language of titles / descriptions
    tagMode: 'en',             // 'en' = English only, 'mixed' = English + content language
    useVidiq: true
  };
})(typeof self !== 'undefined' ? self : window);

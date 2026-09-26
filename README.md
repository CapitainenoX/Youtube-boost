# Video Boost

Extension Chrome (Manifest V3) qui ajoute un panel IA minimaliste dans **YouTube Studio**, uniquement sur la page de gestion d'une vidéo ou d'un Short (`studio.youtube.com/video/<id>/edit`).

## Les 3 pages

- **Chat** : discute avec l'IA. Elle lit le titre, la description, les tags, la catégorie et les données vidIQ de la page, puis renvoie des propositions applicables :
  - 3 titres → *Appliquer*
  - description → *Remplacer*
  - tags courts, en anglais, pensés pour l'algorithme → présélectionnés, clic pour retirer, *Ajouter N* (ajoutés **à la suite** des tags existants, sans doublon, dans la limite des 500 caractères)
  - hashtags → *Ajouter à la description* (`#shorts` inclus pour un Short)
  - *Tout appliquer* en un clic
  - Raccourcis : Tout optimiser · Tags · Titres · Description · Hashtags
- **Vidéo** : titre, description, tags (avec compteurs 100 / 5000 / 500), suppression d'un tag, catégorie, détection vidIQ et une checklist SEO. Se met à jour pendant que tu édites dans Studio.
- **Réglages** : Groq, Google Gemini, OpenRouter (Claude, GPT, Llama…), OpenAI ou Mistral · clé API · modèle (*Tester* vérifie la clé et liste les modèles) · langue des titres/descriptions · tags en anglais ou anglais + langue de la vidéo · créativité · vidIQ on/off.

Rien n'est écrit dans Studio sans ton clic, et rien n'est enregistré sans le bouton **Enregistrer** de Studio.

## Installation

1. `chrome://extensions` → activer le **Mode développeur**.
2. **Charger l'extension non empaquetée** → choisir ce dossier.
3. Ouvrir une vidéo dans YouTube Studio → le panel apparaît à droite. `Alt+B` ou l'icône de l'extension l'ouvre / le ferme.
4. Réglages → choisir un fournisseur, coller la clé (Groq et Gemini ont une clé gratuite), *Tester*.

## vidIQ

Les tags sont saisis dans le vrai champ de Studio, donc vidIQ les voit et les note comme s'ils étaient tapés à la main. Quand vidIQ est installé, le texte de ses panneaux (scores, volumes, tags suggérés) est envoyé à l'IA comme contexte, pour privilégier les mots-clés à fort score et faible concurrence.

## Sécurité

La clé API reste dans `chrome.storage.local`. Les appels à l'IA partent du service worker, jamais depuis la page YouTube, et la clé n'est jamais réaffichée dans le panel.

## Développement

- Pas de build : HTML/CSS/JS vanilla.
- `node tools/make-icons.js` : régénère les icônes (Playwright).
- `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node tools/e2e.js` : charge l'extension dans Chromium sur une fausse page Studio (`tools/mock-studio.html`) avec une IA simulée, puis teste réglages, chat, ajout de tags, titre, description, hashtags et suppression.

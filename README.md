# Video Boost

Extension Chrome (Manifest V3) : un panel IA minimaliste dans **YouTube Studio** et sur **YouTube**.

## Deux panels

### Page d'une vidéo ou d'un Short (`studio.youtube.com/video/<id>/edit`)
- **Chat** : l'IA lit le titre, la description, les tags, la catégorie, vidIQ et les stats de ta chaîne, puis propose des éléments applicables en un clic :
  - titres → *Appliquer* · description → *Remplacer* · catégorie → *Appliquer*
  - tags en anglais, courts, présélectionnés → *Ajouter N* (à la suite, sans doublon, limite de 500 caractères respectée)
  - hashtags → *Ajouter à la description* (`#shorts` pour un Short) · *Tout appliquer*
  - Outils : commentaire épinglé, texte de miniature, hooks, chapitres, traductions, idées de Shorts, analyse de la chaîne
- **Vidéo** : titre, description, tags (compteurs 100 / 5000 / 500, retrait d'un tag), **testeur de titres**, **paramètres** (catégorie, conçue pour les enfants, promotion payée, contenu modifié / IA, *Appliquer mes préférences*) et checklist SEO.
- **Mes vidéos** (icône liste en haut) : choisir une autre vidéo ou coller un lien / ID pour l'ouvrir.

### Reste de Studio et youtube.com
- **Vidéos** : tes dernières vidéos avec vues, ratio face à la médiane de la chaîne, Shorts vs vidéos longues et meilleure vidéo. Clique une vidéo pour ouvrir sa page d'édition.
- Sur une vidéo YouTube (la tienne ou celle d'un concurrent) : ses **tags cachés**, ses vues et un bouton *Analyser*.
- **Chat** : « Qu'est-ce qui marche ? », idées de vidéos, quand publier. Les chiffres viennent uniquement de tes vidéos.

### Langue
Titres et descriptions en **anglais par défaut** (réglage « Auto »), sauf si la vidéo est réglée dans une autre langue dans Studio (*Langue de la vidéo*) : ils sont alors écrits dans cette langue. Les tags restent en anglais.

### Notes des tags (vidIQ)
Chaque tag proposé porte une note sur 100 : celle de **vidIQ** quand vidIQ l'affiche sur la page, sinon une note locale marquée ◦ (tag court et précis, en anglais, lié au sujet, suggéré par vidIQ). Les tags sont triés par note ; **Meilleurs** garde les mieux notés dans la limite de 500 caractères.

### Réglages
Fournisseur IA (Groq, Gemini, OpenRouter, OpenAI, Mistral), clé, modèle (*Tester*), langue, langue des tags, créativité, **préférences vidéo par défaut** (enfants, promotion payée, contenu IA, catégorie), ID de chaîne (rempli automatiquement), vidIQ on/off, affichage sur youtube.com, réglages avancés du testeur.

## Testeur de titres
L'IA propose des titres. Chacun est tapé dans le vrai champ Studio, vidIQ le note, et le test continue jusqu'à obtenir **100** ou un titre **meilleur que l'actuel** (3 tours max, réglable). Le meilleur titre reste dans le champ, sinon le titre d'origine est remis. Rien n'est enregistré. Sans vidIQ, un score local transparent le remplace (longueur, mot-clé, chiffre, accroche). Si le score vidIQ n'est pas lu, indique son sélecteur CSS dans Réglages → Avancé.

Rien n'est écrit dans Studio sans ton clic. Le bouton **Enregistrer** en haut du panel clique sur celui de Studio ; rien n'est enregistré sans lui.

Si un paramètre est « introuvable » sur ta page : Réglages → Avancé → **Diagnostic Studio** copie ce que l'extension voit, à envoyer pour corriger les sélecteurs.

## Installation (PowerShell)

```powershell
cd "$env:USERPROFILE\Desktop"
git clone -b claude/eloquent-dijkstra-74js81 https://github.com/CapitainenoX/Youtube-boost.git
cd Youtube-boost; (Get-Location).Path | Set-Clipboard
Start-Process chrome "chrome://extensions"
```
Ensuite : **Mode développeur** → **Charger l'extension non empaquetée** → colle le chemin. Mise à jour : `git pull`, puis ↻ sur l'extension.

## Données et sécurité
- La clé API reste dans `chrome.storage.local`. Les appels à l'IA partent du service worker, jamais depuis la page YouTube.
- Liste des vidéos : le tableau « Contenu » de Studio quand il est ouvert (vues, commentaires), sinon le flux public de la chaîne (15 dernières vidéos, vues).
- Tags d'une vidéo YouTube : lus dans les données publiques de sa page.

## Développement
- Pas de build : HTML/CSS/JS vanilla.
- `node tools/make-icons.js` : régénère les icônes.
- `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node tools/e2e.js` : charge l'extension dans Chromium sur de fausses pages Studio / YouTube (`tools/mock-*`) avec une IA simulée et vérifie tous les parcours.

## App mobile (Android) — `mobile/`

Web app installable (PWA) : tu mets en ligne dans l'app YouTube comme d'habitude, puis **Partager → Video Boost**. L'IA propose le titre, les tags (ajoutés à la suite des tags existants), la description, les hashtags, la catégorie, « conçue pour les enfants », « promotion rémunérée » et « contenu IA ». Un tap sur **Appliquer sur YouTube** écrit tout sur la vidéo via l'API officielle YouTube Data v3 (`videos.update`). Le résultat est visible dans YouTube Studio.

### Mise en ligne (une fois)
1. GitHub → repo → **Settings → Pages** → Source : *Deploy from a branch* → branche `claude/eloquent-dijkstra-74js81`, dossier `/ (root)`.
2. L'app est ensuite sur `https://capitainenox.github.io/Youtube-boost/mobile/`.
3. Sur le téléphone, ouvre ce lien dans Chrome → ⋮ → **Installer l'application**. « Video Boost » apparaît alors dans le menu Partager d'Android.
4. Dans l'app → Réglages : clé IA (Groq ou Gemini) et **Client ID Google**. Les étapes pour l'obtenir sont dans l'app (projet Google Cloud, YouTube Data API v3, ID client OAuth « Application Web » avec l'origine `https://capitainenox.github.io`, ton Gmail en utilisateur test).

La clé IA et les réglages restent dans le téléphone. Le jeton Google reste en mémoire, jamais stocké. Rien n'est envoyé à YouTube sans le tap sur *Appliquer*.

Test : `node tools/e2e-mobile.js` (fausses API Google/YouTube/Groq, écran Pixel 7).

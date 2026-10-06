# Assistant d'étude IA

Application web qui t'aide à réviser tes cours : tu déposes un PDF et l'IA génère des résumés, répond à tes questions en citant les pages, crée des quiz et des flashcards, puis suit tes points faibles pour te dire quoi réviser en priorité.

## Fonctionnalités

- **Bibliothèque** : plusieurs cours en PDF, choix du cours actif, suppression
- **Résumé** : résumé structuré en français de chaque cours
- **Chat** : questions-réponses basées sur le cours, avec la page citée. Si l'information n'est pas dans le cours, l'IA le dit et sépare clairement sa réponse générale ("Hors cours")
- **Quiz** : QCM avec correction et explication, différents à chaque génération
- **Flashcards** : cartes recto-verso à retourner, avec "Je savais" et "À revoir"
- **Progression** : score par notion, points faibles en premier, et bouton pour réviser ses points faibles
- **Responsive** : utilisable sur téléphone, avec menu et en-tête fixes

## Technologies

- Frontend : React, Vite, Tailwind CSS
- Backend : Node.js, Express
- IA : API Gemini (Google)
- Lecture des PDF : pdf-parse

## Installation

Prérequis : Node.js et une clé API Gemini (gratuite sur Google AI Studio).

```bash
git clone https://github.com/Ricardo1826/assistant-etude.git
cd assistant-etude
```

### Backend

```bash
cd backend
npm install
```

Crée un fichier `.env` dans le dossier `backend` :

```
GEMINI_API_KEY=ta-cle-gemini
GEMINI_MODEL=gemini-3.1-flash-lite
```

Lance le serveur :

```bash
node server.js
```

Le serveur tourne sur `http://localhost:3001`.

### Frontend

Dans un deuxième terminal :

```bash
cd frontend
npm install
npm run dev
```

Ouvre `http://localhost:5173` dans ton navigateur.

## Choix de conception

- Aucune donnée n'est stockée : les cours restent en mémoire pendant que le serveur tourne, et il n'y a ni base de données ni compte utilisateur. L'application est volontairement simple et privée.
- Les PDF doivent contenir du texte sélectionnable (pas de documents scannés).
- Le niveau gratuit de Gemini est limité en nombre de requêtes.

## Prochaines étapes

- Export des résumés en PDF
- Chat sur plusieurs cours à la fois
- Déploiement en ligne

## Auteur

Richard GNALOU
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");
const { PDFParse } = require("pdf-parse");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODELE = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MODELES = [MODELE, "gemini-3.1-flash-lite"];
const cours = new Map();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function genererAvecReprise(contents, config) {
  let derniereErreur;
  for (const modele of MODELES) {
    for (let essai = 1; essai <= 2; essai++) {
      try {
        return await ai.models.generateContent({ model: modele, contents, config });
      } catch (erreur) {
        derniereErreur = erreur;
        if (erreur.status === 404) break;
        const erreurReseau = !erreur.status;
        if (!erreurReseau && erreur.status !== 503 && erreur.status !== 429) {
          throw erreur;
        }
        await attendre(essai * 1500);
      }
    }
  }
  throw derniereErreur;
}

function normaliser(texte) {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const MOTS_VIDES = new Set([
  "les", "des", "une", "est", "que", "qui", "quoi", "dans", "pour", "par",
  "sur", "avec", "sans", "sont", "cette", "ces", "comment", "quel", "quelle",
  "quels", "quelles", "ce", "cet", "aux", "du", "de", "la", "le", "un", "et",
  "ou", "en", "au", "il", "elle", "mon", "ma", "mes", "son", "sa", "ses",
  "pas", "plus", "faire", "fait", "etre", "avoir", "donne", "explique",
]);

function mots(texte) {
  return normaliser(texte)
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 2 && !MOTS_VIDES.has(m));
}

function decouperEnExtraits(pages) {
  const extraits = [];
  for (const page of pages) {
    const texte = (page.text || "").trim();
    for (let i = 0; i < texte.length; i += 1200) {
      const morceau = texte.slice(i, i + 1200).trim();
      if (morceau.length > 30) {
        extraits.push({ page: page.num, texte: morceau });
      }
    }
  }
  return extraits;
}

function chercherExtraits(extraits, question, nombre = 5) {
  const motsQuestion = [...new Set(mots(question))];
  return extraits
    .map((extrait) => {
      const motsExtrait = new Set(mots(extrait.texte));
      const score = motsQuestion.filter((m) => motsExtrait.has(m)).length;
      return { ...extrait, score };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, nombre);
}

app.get("/api/sante", (req, res) => {
  res.json({ message: "Le serveur fonctionne" });
});

app.get("/api/cours", (req, res) => {
  const liste = [...cours.values()].map((c) => ({
    id: c.id,
    nom: c.nom,
    nombrePages: c.nombrePages,
  }));
  res.json(liste);
});

app.post("/api/cours", upload.single("pdf"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ erreur: "Aucun fichier reçu" });
  }
  if (req.file.mimetype !== "application/pdf") {
    return res.status(400).json({ erreur: "Le fichier doit être un PDF" });
  }

  let parser;
  try {
    parser = new PDFParse({ data: req.file.buffer });
    const resultat = await parser.getText();

    const pages =
      Array.isArray(resultat.pages) && resultat.pages.length > 0
        ? resultat.pages
        : [{ num: null, text: resultat.text }];

    const id = crypto.randomUUID();
    cours.set(id, {
      id,
      nom: req.file.originalname,
      nombrePages: resultat.total,
      texte: resultat.text,
      extraits: decouperEnExtraits(pages),
    });

    res.json({
      id,
      nom: req.file.originalname,
      nombrePages: resultat.total,
      nombreCaracteres: resultat.text.length,
      apercu: resultat.text.slice(0, 300),
    });
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ erreur: "Impossible de lire ce PDF" });
  } finally {
    if (parser) await parser.destroy();
  }
});

app.post("/api/cours/:id/resume", async (req, res) => {
  const course = cours.get(req.params.id);
  if (!course) {
    return res.status(404).json({ erreur: "Cours introuvable" });
  }

  try {
    const reponse = await genererAvecReprise(
      `Voici le cours "${course.nom}". Fais-en un résumé structuré.\n\n${course.texte.slice(0, 150000)}`,
      {
        systemInstruction:
          "Tu es un assistant d'étude. Tu résumes des cours en français, de façon structurée et claire : les idées principales, les définitions importantes, puis les points à retenir. Tu t'appuies uniquement sur le contenu du cours fourni, sans rien inventer. N'utilise jamais de LaTeX ni de signe dollar. Pour une flèche, écris simplement →.",
        maxOutputTokens: 8000,
      }
    );

    res.json({ resume: reponse.text });
  } catch (erreur) {
    console.error(erreur);
    if (erreur.status === 503 || erreur.status === 429) {
      return res.status(503).json({
        erreur: "Le modèle est surchargé ou la limite gratuite est atteinte. Réessaie dans une minute.",
      });
    }
    res.status(500).json({ erreur: "Impossible de générer le résumé" });
  }
});

app.post("/api/cours/:id/chat", async (req, res) => {
  const course = cours.get(req.params.id);
  if (!course) {
    return res.status(404).json({ erreur: "Cours introuvable" });
  }

  const question = (req.body.question || "").trim();
  if (!question) {
    return res.status(400).json({ erreur: "Question vide" });
  }

  let trouves = chercherExtraits(course.extraits, question);
  const coursEntier = trouves.length < 2;
  if (coursEntier) {
    trouves = course.extraits;
  }

  const contexte = trouves
    .map((e) => `[Page ${e.page ?? "?"}]\n${e.texte}`)
    .join("\n\n---\n\n")
    .slice(0, 150000);

  try {
    const reponse = await genererAvecReprise(
      `Extraits du cours "${course.nom}" :\n\n${contexte}\n\nQuestion de l'étudiant : ${question}`,
      {
        systemInstruction:
          "Tu es un assistant d'étude qui répond en français. Réponds à la question en t'appuyant uniquement sur les extraits du cours fournis, et cite la page entre parenthèses, par exemple (page 3). Si l'information n'est pas dans les extraits, commence par écrire exactement : Cette information n'est pas dans ton cours. Tu peux ensuite ajouter une courte réponse générale, introduite par le mot Hors cours : en gras. Ne mélange jamais les deux. N'utilise jamais de LaTeX ni de signe dollar.",
        maxOutputTokens: 3000,
      }
    );

    res.json({
      reponse: reponse.text,
      sources: coursEntier
        ? []
        : trouves.map((e) => ({
            page: e.page,
            extrait: e.texte.slice(0, 200),
          })),
    });
  } catch (erreur) {
    console.error(erreur);
    if (erreur.status === 503 || erreur.status === 429) {
      return res.status(503).json({
        erreur: "Le modèle est surchargé ou la limite gratuite est atteinte. Réessaie dans une minute.",
      });
    }
    res.status(500).json({ erreur: "Impossible de répondre à la question" });
  }
});

app.post("/api/cours/:id/quiz", async (req, res) => {
  const course = cours.get(req.params.id);
  if (!course) {
    return res.status(404).json({ erreur: "Cours introuvable" });
  }

  const nombre = Math.min(Math.max(Number(req.body.nombre) || 5, 3), 10);
  const dejaPosees = Array.isArray(req.body.dejaPosees)
    ? req.body.dejaPosees.slice(-30)
    : [];

    const notionsFaibles = Array.isArray(req.body.notions)
    ? req.body.notions.slice(0, 5)
    : [];
  const cible = notionsFaibles.length
    ? `\n\nConcentre toutes les questions sur ces notions, que l'étudiant maîtrise mal : ${notionsFaibles.join(", ")}.`
    : "";

  const selection = notionsFaibles.length
    ? course.extraits.slice(0, 60)
    : [...course.extraits]
        .sort(() => Math.random() - 0.5)
        .slice(0, 15)
        .sort((a, b) => (a.page ?? 0) - (b.page ?? 0));

  const contexte = selection
    .map((e) => `[Page ${e.page ?? "?"}]\n${e.texte}`)
    .join("\n\n---\n\n");

  const angles = [
    "des définitions et des termes clés",
    "la compréhension des idées et des relations de cause à effet",
    "des mises en situation concrètes qui appliquent le cours",
    "des comparaisons et des distinctions entre notions proches",
  ];
  const angle = angles[Math.floor(Math.random() * angles.length)];

  const evite = dejaPosees.length
    ? `\n\nNe repose aucune de ces questions déjà posées, ni une question très proche :\n- ${dejaPosees.join("\n- ")}`
    : "";

  try {
    const reponse = await genererAvecReprise(
      `Voici des extraits du cours "${course.nom}". Génère ${nombre} questions à choix multiples, en privilégiant ${angle}.${cible}${evite}\n\n${contexte}`,
      {
        systemInstruction:
          "Tu es un assistant d'étude. Tu crées des QCM en français uniquement à partir du contenu du cours fourni. Chaque question a exactement 4 propositions, une seule est correcte, et les 3 autres sont plausibles. Place la bonne réponse à une position variable. Chaque question est rattachée à une notion courte du cours (2 à 4 mots). Tu réponds uniquement avec un tableau JSON, sans texte autour, où chaque élément a la forme : {\"notion\": \"...\", \"question\": \"...\", \"options\": [\"...\", \"...\", \"...\", \"...\"], \"bonneReponse\": 0, \"explication\": \"...\"}. bonneReponse est l'index (de 0 à 3) de la bonne proposition. N'utilise jamais de LaTeX ni de signe dollar.",
        responseMimeType: "application/json",
        temperature: 1,
        maxOutputTokens: 8000,
      }
    );

    const texte = reponse.text.replace(/```json|```/g, "").trim();
    const questions = JSON.parse(texte);

    const valides = questions.filter(
      (q) =>
        q.question &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        Number.isInteger(q.bonneReponse) &&
        q.bonneReponse >= 0 &&
        q.bonneReponse <= 3
    );

    if (valides.length === 0) {
      throw new Error("Aucune question valide");
    }

    res.json({ questions: valides });
  } catch (erreur) {
    console.error(erreur);
    if (erreur.status === 503 || erreur.status === 429) {
      return res.status(503).json({
        erreur: "Le modèle est surchargé ou la limite gratuite est atteinte. Réessaie dans une minute.",
      });
    }
    res.status(500).json({ erreur: "Impossible de générer le quiz" });
  }
});
app.delete("/api/cours/:id", (req, res) => {
  if (!cours.delete(req.params.id)) {
    return res.status(404).json({ erreur: "Cours introuvable" });
  }
  res.json({ ok: true });
});

app.post("/api/cours/:id/flashcards", async (req, res) => {
  const course = cours.get(req.params.id);
  if (!course) {
    return res.status(404).json({ erreur: "Cours introuvable" });
  }

  const nombre = Math.min(Math.max(Number(req.body.nombre) || 8, 4), 15);
  const dejaVues = Array.isArray(req.body.dejaVues)
    ? req.body.dejaVues.slice(-40)
    : [];

  const selection = [...course.extraits]
    .sort(() => Math.random() - 0.5)
    .slice(0, 15)
    .sort((a, b) => (a.page ?? 0) - (b.page ?? 0));

  const contexte = selection
    .map((e) => `[Page ${e.page ?? "?"}]\n${e.texte}`)
    .join("\n\n---\n\n");

  const evite = dejaVues.length
    ? `\n\nNe refais aucune de ces cartes déjà vues, ni une carte très proche :\n- ${dejaVues.join("\n- ")}`
    : "";

  try {
    const reponse = await genererAvecReprise(
      `Voici des extraits du cours "${course.nom}". Crée ${nombre} flashcards de révision.${evite}\n\n${contexte}`,
      {
        systemInstruction:
          "Tu es un assistant d'étude. Tu crées des flashcards en français uniquement à partir du contenu du cours fourni. Le recto est une question courte ou un terme à définir. Le verso est une réponse courte et précise (1 à 3 phrases). Chaque carte est rattachée à une notion courte du cours (2 à 4 mots). Tu réponds uniquement avec un tableau JSON, sans texte autour, où chaque élément a la forme : {\"notion\": \"...\", \"recto\": \"...\", \"verso\": \"...\"}. N'utilise jamais de LaTeX ni de signe dollar.",
        responseMimeType: "application/json",
        temperature: 1,
        maxOutputTokens: 8000,
      }
    );

    const texte = reponse.text.replace(/```json|```/g, "").trim();
    const cartes = JSON.parse(texte).filter((c) => c.recto && c.verso);

    if (cartes.length === 0) {
      throw new Error("Aucune carte valide");
    }

    res.json({ cartes });
  } catch (erreur) {
    console.error(erreur);
    if (erreur.status === 503 || erreur.status === 429) {
      return res.status(503).json({
        erreur: "Le modèle est surchargé ou la limite gratuite est atteinte. Réessaie dans une minute.",
      });
    }
    res.status(500).json({ erreur: "Impossible de générer les flashcards" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
import { useState, useRef, useEffect } from "react"
import { jsPDF } from "jspdf"
import ReactMarkdown from "react-markdown"

const menu = ["Bibliothèque", "Chat", "Quiz", "Flashcards", "Progression"]
const API = import.meta.env.VITE_API_URL || "http://localhost:3001"

function BoutonCopier({ texte }) {
  const [copie, setCopie] = useState(false)

  async function copier() {
    try {
      await navigator.clipboard.writeText(texte)
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch {
      // la copie n'est pas disponible sur ce navigateur
    }
  }

  return (
    <button
      onClick={copier}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
    >
      {copie ? "Copié" : "Copier"}
    </button>
  )
}

function nettoyer(texte) {
  return texte
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`/g, "")
    .replace(/\u2192/g, "->")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "-")
    .replace(/[^\x00-\xFF]/g, "")
}

function telechargerPDF(titre, texte) {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const marge = 18
  const largeur = 210 - marge * 2
  let y = marge

  function ecrire(ligne, taille, gras) {
    doc.setFont("helvetica", gras ? "bold" : "normal")
    doc.setFontSize(taille)
    for (const morceau of doc.splitTextToSize(ligne, largeur)) {
      if (y > 297 - marge) {
        doc.addPage()
        y = marge
      }
      doc.text(morceau, marge, y)
      y += taille * 0.45
    }
  }

  ecrire(nettoyer(titre), 16, true)
  y += 4

  for (const ligne of texte.split("\n")) {
    if (!ligne.trim()) {
      y += 3
      continue
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(ligne)) continue

    const entete = ligne.match(/^#{1,6}\s+(.*)/)
    if (entete) {
      y += 2
      ecrire(nettoyer(entete[1]), 13, true)
      y += 1
      continue
    }

    const puce = ligne.match(/^\s*[*-]\s+(.*)/)
    if (puce) {
      ecrire("- " + nettoyer(puce[1]), 11, false)
      y += 1
      continue
    }

    ecrire(nettoyer(ligne), 11, false)
    y += 1
  }

  doc.save(`${titre.replace(/\.pdf$/i, "")}-resume.pdf`)
}

function BoutonPDF({ titre, texte }) {
  return (
    <button
      onClick={() => telechargerPDF(titre, texte)}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
    >
      Télécharger en PDF
    </button>
  )
}

function Bibliotheque({
  liste,
  actifId,
  setActifId,
  ajouterCours,
  supprimerCours,
  resumes,
  setResume,
}) {
  const [fichier, setFichier] = useState(null)
  const [cleInput, setCleInput] = useState(0)
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState("")
  const [resumeEnCours, setResumeEnCours] = useState(null)

  async function envoyer() {
    if (!fichier) return
    setChargement(true)
    setErreur("")
    try {
      const formData = new FormData()
      formData.append("pdf", fichier)
      const reponse = await fetch(`${API}/api/cours`, {
        method: "POST",
        body: formData,
      })
      const donnees = await reponse.json()
      if (!reponse.ok) throw new Error(donnees.erreur || "Erreur inconnue")
      ajouterCours(donnees)
      setFichier(null)
      setCleInput((k) => k + 1)
    } catch (e) {
      setErreur(e.message)
    } finally {
      setChargement(false)
    }
  }

  async function resumer(id) {
    setResumeEnCours(id)
    setErreur("")
    try {
      const reponse = await fetch(`${API}/api/cours/${id}/resume`, {
        method: "POST",
      })
      const donnees = await reponse.json()
      if (!reponse.ok) throw new Error(donnees.erreur || "Erreur inconnue")
      setResume(id, donnees.resume)
    } catch (e) {
      setErreur(e.message)
    } finally {
      setResumeEnCours(null)
    }
  }

  async function supprimer(id) {
    setErreur("")
    try {
      await fetch(`${API}/api/cours/${id}`, { method: "DELETE" })
    } catch {
      // le serveur est peut-être arrêté, on retire quand même le cours de la liste
    }
    supprimerCours(id)
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <h2 className="text-lg font-semibold text-slate-900">Ajouter un cours</h2>
        <p className="mt-1 text-sm text-slate-500">
          Choisis un PDF avec du texte sélectionnable (50 Mo maximum).
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <input
            key={cleInput}
            type="file"
            accept="application/pdf"
            onChange={(e) => setFichier(e.target.files[0])}
            className="text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
          />
          <button
            onClick={envoyer}
            disabled={!fichier || chargement}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {chargement ? "Lecture en cours..." : "Envoyer"}
          </button>
        </div>

        {erreur && (
          <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {erreur}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <h2 className="text-lg font-semibold text-slate-900">Mes cours</h2>

        {liste.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">
            Aucun cours pour le moment. Ajoute ton premier PDF ci-dessus.
          </p>
        )}

        <div className="mt-4 space-y-4">
          {liste.map((c) => {
            const actif = c.id === actifId
            return (
              <div
                key={c.id}
                className={`rounded-lg border p-5 ${
                  actif ? "border-indigo-300 bg-indigo-50/40" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {c.nom}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {c.nombrePages} pages
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                    {actif ? (
                      <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
                        Cours actif
                      </span>
                    ) : (
                      <button
                        onClick={() => setActifId(c.id)}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        Utiliser
                      </button>
                    )}
                    <button
                      onClick={() => resumer(c.id)}
                      disabled={resumeEnCours === c.id}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {resumeEnCours === c.id ? "Résumé en cours..." : "Résumer"}
                    </button>
                    <button
                      onClick={() => supprimer(c.id)}
                      className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>

                {resumes[c.id] && (
                  <div className="mt-5 border-t border-slate-200 pt-5">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-sm font-semibold text-slate-900">Résumé</h3>
                      <div className="flex items-center gap-2">
                        <BoutonCopier texte={resumes[c.id]} />
                        <BoutonPDF titre={c.nom} texte={resumes[c.id]} />
                      </div>
                    </div>
                    <div className="prose prose-slate prose-sm mt-3 max-w-none">
                     <ReactMarkdown>{resumes[c.id]}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Chat({ cours, messages, setMessages }) {
  const [question, setQuestion] = useState("")
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")
  const bas = useRef(null)

  useEffect(() => {
    bas.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, enCours])

  if (!cours) {
    return (
      <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-sm text-slate-500">
        Ajoute d'abord un cours dans la Bibliothèque pour pouvoir lui poser des
        questions.
      </div>
    )
  }

  async function envoyer() {
    const q = question.trim()
    if (!q || enCours) return
    setMessages((m) => [...m, { role: "user", texte: q }])
    setQuestion("")
    setErreur("")
    setEnCours(true)
    try {
      const reponse = await fetch(`${API}/api/cours/${cours.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      })
      const donnees = await reponse.json()
      if (!reponse.ok) throw new Error(donnees.erreur || "Erreur inconnue")
      setMessages((m) => [
        ...m,
        { role: "ia", texte: donnees.reponse, sources: donnees.sources },
      ])
    } catch (e) {
      setErreur(e.message)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="mt-8 flex h-[72vh] flex-col bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <p className="text-sm font-semibold text-slate-900">{cours.nom}</p>
        <p className="text-xs text-slate-500">
          Les réponses s'appuient sur ce cours.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">
            Pose ta première question sur le cours.
          </p>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
                {m.texte}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3">
                <div className="prose prose-slate prose-sm max-w-none">
                  <ReactMarkdown>{m.texte}</ReactMarkdown>
                </div>
                <div className="mt-3 flex justify-end">
                  <BoutonCopier texte={m.texte} />
                </div>
                {m.sources && m.sources.length > 0 && (
                  <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
                    Pages consultées :{" "}
                    {[...new Set(m.sources.map((s) => s.page).filter(Boolean))].join(", ")}
                  </p>
                )}
              </div>
            </div>
          )
        )}

        {enCours && (
          <p className="text-sm text-slate-400">L'assistant réfléchit...</p>
        )}
        <div ref={bas} />
      </div>

      {erreur && (
        <p className="mx-6 mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {erreur}
        </p>
      )}

      <div className="flex gap-3 border-t border-slate-200 px-6 py-4">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && envoyer()}
          placeholder="Pose une question sur ton cours..."
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <button
          onClick={envoyer}
          disabled={!question.trim() || enCours}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Envoyer
        </button>
      </div>
    </div>
  )
}

function Quiz({ cours, ajouterResultat, revision }) {
  const [questions, setQuestions] = useState([])
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState("")
  const [index, setIndex] = useState(0)
  const [choix, setChoix] = useState(null)
  const [score, setScore] = useState(0)
  const [fini, setFini] = useState(false)
  const [ciblees, setCiblees] = useState([])
  const [nombreQuestions, setNombreQuestions] = useState(5)
  const [difficulte, setDifficulte] = useState("moyen")

  useEffect(() => {
    if (revision && cours) generer(revision.notions)
  }, [revision])

  if (!cours) {
    return (
      <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-sm text-slate-500">
        Ajoute d'abord un cours dans la Bibliothèque pour générer un quiz.
      </div>
    )
  }

  async function generer(notions = []) {
    setChargement(true)
    setErreur("")
    setQuestions([])
    setIndex(0)
    setChoix(null)
    setScore(0)
    setFini(false)
    setCiblees(notions)
    const cle = `questionsPosees:${cours.nom}`
    let dejaPosees = []
    try {
      dejaPosees = JSON.parse(localStorage.getItem(cle)) || []
    } catch {
      dejaPosees = []
    }
    try {
      const reponse = await fetch(`${API}/api/cours/${cours.id}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombreQuestions,
          difficulte,
          dejaPosees,
          notions,
        }),
      })
      const donnees = await reponse.json()
      if (!reponse.ok) throw new Error(donnees.erreur || "Erreur inconnue")
      setQuestions(donnees.questions)
      try {
        const nouvelles = donnees.questions.map((q) => q.question)
        localStorage.setItem(
          cle,
          JSON.stringify([...dejaPosees, ...nouvelles].slice(-30))
        )
      } catch {
        // la mémoire du navigateur est indisponible, on continue sans
      }
    } catch (e) {
      setErreur(e.message)
    } finally {
      setChargement(false)
    }
  }

  function repondre(i) {
    if (choix !== null) return
    const q = questions[index]
    const juste = i === q.bonneReponse
    setChoix(i)
    if (juste) setScore((s) => s + 1)
    ajouterResultat({ notion: q.notion || "Général", juste, cours: cours.nom })
  }

  function suivant() {
    if (index + 1 >= questions.length) {
      setFini(true)
    } else {
      setIndex(index + 1)
      setChoix(null)
    }
  }

  const q = questions[index]
  const lettres = ["A", "B", "C", "D"]

  return (
    <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Quiz</h2>
          <p className="mt-1 text-sm text-slate-500">{cours.nom}</p>
          {ciblees.length > 0 && (
            <p className="mt-1 text-xs font-medium text-indigo-700">
              Révision ciblée : {ciblees.join(", ")}
            </p>
          )}
        </div>
        <button
          onClick={() => generer()}
          disabled={chargement}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {chargement
            ? "Génération en cours..."
            : questions.length > 0
            ? "Nouveau quiz"
            : `Générer un quiz de ${nombreQuestions} questions`}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm text-slate-600">
          Nombre de questions
          <select
            value={nombreQuestions}
            onChange={(e) => setNombreQuestions(Number(e.target.value))}
            disabled={chargement}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500"
          >
            <option value={5}>5 questions</option>
            <option value={10}>10 questions</option>
            <option value={15}>15 questions</option>
          </select>
        </label>

        <label className="text-sm text-slate-600">
          Difficulté
          <select
            value={difficulte}
            onChange={(e) => setDifficulte(e.target.value)}
            disabled={chargement}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500"
          >
            <option value="facile">Facile</option>
            <option value="moyen">Moyen</option>
            <option value="difficile">Difficile</option>
          </select>
        </label>
      </div>

      {erreur && (
        <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {erreur}
        </p>
      )}

      {q && !fini && (
        <div className="mt-8">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Question {index + 1} sur {questions.length}
            </span>
            <span className="rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-700">
              {q.notion || "Général"}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full bg-indigo-600 transition-all"
              style={{ width: `${(index / questions.length) * 100}%` }}
            />
          </div>

          <p className="mt-6 text-base font-medium text-slate-900">{q.question}</p>

          <div className="mt-5 space-y-3">
            {q.options.map((option, i) => {
              let style = "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"
              if (choix !== null) {
                if (i === q.bonneReponse) {
                  style = "border-green-500 bg-green-50 text-green-900"
                } else if (i === choix) {
                  style = "border-red-400 bg-red-50 text-red-900"
                } else {
                  style = "border-slate-200 opacity-50"
                }
              }
              return (
                <button
                  key={i}
                  onClick={() => repondre(i)}
                  disabled={choix !== null}
                  className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition ${style}`}
                >
                  <span className="font-semibold">{lettres[i]}</span>
                  <span>{option}</span>
                </button>
              )
            })}
          </div>

          {choix !== null && (
            <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">
                {choix === q.bonneReponse ? "Bonne réponse" : "Mauvaise réponse"}
              </p>
              <p className="mt-1 leading-relaxed">{q.explication}</p>
              <button
                onClick={suivant}
                className="mt-4 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                {index + 1 >= questions.length ? "Voir mon score" : "Question suivante"}
              </button>
            </div>
          )}
        </div>
      )}

      {fini && (
        <div className="mt-8 rounded-lg bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-500">Ton score</p>
          <p className="mt-2 text-4xl font-bold text-indigo-600">
            {score} / {questions.length}
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Clique sur "Nouveau quiz" pour recommencer avec de nouvelles questions.
          </p>
        </div>
      )}
    </div>
  )
}

function couleurs(pourcentage) {
  if (pourcentage < 50) return { barre: "bg-red-500", texte: "text-red-600" }
  if (pourcentage < 80) return { barre: "bg-amber-500", texte: "text-amber-600" }
  return { barre: "bg-green-500", texte: "text-green-600" }
}

function Progression({ resultats, onReviser }) {
  if (resultats.length === 0) {
    return (
      <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-sm text-slate-500">
        Réponds à quelques questions dans l'onglet Quiz : tes scores par notion
        apparaîtront ici.
      </div>
    )
  }

  const parNotion = {}
  for (const r of resultats) {
    if (!parNotion[r.notion]) {
      parNotion[r.notion] = { notion: r.notion, total: 0, justes: 0 }
    }
    parNotion[r.notion].total += 1
    if (r.juste) parNotion[r.notion].justes += 1
  }

  const liste = Object.values(parNotion)
    .map((n) => ({ ...n, pourcentage: Math.round((n.justes / n.total) * 100) }))
    .sort((a, b) => a.pourcentage - b.pourcentage)

  const total = resultats.length
  const justes = resultats.filter((r) => r.juste).length
  const global = Math.round((justes / total) * 100)
  const faibles = liste.filter((n) => n.pourcentage < 80).slice(0, 3)

  return (
    <div className="mt-8 space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs text-slate-500">Questions répondues</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs text-slate-500">Bonnes réponses</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{justes}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs text-slate-500">Réussite globale</p>
          <p className={`mt-2 text-3xl font-bold ${couleurs(global).texte}`}>
            {global} %
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Mes notions</h2>
            <p className="mt-1 text-sm text-slate-500">
              Les points faibles sont affichés en premier.
            </p>
          </div>
          <button
            onClick={() => onReviser(faibles.map((n) => n.notion))}
            disabled={faibles.length === 0}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {faibles.length === 0
              ? "Aucun point faible"
              : "Réviser mes points faibles"}
          </button>
        </div>

        <div className="mt-6 space-y-5">
          {liste.map((n) => (
            <div key={n.notion}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-900">{n.notion}</span>
                <span className={`font-semibold ${couleurs(n.pourcentage).texte}`}>
                  {n.pourcentage} % ({n.justes}/{n.total})
                </span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                <div
                  className={`h-2 rounded-full ${couleurs(n.pourcentage).barre}`}
                  style={{ width: `${n.pourcentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Flashcards({ cours }) {
  const [cartes, setCartes] = useState([])
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState("")
  const [index, setIndex] = useState(0)
  const [retournee, setRetournee] = useState(false)
  const [connues, setConnues] = useState(0)
  const [aRevoir, setARevoir] = useState([])
  const [fini, setFini] = useState(false)

  if (!cours) {
    return (
      <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-sm text-slate-500">
        Ajoute d'abord un cours dans la Bibliothèque pour générer des flashcards.
      </div>
    )
  }

  async function generer() {
    setChargement(true)
    setErreur("")
    setCartes([])
    setIndex(0)
    setRetournee(false)
    setConnues(0)
    setARevoir([])
    setFini(false)
    const cle = `cartesVues:${cours.nom}`
    let dejaVues = []
    try {
      dejaVues = JSON.parse(localStorage.getItem(cle)) || []
    } catch {
      dejaVues = []
    }
    try {
      const reponse = await fetch(`${API}/api/cours/${cours.id}/flashcards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: 8, dejaVues }),
      })
      const donnees = await reponse.json()
      if (!reponse.ok) throw new Error(donnees.erreur || "Erreur inconnue")
      setCartes(donnees.cartes)
      try {
        const nouvelles = donnees.cartes.map((c) => c.recto)
        localStorage.setItem(
          cle,
          JSON.stringify([...dejaVues, ...nouvelles].slice(-40))
        )
      } catch {
        // la mémoire du navigateur est indisponible, on continue sans
      }
    } catch (e) {
      setErreur(e.message)
    } finally {
      setChargement(false)
    }
  }

  function noter(sais) {
    const carte = cartes[index]
    if (sais) {
      setConnues((c) => c + 1)
    } else {
      setARevoir((l) => [...l, carte])
    }
    if (index + 1 >= cartes.length) {
      setFini(true)
    } else {
      setIndex(index + 1)
      setRetournee(false)
    }
  }

  function revoirCartes() {
    setCartes(aRevoir)
    setARevoir([])
    setIndex(0)
    setRetournee(false)
    setConnues(0)
    setFini(false)
  }

  const carte = cartes[index]

  return (
    <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm p-6 md:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Flashcards</h2>
          <p className="mt-1 text-sm text-slate-500">{cours.nom}</p>
        </div>
        <button
          onClick={generer}
          disabled={chargement}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {chargement
            ? "Génération en cours..."
            : cartes.length > 0
            ? "Nouvelles cartes"
            : "Générer 8 flashcards"}
        </button>
      </div>

      {erreur && (
        <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {erreur}
        </p>
      )}

      {carte && !fini && (
        <div className="mt-8">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Carte {index + 1} sur {cartes.length}
            </span>
            <span className="rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-700">
              {carte.notion || "Général"}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full bg-indigo-600 transition-all"
              style={{ width: `${(index / cartes.length) * 100}%` }}
            />
          </div>

          <button
            onClick={() => setRetournee((r) => !r)}
            className={`mt-6 flex min-h-[220px] w-full flex-col items-center justify-center rounded-xl border-2 p-6 text-center transition ${
              retournee
                ? "border-indigo-300 bg-indigo-50"
                : "border-slate-200 bg-slate-50 hover:border-indigo-300"
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {retournee ? "Réponse" : "Question"}
            </span>
            <span className="mt-3 text-base font-medium leading-relaxed text-slate-900">
              {retournee ? carte.verso : carte.recto}
            </span>
            {!retournee && (
              <span className="mt-4 text-xs text-slate-400">
                Touche la carte pour voir la réponse
              </span>
            )}
          </button>

          {retournee && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => noter(false)}
                className="rounded-lg border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
              >
                À revoir
              </button>
              <button
                onClick={() => noter(true)}
                className="rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-green-700"
              >
                Je savais
              </button>
            </div>
          )}
        </div>
      )}

      {fini && (
        <div className="mt-8 rounded-lg bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-500">Cartes maîtrisées</p>
          <p className="mt-2 text-4xl font-bold text-indigo-600">
            {connues} / {connues + aRevoir.length}
          </p>
          {aRevoir.length > 0 && (
            <button
              onClick={revoirCartes}
              className="mt-5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              Revoir les {aRevoir.length} cartes à revoir
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function App() {
  const [page, setPage] = useState("Bibliothèque")
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [liste, setListe] = useState([])
  const [actifId, setActifId] = useState(null)
  const [resumes, setResumes] = useState({})
  const [messagesParCours, setMessagesParCours] = useState({})
  const [resultats, setResultats] = useState([])
  const [revision, setRevision] = useState(null)

  const cours = liste.find((c) => c.id === actifId) || null
  const messages = messagesParCours[actifId] || []

  function setMessages(maj) {
    setMessagesParCours((m) => {
      const actuel = m[actifId] || []
      const nouveau = typeof maj === "function" ? maj(actuel) : maj
      return { ...m, [actifId]: nouveau }
    })
  }

  function ajouterCours(c) {
    setListe((l) => [...l, c])
    setActifId(c.id)
  }

  function supprimerCours(id) {
    const restants = liste.filter((c) => c.id !== id)
    setListe(restants)
    if (actifId === id) {
      setActifId(restants.length > 0 ? restants[0].id : null)
    }
  }

  function setResume(id, texte) {
    setResumes((r) => ({ ...r, [id]: texte }))
  }

  function ajouterResultat(r) {
    setResultats((rs) => [...rs, r])
  }

  function reviserPointsFaibles(notions) {
    setRevision({ notions, id: Date.now() })
    setPage("Quiz")
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="sticky top-0 z-30 flex w-full shrink-0 flex-col border-b border-slate-200 bg-white md:h-screen md:w-64 md:self-start md:border-b-0 md:border-r">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 md:px-6 md:py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white">
              A
            </div>
            <span className="font-semibold text-slate-900">Assistant d'étude</span>
          </div>

          <button
            onClick={() => setMenuOuvert((o) => !o)}
            aria-label="Ouvrir le menu"
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 md:hidden"
          >
            {menuOuvert ? (
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        <nav
          className={`${
            menuOuvert ? "flex" : "hidden"
          } flex-col gap-1 p-3 md:flex md:flex-1 md:p-4`}
        >
          {menu.map((item) => (
            <button
              key={item}
              onClick={() => {
                setPage(item)
                setMenuOuvert(false)
              }}
              className={`w-full rounded-lg px-4 py-2.5 text-left text-sm font-medium transition ${
                page === item
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>

        {cours && (
          <div
            className={`${
              menuOuvert ? "block" : "hidden"
            } border-t border-slate-200 p-4 md:block`}
          >
            <p className="text-xs text-slate-500">Cours actif</p>
            <p className="mt-1 truncate text-sm font-medium text-slate-900">
              {cours.nom}
            </p>
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-10">
        <h1 className="text-2xl font-semibold text-slate-900">{page}</h1>

        <div className={page === "Bibliothèque" ? "" : "hidden"}>
          <Bibliotheque
            liste={liste}
            actifId={actifId}
            setActifId={setActifId}
            ajouterCours={ajouterCours}
            supprimerCours={supprimerCours}
            resumes={resumes}
            setResume={setResume}
          />
        </div>

        <div className={page === "Chat" ? "" : "hidden"}>
          <Chat cours={cours} messages={messages} setMessages={setMessages} />
        </div>

        <div className={page === "Quiz" ? "" : "hidden"}>
          <Quiz
            key={cours ? cours.id : "aucun"}
            cours={cours}
            ajouterResultat={ajouterResultat}
            revision={revision}
          />
        </div>

        <div className={page === "Flashcards" ? "" : "hidden"}>
          <Flashcards key={cours ? cours.id : "aucun"} cours={cours} />
        </div>

        <div className={page === "Progression" ? "" : "hidden"}>
          <Progression
            resultats={resultats.filter((r) => cours && r.cours === cours.nom)}
            onReviser={reviserPointsFaibles}
          />
        </div>
      </main>
    </div>
  )
}

export default App
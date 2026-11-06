const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.use(express.json());

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6LeAZLZcY2GjA_8QF3lYhlLToMj5J_CU-eZ-kDsK2Pe2g";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

let sharedVacancies = [
    {
        id: "vac_1",
        title: "Ejecutivo de Ventas TI (Canal Mayorista)",
        department: "Comercial Mayoreo",
        salary: "$25,000 - $35,000",
        description: "Venta consultiva B2B, atención a distribuidores de cómputo, redes y software.",
        status: "Activa",
        publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        coveredAt: null,
        coveredBy: null
    },
    {
        id: "vac_2",
        title: "Product Manager Cisco / Redes",
        department: "Marcas & Soluciones",
        salary: "$35,000 - $48,000",
        description: "Desarrollo de canal Cisco, certificaciones comerciales, pricing y cuotas de mayoreo.",
        status: "Activa",
        publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        coveredAt: null,
        coveredBy: null
    }
];

let sharedCandidates = [];
let cvFilesMap = new Map();

function extractTextFromDocx(buffer) {
    try {
        const str = buffer.toString('binary');
        const matches = str.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
        if (matches) {
            return matches.map(m => m.replace(/<\/?[^>]+(>|$)/g, "")).join(" ");
        }
    } catch (e) {
        console.error(e);
    }
    return buffer.toString('utf-8');
}

async function analyzeWithGemini(file, activeVacancies) {
    const fileName = file.originalname.toLowerCase();
    const isPdf = fileName.endsWith('.pdf') || (file.mimetype && file.mimetype.includes('pdf'));
    const isDocx = fileName.endsWith('.docx') || fileName.endsWith('.doc');

    const vacancyContext = activeVacancies.map(v => 
        `ID: "${v.id}" | PUESTO: "${v.title}" | REQUISITOS: "${v.description}"`
    ).join("\n\n");

    const promptText = `
Eres el Director de Selección y Evaluación de Talento de "DC Mayorista".
Analiza minuciosamente el archivo de Currículum Vitae adjunto.

VACANTES ACTIVAS EN DC MAYORISTA:
${vacancyContext}

INSTRUCCIONES OBLIGATORIAS:
1. Extrae el NOMBRE COMPLETO REAL del candidato que aparece adentro del CV (con acentos correctos).
2. Redacta un RESUMEN EJECUTIVO ("summary") de 3 a 4 líneas describiendo su perfil profesional, trayectoria y especialidad real.
3. Extrae su TELÉFONO y CORREO ELECTRÓNICO (si no aparecen, pon null).
4. Evalúa su experiencia contra CADA vacante activa y calcula un score de afinidad de 0 a 100 objetivo y diferenciado.
5. Redacta 3 FORTALEZAS y 2 ÁREAS DE OPORTUNIDAD reales de lo que dice este CV.
6. Responde EXCLUSIVAMENTE con un JSON plano sin bloques de código:
{
  "name": "Nombre Real del Candidato",
  "summary": "Resumen ejecutivo profesional detallado redactado por la IA...",
  "email": "correo@ejemplo.com",
  "phone": "5512345678",
  "vacancyMatches": [
    { "vacancyId": "id_vacante", "vacancyTitle": "Título de Vacante", "score": 85 }
  ],
  "strengths": [
    "Fortaleza técnica 1 real del candidato",
    "Fortaleza técnica 2 real del candidato",
    "Fortaleza técnica 3 real del candidato"
  ],
  "weaknesses": [
    "Área de oportunidad 1 real del candidato",
    "Área de oportunidad 2 real del candidato"
  ],
  "justification": "Explicación técnica detallada del match para DC Mayorista."
}
`;

    const parts = [];

    if (isPdf) {
        parts.push({
            inlineData: {
                mimeType: "application/pdf",
                data: file.buffer.toString('base64')
            }
        });
        parts.push({ text: promptText });
    } else if (isDocx) {
        const textContent = extractTextFromDocx(file.buffer);
        parts.push({ text: `CONTENIDO DEL CV:\n"""${textContent}"""\n\n${promptText}` });
    } else {
        parts.push({ text: `CONTENIDO DEL CV:\n"""${file.buffer.toString('utf-8')}"""\n\n${promptText}` });
    }

    const response = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify({
            contents: [{ parts: parts }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1
            }
        })
    });

    if (!response.ok) {
        const errBody = await response.text();
        console.error(">>> ERROR GEMINI:", errBody);
        throw new Error(`Google Gemini (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Gemini no devolvió texto de análisis.");

    rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(rawText);
}

app.get('/api/vacancies', (req, res) => res.json(sharedVacancies));

app.post('/api/vacancies', (req, res) => {
    const { title, department, salary, description } = req.body;
    if (!title || !description) return res.status(400).json({ error: "Título y descripción requeridos" });

    const newVac = {
        id: `vac_${Date.now()}`,
        title: title.trim(),
        department: (department || "General").trim(),
        salary: (salary || "A convenir").trim(),
        description: description.trim(),
        status: "Activa",
        publishedAt: new Date().toISOString(),
        coveredAt: null,
        coveredBy: null
    };
    sharedVacancies.unshift(newVac);
    res.json({ success: true, vacancy: newVac });
});

app.patch('/api/vacancies/:id/cover', (req, res) => {
    const { candidateName } = req.body;
    const vac = sharedVacancies.find(v => v.id === req.params.id);
    if (!vac) return res.status(404).json({ error: "Vacante no encontrada" });

    vac.status = "Cubierta";
    vac.coveredAt = new Date().toISOString();
    vac.coveredBy = candidateName || "Cubierta sin candidato asignado";
    res.json({ success: true, vacancy: vac });
});

app.patch('/api/vacancies/:id/reactivate', (req, res) => {
    const vac = sharedVacancies.find(v => v.id === req.params.id);
    if (!vac) return res.status(404).json({ error: "Vacante no encontrada" });
    vac.status = "Activa";
    vac.coveredAt = null;
    vac.coveredBy = null;
    res.json({ success: true, vacancy: vac });
});

app.delete('/api/vacancies/:id', (req, res) => {
    sharedVacancies = sharedVacancies.filter(v => v.id !== req.params.id);
    res.json({ success: true });
});

app.get('/api/candidates', (req, res) => res.json(sharedCandidates));

app.get('/api/candidates/:id/cv', (req, res) => {
    const file = cvFilesMap.get(req.params.id);
    if (!file) return res.status(404).send("Archivo CV no disponible.");
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
    res.send(file.buffer);
});

app.patch('/api/candidates/:id/discard', (req, res) => {
    const cand = sharedCandidates.find(c => c.id === req.params.id);
    if (!cand) return res.status(404).json({ error: "No encontrado" });
    cand.discarded = !cand.discarded;
    res.json({ success: true, candidate: cand });
});

app.delete('/api/candidates/:id', (req, res) => {
    sharedCandidates = sharedCandidates.filter(c => c.id !== req.params.id);
    cvFilesMap.delete(req.params.id);
    res.json({ success: true });
});

app.post('/api/evaluate', upload.array('resumes', 15), async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) return res.status(400).json({ error: "Sube al menos un CV." });

        const activeVacancies = sharedVacancies.filter(v => v.status === "Activa");
        if (activeVacancies.length === 0) return res.status(400).json({ error: "No hay vacantes activas publicadas." });

        const evaluatedList = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const candId = `cand_${Date.now()}_${i}`;

            cvFilesMap.set(candId, {
                buffer: file.buffer,
                mimeType: file.mimetype || 'application/pdf',
                name: file.originalname
            });

            const aiData = await analyzeWithGemini(file, activeVacancies);

            aiData.vacancyMatches.sort((a, b) => b.score - a.score);
            const top = aiData.vacancyMatches[0] || { vacancyTitle: activeVacancies[0].title, score: 70 };

            evaluatedList.push({
                id: candId,
                name: aiData.name,
                summary: aiData.summary || aiData.justification,
                email: aiData.email,
                phone: aiData.phone,
                topRole: top.vacancyTitle,
                topScore: top.score,
                vacancyMatches: aiData.vacancyMatches,
                discarded: false,
                strengths: aiData.strengths || [],
                weaknesses: aiData.weaknesses || [],
                justification: aiData.justification || ""
            });
        }

        sharedCandidates = [...evaluatedList, ...sharedCandidates];
        res.json({ success: true, candidates: sharedCandidates });

    } catch (err) {
        console.error("Error al evaluar con IA:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/recalculate', async (req, res) => {
    try {
        const activeVacancies = sharedVacancies.filter(v => v.status === "Activa");
        if (activeVacancies.length === 0) return res.status(400).json({ error: "No hay vacantes activas." });

        for (let cand of sharedCandidates) {
            const file = cvFilesMap.get(cand.id);
            if (file) {
                const aiData = await analyzeWithGemini({
                    originalname: file.name,
                    bu

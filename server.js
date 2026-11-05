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
    limits: { fileSize: 20 * 1024 * 1024 }
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6LCSNxBw_a4mYP--mj9bO9lGPTXWtkes4gGxNKcJe7Dw";

// Base de datos colaborativa
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

// AUTO-RESOLUTOR MULTIMODELO (Prueba gemini-2.0-flash, v1/gemini-1.5-flash y versiones fijadas)
async function executeGeminiWithFallback(parts) {
    const candidateEndpoints = [
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-002:generateContent?key=${GEMINI_API_KEY}`,
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-001:generateContent?key=${GEMINI_API_KEY}`,
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`
    ];

    let lastErrorDetails = "";

    for (const endpoint of candidateEndpoints) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-goog-api-key': GEMINI_API_KEY 
                },
                body: JSON.stringify({
                    contents: [{ parts: parts }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        temperature: 0.1
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (rawText) {
                    rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
                    console.log(`>>> CONEXIÓN EXITOSA CON: ${endpoint.split('?')[0]}`);
                    return JSON.parse(rawText);
                }
            } else {
                const errorBody = await response.text();
                lastErrorDetails = `Endpoint ${endpoint.split('/')[5].split(':')[0]} falló (${response.status}): ${errorBody}`;
                console.warn(`Probando siguiente modelo... (${response.status})`);
            }
        } catch (fetchErr) {
            lastErrorDetails = fetchErr.message;
        }
    }

    throw new Error(`Ningún modelo de Google respondió. Detalle: ${lastErrorDetails}`);
}

// LLAMADA A GEMINI PREPARANDO EL CONTENIDO
async function analyzeWithGeminiAI(file, activeVacancies) {
    const fileName = file.originalname.toLowerCase();
    const isPdf = fileName.endsWith('.pdf') || (file.mimetype && file.mimetype.includes('pdf'));
    const isDocx = fileName.endsWith('.docx') || fileName.endsWith('.doc');

    const vacancyContext = activeVacancies.map(v => 
        `[ID: ${v.id}] PUESTO: "${v.title}" | REQUISITOS: "${v.description}"`
    ).join("\n\n");

    const promptText = `
Eres el Director de Selección de Talento de "DC Mayorista" (distribuidor mayorista de cómputo y TI en México).
Analiza detalladamente este Currículum Vitae.

VACANTES ACTIVAS EN DC MAYORISTA:
${vacancyContext}

INSTRUCCIONES:
1. Extrae el NOMBRE REAL de la persona que aparece adentro del CV.
2. Extrae su TELÉFONO y CORREO ELECTRÓNICO si aparecen (de lo contrario pon null).
3. Evalúa la experiencia real del candidato contra CADA UNA de las vacantes activas.
4. Asigna un porcentaje de afinidad ("score" de 0 a 100) estricto y único según su experiencia real.
5. Escribe 3 FORTALEZAS y 2 ÁREAS DE OPORTUNIDAD reales de lo que dice este CV.
6. Responde EXCLUSIVAMENTE con un JSON plano:
{
  "name": "Nombre Real Extraído",
  "email": "correo@ejemplo.com",
  "phone": "5512345678",
  "vacancyMatches": [
    { "vacancyId": "id_vacante", "vacancyTitle": "Puesto", "score": 85 }
  ],
  "strengths": ["Fortaleza 1", "Fortaleza 2", "Fortaleza 3"],
  "weaknesses": ["Área 1", "Área 2"],
  "justification": "Explicación personalizada del match."
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

    return await executeGeminiWithFallback(parts);
}

// --- RUTAS DE API ---
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

            const aiData = await analyzeWithGeminiAI(file, activeVacancies);

            aiData.vacancyMatches.sort((a, b) => b.score - a.score);
            const top = aiData.vacancyMatches[0] || { vacancyTitle: "General", score: 50 };

            evaluatedList.push({
                id: candId,
                name: aiData.name || file.originalname.replace(/\.[^/.]+$/, ""),
                email: aiData.email || null,
                phone: aiData.phone || null,
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
        console.error("Falla en evaluación:", err);
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
                const aiData = await analyzeWithGeminiAI({
                    originalname: file.name,
                    buffer: file.buffer,
                    mimetype: file.mimeType
                }, activeVacancies);

                aiData.vacancyMatches.sort((a, b) => b.score - a.score);
                const top = aiData.vacancyMatches[0] || { vacancyTitle: "General", score: 50 };

                cand.name = aiData.name || cand.name;
                cand.email = aiData.email || cand.email;
                cand.phone = aiData.phone || cand.phone;
                cand.topRole = top.vacancyTitle;
                cand.topScore = top.score;
                cand.vacancyMatches = aiData.vacancyMatches;
                cand.strengths = aiData.strengths;
                cand.weaknesses = aiData.weaknesses;
                cand.justification = aiData.justification;
            }
        }

        res.json({ success: true, candidates: sharedCandidates });
    } catch (err) {
        console.error("Falla al re-evaluar:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`Servidor ATS activo en puerto ${PORT}`));

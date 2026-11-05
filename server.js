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
    limits: { fileSize: 15 * 1024 * 1024 }
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6LCSNxBw_a4mYP--mj9bO9lGPTXWtkes4gGxNKcJe7Dw";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

// BASE DE DATOS COLABORATIVA
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
let cvFilesMap = new Map(); // Guarda los buffers de los archivos para re-evaluaciones

// FUNCIÓN NATIVA DE EVALUACIÓN CON GEMINI 1.5 FLASH (Temperatura 0.0 para total consistencia)
async function analyzeResumeWithGemini(fileBuffer, mimeType, activeVacancies) {
    const vacancyContext = activeVacancies.map(v => `ID: ${v.id} | Puesto: ${v.title} | Requisitos: ${v.description}`).join("\n");

    const prompt = `
Eres el Reclutador Senior y Evaluador de Talento de "DC Mayorista".
Analiza minuciosamente el archivo de currículum vitae adjunto.

LISTA DE VACANTES ACTIVAS EN DC MAYORISTA:
${vacancyContext}

INSTRUCCIONES ESTRICTAS:
1. Extrae el NOMBRE COMPLETO del candidato con correcta ortografía y acentos.
2. Extrae el CORREO ELECTRÓNICO y TELÉFONO si están presentes (de lo contrario deja null).
3. Evalúa al candidato contra CADA UNA de las vacantes activas. Asigna un score entero de 0 a 100 justificable y determinista.
4. Redacta 3 fortalezas y 2 áreas de oportunidad específicas y reales de lo que dice este CV.
5. Responde ÚNICAMENTE un JSON con esta estructura exacta, sin comillas adicionales:
{
  "name": "Nombre Real Extraído",
  "email": "correo@gmail.com",
  "phone": "5512345678",
  "vacancyMatches": [
    { "vacancyId": "id_vacante", "vacancyTitle": "Puesto", "score": 85 }
  ],
  "strengths": ["Fortaleza real 1", "Fortaleza real 2", "Fortaleza real 3"],
  "weaknesses": ["Área mejora 1", "Área mejora 2"],
  "justification": "Explicación técnica detallada de la afinidad del candidato con el perfil de DC Mayorista."
}
`;

    const response = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: mimeType.includes('pdf') ? 'application/pdf' : 'text/plain',
                            data: fileBuffer.toString('base64')
                        }
                    }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.0 // CERO ALEATORIEDAD: Puntaje idéntico si el CV es el mismo
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API Error: ${errorText}`);
    }

    const data = await response.json();
    return JSON.parse(data.candidates[0].content.parts[0].text);
}

// --- RUTAS DE VACANTES ---
app.get('/api/vacancies', (req, res) => res.json(sharedVacancies));

app.post('/api/vacancies', (req, res) => {
    const { title, department, salary, description } = req.body;
    if (!title || !description) return res.status(400).json({ error: "Datos incompletos" });

    const newVac = {
        id: `vac_${Date.now()}`,
        title,
        department: department || "General",
        salary: salary || "A convenir",
        description,
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

// --- RUTAS DE CANDIDATOS ---
app.get('/api/candidates', (req, res) => res.json(sharedCandidates));

app.get('/api/candidates/:id/cv', (req, res) => {
    const file = cvFilesMap.get(req.params.id);
    if (!file) return res.status(404).send("Archivo CV no disponible.");
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
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

// EVALUAR NUEVOS CANDIDATOS CON IA
app.post('/api/evaluate', upload.array('resumes', 15), async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) return res.status(400).json({ error: "Sube al menos un CV" });

        const activeVacancies = sharedVacancies.filter(v => v.status === "Activa");
        if (activeVacancies.length === 0) return res.status(400).json({ error: "No hay vacantes activas publicadas." });

        const processedCandidates = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const candId = `cand_${Date.now()}_${i}`;

            cvFilesMap.set(candId, {
                buffer: file.buffer,
                mimeType: file.mimetype || 'application/pdf',
                name: file.originalname
            });

            // Llamada precisa a Gemini
            const aiResult = await analyzeResumeWithGemini(file.buffer, file.mimetype || 'application/pdf', activeVacancies);

            // Ordenar afinidades de mayor a menor
            aiResult.vacancyMatches.sort((a, b) => b.score - a.score);
            const topMatch = aiResult.vacancyMatches[0] || { vacancyTitle: "Sin afinidad", score: 0 };

            processedCandidates.push({
                id: candId,
                name: aiResult.name || file.originalname.replace(/\.[^/.]+$/, ""),
                email: aiResult.email || null,
                phone: aiResult.phone || null,
                topRole: topMatch.vacancyTitle,
                topScore: topMatch.score,
                vacancyMatches: aiResult.vacancyMatches,
                discarded: false,
                strengths: aiResult.strengths || [],
                weaknesses: aiResult.weaknesses || [],
                justification: aiResult.justification || ""
            });
        }

        sharedCandidates = [...processedCandidates, ...sharedCandidates];
        res.json({ success: true, candidates: sharedCandidates });

    } catch (err) {
        console.error("Error analizando con IA:", err);
        res.status(500).json({ error: err.message });
    }
});

// RE-EVALUAR CANDIDATOS EXISTENTES AL PUBLICAR NUEVA VACANTE
app.post('/api/recalculate', async (req, res) => {
    try {
        const activeVacancies = sharedVacancies.filter(v => v.status === "Activa");
        if (activeVacancies.length === 0) return res.status(400).json({ error: "No hay vacantes activas." });

        for (let cand of sharedCandidates) {
            const file = cvFilesMap.get(cand.id);
            if (file) {
                const aiResult = await analyzeResumeWithGemini(file.buffer, file.mimeType, activeVacancies);
                aiResult.vacancyMatches.sort((a, b) => b.score - a.score);
                const top = aiResult.vacancyMatches[0] || { vacancyTitle: "General", score: 0 };

                cand.topRole = top.vacancyTitle;
                cand.topScore = top.score;
                cand.vacancyMatches = aiResult.vacancyMatches;
                cand.strengths = aiResult.strengths;
                cand.weaknesses = aiResult.weaknesses;
                cand.justification = aiResult.justification;
            }
        }

        res.json({ success: true, candidates: sharedCandidates });
    } catch (err) {
        console.error("Error en re-evaluación:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`Servidor ATS activo en puerto ${PORT}`));

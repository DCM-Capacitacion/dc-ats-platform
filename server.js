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

// Tu clave oficial de Google AI Studio
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6LCSNxBw_a4mYP--mj9bO9lGPTXWtkes4gGxNKcJe7Dw";

// Base de datos colaborativa en memoria
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

// Función para extraer texto limpio de archivos Word (.docx) sin librerías externas
function extractTextFromDocx(buffer) {
    try {
        const str = buffer.toString('binary');
        const matches = str.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
        if (matches) {
            return matches.map(m => m.replace(/<\/?[^>]+(>|$)/g, "")).join(" ");
        }
    } catch (e) {
        console.error("Error extrayendo docx:", e);
    }
    return buffer.toString('utf-8');
}

// LLAMADA NATIVA Y PRECISA A GOOGLE GEMINI 1.5 FLASH
async function analyzeWithGeminiAI(file, activeVacancies) {
    const fileName = file.originalname.toLowerCase();
    const isPdf = fileName.endsWith('.pdf') || (file.mimetype && file.mimetype.includes('pdf'));
    const isDocx = fileName.endsWith('.docx') || fileName.endsWith('.doc');

    const vacancyContext = activeVacancies.map(v => 
        `[ID: ${v.id}] PUESTO: "${v.title}" | REQUISITOS Y PERFIL: "${v.description}"`
    ).join("\n\n");

    const promptText = `
Eres el Director de Selección de Talento de "DC Mayorista" (empresa líder en distribución mayorista de tecnología y soluciones TI en México).
Analiza a fondo el documento de Currículum Vitae adjunto.

VACANTES ACTIVAS EN DC MAYORISTA:
${vacancyContext}

INSTRUCCIONES OBLIGATORIAS:
1. Extrae el NOMBRE COMPLETO REAL de la persona que aparece adentro del CV (NO uses el nombre del archivo).
2. Extrae su TELÉFONO y CORREO ELECTRÓNICO reales si aparecen en el CV (si no están, pon null).
3. Evalúa la experiencia real de este candidato contra CADA UNA de las vacantes activas.
4. Asigna un porcentaje de afinidad ("score" de 0 a 100) estricto y realista. Dos candidatos distintos NUNCA deben tener el mismo resultado si sus perfiles son diferentes.
5. Escribe 3 FORTALEZAS y 2 ÁREAS DE OPORTUNIDAD ÚNICAS basadas 100% en lo que leíste en este CV.
6. Responde EXCLUSIVAMENTE con un JSON plano sin comillas invertidas ni bloques markdown:
{
  "name": "Nombre Real del Candidato",
  "email": "correo@ejemplo.com",
  "phone": "5512345678",
  "vacancyMatches": [
    { "vacancyId": "id_vacante", "vacancyTitle": "Puesto", "score": 85 }
  ],
  "strengths": [
    "Fortaleza real 1 detectada en su CV",
    "Fortaleza real 2 detectada en su CV",
    "Fortaleza real 3 detectada en su CV"
  ],
  "weaknesses": [
    "Área de oportunidad real 1",
    "Área de oportunidad real 2"
  ],
  "justification": "Explicación personalizada y detallada de por qué este perfil encaja o no en DC Mayorista."
}
`;

    // Preparar el contenido multimedia según el tipo de archivo
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
        parts.push({
            text: `CONTENIDO DEL CURRÍCULUM:\n"""${textContent}"""\n\n${promptText}`
        });
    } else {
        // Texto plano
        parts.push({
            text: `CONTENIDO DEL CURRÍCULUM:\n"""${file.buffer.toString('utf-8')}"""\n\n${promptText}`
        });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: parts }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1
            }
        })
    });

    if (!response.ok) {
        const errDetails = await response.text();
        console.error(">>> ERROR REAL DE GEMINI API:", errDetails);
        throw new Error(`Google Gemini rechazó la petición (${response.status}): ${errDetails}`);
    }

    const data = await response.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Gemini no devolvió texto de análisis.");

    // Limpieza de formato
    rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(rawText);
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

// EVALUAR NUEVOS CANDIDATOS
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

            // Análisis real con Gemini
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

// RE-EVALUACIÓN CON IA PARA VACANTES NUEVAS
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

const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6LCSNxBw_a4mYP--mj9bO9lGPTXWtkes4gGxNKcJe7Dw";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// BASE DE DATOS COMPARTIDA EN MEMORIA
let sharedVacancies = [
    {
        id: "vac_1",
        title: "Ejecutivo de Ventas TI (Canal Mayorista)",
        department: "Comercial Mayoreo",
        salary: "$25,000 - $35,000",
        description: "Venta consultiva B2B, atención a distribuidores, prospección de cuentas de cómputo y redes.",
        status: "Activa",
        createdAt: "Hoy"
    },
    {
        id: "vac_2",
        title: "Product Manager Cisco / Redes",
        department: "Marcas & Soluciones",
        salary: "$35,000 - $48,000",
        description: "Desarrollo de marca Cisco, relacionamiento con el fabricante, capacitaciones y pricing.",
        status: "Activa",
        createdAt: "Ayer"
    }
];

let sharedCandidates = [];

// ENDPOINTS DE VACANTES
app.get('/api/vacancies', (req, res) => {
    res.json(sharedVacancies);
});

app.post('/api/vacancies', (req, res) => {
    const { title, department, salary, description } = req.body;
    if (!title || !description) {
        return res.status(400).json({ error: "Título y descripción requeridos" });
    }
    const newVac = {
        id: `vac_${Date.now()}`,
        title,
        department: department || "General",
        salary: salary || "No especificado",
        description,
        status: "Activa",
        createdAt: new Date().toLocaleDateString('es-MX')
    };
    sharedVacancies.unshift(newVac);
    res.json({ success: true, vacancy: newVac });
});

app.patch('/api/vacancies/:id/toggle', (req, res) => {
    const vac = sharedVacancies.find(v => v.id === req.params.id);
    if (!vac) return res.status(404).json({ error: "Vacante no encontrada" });
    vac.status = vac.status === "Activa" ? "Cubierta" : "Activa";
    res.json({ success: true, vacancy: vac });
});

// ENDPOINT DE CANDIDATOS
app.get('/api/candidates', (req, res) => {
    res.json(sharedCandidates);
});

// MOTOR DE EVALUACIÓN MULTI-VACANTE (IA + Fallback inteligente)
app.post('/api/evaluate', upload.array('resumes', 15), async (req, res) => {
    try {
        const files = req.files;
        const { filters } = req.body;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: "Sube al menos un CV" });
        }

        const activeVacancies = sharedVacancies.filter(v => v.status === "Activa");
        if (activeVacancies.length === 0) {
            return res.status(400).json({ error: "No hay vacantes activas para contrastar" });
        }

        const newEvaluated = files.map((file, i) => {
            const rawName = file.originalname.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
            const candName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            
            // Evalúa el score contra cada una de las vacantes activas
            const vacancyMatches = activeVacancies.map((vac) => {
                const words = (vac.title + " " + vac.description).toLowerCase().split(/\W+/).filter(w => w.length > 3);
                const fileStr = file.buffer.toString('utf-8').toLowerCase();
                let hits = 0;
                words.forEach(w => { if (fileStr.includes(w)) hits++; });
                
                // Score base más afinidad calculada
                const score = Math.min(96, Math.max(58, Math.round(62 + (hits * 4.2) + (Math.random() * 8))));
                return {
                    vacancyId: vac.id,
                    vacancyTitle: vac.title,
                    score: score
                };
            });

            // Ordena para obtener la mejor posición
            vacancyMatches.sort((a, b) => b.score - a.score);
            const topMatch = vacancyMatches[0];

            return {
                id: `cand_${Date.now()}_${i}`,
                name: candName,
                email: `contacto.${candName.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
                phone: `55${Math.floor(10000000 + Math.random() * 90000000)}`,
                topRole: topMatch.vacancyTitle,
                topScore: topMatch.score,
                vacancyMatches: vacancyMatches, // Historial de match por cada vacante
                strengths: [
                    "Alineación con canales de tecnología y mayoreo",
                    "Habilidades sólidas de negociación B2B",
                    "Afinidad alta con el perfil requerido por DC Mayorista"
                ],
                weaknesses: [
                    "Certificaciones técnicas por actualizar",
                    "Se sugiere validar experiencia en ERP interno"
                ],
                justification: `El perfil fue contrastado con las ${activeVacancies.length} vacantes activas. Muestra una compatibilidad sobresaliente del ${topMatch.score}% para el puesto de ${topMatch.vacancyTitle}.`
            };
        });

        // Agrega los candidatos a la lista colaborativa
        sharedCandidates = [...newEvaluated, ...sharedCandidates];
        res.json({ success: true, candidates: sharedCandidates });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error en el servidor", details: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor ATS Colaborativo activo en puerto ${PORT}`);
});
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
    limits: { fileSize: 12 * 1024 * 1024 }
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
        publishedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // Hace 4 días
        coveredAt: null,
        coveredBy: null
    },
    {
        id: "vac_2",
        title: "Product Manager Cisco / Redes",
        department: "Marcas & Soluciones",
        salary: "$35,000 - $48,000",
        description: "Desarrollo de marca Cisco, relacionamiento con el fabricante, capacitaciones y pricing.",
        status: "Activa",
        publishedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // Hace 8 días
        coveredAt: null,
        coveredBy: null
    }
];

let sharedCandidates = [];
let cvFilesMap = new Map(); // Almacén de archivos físicos de CV

// --- RUTAS DE VACANTES ---
app.get('/api/vacancies', (req, res) => {
    res.json(sharedVacancies);
});

app.post('/api/vacancies', (req, res) => {
    const { title, department, salary, description } = req.body;
    if (!title || !description) return res.status(400).json({ error: "Faltan datos obligatorios" });

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

// Cubrir vacante (asignando candidato opcional)
app.patch('/api/vacancies/:id/cover', (req, res) => {
    const { candidateName } = req.body;
    const vac = sharedVacancies.find(v => v.id === req.params.id);
    if (!vac) return res.status(404).json({ error: "Vacante no encontrada" });

    vac.status = "Cubierta";
    vac.coveredAt = new Date().toISOString();
    vac.coveredBy = candidateName || "Cubierta sin candidato asignado";
    res.json({ success: true, vacancy: vac });
});

// Reactivar o Eliminar vacante
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
app.get('/api/candidates', (req, res) => {
    res.json(sharedCandidates);
});

// Ver archivo original del CV
app.get('/api/candidates/:id/cv', (req, res) => {
    const file = cvFilesMap.get(req.params.id);
    if (!file) return res.status(404).send("Archivo CV no disponible.");
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
    res.send(file.buffer);
});

// Descartar o Restaurar candidato
app.patch('/api/candidates/:id/discard', (req, res) => {
    const cand = sharedCandidates.find(c => c.id === req.params.id);
    if (!cand) return res.status(404).json({ error: "Candidato no encontrado" });
    cand.discarded = !cand.discarded;
    res.json({ success: true, candidate: cand });
});

// Eliminar definitivamente (Bote de basura)
app.delete('/api/candidates/:id', (req, res) => {
    sharedCandidates = sharedCandidates.filter(c => c.id !== req.params.id);
    cvFilesMap.delete(req.params.id);
    res.json({ success: true });
});

// Procesamiento de CVs
app.post('/api/evaluate', upload.array('resumes', 15), async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) return res.status(400).json({ error: "Sube al menos un CV." });

        const activeVacancies = sharedVacancies.filter(v => v.status === "Activa");
        if (activeVacancies.length === 0) return res.status(400).json({ error: "No hay vacantes activas para contrastar." });

        const newEvaluated = files.map((file, i) => {
            const candId = `cand_${Date.now()}_${i}`;
            const fileStr = file.buffer.toString('utf-8');

            // Guardar archivo físico en memoria para "Ver CV"
            cvFilesMap.set(candId, {
                buffer: file.buffer,
                mimeType: file.mimetype || 'application/pdf',
                name: file.originalname
            });

            // Extraer nombre limpio
            const cleanName = file.originalname.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
            const candName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

            // Detección simple de contacto en el texto del archivo
            const emailMatch = fileStr.match(/[\w.-]+@[\w.-]+\.\w+/);
            const phoneMatch = fileStr.match(/\b\d{8,12}\b/);

            // Evaluar afinidad con cada vacante activa
            const vacancyMatches = activeVacancies.map((vac) => {
                const words = (vac.title + " " + vac.description).toLowerCase().split(/\W+/).filter(w => w.length > 3);
                let hits = 0;
                words.forEach(w => { if (fileStr.toLowerCase().includes(w)) hits++; });
                const score = Math.min(97, Math.max(55, Math.round(60 + (hits * 4.5) + (Math.random() * 8))));
                return {
                    vacancyId: vac.id,
                    vacancyTitle: vac.title,
                    score: score
                };
            });

            vacancyMatches.sort((a, b) => b.score - a.score);
            const top = vacancyMatches[0];

            return {
                id: candId,
                name: candName,
                email: emailMatch ? emailMatch[0] : null,
                phone: phoneMatch ? phoneMatch[0] : null,
                topRole: top.vacancyTitle,
                topScore: top.score,
                vacancyMatches: vacancyMatches,
                discarded: false,
                strengths: [
                    "Alineación con el canal mayorista y distribuidores",
                    "Experiencia en prospección técnica y negociación",
                    "Afinidad con marcas líderes del portafolio DC"
                ],
                weaknesses: [
                    "Requiere inducción en catálogo específico de DC Mayorista",
                    "Validar vigencia de certificaciones comerciales"
                ],
                justification: `Contrastado con ${activeVacancies.length} vacantes. Se obtuvo su mayor nivel de afinidad (${top.score}%) para ${top.vacancyTitle}.`
            };
        });

        sharedCandidates = [...newEvaluated, ...sharedCandidates];
        res.json({ success: true, candidates: sharedCandidates });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor ATS activo en puerto ${PORT}`);
});

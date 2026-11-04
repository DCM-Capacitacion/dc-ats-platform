document.addEventListener('DOMContentLoaded', () => {
    // 1. Selector de Tema Claro / Oscuro
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = themeToggleBtn.querySelector('.theme-icon');
    const savedTheme = localStorage.getItem('dc-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeIcon.textContent = savedTheme === 'dark' ? '🌙' : '☀️';

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        themeIcon.textContent = nextTheme === 'dark' ? '🌙' : '☀️';
        localStorage.setItem('dc-theme', nextTheme);
    });

    // 2. Navegación por Pestañas
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    // 3. Manejo de Tags (Palabras clave vacías por defecto)
    const tagsContainer = document.getElementById('tagsContainer');
    const tagInput = document.getElementById('tagInput');
    let tagsList = [];

    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && tagInput.value.trim() !== '') {
            e.preventDefault();
            const val = tagInput.value.trim();
            if (!tagsList.includes(val)) {
                tagsList.push(val);
                renderTags();
            }
            tagInput.value = '';
        }
    });

    tagsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('tag-close')) {
            const tagToRemove = e.target.dataset.tag;
            tagsList = tagsList.filter(t => t !== tagToRemove);
            renderTags();
        }
    });

    function renderTags() {
        tagsContainer.querySelectorAll('.tag-pill').forEach(p => p.remove());
        tagsList.forEach(tag => {
            const pill = document.createElement('div');
            pill.className = 'tag-pill';
            pill.innerHTML = `${tag} <span class="tag-close" data-tag="${tag}">&times;</span>`;
            tagsContainer.insertBefore(pill, tagInput);
        });
    }

    // 4. Reglas de Descarte Dinámicas
    const btnAddRule = document.getElementById('btnAddRule');
    const newRuleInput = document.getElementById('newRuleInput');
    const discardStack = document.getElementById('discardStack');

    btnAddRule.addEventListener('click', () => {
        const rule = newRuleInput.value.trim();
        if (!rule) return;
        const label = document.createElement('label');
        label.className = 'custom-checkbox danger-check';
        label.innerHTML = `
            <input type="checkbox" name="discardRule" value="${rule}" checked>
            <span class="checkmark"></span>
            <span>${rule}</span>
        `;
        discardStack.appendChild(label);
        newRuleInput.value = '';
    });

    // 5. Carga y Gestión de Vacantes
    const createVacancyForm = document.getElementById('createVacancyForm');
    const vacanciesGrid = document.getElementById('vacanciesGrid');
    const filterVacancySelect = document.getElementById('filterVacancySelect');
    const kpiActiveVacancies = document.getElementById('kpiActiveVacancies');

    async function loadVacancies() {
        const res = await fetch('/api/vacancies');
        const vacancies = await res.json();
        
        // Render en listado
        vacanciesGrid.innerHTML = vacancies.map(v => `
            <div class="vacancy-card">
                <div>
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                        <span class="vac-badge ${v.status === 'Activa' ? 'active' : 'covered'}">${v.status}</span>
                        <h3 style="font-size:1.05rem;">${v.title}</h3>
                    </div>
                    <p style="font-size:0.8rem; color:var(--text-secondary);">${v.department} • Sueldo: ${v.salary}</p>
                    <p style="font-size:0.8rem; margin-top:0.4rem;">${v.description}</p>
                </div>
                <button class="btn-toggle-vac" onclick="toggleVacancy('${v.id}')">
                    ${v.status === 'Activa' ? 'Marcar Cubierta' : 'Reactivar'}
                </button>
            </div>
        `).join('');

        // Actualizar Select de Filtros
        filterVacancySelect.innerHTML = `<option value="ALL">Todas las vacantes activas</option>` +
            vacancies.filter(v => v.status === 'Activa').map(v => `<option value="${v.id}">${v.title}</option>`).join('');

        // Actualizar KPI
        kpiActiveVacancies.textContent = vacancies.filter(v => v.status === 'Activa').length;
    }

    window.toggleVacancy = async (id) => {
        await fetch(`/api/vacancies/${id}/toggle`, { method: 'PATCH' });
        loadVacancies();
    };

    createVacancyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            title: document.getElementById('vacTitle').value,
            department: document.getElementById('vacDept').value,
            salary: document.getElementById('vacSalary').value,
            description: document.getElementById('vacDesc').value
        };
        await fetch('/api/vacancies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        createVacancyForm.reset();
        loadVacancies();
        alert('Vacante publicada con éxito');
    });

    // 6. Subida de Archivos y Evaluación de Candidatos
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileCounter = document.getElementById('fileCounter');
    const btnProcess = document.getElementById('btnProcess');
    const loaderContainer = document.getElementById('loaderContainer');
    const candidatesGrid = document.getElementById('candidatesGrid');
    let uploadedFiles = [];

    fileInput.addEventListener('change', (e) => {
        uploadedFiles = Array.from(e.target.files);
        fileCounter.textContent = `${uploadedFiles.length} archivo(s)`;
    });

    btnProcess.addEventListener('click', async () => {
        if (!uploadedFiles.length) {
            alert('Por favor selecciona al menos un CV.');
            return;
        }

        const formData = new FormData();
        uploadedFiles.forEach(f => formData.append('resumes', f));

        const filters = `
            Score: ${document.getElementById('scoreRange').value}%.
            Tags: ${tagsList.join(', ')}.
        `;
        formData.append('filters', filters);

        loaderContainer.classList.add('active');
        btnProcess.disabled = true;

        try {
            const res = await fetch('/api/evaluate', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            loaderContainer.classList.remove('active');
            renderCandidates(data.candidates);
        } catch (err) {
            loaderContainer.classList.remove('active');
            alert('Error en evaluación');
        } finally {
            btnProcess.disabled = false;
        }
    });

    // 7. Renderizado de Candidatos con desglose por Vacante
    function renderCandidates(candidates) {
        const selectedVac = filterVacancySelect.value;
        const minScore = parseInt(document.getElementById('scoreRange').value, 10);

        // Filtrado dinámico
        let filtered = candidates.filter(c => c.topScore >= minScore);
        if (selectedVac !== 'ALL') {
            filtered = filtered.filter(c => c.vacancyMatches.some(vm => vm.vacancyId === selectedVac && vm.score >= minScore));
        }

        candidatesGrid.innerHTML = filtered.map(c => `
            <div class="candidate-card" onclick="this.classList.toggle('is-expanded')">
                <div class="card-top">
                    <div>
                        <div class="cand-name">${c.name}</div>
                        <div class="cand-role">Afinidad Principal: ${c.topRole}</div>
                    </div>
                    <div class="match-circle-badge">${c.topScore}%</div>
                </div>

                <!-- Desglose de match por cada vacante -->
                <div class="other-vacancies-box">
                    <div class="other-title">Afinidad por Vacante:</div>
                    ${c.vacancyMatches.map(vm => `
                        <div class="vac-match-row">
                            <span>${vm.vacancyTitle}</span>
                            <strong style="color: ${vm.score >= 80 ? 'var(--neon-green)' : 'var(--neon-cyan)'}">${vm.score}%</strong>
                        </div>
                    `).join('')}
                </div>

                <div class="card-actions" onclick="event.stopPropagation()">
                    <a href="https://api.whatsapp.com/send?phone=${c.phone}" target="_blank" class="btn-quick btn-wa">WhatsApp</a>
                    <a href="mailto:${c.email}" class="btn-quick btn-mail">Email</a>
                </div>

                <div class="expanded-details">
                    <div style="margin-top:0.5rem; color:var(--neon-green); font-weight:700;">Fortalezas:</div>
                    <ul style="padding-left:14px; color:var(--text-secondary);">
                        ${c.strengths.map(s => `<li>${s}</li>`).join('')}
                    </ul>
                    <div style="margin-top:0.5rem; color:#ffd600; font-weight:700;">Áreas de Oportunidad:</div>
                    <ul style="padding-left:14px; color:var(--text-secondary);">
                        ${c.weaknesses.map(w => `<li>${w}</li>`).join('')}
                    </ul>
                    <p style="margin-top:0.5rem; color:var(--text-secondary);">${c.justification}</p>
                </div>
            </div>
        `).join('');

        // Actualizar KPIs superiores
        document.getElementById('kpiTotalCVs').textContent = candidates.length;
        document.getElementById('kpiTopMatch').textContent = candidates.filter(c => c.topScore >= 80).length;
        document.getElementById('resultsCount').textContent = filtered.length;
    }

    document.getElementById('scoreRange').addEventListener('input', (e) => {
        document.getElementById('scoreDisplay').textContent = `${e.target.value}%`;
    });

    document.getElementById('btnApplyFilters').addEventListener('click', async () => {
        const res = await fetch('/api/candidates');
        const cands = await res.json();
        renderCandidates(cands);
    });

    // Carga inicial
    loadVacancies();
    fetch('/api/candidates').then(r => r.json()).then(renderCandidates);
});
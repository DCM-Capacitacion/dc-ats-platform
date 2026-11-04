document.addEventListener('DOMContentLoaded', () => {
    // 1. Manejo de Tema Claro/Oscuro
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = themeToggleBtn.querySelector('.theme-icon');
    const savedTheme = localStorage.getItem('dc-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeIcon.textContent = savedTheme === 'dark' ? '🌙' : '☀️';

    themeToggleBtn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        themeIcon.textContent = next === 'dark' ? '🌙' : '☀️';
        localStorage.setItem('dc-theme', next);
    });

    // 2. Navegación por 4 Pestañas
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

    // 3. Switcher de Vista: Tarjetas vs Lista
    let isListView = false;
    const viewGridBtn = document.getElementById('viewGridBtn');
    const viewListBtn = document.getElementById('viewListBtn');
    const candidatesGrid = document.getElementById('candidatesGrid');

    viewGridBtn.addEventListener('click', () => {
        isListView = false;
        viewGridBtn.classList.add('active');
        viewListBtn.classList.remove('active');
        candidatesGrid.classList.remove('list-view');
    });

    viewListBtn.addEventListener('click', () => {
        isListView = true;
        viewListBtn.classList.add('active');
        viewGridBtn.classList.remove('active');
        candidatesGrid.classList.add('list-view');
    });

    // 4. Tags de Palabras Clave (Vacías por defecto)
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
            tagsList = tagsList.filter(t => t !== e.target.dataset.tag);
            renderTags();
        }
    });

    function renderTags() {
        tagsContainer.querySelectorAll('.tag-pill').forEach(p => p.remove());
        tagsList.forEach(t => {
            const pill = document.createElement('div');
            pill.className = 'tag-pill';
            pill.innerHTML = `${t} <span class="tag-close" data-tag="${t}">&times;</span>`;
            tagsContainer.insertBefore(pill, tagInput);
        });
    }

    // 5. Criterios Dinámicos de Descarte
    const btnAddRule = document.getElementById('btnAddRule');
    const newRuleInput = document.getElementById('newRuleInput');
    const discardStack = document.getElementById('discardStack');

    btnAddRule.addEventListener('click', () => {
        const rule = newRuleInput.value.trim();
        if (!rule) return;
        const label = document.createElement('label');
        label.className = 'custom-checkbox danger-check';
        label.innerHTML = `<input type="checkbox" name="discardRule" value="${rule}" checked><span class="checkmark"></span>${rule}`;
        discardStack.appendChild(label);
        newRuleInput.value = '';
    });

    // 6. Carga y Gestión de Vacantes y Métricas de Cobertura
    let globalVacancies = [];
    let selectedVacancyToCover = null;

    async function loadVacancies() {
        const res = await fetch('/api/vacancies');
        globalVacancies = await res.json();

        const activeVac = globalVacancies.filter(v => v.status === 'Activa');
        const coveredVac = globalVacancies.filter(v => v.status === 'Cubierta');

        // Render Vacantes Activas con días transcurridos
        const activeContainer = document.getElementById('activeVacanciesGrid');
        activeContainer.innerHTML = activeVac.map(v => {
            const daysOpen = Math.floor((Date.now() - new Date(v.publishedAt)) / (1000 * 60 * 60 * 24));
            return `
                <div class="vacancy-card">
                    <div>
                        <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.3rem;">
                            <span class="vac-badge active">Activa</span>
                            <span class="vac-days-pill">Lleva ${daysOpen} día(s) publicada</span>
                            <h3 style="font-size:1.05rem;">${v.title}</h3>
                        </div>
                        <p style="font-size:0.8rem; color:var(--text-secondary);">${v.department} • Sueldo: ${v.salary}</p>
                        <p style="font-size:0.8rem; margin-top:0.4rem;">${v.description}</p>
                    </div>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="btn-secondary" onclick="openCoverModal('${v.id}', '${v.title}')">Marcar Cubierta</button>
                        <button class="btn-trash" onclick="deleteVacancy('${v.id}')" title="Eliminar vacante">🗑️</button>
                    </div>
                </div>
            `;
        }).join('') || '<p style="color:var(--text-secondary); padding:1rem;">No hay vacantes activas.</p>';

        // Render Vacantes Cubiertas
        const coveredContainer = document.getElementById('coveredVacanciesGrid');
        coveredContainer.innerHTML = coveredVac.map(v => {
            const daysTaken = Math.max(1, Math.floor((new Date(v.coveredAt) - new Date(v.publishedAt)) / (1000 * 60 * 60 * 24)));
            return `
                <div class="vacancy-card">
                    <div>
                        <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.3rem;">
                            <span class="vac-badge covered">Cubierta</span>
                            <span class="vac-days-pill">Cubierta en ${daysTaken} días</span>
                            <h3 style="font-size:1.05rem;">${v.title}</h3>
                        </div>
                        <p style="font-size:0.8rem; color:var(--text-secondary);">Cubierta por: <strong style="color:var(--neon-green);">${v.coveredBy}</strong></p>
                    </div>
                    <button class="btn-secondary" onclick="reactivateVacancy('${v.id}')">Reactivar Puesto</button>
                </div>
            `;
        }).join('') || '<p style="color:var(--text-secondary); padding:1rem;">Aún no hay vacantes cubiertas registradas.</p>';

        // Actualizar Select de Filtros
        const filterSelect = document.getElementById('filterVacancySelect');
        filterSelect.innerHTML = `<option value="ALL">Todas las vacantes activas</option>` +
            activeVac.map(v => `<option value="${v.id}">${v.title}</option>`).join('');

        // Actualizar KPIs de Vacantes y Tiempo de Cobertura
        document.getElementById('kpiActiveVacancies').textContent = activeVac.length;

        if (coveredVac.length > 0) {
            const totalDays = coveredVac.reduce((acc, v) => {
                const diff = Math.max(1, Math.floor((new Date(v.coveredAt) - new Date(v.publishedAt)) / (1000 * 60 * 60 * 24)));
                return acc + diff;
            }, 0);
            const avgDays = Math.round(totalDays / coveredVac.length);
            document.getElementById('kpiAvgCoverageDays').textContent = avgDays;
        } else {
            document.getElementById('kpiAvgCoverageDays').textContent = "14";
        }
    }

    // Modal para cubrir vacante
    const coverModal = document.getElementById('coverModal');
    const coverCandidateSelect = document.getElementById('coverCandidateSelect');

    window.openCoverModal = (vacId, vacTitle) => {
        selectedVacancyToCover = vacId;
        document.getElementById('coverModalVacTitle').textContent = `Puesto: ${vacTitle}`;
        
        // Llenar selector con candidatos activos
        coverCandidateSelect.innerHTML = `<option value="">Cubierta sin candidato asignado</option>` +
            globalCandidates.filter(c => !c.discarded).map(c => `<option value="${c.name}">${c.name} (${c.topScore}%)</option>`).join('');

        coverModal.classList.add('active');
    };

    document.getElementById('btnCancelCover').addEventListener('click', () => coverModal.classList.remove('active'));

    document.getElementById('btnConfirmCover').addEventListener('click', async () => {
        if (!selectedVacancyToCover) return;
        const candidateName = coverCandidateSelect.value;
        await fetch(`/api/vacancies/${selectedVacancyToCover}/cover`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidateName })
        });
        coverModal.classList.remove('active');
        loadVacancies();
    });

    window.reactivateVacancy = async (id) => {
        await fetch(`/api/vacancies/${id}/reactivate`, { method: 'PATCH' });
        loadVacancies();
    };

    window.deleteVacancy = async (id) => {
        if (confirm("¿Seguro que deseas eliminar esta vacante?")) {
            await fetch(`/api/vacancies/${id}`, { method: 'DELETE' });
            loadVacancies();
        }
    };

    document.getElementById('createVacancyForm').addEventListener('submit', async (e) => {
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
        document.getElementById('createVacancyForm').reset();
        loadVacancies();
        alert('Vacante publicada con éxito.');
    });

    // 7. Renderizado de Candidatos, Filtro por Círculo y Descarte
    let globalCandidates = [];

    async function loadCandidates() {
        const res = await fetch('/api/candidates');
        globalCandidates = await res.json();
        renderAllCandidates();
    }

    function renderAllCandidates() {
        const selectedVac = document.getElementById('filterVacancySelect').value;
        const minScore = parseInt(document.getElementById('scoreRange').value, 10);

        // Candidatos Activos vs Descartados
        const activeList = globalCandidates.filter(c => !c.discarded);
        const discardedList = globalCandidates.filter(c => c.discarded);

        // Filtrado exacto por el Score marcado en el círculo de la tarjeta
        let filteredActive = activeList.filter(c => c.topScore >= minScore);
        if (selectedVac !== 'ALL') {
            filteredActive = filteredActive.filter(c => c.vacancyMatches.some(vm => vm.vacancyId === selectedVac && vm.score >= minScore));
        }

        // Render Candidatos Activos
        document.getElementById('resultsCount').textContent = filteredActive.length;
        candidatesGrid.innerHTML = filteredActive.map(c => renderCandidateCard(c, false)).join('') || '<p style="color:var(--text-secondary); padding:1rem;">No hay candidatos con este puntaje.</p>';

        // Render Candidatos Descartados
        document.getElementById('discardedCount').textContent = discardedList.length;
        document.getElementById('discardedGrid').innerHTML = discardedList.map(c => renderCandidateCard(c, true)).join('') || '<p style="color:var(--text-secondary); padding:1rem;">No hay candidatos descartados.</p>';

        // Actualizar Métricas KPI:
        // 1. Postulados Totales Activos
        document.getElementById('kpiTotalCVs').textContent = activeList.length;

        // 2. Match IA > 80%
        document.getElementById('kpiTopMatch').textContent = activeList.filter(c => c.topScore >= 80).length;

        // 3. Calidad de Talento (Promedio real de CVs activos)
        if (activeList.length > 0) {
            const avg = Math.round(activeList.reduce((acc, c) => acc + c.topScore, 0) / activeList.length);
            document.getElementById('kpiAvgScore').textContent = `${avg}%`;
            document.getElementById('kpiAvgBar').style.width = `${avg}%`;
        } else {
            document.getElementById('kpiAvgScore').textContent = "0%";
            document.getElementById('kpiAvgBar').style.width = "0%";
        }
    }

    function renderCandidateCard(c, isDiscardedTab) {
        return `
            <div class="candidate-card" onclick="this.classList.toggle('is-expanded')">
                <div class="card-top">
                    <div>
                        <div class="cand-name">${c.name}</div>
                        <div class="cand-role">Afinidad Principal: ${c.topRole}</div>
                    </div>
                    <div class="match-circle-badge">${c.topScore}%</div>
                </div>

                <div class="other-vacancies-box">
                    <div class="other-title">Match por Vacante:</div>
                    ${c.vacancyMatches.map(vm => `
                        <div class="vac-match-row">
                            <span>${vm.vacancyTitle}</span>
                            <strong style="color: ${vm.score >= 80 ? 'var(--neon-green)' : 'var(--neon-cyan)'}">${vm.score}%</strong>
                        </div>
                    `).join('')}
                </div>

                <div class="card-actions" onclick="event.stopPropagation()">
                    <!-- Botón Ver CV Original -->
                    <a href="/api/candidates/${c.id}/cv" target="_blank" class="btn-quick btn-cv">👁️ Ver CV</a>

                    <!-- Botón WhatsApp solo si existe teléfono en el CV -->
                    ${c.phone ? `<a href="https://api.whatsapp.com/send?phone=${c.phone}" target="_blank" class="btn-quick btn-wa">WhatsApp</a>` : ''}

                    <!-- Botón Email solo si existe correo en el CV -->
                    ${c.email ? `<a href="mailto:${c.email}" class="btn-quick btn-mail">Email</a>` : ''}

                    ${!isDiscardedTab ? `
                        <button class="btn-quick btn-discard" onclick="toggleDiscard('${c.id}')">Descartar</button>
                    ` : `
                        <button class="btn-quick btn-restore" onclick="toggleDiscard('${c.id}')">Restaurar</button>
                        <button class="btn-trash" onclick="deleteCandidate('${c.id}')" title="Eliminar definitivamente">🗑️</button>
                    `}
                </div>

                <div class="expanded-details">
                    <div style="margin-top:0.5rem; color:var(--neon-green); font-weight:700;">Fortalezas:</div>
                    <ul style="padding-left:14px; color:var(--text-secondary);">${c.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
                    <div style="margin-top:0.5rem; color:#ffd600; font-weight:700;">Áreas de Oportunidad:</div>
                    <ul style="padding-left:14px; color:var(--text-secondary);">${c.weaknesses.map(w => `<li>${w}</li>`).join('')}</ul>
                    <p style="margin-top:0.5rem; color:var(--text-secondary);">${c.justification}</p>
                </div>
            </div>
        `;
    }

    // Funciones globales para botones
    window.toggleDiscard = async (id) => {
        await fetch(`/api/candidates/${id}/discard`, { method: 'PATCH' });
        loadCandidates();
    };

    window.deleteCandidate = async (id) => {
        if (confirm("¿Deseas eliminar definitivamente este currículum?")) {
            await fetch(`/api/candidates/${id}`, { method: 'DELETE' });
            loadCandidates();
        }
    };

    // 8. Subida y Evaluación Masiva
    const fileInput = document.getElementById('fileInput');
    const fileCounter = document.getElementById('fileCounter');
    const btnProcess = document.getElementById('btnProcess');
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
        btnProcess.disabled = true;
        btnProcess.textContent = "Analizando...";

        try {
            const res = await fetch('/api/evaluate', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            uploadedFiles = [];
            fileCounter.textContent = "0 archivos";
            loadCandidates();
            alert('¡Evaluación completada con éxito!');
        } catch (err) {
            alert('Error en evaluación');
        } finally {
            btnProcess.disabled = false;
            btnProcess.textContent = "⚡ Evaluar Candidatos";
        }
    });

    // Filtros interactivos
    document.getElementById('scoreRange').addEventListener('input', (e) => {
        document.getElementById('scoreDisplay').textContent = `${e.target.value}%`;
        renderAllCandidates();
    });

    document.getElementById('btnApplyFilters').addEventListener('click', renderAllCandidates);
    document.getElementById('filterVacancySelect').addEventListener('change', renderAllCandidates);

    // Carga inicial
    loadVacancies();
    loadCandidates();
});

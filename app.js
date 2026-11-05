document.addEventListener('DOMContentLoaded', () => {
    // 0. Notificaciones Toast Flotantes (Reemplaza los molestos alert())
    function showToast(message) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    // 1. Selector de Tema Claro/Oscuro
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

    // 2. Navegación entre Pestañas Inmune a Bloqueos
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.tab);
            if (target) target.classList.add('active');
        });
    });

    // 3. Switcher de Vistas (Tarjetas vs Lista)
    const viewGridBtn = document.getElementById('viewGridBtn');
    const viewListBtn = document.getElementById('viewListBtn');
    const candidatesGrid = document.getElementById('candidatesGrid');

    viewGridBtn.addEventListener('click', () => {
        viewGridBtn.classList.add('active');
        viewListBtn.classList.remove('active');
        candidatesGrid.classList.remove('list-view');
    });

    viewListBtn.addEventListener('click', () => {
        viewListBtn.classList.add('active');
        viewGridBtn.classList.remove('active');
        candidatesGrid.classList.add('list-view');
    });

    // 4. Gestión de Vacantes y Métricas
    let globalVacancies = [];
    let selectedVacancyToCover = null;

    async function loadVacancies() {
        try {
            const res = await fetch('/api/vacancies');
            globalVacancies = await res.json();

            const activeVac = globalVacancies.filter(v => v.status === 'Activa');
            const coveredVac = globalVacancies.filter(v => v.status === 'Cubierta');

            // Render Vacantes Activas (Protegido contra comillas en títulos)
            const activeContainer = document.getElementById('activeVacanciesGrid');
            activeContainer.innerHTML = activeVac.map(v => {
                const daysOpen = Math.floor((Date.now() - new Date(v.publishedAt)) / (1000 * 60 * 60 * 24));
                return `
                    <div class="vacancy-card">
                        <div>
                            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.3rem;">
                                <span class="vac-badge active">Activa</span>
                                <span class="vac-days-pill">Lleva ${daysOpen} día(s) publicada</span>
                                <h3 style="font-size:1.05rem;">${escapeHtml(v.title)}</h3>
                            </div>
                            <p style="font-size:0.8rem; color:var(--text-secondary);">${escapeHtml(v.department)} • Sueldo: ${escapeHtml(v.salary)}</p>
                            <p style="font-size:0.8rem; margin-top:0.4rem;">${escapeHtml(v.description)}</p>
                        </div>
                        <div style="display:flex; gap:0.5rem;">
                            <button type="button" class="btn-secondary" onclick="openCoverModal('${v.id}')">Marcar Cubierta</button>
                            <button type="button" class="btn-trash" onclick="deleteVacancy('${v.id}')" title="Eliminar vacante">🗑️</button>
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
                                <h3 style="font-size:1.05rem;">${escapeHtml(v.title)}</h3>
                            </div>
                            <p style="font-size:0.8rem; color:var(--text-secondary);">Cubierta por: <strong style="color:var(--neon-green);">${escapeHtml(v.coveredBy || 'Sin asignar')}</strong></p>
                        </div>
                        <button type="button" class="btn-secondary" onclick="reactivateVacancy('${v.id}')">Reactivar Puesto</button>
                    </div>
                `;
            }).join('') || '<p style="color:var(--text-secondary); padding:1rem;">Aún no hay vacantes cubiertas registradas.</p>';

            // Select de Filtros
            const filterSelect = document.getElementById('filterVacancySelect');
            filterSelect.innerHTML = `<option value="ALL">Todas las vacantes activas</option>` +
                activeVac.map(v => `<option value="${v.id}">${escapeHtml(v.title)}</option>`).join('');

            // KPI Vacantes Activas
            document.getElementById('kpiActiveVacancies').textContent = activeVac.length;

            // KPI TIEMPO DE COBERTURA REAL
            if (coveredVac.length > 0) {
                const totalDays = coveredVac.reduce((acc, v) => {
                    const diff = Math.max(1, Math.floor((new Date(v.coveredAt) - new Date(v.publishedAt)) / (1000 * 60 * 60 * 24)));
                    return acc + diff;
                }, 0);
                const avg = Math.round(totalDays / coveredVac.length);
                document.getElementById('kpiAvgCoverageDays').textContent = `${avg} días`;
            } else {
                document.getElementById('kpiAvgCoverageDays').textContent = "0 días";
            }

        } catch (e) {
            console.error("Error al cargar vacantes:", e);
        }
    }

    // Modal Cubrir Vacante
    const coverModal = document.getElementById('coverModal');
    const coverCandidateSelect = document.getElementById('coverCandidateSelect');

    window.openCoverModal = (vacId) => {
        const vac = globalVacancies.find(v => v.id === vacId);
        if (!vac) return;
        selectedVacancyToCover = vacId;
        document.getElementById('coverModalVacTitle').textContent = `Puesto: ${vac.title}`;
        coverCandidateSelect.innerHTML = `<option value="">Cubierta sin candidato asignado</option>` +
            globalCandidates.filter(c => !c.discarded).map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
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
        await loadVacancies();
        renderAllCandidates();
        showToast("Vacante marcada como cubierta.");
    });

    window.reactivateVacancy = async (id) => {
        await fetch(`/api/vacancies/${id}/reactivate`, { method: 'PATCH' });
        await loadVacancies();
        renderAllCandidates();
        showToast("Vacante reactivada.");
    };

    window.deleteVacancy = async (id) => {
        if (confirm("¿Deseas eliminar esta vacante?")) {
            await fetch(`/api/vacancies/${id}`, { method: 'DELETE' });
            await loadVacancies();
            renderAllCandidates();
            showToast("Vacante eliminada.");
        }
    };

    // Publicación de Vacante sin trabas
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
        await loadVacancies();
        showToast("¡Vacante publicada con éxito! Puedes re-evaluar con el botón 🔄.");
    });

    // 5. Candidatos, Filtro Instantáneo y Render
    let globalCandidates = [];

    async function loadCandidates() {
        try {
            const res = await fetch('/api/candidates');
            globalCandidates = await res.json();
            renderAllCandidates();
        } catch (e) {
            console.error("Error al cargar candidatos:", e);
        }
    }

    function renderAllCandidates() {
        const selectedVac = document.getElementById('filterVacancySelect').value;
        const minScore = parseInt(document.getElementById('scoreRange').value, 10);
        const activeVacIds = new Set(globalVacancies.filter(v => v.status === 'Activa').map(v => v.id));

        const activeList = globalCandidates.filter(c => !c.discarded);
        const discardedList = globalCandidates.filter(c => c.discarded);

        let filteredActive = activeList.filter(c => c.topScore >= minScore);
        if (selectedVac !== 'ALL') {
            filteredActive = filteredActive.filter(c => c.vacancyMatches.some(vm => vm.vacancyId === selectedVac && vm.score >= minScore));
        }

        document.getElementById('resultsCount').textContent = filteredActive.length;
        candidatesGrid.innerHTML = filteredActive.map(c => renderCandidateCard(c, false, activeVacIds)).join('') || '<p style="color:var(--text-secondary); padding:1rem;">No hay candidatos con este score.</p>';

        document.getElementById('discardedCount').textContent = discardedList.length;
        document.getElementById('discardedGrid').innerHTML = discardedList.map(c => renderCandidateCard(c, true, activeVacIds)).join('') || '<p style="color:var(--text-secondary); padding:1rem;">No hay candidatos descartados.</p>';

        // KPIs
        document.getElementById('kpiTotalCVs').textContent = activeList.length;
        document.getElementById('kpiTopMatch').textContent = activeList.filter(c => c.topScore >= 80).length;

        if (activeList.length > 0) {
            const avg = Math.round(activeList.reduce((acc, c) => acc + c.topScore, 0) / activeList.length);
            document.getElementById('kpiAvgScore').textContent = `${avg}%`;
            document.getElementById('kpiAvgBar').style.width = `${avg}%`;
        } else {
            document.getElementById('kpiAvgScore').textContent = "0%";
            document.getElementById('kpiAvgBar').style.width = "0%";
        }
    }

    function renderCandidateCard(c, isDiscardedTab, activeVacIds) {
        const activeMatches = (c.vacancyMatches || []).filter(vm => activeVacIds.has(vm.vacancyId));

        return `
            <div class="candidate-card" onclick="this.classList.toggle('is-expanded')">
                <div class="card-top">
                    <div>
                        <div class="cand-name">${escapeHtml(c.name)}</div>
                        <div class="cand-role">Afinidad Principal: ${escapeHtml(c.topRole)}</div>
                    </div>
                    <div class="match-circle-badge">${c.topScore}%</div>
                </div>

                <div class="other-vacancies-box">
                    <div class="other-title">Match por Vacante Activa:</div>
                    ${activeMatches.length > 0 ? activeMatches.map(vm => `
                        <div class="vac-match-row">
                            <span>${escapeHtml(vm.vacancyTitle)}</span>
                            <strong style="color: ${vm.score >= 80 ? 'var(--neon-green)' : 'var(--neon-cyan)'}">${vm.score}%</strong>
                        </div>
                    `).join('') : '<span style="color:var(--text-secondary);">No hay vacantes activas afines</span>'}
                </div>

                <div class="card-actions" onclick="event.stopPropagation()">
                    <a href="/api/candidates/${c.id}/cv" target="_blank" class="btn-quick btn-cv">👁️ Ver CV</a>

                    ${c.phone ? `<a href="https://api.whatsapp.com/send?phone=${c.phone}" target="_blank" class="btn-quick btn-wa">WhatsApp</a>` : ''}
                    ${c.email ? `<a href="mailto:${c.email}" class="btn-quick btn-mail">Email</a>` : ''}

                    ${!isDiscardedTab ? `
                        <button type="button" class="btn-quick btn-discard" onclick="toggleDiscard('${c.id}')">Descartar</button>
                    ` : `
                        <button type="button" class="btn-quick btn-restore" onclick="toggleDiscard('${c.id}')">Restaurar</button>
                        <button type="button" class="btn-trash" onclick="deleteCandidate('${c.id}')" title="Eliminar definitivamente">🗑️</button>
                    `}
                </div>

                <div class="expanded-details">
                    <div style="margin-top:0.5rem; color:var(--neon-green); font-weight:700;">Fortalezas:</div>
                    <ul style="padding-left:14px; color:var(--text-secondary);">${(c.strengths || []).map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
                    <div style="margin-top:0.5rem; color:#ffd600; font-weight:700;">Áreas de Oportunidad:</div>
                    <ul style="padding-left:14px; color:var(--text-secondary);">${(c.weaknesses || []).map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
                    <p style="margin-top:0.5rem; color:var(--text-secondary);">${escapeHtml(c.justification || '')}</p>
                </div>
            </div>
        `;
    }

    window.toggleDiscard = async (id) => {
        await fetch(`/api/candidates/${id}/discard`, { method: 'PATCH' });
        loadCandidates();
    };

    window.deleteCandidate = async (id) => {
        if (confirm("¿Deseas eliminar definitivamente este currículum?")) {
            await fetch(`/api/candidates/${id}`, { method: 'DELETE' });
            loadCandidates();
            showToast("Currículum eliminado.");
        }
    };

    // 6. Subida Masiva (Compatible con Arrastrar y con Clic)
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileCounter = document.getElementById('fileCounter');
    const btnProcess = document.getElementById('btnProcess');
    let uploadedFiles = [];

    // Clic en la zona activa el selector
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            uploadedFiles = Array.from(e.target.files);
            fileCounter.textContent = `${uploadedFiles.length} archivo(s)`;
        }
    });

    // Controladores de arrastre que previenen apertura accidental en el navegador
    ['dragenter', 'dragover'].forEach(name => {
        dropZone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(name => {
        dropZone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            uploadedFiles = Array.from(e.dataTransfer.files);
            fileCounter.textContent = `${uploadedFiles.length} archivo(s)`;
        }
    });

    btnProcess.addEventListener('click', async () => {
        if (!uploadedFiles.length) {
            showToast("Por favor selecciona o arrastra al menos un CV.");
            return;
        }

        const formData = new FormData();
        uploadedFiles.forEach(f => formData.append('resumes', f));
        btnProcess.disabled = true;
        btnProcess.textContent = "Analizando con Gemini...";

        try {
            const res = await fetch('/api/evaluate', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            uploadedFiles = [];
            fileInput.value = "";
            fileCounter.textContent = "0 archivos";
            await loadCandidates();
            showToast("¡Análisis completado con éxito!");
        } catch (err) {
            showToast(`Error: ${err.message}`);
        } finally {
            btnProcess.disabled = false;
            btnProcess.textContent = "⚡ Analizar con IA";
        }
    });

    // 7. Botón Re-evaluar CVs con vacantes actuales (🔄)
    const btnRecalculate = document.getElementById('btnRecalculate');
    btnRecalculate.addEventListener('click', async () => {
        if (!globalCandidates.length) {
            showToast("No hay candidatos cargados para re-evaluar.");
            return;
        }
        btnRecalculate.disabled = true;
        btnRecalculate.textContent = "Re-evaluando...";

        try {
            const res = await fetch('/api/recalculate', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            await loadCandidates();
            showToast("¡Candidatos contrastados contra las vacantes actuales!");
        } catch (err) {
            showToast(`Error: ${err.message}`);
        } finally {
            btnRecalculate.disabled = false;
            btnRecalculate.textContent = "🔄 Actualizar";
        }
    });

    // 8. Filtros Reactivos Instantáneos
    const scoreRange = document.getElementById('scoreRange');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const filterVacancySelect = document.getElementById('filterVacancySelect');

    scoreRange.addEventListener('input', (e) => {
        scoreDisplay.textContent = `${e.target.value}%`;
        renderAllCandidates();
    });

    filterVacancySelect.addEventListener('change', renderAllCandidates);

    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    // Carga inicial
    loadVacancies();
    loadCandidates();
});

document.addEventListener('DOMContentLoaded', () => {
    function showToast(message) {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // 1. Selector de Tema
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        const themeIcon = themeToggleBtn.querySelector('.theme-icon');
        const savedTheme = localStorage.getItem('dc-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        if (themeIcon) themeIcon.textContent = savedTheme === 'dark' ? '🌙' : '☀️';

        themeToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            if (themeIcon) themeIcon.textContent = next === 'dark' ? '🌙' : '☀️';
            localStorage.setItem('dc-theme', next);
        });
    }

    // 2. Navegación por Pestañas
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-tab');
            if (!targetId) return;

            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetContent = document.getElementById(targetId);
            if (targetContent) targetContent.classList.add('active');
        });
    });

    // 3. Switcher de Vistas (Tarjetas vs Lista)
    const viewGridBtn = document.getElementById('viewGridBtn');
    const viewListBtn = document.getElementById('viewListBtn');
    const candidatesGrid = document.getElementById('candidatesGrid');

    if (viewGridBtn && viewListBtn && candidatesGrid) {
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
    }

    // 4. Vacantes
    let globalVacancies = [];
    let selectedVacancyToCover = null;

    async function loadVacancies() {
        try {
            const res = await fetch('/api/vacancies');
            if (!res.ok) return;
            globalVacancies = await res.json();

            const activeVac = globalVacancies.filter(v => v.status === 'Activa');
            const coveredVac = globalVacancies.filter(v => v.status === 'Cubierta');

            // Render Vacantes Activas
            const activeContainer = document.getElementById('activeVacanciesGrid');
            if (activeContainer) {
                activeContainer.innerHTML = activeVac.map(v => {
                    const daysOpen = Math.floor((Date.now() - new Date(v.publishedAt)) / (1000 * 60 * 60 * 24));
                    return `
                        <div class="vacancy-card">
                            <div>
                                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.3rem;">
                                    <span class="vac-badge active">Activa</span>
                                    <span class="vac-days-pill">Lleva ${daysOpen} día(s)</span>
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
            }

            // Render Vacantes Cubiertas
            const coveredContainer = document.getElementById('coveredVacanciesGrid');
            if (coveredContainer) {
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
            }

            // Select Filtros
            const filterSelect = document.getElementById('filterVacancySelect');
            if (filterSelect) {
                const currentVal = filterSelect.value;
                filterSelect.innerHTML = `<option value="ALL">Todas las vacantes activas</option>` +
                    activeVac.map(v => `<option value="${v.id}">${escapeHtml(v.title)}</option>`).join('');
                filterSelect.value = currentVal || "ALL";
            }

            // KPIs
            const kpiVac = document.getElementById('kpiActiveVacancies');
            if (kpiVac) kpiVac.textContent = activeVac.length;

            const kpiDays = document.getElementById('kpiAvgCoverageDays');
            if (kpiDays) {
                if (coveredVac.length > 0) {
                    const totalDays = coveredVac.reduce((acc, v) => {
                        const diff = Math.max(1, Math.floor((new Date(v.coveredAt) - new Date(v.publishedAt)) / (1000 * 60 * 60 * 24)));
                        return acc + diff;
                    }, 0);
                    kpiDays.textContent = `${Math.round(totalDays / coveredVac.length)} días`;
                } else {
                    kpiDays.textContent = "0 días";
                }
            }

        } catch (e) {
            console.error("Error vacantes:", e);
        }
    }

    // Modal Cubrir Vacante
    const coverModal = document.getElementById('coverModal');
    const coverCandidateSelect = document.getElementById('coverCandidateSelect');

    window.openCoverModal = (vacId) => {
        const vac = globalVacancies.find(v => v.id === vacId);
        if (!vac || !coverModal) return;
        selectedVacancyToCover = vacId;
        const titleEl = document.getElementById('coverModalVacTitle');
        if (titleEl) titleEl.textContent = `Puesto: ${vac.title}`;

        if (coverCandidateSelect) {
            coverCandidateSelect.innerHTML = `<option value="">Cubierta sin candidato asignado</option>` +
                globalCandidates.filter(c => !c.discarded).map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
        }
        coverModal.classList.add('active');
    };

    const btnCancelCover = document.getElementById('btnCancelCover');
    if (btnCancelCover) btnCancelCover.addEventListener('click', () => coverModal.classList.remove('active'));

    const btnConfirmCover = document.getElementById('btnConfirmCover');
    if (btnConfirmCover) {
        btnConfirmCover.addEventListener('click', async () => {
            if (!selectedVacancyToCover) return;
            const candidateName = coverCandidateSelect ? coverCandidateSelect.value : "";
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
    }

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

    const createVacancyForm = document.getElementById('createVacancyForm');
    if (createVacancyForm) {
        createVacancyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                title: document.getElementById('vacTitle').value,
                department: document.getElementById('vacDept').value,
                salary: document.getElementById('vacSalary').value,
                description: document.getElementById('vacDesc').value
            };
            const res = await fetch('/api/vacancies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                createVacancyForm.reset();
                await loadVacancies();
                showToast("¡Vacante publicada con éxito! Pulsa 🔄 para evaluar candidatos existentes.");
            }
        });
    }

    // 5. Candidatos y Ventana Flotante Modal
    let globalCandidates = [];

    async function loadCandidates() {
        try {
            const res = await fetch('/api/candidates');
            if (!res.ok) return;
            globalCandidates = await res.json();
            renderAllCandidates();
        } catch (e) {
            console.error("Error candidatos:", e);
        }
    }

    function renderAllCandidates() {
        const filterSelect = document.getElementById('filterVacancySelect');
        const scoreRange = document.getElementById('scoreRange');
        const selectedVac = filterSelect ? filterSelect.value : 'ALL';
        const minScore = scoreRange ? parseInt(scoreRange.value, 10) : 50;

        const activeVacIds = new Set(globalVacancies.filter(v => v.status === 'Activa').map(v => v.id));
        const activeList = globalCandidates.filter(c => !c.discarded);
        const discardedList = globalCandidates.filter(c => c.discarded);

        // Filtrado por score
        let filteredActive = activeList.filter(c => (c.topScore || 0) >= minScore);
        if (selectedVac !== 'ALL') {
            filteredActive = filteredActive.filter(c => (c.vacancyMatches || []).some(vm => vm.vacancyId === selectedVac && vm.score >= minScore));
        }

        const countEl = document.getElementById('resultsCount');
        if (countEl) countEl.textContent = filteredActive.length;

        if (candidatesGrid) {
            candidatesGrid.innerHTML = filteredActive.map(c => renderCandidateCard(c, false, activeVacIds)).join('') || '<p style="color:var(--text-secondary); padding:1rem;">No hay candidatos con este porcentaje (intenta bajar el slider).</p>';
        }

        const discCountEl = document.getElementById('discardedCount');
        if (discCountEl) discCountEl.textContent = discardedList.length;

        const discGrid = document.getElementById('discardedGrid');
        if (discGrid) {
            discGrid.innerHTML = discardedList.map(c => renderCandidateCard(c, true, activeVacIds)).join('') || '<p style="color:var(--text-secondary); padding:1rem;">No hay candidatos descartados.</p>';
        }

        // KPIs
        const totalEl = document.getElementById('kpiTotalCVs');
        if (totalEl) totalEl.textContent = activeList.length;

        const topEl = document.getElementById('kpiTopMatch');
        if (topEl) topEl.textContent = activeList.filter(c => (c.topScore || 0) >= 80).length;

        const avgEl = document.getElementById('kpiAvgScore');
        const avgBar = document.getElementById('kpiAvgBar');
        if (activeList.length > 0) {
            const avg = Math.round(activeList.reduce((acc, c) => acc + (c.topScore || 0), 0) / activeList.length);
            if (avgEl) avgEl.textContent = `${avg}%`;
            if (avgBar) avgBar.style.width = `${avg}%`;
        } else {
            if (avgEl) avgEl.textContent = "0%";
            if (avgBar) avgBar.style.width = "0%";
        }
    }

    function renderCandidateCard(c, isDiscardedTab, activeVacIds) {
        const activeMatches = (c.vacancyMatches || []).filter(vm => activeVacIds.has(vm.vacancyId));

        return `
            <div class="candidate-card" onclick="openCandidateDetailModal('${c.id}')" title="Clic para ver perfil completo en ventana flotante">
                <div class="card-top">
                    <div>
                        <div class="cand-name">${escapeHtml(c.name)}</div>
                        <div class="cand-role">Afinidad Principal: ${escapeHtml(c.topRole || 'General')}</div>
                    </div>
                    <div class="match-circle-badge">${c.topScore || 0}%</div>
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
            </div>
        `;
    }

    // --- VENTANA FLOTANTE (MODAL DEL CANDIDATO CON RESUMEN IA) ---
    const candidateDetailModal = document.getElementById('candidateDetailModal');
    const btnCloseCandModal = document.getElementById('btnCloseCandModal');

    window.openCandidateDetailModal = (candId) => {
        const c = globalCandidates.find(item => item.id === candId);
        if (!c || !candidateDetailModal) return;

        const activeVacIds = new Set(globalVacancies.filter(v => v.status === 'Activa').map(v => v.id));
        const activeMatches = (c.vacancyMatches || []).filter(vm => activeVacIds.has(vm.vacancyId));

        document.getElementById('modalCandName').textContent = c.name;
        document.getElementById('modalCandRole').textContent = `Afinidad Principal: ${c.topRole || 'General'}`;
        document.getElementById('modalCandScore').textContent = `${c.topScore || 0}%`;

        // Resumen generado con IA
        const summaryText = c.justification || `Candidato con ${c.topScore}% de compatibilidad detectado por la IA de DC Mayorista. Presenta competencias clave para las vacantes activas del canal.`;
        document.getElementById('modalCandSummary').textContent = summaryText;

        // Desglose de Vacantes
        const vacContainer = document.getElementById('modalCandVacancies');
        vacContainer.innerHTML = activeMatches.map(vm => `
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; padding:0.3rem 0; border-bottom:1px solid rgba(255,255,255,0.04);">
                <span>${escapeHtml(vm.vacancyTitle)}</span>
                <strong style="color:${vm.score >= 80 ? 'var(--neon-green)' : 'var(--neon-cyan)'}">${vm.score}%</strong>
            </div>
        `).join('') || '<span style="color:var(--text-secondary); font-size:0.85rem;">Sin vacantes activas vinculadas.</span>';

        // Fortalezas
        const strList = document.getElementById('modalCandStrengths');
        strList.innerHTML = (c.strengths || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');

        // Debilidades
        const wList = document.getElementById('modalCandWeaknesses');
        wList.innerHTML = (c.weaknesses || []).map(w => `<li>${escapeHtml(w)}</li>`).join('');

        // Botones de Acción en el Modal
        const actBar = document.getElementById('modalCandActions');
        actBar.innerHTML = `
            <a href="/api/candidates/${c.id}/cv" target="_blank" class="btn-action-primary" style="width:auto; padding:0.6rem 1.2rem; text-decoration:none;">👁️ Ver CV Original</a>
            ${c.phone ? `<a href="https://api.whatsapp.com/send?phone=${c.phone}" target="_blank" class="btn-quick btn-wa" style="font-size:0.85rem; padding:0.6rem 1.2rem;">WhatsApp</a>` : ''}
            ${c.email ? `<a href="mailto:${c.email}" class="btn-quick btn-mail" style="font-size:0.85rem; padding:0.6rem 1.2rem;">Email</a>` : ''}
        `;

        candidateDetailModal.classList.add('active');
    };

    if (btnCloseCandModal) {
        btnCloseCandModal.addEventListener('click', () => candidateDetailModal.classList.remove('active'));
    }

    // Cerrar modal al hacer clic en el fondo oscuro
    if (candidateDetailModal) {
        candidateDetailModal.addEventListener('click', (e) => {
            if (e.target === candidateDetailModal) candidateDetailModal.classList.remove('active');
        });
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

    // 6. Subida y Análisis con IA
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileCounter = document.getElementById('fileCounter');
    const btnProcess = document.getElementById('btnProcess');
    let uploadedFiles = [];

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                uploadedFiles = Array.from(e.target.files);
                if (fileCounter) fileCounter.textContent = `${uploadedFiles.length} archivo(s)`;
            }
        });

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
                if (fileCounter) fileCounter.textContent = `${uploadedFiles.length} archivo(s)`;
            }
        });
    }

    if (btnProcess) {
        btnProcess.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!uploadedFiles.length) {
                showToast("Por favor selecciona o arrastra al menos un CV.");
                return;
            }

            const formData = new FormData();
            uploadedFiles.forEach(f => formData.append('resumes', f));
            btnProcess.disabled = true;
            btnProcess.textContent = "Analizando con IA...";

            try {
                const res = await fetch('/api/evaluate', { method: 'POST', body: formData });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Falla al procesar.");

                uploadedFiles = [];
                if (fileInput) fileInput.value = "";
                if (fileCounter) fileCounter.textContent = "0 archivos";
                await loadCandidates();
                showToast("¡Análisis completado exitosamente!");
            } catch (err) {
                showToast(`Aviso: ${err.message}`);
            } finally {
                btnProcess.disabled = false;
                btnProcess.textContent = "⚡ Analizar con IA";
            }
        });
    }

    // 7. Botón Re-evaluación (🔄)
    const btnRecalculate = document.getElementById('btnRecalculate');
    if (btnRecalculate) {
        btnRecalculate.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!globalCandidates.length) {
                showToast("No hay candidatos cargados para re-evaluar.");
                return;
            }
            btnRecalculate.disabled = true;
            btnRecalculate.textContent = "Re-evaluando...";

            try {
                const res = await fetch('/api/recalculate', { method: 'POST' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Falla al re-evaluar.");
                await loadCandidates();
                showToast("¡Candidatos contrastados contra las vacantes actuales!");
            } catch (err) {
                showToast(`Aviso: ${err.message}`);
            } finally {
                btnRecalculate.disabled = false;
                btnRecalculate.textContent = "🔄 Actualizar";
            }
        });
    }

    // 8. Filtros Reactivos
    const scoreRange = document.getElementById('scoreRange');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const filterVacancySelect = document.getElementById('filterVacancySelect');

    if (scoreRange) {
        scoreRange.addEventListener('input', (e) => {
            if (scoreDisplay) scoreDisplay.textContent = `${e.target.value}%`;
            renderAllCandidates();
        });
    }

    if (filterVacancySelect) {
        filterVacancySelect.addEventListener('change', renderAllCandidates);
    }

    function escapeHtml(text) {
        if (!text) return '';
        return String(text).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    loadVacancies();
    loadCandidates();
});

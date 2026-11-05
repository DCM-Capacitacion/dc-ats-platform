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
            
            if (!res.ok) {
                throw new Error(data.error || "Error al procesar con IA");
            }

            uploadedFiles = [];
            fileInput.value = "";
            fileCounter.textContent = "0 archivos";
            await loadCandidates();
            showToast("¡Análisis de IA completado con éxito!");
        } catch (err) {
            console.error("Error detallado:", err);
            alert(`Aviso de IA:\n${err.message}`);
        } finally {
            btnProcess.disabled = false;
            btnProcess.textContent = "⚡ Analizar con IA";
        }
    });

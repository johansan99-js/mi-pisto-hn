// Mi Pisto HN · 03-ocr-y-sms.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== FUNCIÓN OCR MEJORADA (PRICESMART, NECHOS, LITTLE CAESARS) ==========
// ========== FUNCIÓN OCR MEJORADA (DETECCIÓN AVANZADA DE COMERCIOS HONDUREÑOS) ==========
// FIX: tesseract.js (la librería que expone window.Tesseract) nunca se
// cargaba con ningún <script> — se había quitado del <head> para no
// pesar el arranque, pero nunca se agregó la carga bajo demanda que el
// comentario original prometía. Antes, procesarReciboOCR() SIEMPRE
// fallaba con "Tesseract no está cargado", incluso recargando la página.
let _tesseractLibPromise = null;
function _cargarTesseractLib() {
    if (typeof Tesseract !== 'undefined') return Promise.resolve();
    if (_tesseractLibPromise) return _tesseractLibPromise;
    _tesseractLibPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4.0.2/dist/tesseract.min.js';
        script.integrity = 'sha384-p0lyrUSwAXKW8+KUuu0G96F+bX2fnB1MGFTx5X/Y/99IjrwU1BnTzW+H71bs1Vrn';
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve();
        script.onerror = () => { _tesseractLibPromise = null; reject(new Error('No se pudo cargar el motor OCR (revisa tu conexión).')); };
        document.head.appendChild(script);
    });
    return _tesseractLibPromise;
}

// FIX: la cámara de un celular normal produce fotos de varios MB en
// resolución completa; pasarlas tal cual a Tesseract (WASM) puede
// agotar la memoria en equipos gama media/baja. Se reescala a un
// máximo razonable para OCR antes de procesar (y antes de guardar la
// factura), sin perder legibilidad del texto.
async function _comprimirImagenParaOCR(file, maxDim = 1800, calidad = 0.85) {
    try {
        const bitmap = await createImageBitmap(file);
        let { width, height } = bitmap;
        if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);
        if (typeof bitmap.close === 'function') bitmap.close();
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', calidad));
        return blob || file; // si toBlob falla, usar el original
    } catch (e) {
        console.warn('⚠️ No se pudo comprimir la imagen, usando original:', e);
        return file; // degradar sin bloquear el OCR
    }
}

async function procesarReciboOCR(event) {
    const fileOriginal = event.target.files[0];
    if (!fileOriginal) return;
    const statusEl = document.getElementById('ocr-status');
    const montoInput = document.getElementById('gasto-monto');
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--amber)';
    const updateStatus = (msg, isError = false) => { statusEl.textContent = msg; if (isError) statusEl.style.color = 'var(--red)'; };

    try {
        updateStatus('🗜️ Optimizando imagen...');
        const file = await _comprimirImagenParaOCR(fileOriginal);
        updateStatus('📥 Cargando motor OCR...');
        await _cargarTesseractLib();
        if (typeof Tesseract === 'undefined') throw new Error('Tesseract no está cargado. Recarga la página.');
        const workerOptions = {
            logger: m => {
                console.log('Tesseract:', m);
                if (m.status === 'loading language traineddata') { updateStatus('📥 Descargando idioma español (30MB - solo primera vez)...'); statusEl.style.color = 'var(--blue)'; }
                else if (m.status === 'initializing api') { updateStatus('⚙️ Inicializando reconocimiento...'); }
                else if (m.status === 'recognizing text') { const progress = m.progress ? Math.round(m.progress * 100) : 0; updateStatus(`🔍 Analizando imagen... ${progress}%`); }
            },
            workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/worker.min.js',
            langPath: 'https://tessdata.projectnaptha.com/4.0.0',
            corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core.wasm.js'
        };
        updateStatus('🚀 Iniciando motor OCR...');
        const worker = await Tesseract.createWorker(workerOptions);
        updateStatus('🌐 Cargando idioma español...');
        await worker.loadLanguage('spa');
        await worker.initialize('spa');
        updateStatus('📸 Procesando imagen...');
        const imageUrl = URL.createObjectURL(file);
        const { data: { text } } = await worker.recognize(imageUrl);
        // P0-2: Guardar imagen en IndexedDB (no localStorage) para evitar QuotaExceededError
        await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async function(e) {
                _tempFacturaId = await _guardarTempFactura(e.target.result);
                window._tempFacturaDataURL = e.target.result; // solo para preview en modal
                resolve();
            };
            reader.onerror = () => resolve();
            reader.readAsDataURL(file);
        });
        URL.revokeObjectURL(imageUrl);
        
        console.log('✅ Texto completo detectado:', text);
        
        // ========== NUEVA LÓGICA DE EXTRACCIÓN DE MONTO (MÁS ROBUSTA) ==========
        const lineas = text.split('\n');
        let mayorMonto = 0;
        
        // 1. Patrones Específicos por Tipo de Comercio
        const patronesEspecificos = [
            // Little Caesars / Restaurantes
            /PICK-?UP\s+TO\s+L\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i, /PICK-?UP\s+TOP\s+L\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i, /PICK\s*UP\s*:?\s*L\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i, /SON\s*:?\s*[A-Z\s]*L\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i,
            // Generales
            /TOTAL\s+L\.?\s*:?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i, /TOTAL\s+A\s+PAGAR\s*[:\s]*L?\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i, /IMPORTE\s+TOTAL\s*[:\s]*L?\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i, /A\s+PAGAR\s*[:\s]*L?\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i
        ];
        for (const patron of patronesEspecificos) {
            const matches = text.matchAll(new RegExp(patron.source, 'gi'));
            for (const match of matches) {
                const valorStr = match[1] || match[0];
                const valor = parseFloat(valorStr.replace(/,/g, ''));
                if (!isNaN(valor) && valor > 0 && valor < 1000000) { if (valor > mayorMonto) mayorMonto = valor; }
            }
        }

        // 2. Búsqueda línea por línea para casos donde el monto está en la línea siguiente
        if (mayorMonto === 0) {
            for (let i = 0; i < lineas.length; i++) {
                const linea = lineas[i].trim();
                if (linea.match(/TOTAL|IMPORTE|A\s+PAGAR|PICK-?UP|PICKUP/i)) {
                    const matchMismaLinea = linea.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/);
                    if (matchMismaLinea) { const valor = parseFloat(matchMismaLinea[1].replace(/,/g, '')); if (valor > mayorMonto) mayorMonto = valor; }
                    if (i + 1 < lineas.length) {
                        const siguienteLinea = lineas[i + 1].trim();
                        const matchSiguienteLinea = siguienteLinea.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/);
                        if (matchSiguienteLinea) { const valor = parseFloat(matchSiguienteLinea[1].replace(/,/g, '')); if (valor > mayorMonto) mayorMonto = valor; }
                    }
                }
            }
        }

        // 3. Respaldo: el número más grande con formato de moneda
        if (mayorMonto === 0) {
            const todosLosNumeros = text.match(/\d{1,3}(?:,\d{3})*(?:\.\d{2})/g) || [];
            const numeros = todosLosNumeros.map(n => parseFloat(n.replace(/,/g, ''))).filter(n => n > 10 && n < 1000000);
            if (numeros.length > 0) {
                numeros.sort((a, b) => b - a);
                mayorMonto = numeros[0];
                console.log('💰 Usando el número más grande como respaldo:', mayorMonto);
            }
        }
        
        await worker.terminate();

        if (mayorMonto > 0) {
            montoInput.value = mayorMonto.toFixed(2);
            updateStatus(`✅ Total detectado: L. ${mayorMonto.toFixed(2)}`);
            statusEl.style.color = 'var(--green)';
            
            // ========== BASE DE DATOS LOCAL DE COMERCIOS (DETECCIÓN AVANZADA) ==========
            const textLower = text.toLowerCase();
            let categoriaAsignada = '';
            let subcatAsignada = '';
            let tipoAsignado = 'fijo'; // Por defecto es fijo
            
            // Función auxiliar para verificar si una frase está presente
            const contiene = (frase) => textLower.includes(frase);

            // SUPERMERCADOS
            if (contiene('pricesmart')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'PriceSmart'; }
            else if (contiene('los andes')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Los Andes'; }
            else if (contiene('la colonia')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'La Colonia'; }
            else if (contiene('colonial')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Colonial'; }
            else if (contiene('maxi despensa')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Maxi Despensa'; }
            else if (contiene('el faro')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'El Faro'; }
            else if (contiene('walmart')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Walmart'; }
            else if (contiene('paiz')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Paiz'; }
            else if (contiene('despensa familiar')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Despensa Familiar'; }
            else if (contiene('supermercado')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Supermercado'; }

            // RESTAURANTES Y COMIDA RÁPIDA
            else if (contiene('little caesars') || contiene('little') && contiene('caesars') || contiene('intur')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Little Caesars'; tipoAsignado = 'extra'; }
            else if (contiene('pizza hut')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Pizza Hut'; tipoAsignado = 'extra'; }
            else if (contiene('domino\'s pizza') || contiene('dominos')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Domino\'s Pizza'; tipoAsignado = 'extra'; }
            else if (contiene('mcdonald\'s') || contiene('mcdonalds')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'McDonald\'s'; tipoAsignado = 'extra'; }
            else if (contiene('burger king')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Burger King'; tipoAsignado = 'extra'; }
            else if (contiene('wendy\'s') || contiene('wendys')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Wendy\'s'; tipoAsignado = 'extra'; }
            else if (contiene('kfc')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'KFC'; tipoAsignado = 'extra'; }
            else if (contiene('popeyes')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Popeyes'; tipoAsignado = 'extra'; }
            else if (contiene('church\'s chicken') || contiene('churchs')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Church\'s Chicken'; tipoAsignado = 'extra'; }
            else if (contiene('dunkin')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Dunkin\''; tipoAsignado = 'extra'; }
            else if (contiene('starbucks')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Starbucks'; tipoAsignado = 'extra'; }
            else if (contiene('espresso americano')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Espresso Americano'; tipoAsignado = 'extra'; }
            else if (contiene('restaurante') || contiene('comida')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Restaurante'; tipoAsignado = 'extra'; }

            // GASOLINERAS
            else if (contiene('shell')) { categoriaAsignada = 'Transporte'; subcatAsignada = 'Shell'; }
            else if (contiene('texaco')) { categoriaAsignada = 'Transporte'; subcatAsignada = 'Texaco'; }
            else if (contiene('puma')) { categoriaAsignada = 'Transporte'; subcatAsignada = 'Puma'; }
            else if (contiene('uno')) { categoriaAsignada = 'Transporte'; subcatAsignada = 'Uno'; }
            else if (contiene('gasolinera')) { categoriaAsignada = 'Transporte'; subcatAsignada = 'Combustible'; }

            // FARMACIAS
            else if (contiene('farmacia')) { categoriaAsignada = 'Salud'; subcatAsignada = 'Farmacia'; }
            else if (contiene('siman')) { categoriaAsignada = 'Salud'; subcatAsignada = 'Farmacia Simán'; }
            else if (contiene('cruz verde')) { categoriaAsignada = 'Salud'; subcatAsignada = 'Farmacia Cruz Verde'; }
            else if (contiene('farmavalue')) { categoriaAsignada = 'Salud'; subcatAsignada = 'Farmavalue'; }
            else if (contiene('ahorro farmacia')) { categoriaAsignada = 'Salud'; subcatAsignada = 'Farmacia El Ahorro'; }

            // TIENDAS DE CONVENIENCIA
            else if (contiene('circle k')) { categoriaAsignada = 'Ocio'; subcatAsignada = 'Circle K'; tipoAsignado = 'extra'; }
            else if (contiene('pronto')) { categoriaAsignada = 'Ocio'; subcatAsignada = 'Pronto'; tipoAsignado = 'extra'; }

            // MANTENIMIENTO Y REPUESTOS
            else if (contiene('nechos') || contiene('lubricantes')) { categoriaAsignada = 'Mantenimiento'; subcatAsignada = 'NECHOS LUBRICANTES'; }
            else if (contiene('repuestos') || contiene('auto')) { categoriaAsignada = 'Mantenimiento'; subcatAsignada = 'Repuestos'; }

            // TIENDAS POR DEPARTAMENTO / ROPA
            else if (contiene('lady lee')) { categoriaAsignada = 'Ropa'; subcatAsignada = 'Lady Lee'; tipoAsignado = 'extra'; }
            else if (contiene('carrion')) { categoriaAsignada = 'Ropa'; subcatAsignada = 'Carrión'; tipoAsignado = 'extra'; }
            else if (contiene('liverpool')) { categoriaAsignada = 'Ropa'; subcatAsignada = 'Liverpool'; tipoAsignado = 'extra'; }
            else if (contiene('zara')) { categoriaAsignada = 'Ropa'; subcatAsignada = 'Zara'; tipoAsignado = 'extra'; }

            // TECNOLOGÍA
            else if (contiene('radio shack')) { categoriaAsignada = 'Tecnología'; subcatAsignada = 'RadioShack'; tipoAsignado = 'extra'; }
            else if (contiene('la curacao')) { categoriaAsignada = 'Tecnología'; subcatAsignada = 'La Curacao'; tipoAsignado = 'extra'; }
            else if (contiene('elektra')) { categoriaAsignada = 'Tecnología'; subcatAsignada = 'Elektra'; tipoAsignado = 'extra'; }
            else if (contiene('jetstereo')) { categoriaAsignada = 'Tecnología'; subcatAsignada = 'Jetstereo'; tipoAsignado = 'extra'; }

            // OTROS
            else if (contiene('cinemark') || contiene('cine')) { categoriaAsignada = 'Ocio'; subcatAsignada = 'Cinemark'; tipoAsignado = 'extra'; }
            else if (contiene('gimnasio') || contiene('gym')) { categoriaAsignada = 'Salud'; subcatAsignada = 'Gimnasio'; tipoAsignado = 'extra'; }

            // Asignar los valores si se detectó algo
            if (categoriaAsignada) {
                document.getElementById('gasto-cat').value = categoriaAsignada;
                document.getElementById('gasto-subcat').value = subcatAsignada;
                document.getElementById('gasto-tipo').value = tipoAsignado;
                updateStatus(`✅ Total: L. ${mayorMonto.toFixed(2)} - ${subcatAsignada} detectado`);
            } else {
                updateStatus(`✅ Total: L. ${mayorMonto.toFixed(2)} - Comercio no reconocido. Puedes llenarlo manualmente.`);
            }
            
            window.tempFacturaImagen = true;
            // Mostrar preview de la factura escaneada en el modal
            let previewEl = document.getElementById('ocr-preview');
            if (!previewEl) {
                previewEl = document.createElement('div');
                previewEl.id = 'ocr-preview';
                previewEl.style.cssText = 'margin-top:10px;border-radius:8px;overflow:hidden;max-height:140px;border:2px solid var(--amber);position:relative';
                previewEl.innerHTML = `<img id="ocr-preview-img" src="" style="width:100%;max-height:140px;object-fit:cover;display:block">
                  <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:var(--amber);font-size:10px;padding:4px 8px;font-weight:700">🧾 Factura adjunta — se guardará con el gasto</div>`;
                document.getElementById('ocr-status').after(previewEl);
            }
            document.getElementById('ocr-preview-img').src = window._tempFacturaDataURL || '';
            previewEl.style.display = 'block';
            setTimeout(() => statusEl.style.display = 'none', 7000);
            
        } else {
            updateStatus('⚠️ No se detectó ningún monto. Por favor ingresa manualmente.', true);
        }
    } catch (error) {
        console.error('❌ Error OCR:', error);
        updateStatus('❌ Error al procesar la imagen. Intenta de nuevo.', true);
    } finally {
        event.target.value = '';
    }
}
// ========== FUNCIONES DE DIAGNÓSTICO OCR ==========
async function testOCR() {
    const resultEl = document.getElementById('ocr-test-result');
    if (!resultEl) return;
    resultEl.innerHTML = '🔄 Probando OCR...';
    resultEl.style.color = 'var(--amber)';
    try {
        if (typeof Tesseract === 'undefined') throw new Error('Tesseract no esta cargado');
        resultEl.innerHTML = '✅ Tesseract cargado<br>📦 Version: ' + (Tesseract.version || 'OK') + '<br>✅ OCR listo para usar';
        resultEl.style.color = 'var(--green)';
    } catch (error) {
        resultEl.innerHTML = '❌ Error: ' + error.message + '<br>💡 Recarga la pagina';
        resultEl.style.color = 'var(--red)';
    }
}
function clearOCRCache() {
    try {
        const keys = Object.keys(localStorage);
        let removed = 0;
        keys.forEach(key => {
            if (key.includes('tesseract') || key.includes('ocr') || key.includes('temp_factura')) {
                localStorage.removeItem(key);
                removed++;
            }
        });
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => {
                    if (name.includes('tesseract') || name.includes('ocr')) caches.delete(name);
                });
            });
        }
        const resultEl = document.getElementById('ocr-test-result');
        if (resultEl) {
            resultEl.innerHTML = '✅ Cache OCR limpiado (' + removed + ' elementos)<br>💡 Recarga la pagina';
            resultEl.style.color = 'var(--green)';
        } else {
            alert('✅ Cache OCR limpiado: ' + removed + ' elementos');
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}
  
// ========== FUNCIONES DE SUPERVIVENCIA Y GRÁFICO ==========
function updateSurvivalIndex(balance) {
    const fijosMensual = state.transactions.filter(t => t.type === 'expense' && t.tipo === 'fijo' && !t.deletedAt).reduce((a, b) => a + b.amount, 0);

    const el  = document.getElementById('survival-val');
    const box = document.querySelector('.survival-box');
    const statusEl = document.getElementById('survival-status');

    // Sin gastos fijos registrados aún: no hay base para estimar días de supervivencia
    if (fijosMensual <= 0) {
        if (el) { el.textContent = '—'; el.style.color = 'var(--text2)'; }
        if (box) { box.classList.remove('state-danger','state-warning','state-safe'); }
        if (statusEl) { statusEl.className = 'survival-status'; statusEl.textContent = 'Registra tus gastos fijos para calcular esto'; }
        return;
    }

    const gastoDiario = fijosMensual / 30;
    const dias = Math.max(0, Math.floor(balance / gastoDiario));

    // Umbrales: < 30 rojo | 30–90 amarillo | > 90 verde
    let state_class, statusClass, statusText, numColor;
    if (dias < 30) {
        state_class = 'state-danger';  statusClass = 'danger';
        statusText  = '🔴 Riesgo alto — menos de 30 días';
        numColor    = 'var(--red)';
    } else if (dias <= 90) {
        state_class = 'state-warning'; statusClass = 'warning';
        statusText  = '🟡 Precaución — entre 30 y 90 días';
        numColor    = 'var(--amber)';
    } else {
        state_class = 'state-safe';    statusClass = 'safe';
        statusText  = '🟢 Seguro — más de 90 días';
        numColor    = 'var(--green)';
    }

    if (el) { el.textContent = document.body.classList.contains('modo-discreto') ? '••' : dias.toLocaleString('es-HN'); el.style.color = numColor; }
    if (box) { box.classList.remove('state-danger','state-warning','state-safe'); box.classList.add(state_class); }
    if (statusEl) { statusEl.className = `survival-status ${statusClass}`; statusEl.textContent = statusText; }
}

function renderDoughnutChart() {
    const canvas = document.getElementById('mainChart');
    if(!canvas) return;
    
    // FIX: Proteger contra "Chart is not defined" si Chart.js no carga
    if (typeof Chart === 'undefined') {
        console.warn('⚠️ Chart.js no cargado - omitiendo gráfico (la app sigue funcionando)');
        // Mostrar mensaje amigable en lugar del gráfico
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = colorTema('text2', '#C09090');
            ctx.font = '12px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('📊 Gráfico no disponible', canvas.width/2, canvas.height/2 - 8);
            ctx.fillText('(verifica conexión)', canvas.width/2, canvas.height/2 + 12);
        }
        return;
    }
    
    const ctx = canvas.getContext('2d');
    // P0-2: excluir transferencias internas, conciliaciones y soft-deleted del gráfico de gastos
    const realExpenses = state.transactions.filter(t => t.type === 'expense' && !t.deletedAt && !t.esTransferencia && !t.esConciliacion);
    const fijos = realExpenses.filter(t => t.tipo === 'fijo').reduce((a, b) => a + b.amount, 0);
    const extras = realExpenses.filter(t => t.tipo === 'extra').reduce((a, b) => a + b.amount, 0);

    const hasData = fijos > 0 || extras > 0;

    if(mainChart) mainChart.destroy();
    
    try {
        mainChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: hasData ? ['Vital/Fijo', 'Ocio/Extra'] : ['Sin datos'],
                datasets: [{ 
                    data: hasData ? [fijos, extras] : [1], 
                    backgroundColor: hasData ? [colorTema('amber', '#F5C800'), colorTema('red', '#FF4444')] : [colorTema('bg4', '#3A1418')], 
                    borderWidth: 0 
                }]
            },
            options: { cutout: '70%', plugins: { legend: { position: 'bottom', labels: {color: colorTema('text2', '#9b9eb5')} }, tooltip: { enabled: hasData } } }
        });
    } catch (e) {
        console.error('❌ Error creando gráfico:', e);
    }
}

// ═══ LEER SMS O NOTIFICACIONES DEL BANCO ══════════════════════════════════
// Los formatos cambian por banco, así que se buscan piezas sueltas (monto con
// moneda, "en COMERCIO", últimos 4 dígitos) en vez de una plantilla fija. El
// texto se corta a 1000 caracteres y los patrones son acotados (sin ReDoS).
const BANCOS_SMS = [['BAC', /\bBAC\b|credomatic/i], ['Ficohsa', /ficohsa/i], ['Atlántida', /atl[aá]ntida/i],
  ['Banpaís', /banpa[ií]s/i], ['Occidente', /occidente/i], ['Banrural', /banrural/i], ['Davivienda', /davivienda/i],
  ['Lafise', /lafise/i], ['Promerica', /promerica/i], ['Cuscatlán', /cuscatl[aá]n/i]];
const COMERCIOS_SMS = [
  [/pricesmart/i, 'Alimentación', 'PriceSmart', 'fijo'], [/los andes/i, 'Alimentación', 'Los Andes', 'fijo'],
  [/la colonia/i, 'Alimentación', 'La Colonia', 'fijo'], [/colonial/i, 'Alimentación', 'Colonial', 'fijo'],
  [/maxi ?despensa/i, 'Alimentación', 'Maxi Despensa', 'fijo'], [/walmart/i, 'Alimentación', 'Walmart', 'fijo'],
  [/paiz/i, 'Alimentación', 'Paiz', 'fijo'], [/despensa familiar/i, 'Alimentación', 'Despensa Familiar', 'fijo'],
  [/super(mercado)?\b/i, 'Alimentación', null, 'fijo'],
  [/uber ?eats|pedidos ?ya|\bhugo\b/i, 'Alimentación', 'Delivery', 'extra'],
  [/pizza|little caesars|domino|mcdonald|burger king|wendy|kfc|popeyes|church|starbucks|espresso americano|dunkin|restaurante/i, 'Alimentación', null, 'extra'],
  [/\buber\b|indrive|\btaxi\b/i, 'Transporte', 'Taxi', 'extra'],
  [/shell|texaco|\bpuma\b|\buno\b|gasolin/i, 'Transporte', 'Combustible', 'fijo'],
  [/farmacia|farmavalue|kielsa/i, 'Salud', 'Farmacia', 'fijo'],
  [/netflix|spotify|disney|hbo|prime video|youtube/i, 'Ocio', 'Streaming', 'extra'],
  [/\bclaro\b|\btigo\b/i, 'Vivienda', 'Teléfono', 'fijo'], [/\benee\b|energ[ií]a/i, 'Vivienda', 'Electricidad', 'fijo'],
  [/amazon|temu|shein|aliexpress/i, 'Compras', null, 'extra'],
];
const _sinAcentos = x => String(x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function interpretarMensajeBanco(texto) {
  const t = String(texto || '').slice(0, 1000).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  // Promociones y avisos de marketing traen montos pero no son movimientos
  if (/\b(aprovecha|participa|gana|promoci[oó]n|oferta|descuento|cashback|pre-?aprobad|te regalamos)\b/i.test(t) &&
      !/\b(compra|consumo|transacci[oó]n|cargo|retiro)\b.{0,40}\b(aprobad|realizad|por)\b/i.test(t)) return null;
  const r = { monto: null, moneda: 'HNL', comercio: '', ultimos4: '', banco: '', tipo: 'gasto', debito: false,
              categoria: '', subcategoria: '', tipoGasto: 'extra' };
  const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d{1,9}(?:[.,]\\d{1,2})?)';
  const CON_MONEDA = new RegExp('(\\bL\\.?|\\bLPS\\.?|\\bHNL|\\bUSD\\$?|US\\$|\\$)\\s?' + NUM, 'gi');
  const pares = [...t.matchAll(CON_MONEDA)], esUSD = p => /us|\$/i.test(p[1]);
  let m = pares[0], moneda = '', num = '';
  // "USD 15.99 (L 430.12)" o "L 430.12 (USD 15.99)": juntos son la misma compra
  // en dólares con lo que cobra el banco en lempiras. Separados (ej. un saldo
  // disponible más adelante), manda el primero.
  const [a, b] = pares;
  if (a && b && esUSD(a) !== esUSD(b) && b.index - (a.index + a[0].length) <= 40) {
    const usd = esUSD(a) ? a : b, hnl = esUSD(a) ? b : a;
    m = usd; r.montoLempiras = parseMonto(hnl[2]);
  }
  if (m) { moneda = m[1]; num = m[2]; }
  else if ((m = t.match(new RegExp(NUM + '\\s?(HNL|LPS|lempiras|USD|d[oó]lares)\\b', 'i')))) { num = m[1]; moneda = m[2]; }
  // Sin moneda escrita: "monto 120.50", "por 350.00" (se asume lempiras)
  else if ((m = t.match(new RegExp('\\b(?:monto|valor|importe|total|por)\\s*:?\\s*' + NUM + '(?![\\d/])', 'i')))) num = m[1];
  if (num) { r.monto = parseMonto(num); r.moneda = /us|\$|d[oó]lar/i.test(moneda) ? 'USD' : 'HNL'; }

  // Comercio: "en COMERCIO" o "comercio: COMERCIO". Se descartan "en 1234"
  // (terminada en...), "en su cuenta" y frases con verbos del propio aviso.
  const NO_COMERCIO = /^(\d{4}\b|su|tu|sus|tus|la|el|los|las|un|una|cuenta|tarjeta|l[ií]nea|fecha|linea|dolares|lempiras|cajero|efectivo)\b|\b(realiz\w*|compra|consumo|transacci\w*|aprobad\w*|efectuad\w*)\b/i;
  const FIN = '(?=\\s+(?:el|con|fecha|por|desde|a\\s+las|autoriz\\w*|ref\\w*|tarj\\w*|hora|saldo|monto|\\d{1,2}[/-]\\d{1,2})\\b|\\s+\\d{1,2}[/-]\\d{1,2}|[,;:]|\\.\\s|\\.$|$)';
  for (const c of t.matchAll(new RegExp("\\ben\\s+([A-Za-z0-9][A-Za-z0-9&'.*\\- ]{1,40}?)" + FIN, 'gi'))) {
    if (!NO_COMERCIO.test(c[1].trim())) { r.comercio = c[1].trim().replace(/[.*\-]+$/, ''); break; }
  }
  if (!r.comercio && (m = t.match(new RegExp("\\bcomercio\\s*:?\\s*([A-Za-z0-9&'.*\\- ]{2,40}?)" + FIN, 'i')))) r.comercio = m[1].trim();

  if ((m = t.match(/(?:terminad[ao]\s+en|terminaci[oó]n|final(?:izad[ao])?(?:\s+en)?|\*+\s?|x{2,}[\s-]?|#\s?)(\d{4})\b/i)) ||
      (m = t.match(/\btarj\w*\.?[^0-9]{0,25}(\d{4})\b/i))) r.ultimos4 = m[1];
  r.debito = (/d[eé]bito/i.test(t) || /\bTD\b/.test(t)) && !/cr[eé]dito|\bTC\b/i.test(t);
  const banco = BANCOS_SMS.find(([, re]) => re.test(t));
  if (banco) r.banco = banco[0];

  if (/rechazad|denegad|declinad|no (fue )?aprobad|fondos insuficientes|no procesad/i.test(t)) r.tipo = 'rechazada';
  else if (/\bretiro\b/i.test(t)) r.tipo = 'retiro';
  else if (/\b(pago|abono)\s+(a|en)\s+(su\s+|tu\s+)?(tarjeta|TC)\b|pago recibido|recibimos (su|tu) pago/i.test(t)) r.tipo = 'pagoTarjeta';
  else if (/transferencia (enviada|realizada|a terceros)|transferiste|env[ií]o de dinero/i.test(t)) r.tipo = 'transferencia';
  else if (/dep[oó]sito|abono|acreditad|recibiste|transferencia recibida|ha recibido|has recibido/i.test(t) && !/\bcompra\b|\bpago de\b|\bcargo\b/i.test(t)) r.tipo = 'ingreso';

  const fuente = r.comercio || t;
  const com = COMERCIOS_SMS.find(([re]) => re.test(fuente));
  if (com) { r.categoria = com[1]; r.subcategoria = com[2] || r.comercio; r.tipoGasto = com[3]; }
  else r.subcategoria = r.comercio;
  return r.monto ? r : null;
}

// Para que el usuario nos mande un formato que no se leyó: se tapan los
// números largos (tarjeta, cuenta, autorización) antes de compartirlo.
function _smsAnonimizado(texto) {
  return String(texto || '').slice(0, 1000).replace(/\d{4,}/g, d => '#'.repeat(d.length));
}
function enviarSMSNoLeido() {
  const txt = _smsAnonimizado(document.getElementById('sms-texto').value);
  const cuerpo = 'Este mensaje de mi banco no se leyó bien en Mi Pisto HN:\n\n' + txt +
    '\n\n(Los números largos se reemplazaron por #. Revisa que no quede ningún dato personal antes de enviar.)';
  location.href = 'mailto:mipistohn@gmail.com?subject=' + encodeURIComponent('SMS no reconocido') + '&body=' + encodeURIComponent(cuerpo);
}

// La tarjeta del mensaje: por los últimos 4 dígitos, o por el banco si solo hay una
function tarjetaDelMensaje(r) {
  const tarjetas = state.tarjetas || [];
  if (r.ultimos4) { const t = tarjetas.find(x => x.ultimos4 === r.ultimos4); if (t) return t; }
  if (r.banco && !r.debito) {
    const delBanco = tarjetas.filter(x => _sinAcentos(x.nombre).includes(_sinAcentos(r.banco)));
    if (delBanco.length === 1) return delBanco[0];
  }
  return null;
}

let _smsLeido = null;
function abrirModalSMS(textoInicial) {
  document.getElementById('sms-texto').value = textoInicial || '';
  leerSMSBanco();
  openModal('modal-sms');
}
async function pegarSMSDelPortapapeles() {
  try {
    const txt = await navigator.clipboard.readText();
    document.getElementById('sms-texto').value = txt.slice(0, 1000);
    leerSMSBanco();
  } catch (e) {
    alert('No se pudo leer el portapapeles. Mantén presionado el cuadro de texto y toca "Pegar".');
  }
}
function leerSMSBanco() {
  const out = document.getElementById('sms-resultado'), btn = document.getElementById('btn-sms-usar');
  const r = interpretarMensajeBanco(document.getElementById('sms-texto').value);
  _smsLeido = r;
  btn.disabled = !r || r.tipo !== 'gasto';
  if (!document.getElementById('sms-texto').value.trim()) { out.style.display = 'none'; return; }
  out.style.display = 'block';
  const enviar = '<br><button type="button" onclick="enviarSMSNoLeido()" style="background:none;border:none;color:var(--text2);text-decoration:underline;font-size:11px;padding:6px 0 0;cursor:pointer">📨 ¿Se leyó mal? Envíanos el formato para mejorarlo</button>';
  if (!r) { out.innerHTML = '🤔 No encontré un gasto en el mensaje. Revisa que incluya el monto (por ejemplo L. 350.00).' + enviar; return; }
  const tarjeta = tarjetaDelMensaje(r);
  const monto = r.moneda === 'USD' ? '$ ' + r.monto.toFixed(2) + ' (USD)' : fL(r.monto);
  if (r.tipo === 'rechazada') { out.innerHTML = '🚫 Es una <strong>transacción rechazada</strong>: no se cobró, así que no hay nada que anotar.'; return; }
  if (r.tipo === 'retiro') { out.innerHTML = '🏧 Es un <strong>retiro de cajero</strong> por ' + esc(monto) + '. No es un gasto: regístralo como una transferencia de <em>Ahorro</em> a <em>Efectivo</em>.'; return; }
  if (r.tipo === 'pagoTarjeta') { out.innerHTML = '💳 Es un <strong>pago a tu tarjeta</strong> por ' + esc(monto) + '. No es un gasto: regístralo con <em>Pagar</em> en la pestaña TC.'; return; }
  if (r.tipo === 'transferencia') { out.innerHTML = '🔁 Es una <strong>transferencia</strong> de ' + esc(monto) + '. Si es entre tus cuentas, usa <em>Transferir entre cuentas</em>; si le pagaste a alguien, regístrala como gasto a mano.'; return; }
  if (r.tipo === 'ingreso') { out.innerHTML = '💰 Parece un <strong>depósito o ingreso</strong> de ' + esc(monto) + '. Regístralo en <em>Ingresos</em>.'; return; }
  out.innerHTML = '💸 <strong>' + esc(monto) + '</strong>' +
    (r.comercio ? '<br>🏪 ' + esc(r.comercio) : '') +
    (r.categoria ? '<br>🏷️ ' + esc(r.categoria) : '') +
    (tarjeta ? '<br>💳 ' + esc(tarjeta.nombre) + (tarjeta.ultimos4 ? ' •••• ' + esc(tarjeta.ultimos4) : '')
      : r.debito ? '<br>🏦 Débito (cuenta de ahorro)'
      : r.ultimos4 ? '<br>💳 Tarjeta •••• ' + esc(r.ultimos4) + ' <span style="color:var(--amber)">(no la tienes registrada: agrega sus últimos 4 dígitos en TC)</span>' : '') + enviar;
}
function usarSMSBanco() {
  const r = _smsLeido;
  if (!r || r.tipo !== 'gasto') return;
  const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null && v !== '') el.value = v; };
  closeModal('modal-sms');
  if (getComputedStyle(document.getElementById('modal-gasto')).display === 'none') openModal('modal-gasto');
  set('gasto-monto', r.monto.toFixed(2));
  set('gasto-moneda', r.moneda);
  document.getElementById('gasto-cobrado').value = r.moneda !== 'HNL' && r.montoLempiras ? r.montoLempiras.toFixed(2) : '';
  if (typeof actualizarConversionGasto === 'function') actualizarConversionGasto();
  set('gasto-cat', r.categoria);
  set('gasto-subcat', r.subcategoria);
  set('gasto-tipo', r.tipoGasto);
  const bancoSel = document.getElementById('gasto-banco');
  if (bancoSel && [...bancoSel.options].some(o => o.value === r.banco)) bancoSel.value = r.banco;
  const tarjeta = tarjetaDelMensaje(r);
  const cuenta = document.getElementById('gasto-cuenta');
  if (tarjeta) { cuenta.value = 'credito'; checkCreditCard(); document.getElementById('gasto-tarjeta').value = tarjeta.id; }
  else if (r.debito) { cuenta.value = 'ahorro'; checkCreditCard(); }
  actualizarSugerenciaTarjeta();
}

function setGastoPreset(cat, sub, tipo) {
    document.getElementById('gasto-cat').value = cat;
    document.getElementById('gasto-subcat').value = sub;
    document.getElementById('gasto-tipo').value = tipo;
}

// Mi Pisto HN · 14-ux.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
(function () {
  'use strict';

  /* 1. Ocultar secciones vacías del dashboard */
  function hideEmptyDashboardSections() {
    const sections = [
      { c:'dashboard-goals',      e:null },
      { c:'card-alerts',          e:'no-card-alerts' },
      { c:'upcoming-payments',    e:'no-upcoming-payments' },
      { c:'upcoming-receivables', e:'no-upcoming-receivables' }
    ];
    sections.forEach(s => {
      const container = document.getElementById(s.c);
      if (!container) return;
      const isEmpty = container.children.length === 0 || container.innerHTML.trim() === '';
      const heading = container.previousElementSibling;
      const emptyMsg = s.e ? document.getElementById(s.e) : null;
      // El bloque que las envuelve (en la computadora es una tarjeta) también se oculta
      const bloque = container.parentElement && container.parentElement.classList.contains('bloque-inicio') ? container.parentElement : null;
      if (bloque) bloque.style.display = isEmpty ? 'none' : '';
      if (isEmpty) {
        if (heading && heading.tagName === 'H3') heading.style.display = 'none';
        if (emptyMsg) emptyMsg.style.display = 'none';
        container.style.display = 'none';
      } else {
        if (heading && heading.tagName === 'H3') heading.style.display = '';
        if (emptyMsg) emptyMsg.style.display = 'none';
        container.style.display = '';
      }
    });
    const recentEl = document.getElementById('recent-history');
    const recentHeading = recentEl ? recentEl.previousElementSibling : null;
    if (recentEl && recentEl.children.length === 0 && recentHeading && recentHeading.tagName === 'H3') {
      recentHeading.style.display = 'none';
    } else if (recentHeading && recentHeading.tagName === 'H3') {
      recentHeading.style.display = '';
    }
  }

  /* 2. Arreglar botón "Registrar primer movimiento" */
  function fixEmptyStateButton() {
    const observer = new MutationObserver(() => {
      const btn = document.querySelector('.btn-empty-cta');
      if (btn && !btn.dataset.fixed) {
        btn.dataset.fixed = '1';
        btn.classList.add('btn-empty-cta-pro');
        btn.onclick = function (e) {
          e.preventDefault(); e.stopPropagation();
          const candidatos = ['modal-ingreso','modal-income','modal-tx-income','modal-nuevo-ingreso','modal-gasto'];
          for (const id of candidatos) {
            if (document.getElementById(id) && typeof window.openModal === 'function') {
              window.openModal(id); return;
            }
          }
          if (typeof window.toggleFabMenu === 'function') {
            const fab = document.getElementById('nav-fab-btn') || document.getElementById('desktop-fab-btn');
            if (fab) fab.scrollIntoView({behavior:'smooth',block:'center'});
            window.toggleFabMenu();
          }
        };
      }
    });
    observer.observe(document.body, { childList:true, subtree:true });
  }

  /* 3. Mejorar metas con barra RGB + acciones */
  function enhanceMetasRendering() {
    if (typeof window.renderMetas !== 'function') { setTimeout(enhanceMetasRendering, 300); return; }
    window.renderMetas = function () {
      const container = document.getElementById('metas-list');
      if (!container) return;
      const goals = (window.state && window.state.goals) || [];
      if (goals.length === 0) {
        container.innerHTML = `
          <div style="text-align:center;padding:40px 20px">
            <div style="font-size:48px;margin-bottom:12px">🎯</div>
            <div style="font-weight:800;font-size:16px;margin-bottom:6px">Sin metas de ahorro</div>
            <div style="font-size:13px;color:var(--text2);margin-bottom:20px;max-width:280px;margin:0 auto 20px">
              Define una meta (viaje, fondo de emergencia, auto) y rastrea tu progreso.
            </div>
            <button class="btn-empty-cta-pro" onclick="openModal('modal-meta')" style="max-width:260px;margin:0 auto">
              ➕ Crear primera meta
            </button>
          </div>`;
        return;
      }
      container.innerHTML = goals.map(g => {
        const pct = Math.min(100, (g.actual / g.objetivo) * 100);
        const isComplete = pct >= 100;
        const escFn = window.esc || (s => String(s||'').replace(/[<>"']/g, ''));
        return `
          <div class="goal-card-pro ${isComplete?'completed':''}" data-goal-id="${escFn(g.id)}">
            <div class="goal-pro-header">
              <div class="goal-pro-name">${isComplete?'🏆 ':''}${escFn(g.nombre)}</div>
              <div class="goal-pro-pct">${pct.toFixed(0)}%</div>
            </div>
            <div class="goal-pro-amounts">
              <strong>${fL(g.actual)}</strong> de ${fL(g.objetivo)}
              ${isComplete?'· ✅ ¡Completada!':''}
            </div>
            ${typeof lineaFondoEmergencia === 'function' ? lineaFondoEmergencia(g) : ''}
            <div class="goal-pro-bar-wrap">
              <div class="goal-pro-bar ${isComplete?'completed':''}" style="width:${pct}%"></div>
            </div>
            <div class="goal-pro-actions">
              <button class="goal-pro-btn abonar"   onclick="openAbono('${escFn(g.id)}')" ${isComplete?'disabled style="opacity:.5;cursor:not-allowed"':''}>💰 Abonar</button>
              <button class="goal-pro-btn editar"   onclick="window.editarMeta('${escFn(g.id)}')">✏️ Editar</button>
              <button class="goal-pro-btn eliminar" onclick="window.eliminarMetaPro('${escFn(g.id)}')">🗑️ Eliminar</button>
            </div>
          </div>`;
      }).join('') + `
          <button type="button" class="meta-agregar-otra" onclick="openModal('modal-meta')">
            <span style="font-size:22px">➕</span>
            <span><strong>Agregar otra meta</strong><br><small>Viaje, electrodoméstico, universidad… puedes tener todas las que quieras</small></span>
          </button>`;
    };

    window.editarMeta = function (id) {
      const g = window.state.goals.find(x => String(x.id) === String(id));
      if (!g) return;
      let modal = document.getElementById('modal-editar-meta');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-editar-meta';
        modal.className = 'modal';
        modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
        modal.innerHTML = `
          <div class="modal-content">
            <h3 style="margin-bottom:16px">✏️ Editar Meta</h3>
            <input type="text"   id="edit-meta-nombre"   class="input-field" placeholder="Nombre">
            <input type="number" id="edit-meta-objetivo" class="input-field" placeholder="Monto objetivo" inputmode="decimal">
            <input type="number" id="edit-meta-actual"   class="input-field" placeholder="Monto actual"   inputmode="decimal">
            <input type="hidden" id="edit-meta-id">
            <div style="display:flex;gap:10px">
              <button class="btn btn-secondary" onclick="document.getElementById('modal-editar-meta').style.display='none'" style="flex:1">Cancelar</button>
              <button class="btn btn-primary"   onclick="window.guardarEdicionMeta()" style="flex:2">Guardar</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
      }
      document.getElementById('edit-meta-nombre').value   = g.nombre;
      document.getElementById('edit-meta-objetivo').value = g.objetivo;
      document.getElementById('edit-meta-actual').value   = g.actual;
      document.getElementById('edit-meta-id').value       = g.id;
      modal.style.display = 'flex';
    };

    window.guardarEdicionMeta = function () {
      const id = document.getElementById('edit-meta-id').value;
      const nombre = document.getElementById('edit-meta-nombre').value.trim();
      const objetivo = leerMonto(document.getElementById('edit-meta-objetivo').value);
      const actual = leerMonto(document.getElementById('edit-meta-actual').value) || 0;
      if (!nombre || !objetivo || objetivo <= 0) { alert('⚠️ Datos inválidos'); return; }
      const g = window.state.goals.find(x => String(x.id) === String(id));
      if (!g) return;
      const wasIncomplete = (g.actual / g.objetivo) < 1;
      g.nombre = nombre; g.objetivo = objetivo; g.actual = actual;
      const isNowComplete = (actual / objetivo) >= 1;
      if (typeof window.save === 'function') window.save();
      document.getElementById('modal-editar-meta').style.display = 'none';
      if (typeof window.renderAll === 'function') window.renderAll();
      if (wasIncomplete && isNowComplete) setTimeout(() => alert(`🎯 ¡Meta "${nombre}" completada!`), 300);
    };

    // deleteMeta devuelve a una cuenta lo abonado; esta versión solo borraba la meta
    window.eliminarMetaPro = function (id) { deleteMeta(id); };

    if (window.state && window.state.goals && window.state.goals.length) window.renderMetas();
  }

  /* 3b. Confeti DESACTIVADO (a petición del usuario) */
  function lanzarConfeti(durationMs) {
    /* no-op */
  }

  function mostrarFelicitacion(nombreMeta) {
    /* no-op — la felicitación ahora es un alert simple desde saveAbono */
  }

  window.celebrarMeta = function (id) {
    /* no-op — sin confeti ni toast animado */
  };

  /* Hook saveAbono — DESACTIVADO (saveAbono ya muestra alert al completar) */
  function hookAbonoParaConfeti() {
    /* no-op */
  }

  /* Hook al renderDashboard para ocultar secciones vacías cada vez que se renderiza */
  function hookRenderDashboard() {
    if (typeof window.renderDashboard !== 'function') { setTimeout(hookRenderDashboard, 300); return; }
    const original = window.renderDashboard;
    window.renderDashboard = function () {
      original.apply(this, arguments);
      setTimeout(hideEmptyDashboardSections, 50);
    };
  }

  function init() {
    console.log('🎨 UX Improvements + Multimoneda v1.0 cargando...');
    hookRenderDashboard();
    setTimeout(hideEmptyDashboardSections, 500);
    fixEmptyStateButton();
    enhanceMetasRendering();
    hookAbonoParaConfeti();
    if (typeof window.switchView === 'function') {
      const orig = window.switchView;
      window.switchView = function () {
        orig.apply(this, arguments);
        setTimeout(hideEmptyDashboardSections, 100);
      };
    }
    console.log('✅ Listo');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

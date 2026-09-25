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
            <div class="goal-pro-bar-wrap">
              <div class="goal-pro-bar ${isComplete?'completed':''}" style="width:${pct}%"></div>
            </div>
            <div class="goal-pro-actions">
              <button class="goal-pro-btn abonar"   onclick="openAbono('${escFn(g.id)}')" ${isComplete?'disabled style="opacity:.5;cursor:not-allowed"':''}>💰 Abonar</button>
              <button class="goal-pro-btn editar"   onclick="window.editarMeta('${escFn(g.id)}')">✏️ Editar</button>
              <button class="goal-pro-btn eliminar" onclick="window.eliminarMetaPro('${escFn(g.id)}')">🗑️ Eliminar</button>
            </div>
          </div>`;
      }).join('');
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

    window.eliminarMetaPro = function (id) {
      const g = window.state.goals.find(x => String(x.id) === String(id));
      if (!g) return;
      const pct = ((g.actual/g.objetivo)*100).toFixed(0);
      if (!confirm(`¿Eliminar la meta "${g.nombre}"?\n\nProgreso actual: ${pct}%\nEsta acción no se puede deshacer.`)) return;
      window.state.goals = window.state.goals.filter(x => String(x.id) !== String(id));
      if (typeof window.save === 'function') window.save();
      if (typeof window.renderAll === 'function') window.renderAll();
    };

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

  /* 4. Hamburguesa desktop */
  function buildDesktopHamburger() {
    if (document.getElementById('desktop-hamburger-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'desktop-hamburger-btn';
    btn.className = 'desktop-hamburger';
    btn.setAttribute('aria-label','Abrir menú');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>`;
    document.body.appendChild(btn);

    const menu = document.createElement('div');
    menu.id = 'desktop-hamburger-menu';
    menu.className = 'desktop-hamburger-menu';
    menu.innerHTML = `
      <div class="hb-menu-section">Acciones rápidas</div>
      <div class="hb-menu-item" data-fab="ingreso">
        <svg viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
        Nuevo ingreso
      </div>
      <div class="hb-menu-item" data-fab="gasto">
        <svg viewBox="0 0 24 24" fill="none" stroke="#FF4444" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
        Nuevo gasto
      </div>
      <div class="hb-menu-item" data-fab="transferir">
        <svg viewBox="0 0 24 24" fill="none" stroke="#F5C800" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        Transferir
      </div>
      <div class="hb-menu-divider"></div>
      <div class="hb-menu-section">Navegación</div>
      <div class="hb-menu-item" data-view="dashboard">
        <svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2" opacity=".6"/><rect x="3" y="13" width="8" height="8" rx="2" opacity=".6"/><rect x="13" y="13" width="8" height="8" rx="2" opacity=".35"/></svg>
        Inicio
      </div>
      <div class="hb-menu-item" data-view="metas">
        <svg viewBox="0 0 24 24" fill="none" stroke="#4285F4" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="#4285F4"/></svg>
        Metas de ahorro
      </div>
      <div class="hb-menu-item" data-view="historico">
        <svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="14" width="4" height="7" rx="1.5" opacity=".5"/><rect x="10" y="9" width="4" height="12" rx="1.5" opacity=".75"/><rect x="17" y="4" width="4" height="17" rx="1.5"/></svg>
        Historial
      </div>
      <div class="hb-menu-item" data-view="tarjetas">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        Tarjetas
      </div>
      <div class="hb-menu-divider"></div>
      <div class="hb-menu-item" data-view="config">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Configuración
      </div>`;
    document.body.appendChild(menu);

    btn.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('open'); });
    document.addEventListener('click', e => {
      if (!menu.contains(e.target) && !btn.contains(e.target)) menu.classList.remove('open');
    });
    menu.addEventListener('click', e => {
      const item = e.target.closest('.hb-menu-item');
      if (!item) return;
      menu.classList.remove('open');
      const view = item.dataset.view;
      const fabAction = item.dataset.fab;
      if (view && typeof window.switchView === 'function') {
        window.switchView(view);
        if (typeof window.setSidebarActive === 'function') window.setSidebarActive('sb-' + view);
      }
      if (fabAction) {
        const map = {
          ingreso:    ['modal-ingreso','modal-income'],
          gasto:      ['modal-gasto','modal-expense'],
          transferir: ['modal-transferir','modal-transfer']
        };
        const candidatos = map[fabAction] || [];
        for (const id of candidatos) {
          if (document.getElementById(id) && typeof window.openModal === 'function') {
            window.openModal(id); return;
          }
        }
        if (typeof window.toggleFabMenu === 'function') window.toggleFabMenu();
      }
    });
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
    buildDesktopHamburger();
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

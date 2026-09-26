// Mi Pisto HN · 36-escritorio.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== LA APP EN LA COMPUTADORA ==========
// En el teléfono el Inicio es una sola columna. En una pantalla ancha (1024 px
// o más) las mismas tarjetas se acomodan en columnas —los movimientos del mes a
// la izquierda y lo demás al lado— con una fila de datos clave arriba. Las
// tarjetas se mueven de lugar (no se copian) y vuelven a su sitio si la ventana
// se achica, así todo lo que ya las actualiza sigue funcionando igual.

const _escAncho = window.matchMedia ? matchMedia('(min-width: 1024px)') : { matches: false };
const _escMuyAncho = window.matchMedia ? matchMedia('(min-width: 1600px)') : { matches: false };
const _ESC_PRINCIPAL = ['duplicates-alert', 'primeros-pasos', 'aviso-resumen', 'auto-anotados', 'sugerencia-recurrente', 'registros-mes'];
const _ESC_COLUMNAS = {
  2: [_ESC_PRINCIPAL,
    ['balance-card', 'aviso-cuadre', 'racha-card', 'liquidez-7dias', 'presupuestos-card', 'bloque-metas', 'fondo-emergencia-card', 'cashflow-projection', 'bloque-alertas-tc', 'bloque-proximos-cobros', 'bloque-proximos-pagos']],
  3: [_ESC_PRINCIPAL,
    ['balance-card', 'liquidez-7dias', 'cashflow-projection', 'bloque-alertas-tc', 'bloque-proximos-pagos', 'bloque-proximos-cobros'],
    ['racha-card', 'aviso-cuadre', 'presupuestos-card', 'bloque-metas', 'fondo-emergencia-card']],
};
const _escMarcas = {}; // id → comentario que marca su lugar en el teléfono

function _escContenedores() {
  const vista = document.getElementById('view-dashboard');
  if (!vista) return null;
  let grid = document.getElementById('esc-grid');
  if (!grid) {
    const kpis = document.createElement('div');
    kpis.id = 'esc-kpis';
    grid = document.createElement('div');
    grid.id = 'esc-grid';
    grid.innerHTML = '<div class="esc-col"></div><div class="esc-col"></div><div class="esc-col"></div>';
    vista.insertBefore(grid, vista.firstChild);
    vista.insertBefore(kpis, grid);
  }
  return grid;
}

function acomodarEscritorio() {
  const grid = _escContenedores();
  if (!grid) return;
  const cols = grid.children;
  if (_escAncho.matches) {
    const plan = _ESC_COLUMNAS[_escMuyAncho.matches ? 3 : 2];
    plan.forEach((ids, n) => ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!_escMarcas[id] && !grid.contains(el)) {
        _escMarcas[id] = document.createComment('esc:' + id);
        el.parentNode.insertBefore(_escMarcas[id], el);
      }
      cols[n].appendChild(el);
    }));
    renderKPIsEscritorio();
  } else {
    // De vuelta a su lugar de siempre
    Object.keys(_escMarcas).forEach(id => {
      const el = document.getElementById(id), marca = _escMarcas[id];
      if (el && marca.parentNode) marca.parentNode.insertBefore(el, marca.nextSibling);
    });
  }
}

// Fila de datos clave arriba del Inicio
function renderKPIsEscritorio() {
  const el = document.getElementById('esc-kpis');
  if (!el || !_escAncho.matches || !state.setup) return;
  const hoy = new Date(), mes = calcularResumenMes(hoy.getFullYear(), hoy.getMonth());
  const prev = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1), mesPrev = calcularResumenMes(prev.getFullYear(), prev.getMonth());
  const cuentas = calcBalance(), debes = typeof totalLoQueDebes === 'function' ? totalLoQueDebes() : 0;
  const nomMes = _MESES[hoy.getMonth()], nomPrev = _MESES[prev.getMonth()];
  const racha = typeof calcularRacha === 'function' ? calcularRacha() : { actual: 0, mejor: 0 };
  const cambio = mesPrev.ingresos > 0 ? Math.round((mes.ingresos - mesPrev.ingresos) / mesPrev.ingresos * 100) : null;
  // Sin centavos: es un resumen (el detalle está en cada tarjeta)
  const entero = n => fL(Math.round(n)).replace(/\.00$/, '');
  const kpi = (titulo, valor, sub, color, clase) => `<div class="esc-kpi${clase ? ' ' + clase : ''}"><div class="esc-kpi-t">${titulo}</div><div class="esc-kpi-v"${color ? ` style="color:${color}"` : ''}>${valor}</div><div class="esc-kpi-s">${sub}</div></div>`;
  el.innerHTML =
    kpi('Patrimonio neto', fL(cuentas - debes), `Cuentas ${entero(cuentas)}${debes > 0 ? ' · Debes ' + entero(debes) : ''}`, cuentas - debes >= 0 ? 'var(--green)' : 'var(--red)', 'grande') +
    kpi('Ingresos · ' + nomMes, entero(mes.ingresos), cambio === null ? 'Lo que entró este mes' : (cambio >= 0 ? '▲ ' : '▼ ') + Math.abs(cambio) + '% vs ' + nomPrev, 'var(--green)') +
    kpi('Gastos · ' + nomMes, entero(mes.gastos), entero(mes.promedioDiario) + ' por día', 'var(--red)') +
    kpi(mes.sobrante >= 0 ? 'Te sobra' : 'Te faltó', entero(Math.abs(mes.sobrante)), mes.ingresos > 0 ? Math.round(Math.abs(mes.sobrante) / mes.ingresos * 100) + '% de lo que ganaste' : 'Anota tus ingresos del mes', mes.sobrante >= 0 ? 'var(--text)' : 'var(--red)') +
    kpi('Racha', '🔥 ' + racha.actual + (racha.actual === 1 ? ' día' : ' días'), 'Tu mejor racha: ' + racha.mejor, '');
}

// El buscador de la barra de arriba busca en los movimientos del Inicio
function buscarDesdeBarra(q) {
  const vista = document.querySelector('.view.active');
  if (!vista || vista.id !== 'view-dashboard') switchView('dashboard');
  const campo = document.getElementById('rm-q');
  if (campo) campo.value = q;
  if (typeof buscarMovimientos === 'function') buscarMovimientos(q);
}

// Candado de la barra de arriba
async function bloquearAhora() {
  if (!localStorage.getItem('finanzas_pin_hash')) return avisar('Para bloquear la app, primero crea un PIN en Configuración.');
  await save();
  _bloquearAppPorInactividad();
}

// El menú lateral marca la pantalla en la que estás, se llegue como se llegue
const _switchViewBase = switchView;
switchView = function (v) {
  _switchViewBase(v);
  if (document.getElementById('sb-' + v)) setSidebarActive('sb-' + v);
};

// Después de cada actualización de la pantalla se reacomoda (hay tarjetas que se crean tarde)
const _renderAllBase = renderAll;
renderAll = function () {
  const r = _renderAllBase.apply(this, arguments);
  acomodarEscritorio();
  return r;
};

// Atajos de teclado: N gasto, I ingreso, T transferencia, / buscar, Esc cierra
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target, enCampo = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  if (e.key === 'Escape' && t && t.id === 'dt-buscar') { t.blur(); return; }
  if (document.getElementById('dialogo-app') || document.body.classList.contains('app-bloqueada') || !state.setup) return;
  const modal = typeof _modalAbiertoArriba === 'function' ? _modalAbiertoArriba() : null;
  if (e.key === 'Escape' && modal && modal.id !== 'modal-registro') { e.preventDefault(); closeModal(modal.id); return; }
  if (enCampo || modal) return;
  const k = e.key.toLowerCase();
  if (k === 'n') { e.preventDefault(); abrirRegistro('gasto'); }
  else if (k === 'i') { e.preventDefault(); abrirRegistro('ingreso'); }
  else if (k === 't') { e.preventDefault(); abrirRegistro('transferencia'); }
  else if (e.key === '/') {
    e.preventDefault();
    const campo = getComputedStyle(document.getElementById('desktop-topbar') || document.body).display !== 'none' ? document.getElementById('dt-buscar') : document.getElementById('rm-q');
    if (campo) campo.focus();
  }
});

try { _escAncho.addEventListener('change', acomodarEscritorio); _escMuyAncho.addEventListener('change', acomodarEscritorio); } catch (e) {}
acomodarEscritorio();
setTimeout(acomodarEscritorio, 600);

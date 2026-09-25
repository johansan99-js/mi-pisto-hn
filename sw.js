// ============================================================
//  Mi Pisto HN — Service Worker v20-restored
//  ─────────────────────────────────────────────────────────
//  RESTAURACIÓN: el commit "Update sw.js" (e374ebc) sobrescribió
//  este archivo con una copia completa de index.html (HTML en vez
//  de JS), lo que rompía el registro del service worker por
//  completo (SyntaxError al parsear). Se restaura aquí el último
//  service worker funcional (v19-cloud-sync-fase4) y se sube la
//  versión para forzar la actualización de caché en los clientes.
// ============================================================
//
//  FASE 4 — Merge inteligente de conflictos
//
//  ✅ mergeStates(local, remote): algoritmo de unión inteligente
//       • Escalares (nombre, cuentas, budgetRules): remoto gana
//       • Arrays por ID: unión completa
//         – Solo en local → sobrevive (añadido offline en este device)
//         – Solo en remoto → sobrevive (añadido en otro device)
//         – En ambos, sin cambios → incluido una sola vez
//         – En ambos, con deletedAt → eliminación se propaga
//         – En ambos, con diferencias → remoto gana (tiebreaker)
//         – goals.actual en conflicto → max(local, remoto)
//           para preservar el mayor progreso de ahorro
//
//  ✅ Auto-sync silencioso: descarga, merge, sube. El usuario
//      ve el indicador "☁️✓ +N fusionados" si hubo merge.
//
//  ✅ Modal de merge en upload manual: muestra diff legible
//      ("📱 ESTE DISPOSITIVO: +3 transacciones / ☁️ NUBE:
//       +5 transacciones / ⚠️ 1 conflicto resuelto") con 3
//      opciones: ✅ Combinar (recomendado), ⬆️ Solo lo mío,
//      ❌ Cancelar.
//
//  ✅ Anti-loop: flag _isSyncing evita que el merge dispare
//      otro auto-sync, y que el guardado local del merge
//      vuelva a triggerear _scheduleAutoSync.
//
//  ✅ Código zombie de versiones anteriores eliminado
//      (mergeArr, uploadWithMerge, fragmento huérfano de
//       getRemoteInfo — causaban "Unexpected token '!'").
// ============================================================

const VERSION = 'v72-informe-mes';
const CACHE_NAME = `mipistohn-${VERSION}`;

// FIX: Detectar el scope automáticamente del registro del SW
// Esto resuelve URLs como /mi-pisto-hn/, /mis-finanzas/, /, etc.
const SCOPE = self.registration ? self.registration.scope : self.location.href.replace(/sw\.js.*$/, '');
const BASE_PATH = new URL(SCOPE).pathname;
const FICHA_CACHE = 'mph-recordatorio';  // la comparte index.html; no se borra al actualizar  // ej: "/mi-pisto-hn/"

console.log(`📍 [SW ${VERSION}] Base path detectado: ${BASE_PATH}`);

// Timeouts consistentes
const TIMEOUTS = {
  RATES:        3000,
  NAVIGATION:   4500,
  EXTERNAL:     7000
};

// FIX: Construir URLs dinámicamente con el path real
const ASSETS_REQUIRED = [
  BASE_PATH,
  BASE_PATH + 'index.html',
  BASE_PATH + 'offline.html',
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'tasas.json',
  BASE_PATH + 'guacamaya.png',
  // Código y estilos de la app, en el orden de index.html (una prueba verifica que coincidan)
  BASE_PATH + 'js/00-config.js',
  BASE_PATH + 'js/01-nucleo.js',
  BASE_PATH + 'js/02-cifrado-y-guardado.js',
  BASE_PATH + 'js/03-ocr-y-sms.js',
  BASE_PATH + 'js/04-interfaz-y-kit.js',
  BASE_PATH + 'js/05-movimientos.js',
  BASE_PATH + 'js/06-deudas-y-tarjetas.js',
  BASE_PATH + 'js/07-notificaciones-y-reportes.js',
  BASE_PATH + 'js/08-datos-y-navegacion.js',
  BASE_PATH + 'js/09-saldos-y-sincronizacion.js',
  BASE_PATH + 'js/10-herramientas.js',
  BASE_PATH + 'js/11-arranque.js',
  BASE_PATH + 'js/12-nube.js',
  BASE_PATH + 'js/13-monedas.js',
  BASE_PATH + 'js/14-ux.js',
  BASE_PATH + 'js/15-plan-deudas.js',
  BASE_PATH + 'js/16-fondo-emergencia.js',
  BASE_PATH + 'js/17-compartidos.js',
  BASE_PATH + 'js/18-presupuestos.js',
  BASE_PATH + 'js/19-cuentas.js',
  BASE_PATH + 'js/20-extras.js',
  BASE_PATH + 'js/21-premium.js',
  BASE_PATH + 'js/22-racha.js',
  BASE_PATH + 'js/23-excel.js',
  BASE_PATH + 'js/24-registro-rapido.js',
  BASE_PATH + 'js/25-registros-del-mes.js',
  BASE_PATH + 'js/26-analisis.js',
  BASE_PATH + 'js/27-presupuestos-categoria.js',
  BASE_PATH + 'js/28-categorias.js',
  BASE_PATH + 'js/29-busqueda-y-recurrentes.js',
  BASE_PATH + 'js/30-remesas.js',
  BASE_PATH + 'js/31-dictado.js',
  BASE_PATH + 'js/32-tarjetas-dolares.js',
  BASE_PATH + 'js/33-sin-esfuerzo.js',
  BASE_PATH + 'js/34-informe-mes.js',
  BASE_PATH + 'css/app.css'
];

// Assets opcionales (no fallan si no existen)
const ASSETS_OPTIONAL = [
  BASE_PATH + 'icon-192.png',
  BASE_PATH + 'icon-512.png',
  BASE_PATH + 'icon-maskable-192.png',
  BASE_PATH + 'icon-maskable-512.png'
];

// Librerías CDN con versión fija (inmutables): se cachean para que gráficas,
// Excel y el SDK de sync carguen sin conexión. Deben coincidir con index.html.
const CDN_LIBS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'
];

// ── HELPER: Fetch con timeout compatible ──
function timeoutFetch(request, ms) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    return fetch(request, { signal: AbortSignal.timeout(ms) });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  return fetch(request, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log(`✅ Mi Pisto HN ${VERSION} — cacheando assets...`);

      // FIX: Cachear obligatorios y opcionales por separado
      // Los obligatorios usan addAll para fallar rápido si hay problemas
      // Los opcionales usan add individual con catch (no bloquea install)

      // Required assets (con manejo individual de errores)
      await Promise.allSettled(
        ASSETS_REQUIRED.map(url =>
          cache.add(url).catch(err => {
            console.warn(`⚠️ No se pudo cachear ${url}:`, err.message);
          })
        )
      );

      // Optional assets (silenciosos)
      await Promise.allSettled(
        ASSETS_OPTIONAL.map(url =>
          cache.add(url).catch(() => {
            // Silencioso - los iconos pueden no existir
          })
        )
      );

      await Promise.allSettled(
        CDN_LIBS.map(url =>
          cache.add(new Request(url, { mode: 'cors', credentials: 'omit' })).catch(err => {
            console.warn(`⚠️ No se pudo cachear librería ${url}:`, err.message);
          })
        )
      );

      console.log('✅ Cache completado — saltando espera');
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: limpiar cachés viejos ──────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== FICHA_CACHE)
          .map(name => {
            console.log('🗑️ Eliminando caché antiguo:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log(`✅ Mi Pisto HN ${VERSION} activo`);
      return self.clients.claim();
    })
  );
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // ── tasas.json: NETWORK-FIRST con fallback completo ──
  if (url.pathname.endsWith('/tasas.json')) {
    event.respondWith((async () => {
      // La app pide tasas.json?d=YYYY-MM-DD: se guarda y busca sin el query
      // para que, sin conexión, un día nuevo encuentre la última copia.
      const cacheKey = url.origin + url.pathname;
      try {
        const networkResp = await timeoutFetch(event.request, TIMEOUTS.RATES);
        if (networkResp && networkResp.status === 200) {
          const clone = networkResp.clone();
          caches.open(CACHE_NAME).then(c => c.put(cacheKey, clone).catch(() => {}));
          return networkResp;
        }
      } catch (e) { /* offline o timeout */ }

      const cached = await caches.match(cacheKey);
      if (cached) return cached;

      // Fallback con tasas por defecto
      return new Response(JSON.stringify({
        error: 'tasas.json no disponible (offline/timeout)',
        base: 'HNL',
        updated_at: new Date().toISOString(),
        rates: {
          USD: 26.7295,
          EUR: 31.0000,
          GTQ: 3.4813,
          NIO: 0.7218,
          MXN: 1.5176,
          CRC: 0.0530,
          PAB: 26.7295
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    })());
    return;
  }

  // Librerías CDN versionadas: cache-first (el contenido nunca cambia)
  if (CDN_LIBS.includes(url.href)) {
    event.respondWith((async () => {
      const cached = await caches.match(url.href);
      if (cached) return cached;
      try {
        const resp = await timeoutFetch(event.request, TIMEOUTS.EXTERNAL);
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(url.href, clone).catch(() => {}));
        }
        return resp;
      } catch (e) {
        return new Response('', { status: 503, statusText: 'Offline — librería no disponible' });
      }
    })());
    return;
  }

  // Resto de externos (Tesseract, API de Supabase, etc.): solo red
  const isExternal = url.origin !== self.location.origin;
  if (isExternal) {
    event.respondWith(
      timeoutFetch(event.request, TIMEOUTS.EXTERNAL)
        .catch(() => new Response('', {
          status: 503,
          statusText: 'Offline — recurso externo no disponible'
        }))
    );
    return;
  }

  // ── Navegación: caché-rápido + revalidación en background ──
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      // Se guarda sin el query: ?action= y ?text= (un SMS compartido) no
      // deben quedar como entradas de la caché.
      const cacheKey = url.origin + url.pathname;
      const cached = await caches.match(cacheKey) ||
                     await caches.match(BASE_PATH + 'index.html');

      const updateCacheInBackground = (async () => {
        try {
          const fresh = await timeoutFetch(event.request, TIMEOUTS.NAVIGATION);
          if (fresh && fresh.status === 200) {
            const clone = fresh.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(cacheKey, clone);
          }
        } catch (e) {
          // Silencioso
        }
      })();

      event.waitUntil(updateCacheInBackground);

      if (cached) return cached;

      try {
        const fresh = await timeoutFetch(event.request, TIMEOUTS.NAVIGATION);
        return fresh;
      } catch (e) {
        return (await caches.match(BASE_PATH + 'offline.html')) ||
               new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Assets estáticos: cache-first con actualización en background
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = timeoutFetch(event.request, TIMEOUTS.EXTERNAL)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c =>
              c.put(event.request, clone).catch(() => {})
            );
          }
          return response;
        })
        .catch(() => null);

      return cachedResponse || fetchPromise.then(r => r || new Response('', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      }));
    })
  );
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'Mi Pisto HN', body: 'Tienes un recordatorio de pago.' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    BASE_PATH + 'icon-192.png',
      badge:   BASE_PATH + 'icon-192.png',
      vibrate: [200, 100, 200, 100, 200],
      tag:     'mipistohn-recordatorio',
      renotify: true,
      data:    { url: BASE_PATH }
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || BASE_PATH, self.registration.scope);
  // El botón de la notificación manda sobre la URL
  const accion = event.action || url.searchParams.get('action');
  if (event.action) url.searchParams.set('action', event.action);
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(BASE_PATH) && 'focus' in client) {
          if (accion) client.postMessage({ tipo: 'accion', accion });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url.href);
    })
  );
});

// ── RECORDATORIO DIARIO (Periodic Background Sync) ────────────
// La app deja en FICHA_CACHE solo lo necesario (activo, hora, fecha del
// último movimiento y del último aviso), nunca montos ni datos cifrados.
// Android decide cuándo despierta al SW, así que la hora es aproximada.
function fechaLocalSW(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function revisarRecordatorio(ahora = new Date()) {
  const cache = await caches.open(FICHA_CACHE);
  const resp = await cache.match('ficha.json');
  if (!resp) return false;
  let ficha;
  try { ficha = await resp.json(); } catch (e) { return false; }
  const hoy = fechaLocalSW(ahora);
  const [h, m] = String(ficha.hora || '20:00').split(':').map(Number);
  const minutos = ahora.getHours() * 60 + ahora.getMinutes();
  if (!ficha.activo || minutos < h * 60 + (m || 0) || ficha.ultimoRegistro === hoy || ficha.avisado === hoy) return false;
  // Con racha, el aviso invita a no perderla (la ficha trae solo el número)
  const titulo = ficha.racha >= 2 ? '🔥 No pierdas tu racha de ' + ficha.racha + ' días' : '📝 ¿Anotaste tus gastos de hoy?';
  await self.registration.showNotification(titulo, {
    body: 'Tómate un minuto para registrar lo que gastaste hoy.',
    icon: BASE_PATH + 'icon-192.png',
    badge: BASE_PATH + 'icon-192.png',
    tag: 'mph-recordatorio',
    actions: [{ action: 'new-expense', title: '➕ Registrar gasto' }],
    data: { url: BASE_PATH + '?action=new-expense' }
  });
  ficha.avisado = hoy;
  await cache.put('ficha.json', new Response(JSON.stringify(ficha), { headers: { 'Content-Type': 'application/json' } }));
  return true;
}

self.addEventListener('periodicsync', event => {
  if (event.tag === 'mph-recordatorio') event.waitUntil(revisarRecordatorio());
});

// ── MESSAGE: control desde la app ─────────────────────────────
self.addEventListener('message', event => {
  if (!event.data) return;

  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CACHE_URLS':
      if (Array.isArray(event.data.urls)) {
        caches.open(CACHE_NAME).then(cache => {
          cache.addAll(event.data.urls).catch(e => console.warn('Cache error:', e));
        });
      }
      break;

    case 'CLEAR_CACHE':
      caches.keys().then(keys => {
        Promise.all(keys.map(k => caches.delete(k)));
      });
      break;
  }
});

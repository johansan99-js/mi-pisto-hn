// Mi Pisto HN · 13-monedas.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
/* ═══════════════════════════════════════════════════════════════════════
   CURRENCY MANAGER v6.2 — Arquitectura de 3 niveles de fallback
   ─────────────────────────────────────────────────────────────────────
   NIVEL 1: fetch('./tasas.json')    ← actualizado diariamente por
                                       GitHub Actions (sin CORS, sin
                                       API keys, sin latencia).
   NIVEL 2: open.er-api.com          ← si tasas.json no existe o es
                                       muy viejo (> 7 días).
   NIVEL 3: DEFAULT_RATES hardcoded  ← modo offline absoluto.

   CAMBIOS RESPECTO A v6:
   • SVC eliminado (Colón Salvadoreño obsoleto desde 2001 → El Salvador
     usa USD desde la dolarización oficial).
   • Tasas almacenadas como "1 X = Y HNL" (más intuitivo que "1 HNL = Y X").
   • Tasas iniciales actualizadas a abril 2026 (BCH oficial).
   • Migración automática del formato viejo al nuevo.
   • Auto-refresh al cargar la app desde tasas.json del repo.
═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const CURRENCIES = {
    HNL: { code:'HNL', name:'Lempira Hondureño',     symbol:'L',   decimals:2, format:'L. {amount}',  flag:'🇭🇳' },
    USD: { code:'USD', name:'Dólar Estadounidense',  symbol:'$',   decimals:2, format:'$ {amount}',   flag:'🇺🇸' },
    EUR: { code:'EUR', name:'Euro',                  symbol:'€',   decimals:2, format:'€ {amount}',   flag:'🇪🇺' },
    GTQ: { code:'GTQ', name:'Quetzal Guatemalteco',  symbol:'Q',   decimals:2, format:'Q {amount}',   flag:'🇬🇹' },
    NIO: { code:'NIO', name:'Córdoba Nicaragüense',  symbol:'C$',  decimals:2, format:'C$ {amount}',  flag:'🇳🇮' },
    MXN: { code:'MXN', name:'Peso Mexicano',         symbol:'MX$', decimals:2, format:'MX$ {amount}', flag:'🇲🇽' },
    CRC: { code:'CRC', name:'Colón Costarricense',   symbol:'₡',   decimals:2, format:'₡ {amount}',   flag:'🇨🇷' },
    PAB: { code:'PAB', name:'Balboa Panameño',       symbol:'B/.', decimals:2, format:'B/. {amount}', flag:'🇵🇦' }
  };

  // ── TASAS FALLBACK (Nivel 3) — abril 2026, BCH oficial ──
  // Formato v2: cada moneda tiene { bid, ask, mid }
  //   bid = tasa de COMPRA del banco (cuando tú VENDES esa moneda al banco)
  //   ask = tasa de VENTA del banco  (cuando tú COMPRAS esa moneda al banco)
  //   mid = punto medio (referencia/promedio)
  // Estas son el último recurso si tasas.json y la API externa fallan.
  const DEFAULT_RATES = {
    USD: { bid: 26.5965, ask: 26.7295, mid: 26.6630 },  // BCH 28-abr-2026
    EUR: { bid: 30.8450, ask: 31.1550, mid: 31.0000 },
    GTQ: { bid:  3.4639, ask:  3.4987, mid:  3.4813 },
    NIO: { bid:  0.7182, ask:  0.7254, mid:  0.7218 },
    MXN: { bid:  1.5100, ask:  1.5252, mid:  1.5176 },
    CRC: { bid:  0.0527, ask:  0.0533, mid:  0.0530 },
    PAB: { bid: 26.5965, ask: 26.7295, mid: 26.6630 }   // PAB pegado al USD 1:1
  };
  // Spread implícito que aplicamos a tasas legacy (formato número plano)
  // cuando no tenemos bid/ask explícitos. 0.5% es el promedio de los bancos
  // hondureños sobre el TCR del BCH.
  const DEFAULT_SPREAD = 0.0025;  // ±0.25% del mid → spread total 0.5%

  /** Helper: convierte un valor de tasa (sea número o {bid,ask,mid}) al formato {bid,ask,mid} */
  function _normalizeRate(rate) {
    if (rate === null || rate === undefined) return null;
    if (typeof rate === 'number' && rate > 0 && isFinite(rate)) {
      return {
        bid: rate * (1 - DEFAULT_SPREAD),
        ask: rate * (1 + DEFAULT_SPREAD),
        mid: rate
      };
    }
    if (typeof rate === 'object' &&
        typeof rate.bid === 'number' && rate.bid > 0 &&
        typeof rate.ask === 'number' && rate.ask > 0) {
      return {
        bid: rate.bid,
        ask: rate.ask,
        mid: typeof rate.mid === 'number' ? rate.mid : (rate.bid + rate.ask) / 2
      };
    }
    return null;
  }

  /** Helper: extrae el valor mid de una tasa (para legacy) */
  function _midOf(rate) {
    if (typeof rate === 'number') return rate;
    if (rate && typeof rate.mid === 'number') return rate.mid;
    if (rate && typeof rate.bid === 'number' && typeof rate.ask === 'number') {
      return (rate.bid + rate.ask) / 2;
    }
    return 0;
  }

  class CurrencyManager {
    constructor() {
      this.baseCurrency = 'HNL';
      this.displayCurrency = 'HNL';
      this.rates = JSON.parse(JSON.stringify(DEFAULT_RATES));  // deep clone
      this.ratesLastUpdate = null;
      this.ratesSource = 'default';   // 'default' | 'json' | 'api' | 'manual'
      this.ratesExpiryMs = 24 * 60 * 60 * 1000;  // 24h
      this.loadFromStorage();
      this._migrateOldRatesIfNeeded();
    }

    loadFromStorage() {
      try {
        const raw = localStorage.getItem('mph_currency_config');
        if (!raw) return;
        const cfg = JSON.parse(raw);
        if (cfg.displayCurrency && cfg.displayCurrency !== 'SVC') {
          this.displayCurrency = cfg.displayCurrency;
        } else if (cfg.displayCurrency === 'SVC') {
          this.displayCurrency = 'HNL';  // SVC eliminado → reset
        }
        if (cfg.rates && Object.keys(cfg.rates).length) {
          // Normalizar cada tasa al formato {bid,ask,mid}
          const normalized = {};
          Object.keys(cfg.rates).forEach(code => {
            const n = _normalizeRate(cfg.rates[code]);
            if (n) normalized[code] = n;
          });
          if (Object.keys(normalized).length) this.rates = normalized;
        }
        this.ratesLastUpdate = cfg.ratesLastUpdate ? new Date(cfg.ratesLastUpdate) : null;
        this.ratesSource = cfg.ratesSource || 'default';
        this.ratesOrigin = cfg.ratesOrigin || null;
        this._formatVersion = cfg._formatVersion || 1;
      } catch (e) { console.warn('Currency config load fail:', e); }
    }

    /** Migración: tasas v1 estaban como "1 HNL = X moneda" (valores < 2 típicos).
        v2 las quiere como "1 moneda = X HNL". v3 además usa {bid,ask,mid}.
        Detecta y convierte. */
    _migrateOldRatesIfNeeded() {
      // Detección de v1: alguna tasa USD < 1 (formato invertido)
      const firstUSD = this.rates.USD;
      const usdMid = _midOf(firstUSD);
      if (this._formatVersion < 2 && usdMid > 0 && usdMid < 1) {
        console.log('🔄 Migrando tasas a formato v3 (1 X = Y HNL, con bid/ask)...');
        const newRates = {};
        Object.keys(this.rates).forEach(code => {
          const oldMid = _midOf(this.rates[code]);
          if (oldMid && oldMid > 0) {
            const inverted = 1 / oldMid;
            newRates[code] = {
              bid: inverted * (1 - DEFAULT_SPREAD),
              ask: inverted * (1 + DEFAULT_SPREAD),
              mid: inverted
            };
          }
        });
        this.rates = newRates;
      } else if (this._formatVersion < 3) {
        // v2 → v3: las tasas eran números planos, normalizar a {bid,ask,mid}
        const newRates = {};
        Object.keys(this.rates).forEach(code => {
          const n = _normalizeRate(this.rates[code]);
          if (n) newRates[code] = n;
        });
        this.rates = newRates;
      }
      delete this.rates.SVC;  // Colón Salvadoreño obsoleto
      this._formatVersion = 3;
      this.saveToStorage();
      console.log('✅ Tasas en formato v3:', this.rates);
    }

    saveToStorage() {
      try {
        localStorage.setItem('mph_currency_config', JSON.stringify({
          displayCurrency: this.displayCurrency,
          rates: this.rates,
          ratesLastUpdate: this.ratesLastUpdate ? this.ratesLastUpdate.toISOString() : null,
          ratesSource: this.ratesSource,
          ratesOrigin: this.ratesOrigin || null,
          _formatVersion: 3
        }));
      } catch (e) { console.warn('Currency config save fail:', e); }
    }

    getAvailableCurrencies() { return Object.values(CURRENCIES); }
    getCurrencyInfo(code)    { return CURRENCIES[code] || null; }

    /** Devuelve la tasa de una moneda en formato {bid,ask,mid}.
        Garantiza siempre los 3 campos (deriva con spread si solo hay número). */
    getRate(code) {
      if (code === 'HNL') return { bid: 1, ask: 1, mid: 1 };
      return _normalizeRate(this.rates[code]);
    }

    /** Tasa de compra del banco (lo que el banco te paga cuando le VENDES esa moneda).
        Esta es la tasa que aplica cuando recibes/cobras en moneda extranjera. */
    getBidRate(code) {
      const r = this.getRate(code);
      return r ? r.bid : null;
    }

    /** Tasa de venta del banco (lo que el banco te cobra cuando le COMPRAS esa moneda).
        Esta es la tasa que aplica cuando pagas/gastas en moneda extranjera. */
    getAskRate(code) {
      const r = this.getRate(code);
      return r ? r.ask : null;
    }

    /** Tasa media (referencia, sin spread). Para reportes contables, no para conversión real. */
    getMidRate(code) {
      const r = this.getRate(code);
      return r ? r.mid : null;
    }

    setDisplayCurrency(code) {
      if (!CURRENCIES[code]) throw new Error('Moneda no soportada: ' + code);
      this.displayCurrency = code;
      this.saveToStorage();
      document.dispatchEvent(new CustomEvent('currencyChanged', { detail: { code } }));
    }

    areRatesStale() {
      if (!this.ratesLastUpdate) return true;
      return (Date.now() - this.ratesLastUpdate.getTime()) > this.ratesExpiryMs;
    }

    /** ═══ NIVEL 1: cargar tasas.json del repo ═══
        Este archivo lo actualiza GitHub Actions diariamente vía cron.
        Sin CORS, sin API keys, sin latencia (es un archivo del mismo origen).
    */
    async loadFromJson() {
      try {
        // Cache-busting: añadir timestamp del día para que el SW no sirva
        // un tasas.json viejo cuando ya hay uno nuevo en el repo
        const today = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
        // FIX: Usar timeoutFetch (compatible con navegadores antiguos)
        const r = await timeoutFetch(
          './tasas.json?d=' + today,
          { cache: 'no-cache' },
          3000
        );
        if (!r.ok) return false;
        const data = await r.json();
        // El service worker responde con tasas de emergencia y un campo `error`
        // cuando no hay red ni caché: no deben reemplazar las tasas guardadas.
        if (data.error) return false;

        // Validar estructura: { updated_at, base, rates: { USD: ... } }
        if (!data.rates || typeof data.rates !== 'object') return false;
        // Validar USD: aceptar número o {bid,ask,mid}
        const usdMid = _midOf(data.rates.USD);
        if (!usdMid || usdMid < USD_HNL_VALID_RANGE.min || usdMid > USD_HNL_VALID_RANGE.max) {
          console.warn(`⚠️ USD/HNL fuera de rango en tasas.json: ${usdMid}`);
          return false;
        }

        // Mantener solo monedas soportadas, normalizando cada una a {bid,ask,mid}
        const filtered = {};
        Object.keys(CURRENCIES).forEach(c => {
          if (c === 'HNL') return;
          const n = _normalizeRate(data.rates[c]);
          if (n) filtered[c] = n;
        });

        if (Object.keys(filtered).length >= 3) {
          this.rates = filtered;
          this.ratesLastUpdate = data.updated_at ? new Date(data.updated_at) : new Date();
          this.ratesSource = 'json';
          this.ratesOrigin = /BCH/i.test(data.source || '') ? 'bch' : 'mercado';
          this.saveToStorage();
          console.log('✅ [Nivel 1] Tasas cargadas de tasas.json (formato v' + (data.format_version || 1) + '):', filtered);
          return true;
        }
      } catch (e) {
        console.log('ℹ️ [Nivel 1] tasas.json no disponible:', e.message);
      }
      return false;
    }

    /** ═══ NIVEL 2: API externa con failover ═══ */
    async loadFromApi() {
      const apis = [
        'https://open.er-api.com/v6/latest/USD',
        'https://api.exchangerate-api.com/v4/latest/USD'
      ];
      for (const apiUrl of apis) {
        try {
          // FIX: Usar timeoutFetch (compatible con navegadores antiguos)
          const r = await timeoutFetch(apiUrl, {}, 8000);
          if (!r.ok) continue;
          const data = await r.json();
          if (!data || !data.rates) continue;
          const usdToHnl = data.rates.HNL;
          // FIX: Validar rango realista (20-35) para detectar valores corruptos de la API
          if (!usdToHnl || 
              usdToHnl < USD_HNL_VALID_RANGE.min || 
              usdToHnl > USD_HNL_VALID_RANGE.max) {
            console.warn(`⚠️ USD/HNL fuera de rango en API: ${usdToHnl}`);
            continue;
          }

          // Calcular "1 X = Y HNL" vía cruzada con USD; las APIs públicas
          // solo retornan tasa media, así que derivamos bid/ask con spread implícito.
          const newRates = {};
          Object.keys(CURRENCIES).forEach(code => {
            if (code === 'HNL') return;
            let mid = null;
            if (code === 'USD') {
              mid = usdToHnl;
            } else if (data.rates[code] && data.rates[code] > 0) {
              const calculated = usdToHnl / data.rates[code];
              if (isFinite(calculated) && calculated > 0) mid = calculated;
            }
            if (mid !== null) {
              newRates[code] = {
                bid: mid * (1 - DEFAULT_SPREAD),
                ask: mid * (1 + DEFAULT_SPREAD),
                mid: mid
              };
            } else {
              console.warn(`⚠️ Tasa inválida para ${code}`);
            }
          });

          if (Object.keys(newRates).length >= 3) {
            this.rates = newRates;
            this.ratesLastUpdate = new Date();
            this.ratesSource = 'api';
            this.saveToStorage();
            console.log('✅ [Nivel 2] Tasas cargadas desde', apiUrl, '(bid/ask derivados con spread', (DEFAULT_SPREAD*200).toFixed(2)+'%)');
            return true;
          }
        } catch (e) {
          console.warn('[Nivel 2] API falló:', apiUrl, e.message);
        }
      }
      return false;
    }

    /** Carga inicial: intenta Nivel 1, después Nivel 2. */
    async initialLoad() {
      // Las tasas que el usuario escribió (las de su banco) mandan hasta que
      // toque "Auto"; antes, la siguiente carga las reemplazaba sin avisar
      if (this.ratesSource === 'manual') {
        console.log('ℹ️ Usando las tasas manuales del usuario');
        return;
      }
      // Si las tasas son recientes (< 24h) y vienen de json/api, no tocar
      if (!this.areRatesStale() && (this.ratesSource === 'json' || this.ratesSource === 'api')) {
        console.log('ℹ️ Tasas en caché aún frescas (' + this.ratesSource + ')');
        return;
      }
      // Intento 1: archivo estático del repo
      if (await this.loadFromJson()) return;
      // Intento 2: API externa (solo si hay internet)
      if (navigator.onLine && await this.loadFromApi()) return;
      // Si todo falla, mantenemos las DEFAULT_RATES (Nivel 3)
      console.log('⚠️ [Nivel 3] Usando tasas predeterminadas hardcoded');
    }

    /** Actualiza tasas manualmente o desde API (botón "🌐 Auto") */
    async updateExchangeRates(customRates = null) {
      if (customRates) {
        // Normalizar cada tasa nueva al formato {bid,ask,mid}
        const merged = { ...this.rates };
        Object.keys(customRates).forEach(code => {
          const n = _normalizeRate(customRates[code]);
          if (n) merged[code] = n;
        });
        this.rates = merged;
        this.ratesLastUpdate = new Date();
        this.ratesSource = 'manual';
        this.saveToStorage();
        return true;
      }
      // Botón "Auto": prefiere json si existe, después API
      if (await this.loadFromJson()) return true;
      if (await this.loadFromApi())  return true;
      return false;
    }

    /** Convierte HNL → moneda display. 
        El parámetro `side` define qué tasa usar:
          - 'buy'  / 'sell-foreign' → tasa ask: "si quisiera comprar esa moneda con mis lempiras"
          - 'sell' / 'buy-foreign'  → tasa bid: "si quisiera vender esa moneda y recibir lempiras"
          - 'mid'  / undefined      → tasa media (referencia)
        
        Por defecto usamos 'ask' porque el caso típico de ver tu balance L→USD es:
        "¿cuántos USD podría comprar con mis lempiras?" → tasa de venta del banco.
    */
    toDisplay(amountInHNL, side = 'ask') {
      if (this.displayCurrency === 'HNL') return amountInHNL;
      const r = this.getRate(this.displayCurrency);
      if (!r) return amountInHNL;
      let rate;
      if (side === 'bid' || side === 'sell' || side === 'buy-foreign') rate = r.bid;
      else if (side === 'mid') rate = r.mid;
      else rate = r.ask;  // 'ask' / 'buy' / 'sell-foreign' / default
      if (!rate || rate <= 0) return amountInHNL;
      return amountInHNL / rate;
    }

    /** Convierte moneda display → HNL.
        - 'sell-foreign' / 'buy' (default): tasa bid → "tengo USD y los cambio a HNL en el banco"
        - 'buy-foreign'  / 'sell':           tasa ask → "necesito HNL para comprar USD"
        - 'mid':                              tasa media (referencia)
    */
    toBase(amountInDisplay, side = 'bid') {
      if (this.displayCurrency === 'HNL') return amountInDisplay;
      const r = this.getRate(this.displayCurrency);
      if (!r) return amountInDisplay;
      let rate;
      if (side === 'ask' || side === 'sell' || side === 'buy-foreign') rate = r.ask;
      else if (side === 'mid') rate = r.mid;
      else rate = r.bid;  // 'bid' / 'buy' / 'sell-foreign' / default
      if (!rate || rate <= 0) return amountInDisplay;
      return amountInDisplay * rate;
    }

    format(amount, currency = null) {
      const code = currency || this.displayCurrency;
      const info = CURRENCIES[code];
      if (!info) return Number(amount).toFixed(2);
      const formatted = Number(amount).toLocaleString('en-US', {
        minimumFractionDigits: info.decimals,
        maximumFractionDigits: info.decimals
      });
      return info.format.replace('{amount}', formatted);
    }

    /** Formatea un monto en HNL en la moneda de display.
        Acepta opcionalmente un side ('ask'|'bid'|'mid') — por defecto 'ask'
        que es lo que el usuario espera al ver "cuánto valen mis lempiras". */
    formatFromBase(amountInHNL, side = 'ask') {
      return this.format(this.toDisplay(amountInHNL, side));
    }

    /** Etiqueta humana para la fuente actual de las tasas */
    getSourceLabel() {
      switch (this.ratesSource) {
        case 'json':   return this.ratesOrigin === 'bch' ? 'Banco Central de Honduras (se actualiza cada día)' : 'referencia del mercado internacional (se actualiza cada día)';
        case 'api':    return 'referencia del mercado internacional (en línea)';
        case 'manual': return 'las tasas de tu banco, escritas por ti';
        default:       return 'predeterminadas (sin conexión)';
      }
    }
  }

  window.currencyManager = new CurrencyManager();

  // Carga inicial automática al arrancar la app (no bloqueante)
  window.addEventListener('load', () => {
    setTimeout(() => {
      window.currencyManager.initialLoad().then(() => {
        // Re-render después de cargar tasas frescas
        if (typeof window.renderAll === 'function') window.renderAll();
        if (typeof window.renderCurrencySelector === 'function') {
          window.renderCurrencySelector('currency-selector-container');
        }
      });
    }, 1500);  // esperar a que la app cargue primero
  });
})();

/* ═══════════════════════════════════════════════════════════════════════
   CURRENCY UI v6.2 — selector + modal con dirección clara "1 X = Y HNL"
═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const cm = window.currencyManager;

  function renderCurrencySelector(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const currencies = cm.getAvailableCurrencies();
    const current = cm.displayCurrency;

    container.innerHTML = `
      <div class="currency-grid">
        ${currencies.map(c => `
          <div class="currency-card ${c.code === current ? 'selected' : ''}"
               data-currency="${c.code}"
               onclick="selectDisplayCurrency('${c.code}')">
            <div class="currency-flag">${c.flag}</div>
            <div class="currency-code">${c.code}</div>
            <div class="currency-symbol">${c.symbol}</div>
            ${c.code === current ? '<div class="currency-check">✓</div>' : ''}
          </div>
        `).join('')}
      </div>
      <div class="rates-info-box">
        <div class="rates-status">
          ${cm.areRatesStale()
            ? '<span style="color:var(--red)">⚠️ Tasas desactualizadas</span>'
            : '<span style="color:var(--green)">✓ Tasas actualizadas</span>'}
          ${cm.ratesLastUpdate ? '· ' + relTime(cm.ratesLastUpdate) : ' · sin sincronizar'}
          <br><span style="font-size:10px;opacity:.7">Fuente: ${cm.getSourceLabel()}</span>
        </div>
        <div class="rates-grid-pretty">
          ${Object.keys(cm.rates).filter(c => c !== 'HNL').map(code => {
            const info = cm.getCurrencyInfo(code) || {};
            const rateObj = cm.rates[code];
            const rate = typeof rateObj === 'number' ? rateObj : (rateObj ? rateObj.mid : 0);
            return `
              <div class="rate-pretty">
                <span class="rate-pretty-flag">${info.flag || ''}</span>
                <span class="rate-pretty-text">
                  <strong>1 ${code}</strong> =
                  <span style="color:var(--amber);font-weight:800">L. ${rate.toFixed(4)}</span>
                </span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function relTime(date) {
    const d = Date.now() - date.getTime();
    const m = Math.floor(d / 60000);
    if (m < 1) return 'hace instantes';
    if (m < 60) return 'hace ' + m + ' min';
    const h = Math.floor(d / 3600000);
    if (h < 24) return 'hace ' + h + ' h';
    return 'hace ' + Math.floor(d / 86400000) + ' días';
  }

  window.selectDisplayCurrency = function (code) {
    cm.setDisplayCurrency(code);
    renderCurrencySelector('currency-selector-container');
    if (typeof window.renderAll === 'function') window.renderAll();
  };

  window.openRatesModal = function () {
    let modal = document.getElementById('modal-rates');
    if (!modal) createRatesModal();
    renderRatesForm();
    document.getElementById('modal-rates').style.display = 'flex';
  };

  function createRatesModal() {
    const html = `
      <div id="modal-rates" class="modal" onclick="closeModalIfBg(event,'modal-rates')">
        <div class="modal-content" style="max-width:400px">
          <h3 style="margin-bottom:8px">📊 Tasas de Cambio</h3>
          <p style="font-size:12px;color:var(--text2);margin-bottom:8px;line-height:1.5">
            <strong style="color:var(--amber)">¿Cuántos lempiras vale 1 unidad de cada moneda?</strong>
            Ej: si <strong>1 USD = L 26.73</strong>, escribe <strong>26.73</strong> en USD.
          </p>
          <div id="rates-fuente" style="background:var(--bg3);border-left:3px solid var(--blue);border-radius:6px;padding:8px 10px;margin-bottom:12px;font-size:11px;color:var(--text2);line-height:1.5"></div>
          <div id="rates-form-container"></div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn btn-secondary" onclick="updateRatesFromAPI()" style="flex:1">🌐 Auto</button>
            <button class="btn btn-primary"   onclick="saveManualRates()"   style="flex:1">💾 Guardar</button>
          </div>
          <button class="btn btn-secondary" onclick="closeModal('modal-rates')" style="margin-top:8px">Cerrar</button>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function renderRatesForm() {
    const container = document.getElementById('rates-form-container');
    if (!container) return;
    const fuente = document.getElementById('rates-fuente');
    if (fuente) {
      const fecha = cm.ratesLastUpdate ? ' · ' + cm.ratesLastUpdate.toLocaleDateString('es-HN') : '';
      fuente.innerHTML = '📍 <strong>Fuente:</strong> ' + cm.getSourceLabel() + fecha + '<br>' +
        (cm.ratesSource === 'manual'
          ? 'Se mantienen hasta que toques <strong>🌐 Auto</strong>.'
          : '<strong>Cada banco cobra distinto</strong> (Promerica, BAC, Ficohsa…). Si quieres que la app use las de tu banco, escríbelas y toca <strong>💾 Guardar</strong>: se mantienen hasta que toques 🌐 Auto.');
    }
    const currencies = cm.getAvailableCurrencies().filter(c => c.code !== 'HNL');
    container.innerHTML = `
      <div style="background:var(--bg3);border-left:3px solid var(--amber);padding:12px;border-radius:8px;margin-bottom:14px;font-size:11px;color:var(--text2);line-height:1.5">
        💡 <strong>Compra</strong>: tasa cuando RECIBES esa moneda y la cambias a Lempiras (ej: te pagan en USD).<br>
        💡 <strong>Venta</strong>: tasa cuando NECESITAS esa moneda (ej: compras algo en USD o pagas un precio en USD).<br>
        Los bancos siempre cobran un margen entre las dos.
      </div>
    ` + currencies.map(c => {
      const r = cm.getRate(c.code) || { bid: 0, ask: 0, mid: 0 };
      return `
        <div class="rate-input-row-v3" style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="font-size:22px">${c.flag}</span>
            <div style="flex:1">
              <div style="font-weight:800;font-size:14px">1 ${c.code}</div>
              <div style="font-size:10px;color:var(--text2)">${c.name}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="display:block;font-size:10px;color:var(--green);font-weight:700;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">📥 Compra (bid)</label>
              <div style="display:flex;align-items:center;gap:4px">
                <input type="number" step="0.0001" min="0" class="input-field rate-input-bid"
                       data-currency="${c.code}"
                       value="${r.bid ? r.bid.toFixed(4) : ''}"
                       placeholder="0.0000"
                       style="margin:0;flex:1;font-size:13px;padding:8px">
                <span style="color:var(--green);font-weight:700;font-size:11px">L.</span>
              </div>
            </div>
            <div>
              <label style="display:block;font-size:10px;color:var(--red);font-weight:700;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">📤 Venta (ask)</label>
              <div style="display:flex;align-items:center;gap:4px">
                <input type="number" step="0.0001" min="0" class="input-field rate-input-ask"
                       data-currency="${c.code}"
                       value="${r.ask ? r.ask.toFixed(4) : ''}"
                       placeholder="0.0000"
                       style="margin:0;flex:1;font-size:13px;padding:8px">
                <span style="color:var(--red);font-weight:700;font-size:11px">L.</span>
              </div>
            </div>
          </div>
          ${r.mid ? `<div style="font-size:10px;color:var(--text2);margin-top:6px;text-align:center">Spread: ${(((r.ask - r.bid) / r.mid) * 100).toFixed(2)}% · Media: L. ${r.mid.toFixed(4)}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  window.saveManualRates = async function () {
    const bidInputs = document.querySelectorAll('.rate-input-bid');
    const askInputs = document.querySelectorAll('.rate-input-ask');
    const newRates = {};
    bidInputs.forEach(i => {
      const code = i.dataset.currency;
      const bid = parseFloat(i.value);
      const askInput = document.querySelector(`.rate-input-ask[data-currency="${code}"]`);
      const ask = askInput ? parseFloat(askInput.value) : null;
      if (bid > 0 && ask > 0) {
        if (ask < bid) {
          alert(`⚠️ Para ${code}: la tasa de venta debe ser mayor o igual a la de compra.`);
          return;
        }
        newRates[code] = { bid, ask, mid: (bid + ask) / 2 };
      } else if (bid > 0 && !ask) {
        // Si solo dieron bid, derivar ask con spread por defecto
        newRates[code] = {
          bid: bid,
          ask: bid * (1 + 0.005),
          mid: bid * (1 + 0.0025)
        };
      }
    });
    if (!Object.keys(newRates).length) { alert('⚠️ Ingresa al menos una tasa'); return; }
    await cm.updateExchangeRates(newRates);
    closeModal('modal-rates');
    renderCurrencySelector('currency-selector-container');
    if (typeof window.renderAll === 'function') window.renderAll();
    alert('✓ Tasas guardadas (con compra/venta)');
  };

  window.updateRatesFromAPI = async function () {
    const btn = event && event.target;
    const originalText = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '🔄 Conectando...'; btn.disabled = true; }
    const ok = await cm.updateExchangeRates();
    if (btn) { btn.textContent = originalText; btn.disabled = false; }
    if (ok) {
      renderRatesForm();
      renderCurrencySelector('currency-selector-container');
      if (typeof window.renderAll === 'function') window.renderAll();
      const sourceLabel = cm.getSourceLabel();
      const lines = Object.entries(cm.rates).filter(([k]) => k !== 'HNL').map(([k, v]) => {
        const r = (typeof v === 'object' && v.bid && v.ask)
          ? `Compra L. ${Number(v.bid).toFixed(4)} · Venta L. ${Number(v.ask).toFixed(4)}`
          : `L. ${Number(v).toFixed(4)}`;
        return `${k}: ${r}`;
      });
      alert('✓ Tasas actualizadas (' + sourceLabel + ')\n\n' + lines.join('\n'));
    } else {
      alert('❌ No se pudo conectar.\n\n• Verifica internet\n• O ingresa las tasas manualmente desde bch.hn');
    }
  };

  window.renderCurrencySelector = renderCurrencySelector;

  document.addEventListener('click', e => {
    const sb = e.target.closest('#sb-config, [onclick*="config"]');
    if (sb) setTimeout(() => renderCurrencySelector('currency-selector-container'), 100);
  });
  setTimeout(() => renderCurrencySelector('currency-selector-container'), 800);
})();

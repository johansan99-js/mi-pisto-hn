# Mi Pisto HN

**Registro contable y control de finanzas personales para Honduras.** 100% privado, con opción de sincronización cifrada en la nube, y usable sin internet.

🔗 App en vivo: https://johansan99-js.github.io/mi-pisto-hn/

---

## ¿Qué es?

Mi Pisto HN es una PWA (Progressive Web App) de finanzas personales pensada para el contexto hondureño: comercios locales, bancos locales, Lempiras como moneda base y tasas de cambio actualizadas automáticamente. Funciona como app instalable en Android (empaquetada como TWA para Google Play) y en cualquier navegador moderno.

Aplica el concepto de contabilidad de doble entrada: cada ingreso o gasto se imputa a una cuenta (Efectivo o Ahorro), y los saldos se derivan siempre de las transacciones registradas — nunca de un número guardado aparte que se pueda desincronizar.

## Funciones principales

**Registro de movimientos**
- Ingresos y gastos con categoría, comercio, banco, etiqueta y cuenta de pago (efectivo, ahorro o tarjeta de crédito)
- Sugerencias rápidas de comercios de San Pedro Sula (PriceSmart, Los Andes, Colonial, Shell, etc.)
- Escaneo de recibos con OCR (Tesseract.js) que extrae el monto total automáticamente de la foto
- Gastos divididos en varias categorías en un solo movimiento (ej. una factura de supermercado con comida + limpieza + higiene) sin tener que crear transacciones separadas
- Calculadora integrada en cualquier campo de monto — escribe `150+200` o `45.50*2` y se calcula solo
- Buscador en Gastos e Ingresos por categoría, comercio, etiqueta, banco o monto

**Cuentas y tarjetas**
- Transferencias entre Efectivo y Ahorro, manuales o **programadas** (automáticas cada mes en el día que elijas — ahorro mensual, cuota de préstamo, etc.)
- Conciliación de cuentas contra el saldo real (banco/conteo físico), con asiento auditable
- Gestión de tarjetas de crédito: fecha de corte, fecha de pago, saldo, pago mínimo estimado
- Préstamos bancarios/personales con cálculo de cuota y seguimiento de cuotas pagadas
- Dinero que te deben / que debes, con seguimiento de abonos

**Presupuesto y metas**
- Regla de distribución personalizable (65% Gastos / 20% Ahorro / 15% Extra por defecto)
- Barra de progreso real del presupuesto por mes (gastos fijos vs. extra) con alertas al 80% y 100%
- Metas de ahorro con abonos y barra de progreso
- Pagos recurrentes (servicios, suscripciones) con alertas antes del vencimiento
- Índice de Libertad Financiera: días de supervivencia sin ingresos según tu gasto fijo diario
- Liquidez proyectada a 7 días

**Estadísticas**
- Gastos por categoría con selector de mes y comparación de tendencia (▲▼) contra el mes anterior
- Evolución histórica de ingresos/gastos (últimos 6 meses)
- Distribución Vital vs. Ocio (gráfico de dona)
- Exportación a Excel (reporte profesional) y CSV (reporte completo)

**Multi-moneda**
- Soporta HNL, USD, EUR, GTQ, NIO, MXN, CRC con conversión automática al registrar
- Tasas de cambio actualizadas **automáticamente todos los días** vía GitHub Actions (fuente: BCH oficial cuando está disponible, si no, API pública con spread de compra/venta)

**Notificaciones**
- Alertas de vencimiento de pagos recurrentes, cuotas de préstamos y tarjetas de crédito
- Alertas de presupuesto al cruzar 80%/100% de gastos fijos o extra
- Recordatorio nocturno si no registraste ningún movimiento en el día

**Seguridad**
- PIN de 4 dígitos + biometría (huella/Face ID vía WebAuthn)
- Cifrado en reposo: AES-GCM-256 con clave derivada del PIN por PBKDF2 (patrón DEK/KEK — cambiar el PIN solo re-cifra la clave, no todos los datos)
- Bloqueo progresivo tras intentos fallidos de PIN (30s → 1min → 2min... hasta 30min)
- Auto-bloqueo si la app estuvo en segundo plano más de 60 segundos
- Sincronización en la nube opcional (Supabase) con los datos cifrados de extremo a extremo antes de subirlos — el sync solo mueve blobs cifrados, nunca datos en claro
- Merge inteligente de conflictos entre dispositivos (unión de transacciones por ID, con resolución asistida)
- Integridad de subrecursos (SRI) en las librerías cargadas por CDN (Chart.js, SheetJS, Supabase, Tesseract)
- Papelera de gastos con recuperación (nada se borra de inmediato)

**Offline-first**
- Service worker con caché de assets estáticos y fallback offline completo
- Funciona sin conexión; sincroniza cuando vuelve a haber internet

## Cómo se usa

1. Abre https://johansan99-js.github.io/mi-pisto-hn/ (o instala la app Android desde el paquete generado con PWABuilder)
2. Configura tu nombre y saldo inicial (efectivo/ahorro)
3. Crea un PIN de 6 a 8 dígitos — tus datos se cifran con eso
4. Registra tus movimientos; el dashboard, las estadísticas y las alertas se calculan solos

## Stack técnico

- **Frontend:** HTML/CSS/JS puro, sin build ni framework — se despliega directo a GitHub Pages:
  - `index.html`: el marcado de todas las pantallas y modales
  - `css/app.css`: todos los estilos
  - `js/00-config.js` … `js/14-ux.js`: el código, por tema. Son scripts clásicos que comparten el ámbito global y se cargan en el orden de `index.html`; una función usada **al cargar** debe estar en el mismo archivo o en uno anterior (`tests/arranque-sin-errores.test.js` lo vigila)
  - Al agregar un archivo a `js/` o `css/`, súmalo también a `ASSETS_REQUIRED` en `sw.js` para que funcione sin conexión (una prueba lo verifica)
- **Almacenamiento:** localStorage (cifrado) + IndexedDB como respaldo, todo en el dispositivo
- **Sync opcional:** Supabase (Postgres + Auth), solo blobs cifrados
- **OCR:** Tesseract.js (WebAssembly), cargado bajo demanda
- **Gráficos:** Chart.js
- **Exportación Excel:** SheetJS
- **App Android:** empaquetada como TWA (Trusted Web Activity) con PWABuilder/Bubblewrap — mismo código, sin duplicar lógica
- **Automatización:** GitHub Actions actualiza `tasas.json` diariamente (`.github/workflows/update-rates.yml`)

## Limitaciones conocidas (deuda técnica aceptada)

- El CSP mantiene `'unsafe-inline'` en `script-src`/`style-src` — la app usa `onclick=""` inline extensivamente; quitarlo requiere migrar a `addEventListener` en todo el archivo (refactor grande, pendiente)
- Sin build system: el código comparte el ámbito global entre archivos; las pruebas automáticas cubren los flujos críticos, no cada pantalla
- Sin importación automática de movimientos bancarios (Open Banking): el registro es manual, pegando o compartiendo el SMS del banco, o vía OCR de recibo

## Desarrollo local

No requiere build. Sirve los archivos con cualquier servidor estático:

```bash
python -m http.server 8000
# abrir http://localhost:8000/index.html
```

## Pruebas

Pruebas de extremo a extremo con Playwright sobre Chromium (`tests/`), con el runner nativo de Node. Se corren en cada pull request (`.github/workflows/tests.yml`).

```bash
npm ci
npx playwright install chromium   # la primera vez
npm test
```

Cubren: arranque, montos y saldos; PIN, cifrado, kit de recuperación y respaldo; tarjetas, Tasa Cero, conciliación y préstamos; sincronización y merge entre dispositivos (con un Supabase simulado); service worker y modo sin conexión. No usan red: el CDN, las APIs de tasas y Supabase se bloquean o se simulan.

## Aviso de responsabilidad

⚠️ Esta aplicación es una herramienta de gestión financiera personal. Los datos se almacenan **localmente en su dispositivo** (y, si activa la sincronización, de forma cifrada en la nube).

**Usted es responsable de:**
- Proteger su dispositivo con contraseña
- Realizar respaldos periódicos
- Mantener la confidencialidad de su PIN
- Guardar sus respaldos en un lugar seguro

**No nos hacemos responsables por:**
- Pérdida de datos por fallo del dispositivo
- Acceso no autorizado si no protege su dispositivo
- Pérdida de información por no hacer respaldos

Al usar esta app, usted acepta estos términos.

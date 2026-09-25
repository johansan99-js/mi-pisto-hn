# Seguridad — Mi Pisto HN

Última auditoría: **2026-09-22**. Este documento resume qué se probó, qué se encontró, qué se corrigió, y qué hacer si en el futuro sospechas un incidente.

## Modelo de amenaza

Mi Pisto HN es una PWA sin backend propio (solo Supabase para sync opcional). El dato más sensible es el `state` completo (transacciones, saldos, nombre) cifrado con AES-GCM-256, cuya llave (DEK) está cifrada con una KEK derivada del PIN vía PBKDF2. Los escenarios reales a defender:

1. **Alguien toma tu celular desbloqueado** → mitigado por auto-bloqueo a los 60s en segundo plano y bloqueo progresivo tras 5 PINs fallidos.
2. **Alguien roba el `localStorage`** (vía XSS, malware, o acceso físico con herramientas de desarrollo) → el dato sigue cifrado; el ataque se reduce a forzar el PIN offline.
3. **Alguien intercepta o accede a la base de datos en Supabase** → solo ve blobs cifrados (cifrado de extremo a extremo, el servidor nunca ve datos en claro), protegido además por RLS (cada usuario solo ve/escribe su propia fila).

## Pruebas realizadas (2026-09-22) y resultado

| Prueba | Resultado |
|---|---|
| Inyección XSS en el campo "Tu nombre" (`<img src=x onerror=...>`) | 🔴 **Vulnerable → corregido.** Se ejecutaba en la tarjeta de saludo. Ahora se rechaza `<`/`>` en el origen + se escapan todas las interpolaciones de `nombre` en `renderWelcome()`. |
| INSERT en `encrypted_states` sin sesión, suplantando otro `user_id` | 🟢 Bloqueado por RLS (401, "row-level security policy"). |
| UPDATE masivo en `encrypted_states` sin sesión | 🟢 0 filas afectadas (RLS filtra por `auth.uid() = user_id`, que es NULL sin sesión). |
| Forzar `sessionStorage.pinVerificado='true'` sin el PIN real | 🟡 Oculta la pantalla de bloqueo pero **no expone datos reales** — la DEK nunca se deriva sin pasar por `verificarPIN()`, así que el dashboard se ve vacío. No es una fuga de datos, pero es un candado cosmético — ver nota abajo. |
| Fuerza bruta offline del PIN (con el hash+salt reales) | 🔴 **Hallazgo crítico → corregido.** Un PIN de 4 dígitos completo (10,000 combinaciones) se prueba en ~162 segundos en una laptop normal. Ahora se permiten PINs de 4 a 8 dígitos (recomendado 6+). |
| Bloqueo de PIN tras 5 intentos fallidos (`localStorage`) | 🟡 Funciona para el flujo normal de la app, pero es evadible borrando la clave `pin_bloqueo_hasta` desde la consola del navegador — inherente a cualquier protección 100% del lado del cliente sin servidor. Ver "Riesgos aceptados". |

## Riesgos aceptados (documentados, no corregidos)

Estos son reales pero requieren reescrituras grandes o no tienen arreglo posible sin backend propio — decisión consciente, no descuido:

- **`unsafe-inline` en el CSP** (`script-src`/`style-src`): la app usa `onclick=""` inline en cientos de lugares. Quitarlo requiere migrar todo a `addEventListener`.
- **Bloqueo de PIN evadible con acceso a DevTools**: cualquier rate-limit puramente client-side se puede desactivar si el atacante ya tiene ese nivel de acceso al dispositivo. Sin servidor propio no hay forma de cerrarlo del todo.
- **PBKDF2 en 100k/250k iteraciones**: por debajo del estándar 2026, pero subirlo rompería el acceso a datos ya cifrados de usuarios existentes. El PIN más largo (ya corregido arriba) es la mitigación real; las iteraciones son secundarias frente a un keyspace tan chico.
- **Sin módulos ni build system:** el código está repartido por tema en `js/`, pero comparte el ámbito global; aislar módulos de verdad requiere un build system.

## Qué hacer si sospechas un incidente futuro

**Si crees que alguien pudo ver los datos de un usuario en Supabase:**
1. Verifica RLS: `select tablename, rowsecurity from pg_tables where tablename in ('encrypted_states','device_log');` — ambas deben dar `true`.
2. Revisa políticas activas: `select * from pg_policies where tablename in ('encrypted_states','device_log');`
3. Si algo está mal, vuelve a correr el SQL de este mismo repo (ver commit `22d6eb4` y conversación del `22-sep-2026`) que crea las tablas + políticas desde cero.

**Si sospechas que el anon key de Supabase fue usado para abuso (spam de filas, etc.):**
1. Dashboard → Settings → API → regenerar el `anon key`.
2. Actualizar `CLOUD_SYNC_CONFIG.anonKey` en `js/12-nube.js` con el nuevo valor y hacer commit/push.
3. Esto NO afecta el cifrado de los datos (la anon key nunca protegió los datos en sí, solo el acceso a la tabla — la protección real es RLS + cifrado E2E).

**Si encuentras un campo de texto libre nuevo que se renderiza en pantalla:**
- Antes de mergear, confirma que pase por `esc()` en CUALQUIER `innerHTML`. Si solo usa `.textContent`, no hace falta.
- Prueba rápida: mete `<img src=x onerror=alert(1)>` en el campo y revisa si aparece un alert.

**Si un usuario reporta que perdió el acceso a sus datos (olvidó el PIN):**
- No hay recuperación posible por diseño (cifrado E2E real, ni el desarrollador puede leerlo). Solo queda restaurar desde un respaldo exportado (`exportDataEncriptado()`) si lo tiene, o empezar de cero.

## Cómo volver a correr esta auditoría

La mayoría de estas pruebas se hicieron con JavaScript directo en la consola del navegador, contra `https://johansan99-js.github.io/mi-pisto-hn/` en una pestaña aislada (sin tocar datos reales). Están documentadas en la conversación del 22-sep-2026 con Claude — pídele a Claude que "repita la auditoría de seguridad" y puede rehacer los mismos 6 ataques descritos arriba.

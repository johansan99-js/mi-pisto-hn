# Publicar Mi Pisto HN en Google Play

La app es una PWA. Para Play Store se empaqueta como **TWA** (Trusted Web Activity): una app Android que abre la PWA en Chrome sin barra de navegador. No hay que reescribir nada; lo que cambie en `main` llega a la app de Play al publicarse en GitHub Pages.

Requisitos de Google revisados el 26 de septiembre de 2026.

## Lista de pendientes

- [x] **Correo de contacto:** `mipistohn@gmail.com` (ya está en `privacidad.html`; úsalo también en la ficha de Play).
- [ ] **Cuenta de desarrollador:** crearla en Play Console y pagar los US$25 (paso 0). Va primero porque Google tarda unos días en verificar la identidad.
- [ ] **Paquete Android:** generarlo con PWABuilder, con API 36 (paso 2).
- [ ] **Digital Asset Links:** poner el paquete y las huellas definitivas en `johansan99-js.github.io/.well-known/assetlinks.json` (paso 4). Ese archivo y `.nojekyll` ya existen, pero con `io.github.johansan99_js.twa`, el paquete de una prueba del 17 de septiembre. Sin las huellas correctas, la app muestra la barra de direcciones de Chrome.
- [ ] **Prueba cerrada:** 12 testers durante 14 días (obligatoria para cuentas personales nuevas).
- [ ] **Ficha, formularios y solicitud de producción** (pasos 5 y 6).

Ya está listo en el repositorio:
- `privacidad.html`: política de privacidad con sección para eliminar la cuenta.
- El botón en la app para eliminar la cuenta y los datos de la nube (función `eliminar_mi_cuenta` en Supabase).
- Íconos `maskable`, `id` y capturas en `manifest.json`.
- Las imágenes de la ficha, en esta carpeta.

## 0. Crear la cuenta de desarrollador (US$25, una sola vez)

**Ten a mano:**
- **La cuenta de Google que será dueña de la app.** Usa `mipistohn@gmail.com` con la verificación en 2 pasos activada. No uses un correo del trabajo: la app queda ligada a esa cuenta para siempre.
- **Tu DNI o pasaporte vigente.** El nombre legal que escribas tiene que ser igual al del documento.
- **Una tarjeta de crédito o débito a tu nombre.** No aceptan tarjetas prepago. Si tu banco bloquea las compras internacionales en línea, actívalas antes de pagar.
- **Un teléfono y un correo de contacto** que puedas verificar con un código.
- **Un teléfono Android físico** con Android 10 o más y sin root, para la verificación del dispositivo.

**Pasos:**
1. Entra a <https://play.google.com/console/signup> con la cuenta de Google que elegiste.
2. **Tipo de cuenta: Personal.** La de organización pide número D-U-N-S y una empresa registrada a nombre de la app. Con la personal hay que hacer la prueba cerrada de 14 días (paso 7); con la de organización no.
3. Llena el perfil:
   - **Nombre de desarrollador** (el que ve la gente en Play): `Mi Pisto HN`.
   - **Nombre legal y dirección:** los de tu DNI.
   - **Correo y teléfono de contacto:** `mipistohn@gmail.com` y tu número.
   - Responde las preguntas sobre tu experiencia y la app.
4. Paga los **US$25** con la tarjeta. Es un pago único y no se devuelve. Te llega un correo de confirmación.
5. **Verifica tu identidad:** sube la foto del DNI o del pasaporte (a veces piden una selfie) y escribe los códigos que llegan al teléfono y al correo de contacto.
6. **Verifica el dispositivo:** instala la app **Google Play Console** en tu Android, entra con la misma cuenta y toca **Verificar** en la tarea "Verifica que tienes acceso a un dispositivo móvil Android".

Mientras Google revisa la identidad, puedes ir generando el paquete (paso 2). La verificación de desarrolladores de Android que empezó en 2026 no pide nada extra: la app queda registrada sola al crearla en Play Console.

## 1. Antes de empaquetar

1. Confirma que `https://johansan99-js.github.io/mi-pisto-hn/` carga la última versión y que `https://johansan99-js.github.io/mi-pisto-hn/privacidad.html` abre.
2. Ten a mano el correo de contacto y un nombre de paquete definitivo, por ejemplo `hn.mipisto.app`. **El nombre de paquete no se puede cambiar después de publicar.**
   El `assetlinks.json` de hoy usa `io.github.johansan99_js.twa`, el nombre que PWABuilder pone solo. Como la app no está publicada, todavía puedes elegir. Si te quedas con ese nombre, usa la misma llave `.keystore` de esa vez; si no la tienes, genera todo nuevo con `hn.mipisto.app`.

## 2. Generar el paquete con PWABuilder

1. Entra a <https://www.pwabuilder.com>, pega `https://johansan99-js.github.io/mi-pisto-hn/` y toca **Start**.
2. **Package for stores → Android → Generate Package**. En las opciones:
   - **Package ID:** `hn.mipisto.app` (o el que elegiste).
   - **App name:** `Mi Pisto HN` · **Launcher name:** `Mi Pisto HN`.
   - **Display mode:** Standalone · **Status bar color / Nav bar color:** `#000000` (el mismo `theme_color` de `manifest.json`).
   - **Signing key:** *Create new*. Llena los datos (nombre, organización `Mi Pisto HN`, país `HN`).
3. Descarga el ZIP. Contiene:
   - el `.aab` que se sube a Play;
   - el archivo de firma `.keystore` con sus contraseñas en `signing-key-info.txt`;
   - un `assetlinks.json` de ejemplo.

> ⚠️ **Guarda el `.keystore` y sus contraseñas fuera del teléfono y fuera del repositorio** (por ejemplo, en un gestor de contraseñas). Sin ellos no puedes publicar actualizaciones de la app.

**API 36:** desde el 31 de agosto de 2026, Google Play solo acepta apps nuevas que apunten a Android 16 (API 36). PWABuilder arma el paquete con Bubblewrap, que pasó a API 36 en su versión 1.25.0, pero PWABuilder puede tardar en usar la versión nueva. El paquete de la prueba del 17 de septiembre pudo salir con API 35: lo más seguro es generar uno nuevo. Si al subir el `.aab` Play Console dice que apunta a una API menor, vuelve a generarlo. Si PWABuilder sigue dando API 35, usa Bubblewrap 1.25.0 o más nuevo en la compu, con JDK 17:

```bash
npx @bubblewrap/cli init --manifest=https://johansan99-js.github.io/mi-pisto-hn/manifest.json
npx @bubblewrap/cli build
```

## 3. Crear la app en Play Console

1. <https://play.google.com/console> → **Crear app**:
   - **Nombre:** `Mi Pisto HN: Finanzas y Gastos` (el mismo de la ficha).
   - **Idioma:** Español (Latinoamérica).
   - **Tipo:** App · **Gratis**.
2. **Probar y publicar → Prueba cerrada → Crear versión:** sube el `.aab`. Acepta **Firma de apps de Play**.
3. **Configuración → Integridad de la app → Firma de apps:** copia las dos huellas **SHA-256**, la de la clave de firma de apps y la de la clave de subida.

## 4. Digital Asset Links (la huella de la app en tu sitio)

Android verifica que la app y el sitio son del mismo dueño leyendo `https://johansan99-js.github.io/.well-known/assetlinks.json`. Tiene que estar en la **raíz del dominio**, no dentro de `/mi-pisto-hn/`, así que va en el repositorio `johansan99-js/johansan99-js.github.io`:

```
.well-known/assetlinks.json
.nojekyll          ← archivo vacío; sin él GitHub Pages ignora las carpetas que empiezan con punto
```

Los dos archivos ya están en ese repositorio desde el 17 de septiembre. Solo hay que reemplazar el contenido de `assetlinks.json`, que hoy tiene el paquete de prueba `io.github.johansan99_js.twa` y una sola huella, por este, con las dos huellas del paso 3:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "hn.mipisto.app",
    "sha256_cert_fingerprints": [
      "AA:BB:...:ZZ  (clave de firma de apps de Play)",
      "11:22:...:99  (clave de subida)"
    ]
  }
}]
```

Compruébalo con <https://developers.google.com/digital-asset-links/tools/generator>.

## 5. Ficha de Play Store

El texto completo, listo para copiar, está en [`ficha.md`](ficha.md).

**Nombre (30):** `Mi Pisto HN: Finanzas y Gastos`

**Descripción breve (72 de 80):** `Anota tus gastos en segundos y controla tus lempiras, tarjetas y deudas.`

**Categoría:** Finanzas · **Correo:** `mipistohn@gmail.com` · **Política de privacidad:** `https://johansan99-js.github.io/mi-pisto-hn/privacidad.html`

**Imágenes (en esta carpeta):**
- **Ícono:** `icono-512.png` (512×512, cuadrado y sin transparencia: Google le pone las esquinas). Todos los íconos salen de `node play-store/generar-icono.js` (una flecha verde que sube, dibujo propio).
- **Gráfico destacado:** `grafico-destacado.png` (1024×500), en el verde de la app con la guacamaya y la pantalla de Análisis. Se rehace con `node play-store/generar-grafico-destacado.js`. `grafico-destacado-quincenas.png` es del diseño anterior (vino y dorado); la idea detrás de ese diseño está en `filosofia-diseno.md`.
- **Capturas de teléfono:** `capturas-ficha/` (1080×1920, en orden). Cada una tiene un título arriba y la pantalla real de la app debajo, con datos de ejemplo:
  1. Tu mes, día por día · 2. Anota en 3 toques (el teclado) · 3. Análisis con la dona · 4. Presupuesto por quincena · 5. Cuentas y tarjetas · 6. El dólar de tu banco · 7. Plan para salir de deudas · 8. Claro u oscuro.
  Van en tema claro y oscuro, alternados, con la guacamaya arriba. Para rehacerlas después de cambiar la app: `node play-store/generar-capturas.js`. Usa el navegador de las pruebas y la fuente Outfit de `fuentes/`, con licencia OFL.
  `manifest.json` usa estas mismas capturas para la pantalla de instalación de la app. Las del diseño anterior siguen en `capturas/`.

## 6. Formularios de Contenido de la app

**Seguridad de los datos** (respuestas según lo que hace el código hoy):

| Pregunta | Respuesta |
|---|---|
| ¿Recopila o comparte datos? | Sí, recopila (solo si el usuario activa la sincronización). No comparte con terceros. |
| Información personal → Dirección de correo | Recopilada · Opcional · Administración de la cuenta |
| Información financiera → Otra información financiera | Recopilada · Opcional · Funcionalidad de la app. Es la copia cifrada de extremo a extremo; se declara igual por prudencia. |
| ID del dispositivo u otros ID | Recopilado · Opcional · Funcionalidad de la app (identificador aleatorio para la lista de dispositivos) |
| Audio → Grabaciones de voz o sonido | Recopilado · Opcional · **Procesado de forma efímera** (no se guarda) · Funcionalidad de la app · No se comparte. Solo mientras el usuario toca 🎤 para dictar; el reconocimiento lo hace el servicio de voz de Google del teléfono y la app solo recibe el texto. |
| Información financiera → Historial de compras | **Solo cuando actives Premium.** Recopilado · Opcional · Funcionalidad de la app (el comprobante de Google Play para saber si la suscripción sigue vigente). Mientras Premium esté apagado, no lo marques. |
| ¿Datos cifrados en tránsito? | Sí (HTTPS) |
| ¿El usuario puede pedir que se borren? | Sí. En la app (Config → Sincronización → Eliminar mi cuenta) y en `https://johansan99-js.github.io/mi-pisto-hn/privacidad.html#eliminar` |

Notas para el formulario:
- **Permisos de Android:** el paquete de PWABuilder no pide el permiso de micrófono; lo pide Chrome la primera vez que alguien toca 🎤 y la persona puede negarlo (la app deja escribir la frase).
- La política de privacidad ya explica el dictado, la imagen de "Tu mes" y las compras: `privacidad.html`.

**Otras secciones:**
- **Acceso a la app:** "Todas las funciones están disponibles sin cuenta. Al abrir, crea un PIN de 6 dígitos cualquiera. La sincronización con Google es opcional."
- **Anuncios:** No contiene anuncios.
- **ID de publicidad:** No. La app no tiene anuncios ni analítica.
- **Público objetivo:** 18 años o más. Evita las reglas de apps para niños; es una app de finanzas.
- **Clasificación de contenido:** responde el cuestionario (sin violencia, apuestas ni contenido de usuarios compartido).
- **Funciones financieras:** declara que es una herramienta de gestión de finanzas personales y presupuesto. No ofrece préstamos, pagos, transferencias de dinero, inversiones ni criptomonedas.

## 7. Prueba cerrada y producción

1. En **Prueba cerrada**, agrega al menos **12 testers** (lista de correos de Google). Deben aceptar la invitación e instalar la app. El mensaje para invitarlos está en [`mensaje-testers.md`](mensaje-testers.md).
2. Mantén la prueba activa **14 días seguidos**. Pide a los testers que la usen: Google revisa que haya uso real.
3. Luego, **Solicitar acceso a producción** y responde el cuestionario sobre la prueba.

## 8. Activar Mi Pisto Premium (cuando quieras cobrar)

El código ya está listo en `js/21-premium.js`, pero apagado (`PREMIUM.activo = false`). Mientras siga apagado, `tienePremium()` responde que sí a todos y nada se bloquea.

**Qué es gratis y qué es Premium**

| Gratis | Premium |
|---|---|
| Todo lo demás: registrar, análisis, metas, deudas, tarjetas, nube, Excel, categorías propias… | Reporte del mes en PDF |
| Hasta 3 cuentas además de Efectivo y Ahorro | Cuentas sin límite |
| 1 grupo de gastos compartidos | Grupos sin límite |
| Hasta 3 presupuestos | Presupuestos sin límite |

Los límites solo frenan **crear uno más**. Lo que la persona ya tenía se sigue viendo, editando y borrando. Al llegar al límite, la app explica por qué y ofrece ver Premium.

**Pasos**

1. En Play Console, entra a **Monetizar → Productos → Suscripciones** y crea dos suscripciones, cada una con un plan base que se renueva solo:
   - `mipisto_premium_mensual`: cada mes, **L 25**.
   - `mipisto_premium_anual`: cada año, **L 199**.

   No agregues prueba gratis en Play: la app ya da 30 días sin pedir tarjeta.
2. Regenera el `.aab` en PWABuilder con **la misma clave** y activa **Play Billing** (Digital Goods API).
3. Cambia `PREMIUM.activo` a `true` en `js/21-premium.js`. Si cambiaste los precios en Play, cámbialos también en `PREMIUM.planes` (dentro de la app se muestra el precio que devuelve Play, pero así la ficha y el código dicen lo mismo).
4. Agrega a la ficha una línea con los precios (ver `ficha.md`).
5. Pruébalo con una cuenta de prueba de licencias de Play Console: compra un plan, cancélalo y vuelve a abrir la app para ver que se apaga.

Cada vez que se abre la app instalada desde Play, se le pregunta a Google Play si la suscripción sigue vigente. Si se canceló o venció, Premium se apaga solo (sin tocar los datos); si se pagó en otro teléfono con la misma cuenta de Google, se activa solo.

Reglas que no se rompen (salen de las quejas en las opiniones de otras apps):
- Los datos nunca se bloquean: si el Premium termina, la persona sigue viendo, editando y exportando todo.
- El botón **Restaurar mi compra** está siempre visible, y explica qué hacer si la compra se hizo con otra cuenta de Google.
- El precio y el tipo de pago se dicen antes de comprar.

## Actualizaciones

- **Cambios de la web** (todo lo de `index.html`, `js/`, `css/`, `sw.js`, etc.): llegan solos a la app de Play al publicarse en GitHub Pages, sin subir nada nuevo.
- **Nuevo `.aab`:** solo hace falta si cambia algo de la app Android (nombre, ícono de lanzador, colores de la barra, versión mínima de Android). Se regenera en PWABuilder con **la misma clave** (`.keystore`) y un número de versión mayor.

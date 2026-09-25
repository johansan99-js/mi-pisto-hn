# Publicar Mi Pisto HN en Google Play

La app es una PWA. Para Play Store se empaqueta como **TWA** (Trusted Web Activity): una app Android que abre la PWA en Chrome sin barra de navegador. No hay que reescribir nada; lo que cambie en `main` llega a la app de Play al publicarse en GitHub Pages.

## Lista de pendientes

- [x] **Correo de contacto:** `mipistohn@gmail.com` (ya está en `privacidad.html`; úsalo también en la ficha de Play).
- [ ] **Paquete Android:** generarlo con PWABuilder (paso 2).
- [ ] **Cuenta de desarrollador:** crearla en Play Console (pago único de US$25).
- [ ] **Digital Asset Links:** publicar `assetlinks.json` en `johansan99-js.github.io` (paso 4). Sin esto, la app muestra la barra de direcciones de Chrome.
- [ ] **Prueba cerrada:** 12 testers durante 14 días (obligatoria para cuentas personales nuevas).
- [ ] **Ficha, formularios y solicitud de producción** (pasos 5 y 6).

Ya está listo en el repositorio:
- `privacidad.html`: política de privacidad con sección para eliminar la cuenta.
- El botón en la app para eliminar la cuenta y los datos de la nube (función `eliminar_mi_cuenta` en Supabase).
- Íconos `maskable`, `id` y capturas en `manifest.json`.
- Las imágenes de la ficha, en esta carpeta.

## 1. Antes de empaquetar

1. Confirma que `https://johansan99-js.github.io/mi-pisto-hn/` carga la última versión y que `https://johansan99-js.github.io/mi-pisto-hn/privacidad.html` abre.
2. Ten a mano el correo de contacto y un nombre de paquete definitivo, por ejemplo `hn.mipisto.app`. **El nombre de paquete no se puede cambiar después de publicar.**

## 2. Generar el paquete con PWABuilder

1. Entra a <https://www.pwabuilder.com>, pega `https://johansan99-js.github.io/mi-pisto-hn/` y toca **Start**.
2. **Package for stores → Android → Generate Package**. En las opciones:
   - **Package ID:** `hn.mipisto.app` (o el que elegiste).
   - **App name:** `Mi Pisto HN` · **Launcher name:** `Mi Pisto HN`.
   - **Display mode:** Standalone · **Status bar color / Nav bar color:** `#130507`.
   - **Signing key:** *Create new*. Llena los datos (nombre, organización `Mi Pisto HN`, país `HN`).
3. Descarga el ZIP. Contiene:
   - el `.aab` que se sube a Play;
   - el archivo de firma `.keystore` con sus contraseñas en `signing-key-info.txt`;
   - un `assetlinks.json` de ejemplo.

> ⚠️ **Guarda el `.keystore` y sus contraseñas fuera del teléfono y fuera del repositorio** (por ejemplo, en un gestor de contraseñas). Sin ellos no puedes publicar actualizaciones de la app.

## 3. Crear la app en Play Console

1. <https://play.google.com/console> → **Crear app**:
   - **Nombre:** `Mi Pisto HN: Finanzas Honduras`.
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

Contenido de `assetlinks.json`, con las dos huellas del paso 3:

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
- **Ícono:** `../icon-512.png` (512×512).
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

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

**Descripción breve (74 de 80):** `Controla tus lempiras: presupuesto por quincena, tarjetas, deudas y dólar.`

**Categoría:** Finanzas · **Correo:** `mipistohn@gmail.com` · **Política de privacidad:** `https://johansan99-js.github.io/mi-pisto-hn/privacidad.html`

**Imágenes (en esta carpeta):**
- **Ícono:** `../icon-512.png` (512×512).
- **Gráfico destacado:** `grafico-destacado.png` (1024×500). Alternativa: `grafico-destacado-quincenas.png`, con un anillo de 365 días que marca en dorado las 24 quincenas. La idea detrás del diseño está en `filosofia-diseno.md`.
- **Capturas de teléfono:** `capturas-ficha/` (1080×1920, en orden). Cada una tiene un título arriba y la pantalla real de la app debajo, con datos de ejemplo:
  1. Presupuesto por quincena · 2. Mis cuentas · 3. El dólar de tu banco · 4. Tarjetas (el verdadero costo) · 5. Plan para salir de deudas · 6. Gastos compartidos · 7. Resumen del mes · 8. Privado (modo discreto).
  Para rehacerlas después de cambiar la app: `node play-store/generar-capturas.js`. Usa el navegador de las pruebas y la fuente Outfit de `fuentes/`, con licencia OFL.
  Las capturas anteriores siguen en `capturas/`, porque las usa `manifest.json`.

## 6. Formularios de Contenido de la app

**Seguridad de los datos** (respuestas según lo que hace el código hoy):

| Pregunta | Respuesta |
|---|---|
| ¿Recopila o comparte datos? | Sí, recopila (solo si el usuario activa la sincronización). No comparte con terceros. |
| Información personal → Dirección de correo | Recopilada · Opcional · Administración de la cuenta |
| Información financiera → Otra información financiera | Recopilada · Opcional · Funcionalidad de la app. Es la copia cifrada de extremo a extremo; se declara igual por prudencia. |
| ID del dispositivo u otros ID | Recopilado · Opcional · Funcionalidad de la app (identificador aleatorio para la lista de dispositivos) |
| ¿Datos cifrados en tránsito? | Sí (HTTPS) |
| ¿El usuario puede pedir que se borren? | Sí. En la app (Config → Sincronización → Eliminar mi cuenta) y en `https://johansan99-js.github.io/mi-pisto-hn/privacidad.html#eliminar` |

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

1. En Play Console, entra a **Monetizar → Productos → Suscripciones** y crea `mipisto_premium`, con precio en lempiras y 30 días de prueba gratis.
2. Regenera el `.aab` en PWABuilder con **la misma clave** y activa **Play Billing** (Digital Goods API).
3. Cambia `PREMIUM.activo` a `true`. Ajusta `PREMIUM.precio` y `PREMIUM.tipo` para que digan lo mismo que la ficha, y agrega a la ficha una línea con el precio.
4. Pruébalo con una cuenta de prueba de licencias de Play Console.

Reglas que no se rompen (salen de las quejas en las opiniones de otras apps):
- Los datos nunca se bloquean: si el Premium termina, la persona sigue viendo, editando y exportando todo.
- El botón **Restaurar mi compra** está siempre visible, y explica qué hacer si la compra se hizo con otra cuenta de Google.
- El precio y el tipo de pago se dicen antes de comprar.

## Actualizaciones

- **Cambios de la web** (todo lo de `index.html`, `js/`, `css/`, `sw.js`, etc.): llegan solos a la app de Play al publicarse en GitHub Pages, sin subir nada nuevo.
- **Nuevo `.aab`:** solo hace falta si cambia algo de la app Android (nombre, ícono de lanzador, colores de la barra, versión mínima de Android). Se regenera en PWABuilder con **la misma clave** (`.keystore`) y un número de versión mayor.

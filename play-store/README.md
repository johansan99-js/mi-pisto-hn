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

**Nombre (30):** `Mi Pisto HN: Finanzas Honduras`

**Descripción breve (80):** `Controla tu dinero en lempiras: cuentas, tarjetas y metas. Privado y offline.`

**Descripción completa:**

```
Mi Pisto HN es la app de finanzas personales hecha para Honduras: en lempiras, con las tarjetas y bancos que usas, y con tus datos solo en tu teléfono.

💵 TUS CUENTAS AL DÍA
• Efectivo y ahorro con saldos que salen de tus movimientos
• Ingresos y gastos por categoría, con etiquetas y gastos divididos
• Transferencias entre cuentas, manuales o programadas cada mes
• Escanea tus facturas: el monto se lee con la cámara, sin enviar la foto a ningún lado
• Pega o comparte el SMS de tu banco y el gasto se llena solo
• Recordatorio diario para anotar tus gastos, a la hora que elijas

💳 TARJETAS SIN SORPRESAS
• Fecha de corte, fecha de pago, pago mínimo y cupo disponible
• "El verdadero costo": cuánto tiempo e intereses te cuesta pagar solo el mínimo
• Compras a cuotas Tasa Cero: cupo comprometido y cuota de cada mes
• Concilia con tu estado de cuenta y registra seguros, membresías y comisiones

🎯 METAS, DEUDAS Y PRÉSTAMOS
• Metas de ahorro con avance
• Préstamos con saldo real, intereses incluidos
• Dinero que te deben y que debes, con abonos
• Pagos recurrentes con recordatorios

📊 PARA DECIDIR MEJOR
• Liquidez de los próximos 7 días
• Índice de libertad financiera: cuántos días aguantas sin ingresos
• Regla de presupuesto 65/20/15 personalizable
• Tipo de cambio del día y compras en dólares
• Exporta a Excel

🔒 TU PRIVACIDAD PRIMERO
• Tus datos se guardan cifrados (AES-256) en tu teléfono, protegidos con tu PIN
• Funciona sin internet
• Sin anuncios y sin rastreadores
• Sincronización en la nube opcional, cifrada antes de salir de tu teléfono con una contraseña que solo tú conoces
• Modo discreto para ocultar montos en público
• Kit de recuperación por si olvidas tu PIN

Mi Pisto HN no pide números de tarjeta, CVV ni claves de banco.
```

**Categoría:** Finanzas · **Correo:** `mipistohn@gmail.com` · **Política de privacidad:** `https://johansan99-js.github.io/mi-pisto-hn/privacidad.html`

**Imágenes (en esta carpeta):**
- **Ícono:** `../icon-512.png` (512×512).
- **Gráfico destacado:** `grafico-destacado.png` (1024×500).
- **Capturas de teléfono:** `capturas/` (1080×1920, en orden). Los datos son de ejemplo.

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

1. En **Prueba cerrada**, agrega al menos **12 testers** (lista de correos de Google). Deben aceptar la invitación e instalar la app.
2. Mantén la prueba activa **14 días seguidos**. Pide a los testers que la usen: Google revisa que haya uso real.
3. Luego, **Solicitar acceso a producción** y responde el cuestionario sobre la prueba.

## Actualizaciones

- **Cambios de la web** (todo lo de `index.html`, `js/`, `css/`, `sw.js`, etc.): llegan solos a la app de Play al publicarse en GitHub Pages, sin subir nada nuevo.
- **Nuevo `.aab`:** solo hace falta si cambia algo de la app Android (nombre, ícono de lanzador, colores de la barra, versión mínima de Android). Se regenera en PWABuilder con **la misma clave** (`.keystore`) y un número de versión mayor.

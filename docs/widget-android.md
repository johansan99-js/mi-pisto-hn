# Widget de Mi Pisto HN para Android

El widget es un recuadro en la pantalla principal del teléfono con 4 botones: **➖ Gasto · ➕ Ingreso · 🎤 Dictar · 🔁 Pago fijo**. También hay uno chiquito de 1×1 que solo sirve para **dictar**.

Cada botón abre la app directo en esa acción. Si la persona tiene PIN, el gasto, el ingreso y el dictado se anotan **sin desbloquear**: solo se puede agregar y nadie ve nada. El widget **no guarda ni lee datos**; todo sigue cifrado dentro de la app.

> Solo funciona en la versión de **Play Store**, porque es código nativo de Android. Quien usa la app desde el navegador tiene los atajos del ícono, que se pueden arrastrar a la pantalla principal.

## Lo que hay en el repositorio

```
android/widget/
├── java/hn/mipisto/app/
│   ├── MiPistoWidget.java          ← widget de 4 botones
│   └── MiPistoWidgetDictar.java    ← widget de 1×1 para dictar
├── res/
│   ├── layout/widget_mipisto.xml, widget_mipisto_dictar.xml
│   ├── xml/widget_mipisto_info.xml, widget_mipisto_dictar_info.xml
│   ├── drawable/widget_fondo.xml, widget_boton.xml
│   └── values/widget_mipisto.xml   ← textos, colores y LA DIRECCIÓN de la app
└── AndroidManifest-fragmento.xml   ← lo que se pega en el AndroidManifest
```

## Antes de empezar (una sola vez)

1. **El ZIP que te dio PWABuilder** cuando generaste la app. Dentro vienen dos archivos que **no puedes perder**:
   - `signing.keystore`: la llave con la que firmas la app;
   - `signing-key-info.txt`: el alias y las contraseñas de esa llave.

   Play Store solo acepta actualizaciones firmadas con **esa misma llave**. Si no encuentras el ZIP, avísame antes de seguir.
2. **Node.js** (gratis): descarga la versión LTS de nodejs.org e instálala.
3. **El número de versión actual** de la app en Play Store: Play Console → tu app → *Versiones* → mira el **código de versión** (versionCode) de la última. La nueva tiene que ser **mayor**.

## Paso a paso

### 1. Crear el proyecto de Android con Bubblewrap

Bubblewrap es la herramienta gratis de Google que usa PWABuilder por dentro. La primera vez descarga sola lo que falta (Java y el SDK de Android); dile que **sí** a todo lo que ofrezca instalar.

Abre una terminal (en Windows: *PowerShell*) y escribe:

```bash
npm install -g @bubblewrap/cli
mkdir mipisto-android
cd mipisto-android
bubblewrap init --manifest=https://johansan99-js.github.io/mi-pisto-hn/manifest.json
```

Te hará preguntas. Las importantes:

| Pregunta | Qué responder |
|---|---|
| Domain | `johansan99-js.github.io` (o la dirección nueva, si ya la cambiaste) |
| Application ID | **`hn.mipisto.app`**, exactamente igual que en Play Store |
| Starting version code | Un número **mayor** que el versionCode actual de Play Store |
| Key store location | La ruta a tu `signing.keystore` del ZIP de PWABuilder |
| Key name (alias) | El alias que dice `signing-key-info.txt` |

### 2. Copiar los archivos del widget

Desde la carpeta de este repositorio:

- Copia `android/widget/java/hn/mipisto/app/*.java` a `mipisto-android/app/src/main/java/hn/mipisto/app/`, donde ya hay un `LauncherActivity.java`.
- Copia el contenido de `android/widget/res/` **dentro** de `mipisto-android/app/src/main/res/`, juntando las carpetas (`layout`, `xml`, `drawable`, `values`). No reemplaces carpetas enteras, solo agrega los archivos.

### 3. Registrar el widget en el AndroidManifest

1. Abre `mipisto-android/app/src/main/AndroidManifest.xml` con cualquier editor de texto.
2. Busca la línea `</application>`.
3. **Justo antes** de esa línea, pega todo el contenido de `android/widget/AndroidManifest-fragmento.xml`.
4. Guarda el archivo.

### 4. Compilar la app

```bash
bubblewrap build
```

- Te pide las contraseñas de la llave; están en `signing-key-info.txt`.
- **Si pregunta si quieres regenerar el proyecto porque `twa-manifest.json` cambió, responde que NO.** Si respondes que sí, se borran los cambios del paso 3.
- Al terminar queda el archivo **`app-release-bundle.aab`**.

> **Alternativa con Android Studio** (gratis, en developer.android.com/studio): *Open* → la carpeta `mipisto-android` → *Build* → *Generate Signed App Bundle* → elige tu `signing.keystore`.

### 5. Subir a Play Store

1. Play Console → tu app → *Pruebas* → **Prueba interna** → *Crear versión*.
2. Sube `app-release-bundle.aab` y publícala para ti y tus testers.
3. Instala la versión de prueba en tu teléfono y prueba el widget: mantén presionada la pantalla principal → **Widgets** → **Mi Pisto HN**.
4. Si todo está bien, *Promocionar versión* a **Producción**.

## Si algo falla

| Problema | Solución |
|---|---|
| Play Console dice que la firma no coincide | No usaste el `signing.keystore` de PWABuilder. Vuelve al paso 1 con esa llave. |
| "Version code already used" | Sube el número en `twa-manifest.json` (`appVersionCode`) y compila otra vez. |
| El widget no aparece en la lista | Faltó el paso 3, o se perdió al regenerar el proyecto. Revisa el AndroidManifest. |
| El botón abre el navegador con barra de dirección | Falta el archivo `assetlinks.json` con la huella SHA-256 de tu llave. Es lo que tenemos pendiente: mándame las 2 huellas de Play Console → *Integridad de la app*. |
| Cambiaste la dirección de la app | Cambia `widget_url_app` en `res/values/widget_mipisto.xml` y compila de nuevo. |

## Cómo funciona por dentro (para el desarrollador)

- `MiPistoWidget` es un `AppWidgetProvider`. Cada botón es un `PendingIntent` con `ACTION_VIEW` a `widget_url_app + "?action=…"`, restringido al propio paquete (`setPackage`). Lo recibe la `LauncherActivity` de la TWA, que abre esa URL.
- La app web lee `?action=` en `verificarPINmejorado()` (`js/42-anotar-rapido.js`) y en `procesarAccionDeURL()` (`js/09-saldos-y-sincronizacion.js`). Son las mismas acciones de los atajos del `manifest.json`.
- El widget no se actualiza solo (`updatePeriodMillis=0`) y no muestra saldos: mostrarlos exigiría sacar datos del cifrado.
- Tamaños: 4×1 celdas, se puede agrandar; el de dictar es de 1×1. `previewLayout` y `targetCell*` requieren Android 12 o más nuevo; en versiones anteriores se usan `minWidth` y `minHeight`.

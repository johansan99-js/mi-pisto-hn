# Sincronización en la nube: celular y compu

Cómo funciona la sincronización de Mi Pisto HN entre dispositivos, los pasos para usarla y qué hacer cuando "no conecta".

## Resumen en una línea

El **celular sube** sus datos cifrados. La **compu entra con la misma cuenta de Google** y los **baja** con la contraseña de la nube. Después de eso los dos se mantienen al día solos.

## Pasos para el usuario

### 1. En el celular (donde ya están tus datos)

1. **Configuración → Sincronización en la nube → ☁️ Activar sincronización.**
2. Entra con tu cuenta de Google.
3. Toca **⬆️ Subir ahora**.
4. La primera vez, la app pide crear la **contraseña de la nube**:
   - debe tener 12 caracteres o más y no puede ser solo números;
   - anótala, porque no se puede recuperar.

> El celular necesita tener PIN, porque la app ya lo pide al empezar. El PIN cifra los datos en el teléfono.

### 2. En la compu

1. Abre `https://johansan99-js.github.io/mi-pisto-hn/` en el navegador.
2. En la bienvenida **no llenes el perfil**. Toca **📲 Ya uso Mi Pisto en otro dispositivo**.
3. Entra con **la misma cuenta de Google** que usaste en el celular.
4. Al volver, se abre sola la ventana **Traer mis datos**:
   - escribe la **contraseña de la nube**;
   - crea un **PIN para la compu**, de 6 a 8 dígitos. Puede ser distinto al del celular.
5. Listo: aparecen tus datos.

### 3. Después

- Cada cambio se **sube solo** unos 3 segundos después, mientras la app esté abierta y con internet.
- Si el otro dispositivo cambió algo, al abrir la app sale el aviso **"Datos nuevos en la nube"**. Tócalo y se **combinan** los dos lados. Si una misma cosa cambió en los dos, gana el cambio más reciente.
- En iPhone el envío automático solo funciona con la app abierta. Antes de cambiar de dispositivo, toca **⬆️ Subir ahora**.

## Qué se guarda y quién lo puede ver

Hay tres claves distintas:

| Qué | Para qué sirve | Dónde vive |
|---|---|---|
| **Cuenta de Google** | Solo identifica **tu espacio** en la nube | Google / Supabase |
| **Contraseña de la nube** | Abre la clave de tus datos en un dispositivo nuevo | Solo en tu cabeza (no se guarda en ningún lado) |
| **PIN** | Cifra los datos **en cada dispositivo** y bloquea la app | Cada dispositivo tiene el suyo |

- A la nube (Supabase, tabla `encrypted_states`) sube un **bloque cifrado con AES-256**. El servidor no puede leerlo, y nosotros tampoco.
- Junto al bloque va la clave de los datos (DEK), cifrada con la contraseña de la nube (PBKDF2, 600 000 iteraciones). Sin esa contraseña, nadie puede abrirla.
- Cada cuenta de Google tiene **una sola fila**. Las reglas de acceso (RLS) de Supabase solo dejan que cada usuario lea y escriba la suya.
- La tabla `device_log` guarda la lista de tus dispositivos, que se muestra en Configuración.

## "No conecta": causas y soluciones

| Lo que ves | Causa | Solución |
|---|---|---|
| "La cuenta … todavía no tiene datos en la nube" | Entraste con **otra cuenta de Google**, o el celular nunca tocó "Subir ahora" | En el celular: Configuración → Sincronización y revisa el correo que aparece bajo "Conectado". Entra en la compu con **ese** correo. Si no hay datos, toca "Subir ahora" en el celular. |
| "Contraseña de la nube incorrecta" | La contraseña no es la que se creó al subir | Escríbela igual, respetando mayúsculas y espacios. Si se perdió, en el celular: "Eliminar mi cuenta y mis datos de la nube" (los datos del celular no se borran) y vuelve a activar. |
| "La nube tiene otros datos … ¿Cuáles son tus datos buenos?" | Los dos dispositivos empezaron por separado (por ejemplo, la compu llenó un perfil vacío y lo subió) | Elige **"Los de este dispositivo"** en el que tiene los datos reales. Así se reemplaza la nube. Luego, en el otro, usa "⬇️ Bajar de la nube". |
| "Este dispositivo no tiene movimientos, pero la nube ya tiene datos" | Ibas a subir una app vacía encima de tus datos | Toca **Bajar mis datos**. |
| "No hay conexión con el servidor de sincronización" | Sin internet, o algo bloquea `supabase.co` (la red de la oficina o un bloqueador de anuncios) | Prueba otra red o desactiva el bloqueador para esta página. |
| Google muestra un error al volver | La dirección de la página no está permitida en Supabase | En Supabase → Authentication → URL Configuration, agrega `https://johansan99-js.github.io/mi-pisto-hn/**` en Redirect URLs. |

## Para el desarrollador

- Código: `js/12-nube.js`.
  - `cloudSync.init()` crea el cliente de Supabase (flujo PKCE) y detecta el regreso de Google con `?code=` antes de que el SDK limpie la URL.
  - `_alVolverDelLogin()` decide el paso siguiente:
    - dispositivo vacío o botón "Ya uso Mi Pisto": abre `abrirModalBajarCloud()`;
    - si no hay datos: `_sinDatosEnLaNube()`.
  - `traerDatosDeOtroDispositivo()` es el botón de la bienvenida. Guarda `mph_nube_traer=1` en localStorage para recordarlo después de ir a Google.
  - `subirDatosCloud()` no sube desde un dispositivo sin movimientos si la nube ya tiene datos de otro.
  - `asegurarClaveNube()`: si la nube se cifró con otra DEK (`otraClave`), deja elegir entre bajar o reemplazar la nube.
  - Envío automático: `_scheduleAutoSync()` → `_autoMergeAndUpload()`. Primero baja y combina (`mergeStates`) y después sube. Si no pudo leer la versión más nueva, no sube.
- Pruebas: `tests/sincronizacion.test.js` y `tests/nube-compu.test.js`. Usan un Supabase simulado (`conectarNube` en `tests/helpers.js`).

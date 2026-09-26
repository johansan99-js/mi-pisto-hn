# Sincronización en la nube: celular y compu

Cómo funciona la sincronización de Mi Pisto HN entre dispositivos, cómo se entra con huella o Face ID y qué hacer cuando "no conecta".

## Resumen en una línea

Cada persona conecta **su cuenta de Google**. El **primer dispositivo** sube sus datos cifrados. El **segundo** los recibe con la **contraseña de la nube**. Si los dos ya tenían datos, **se juntan**. Después se mantienen al día solos, o con el botón **🔄 Actualizar**.

No importa cuál se usa primero, el teléfono o la computadora: el proceso es el mismo.

## Pasos para el usuario

### 1. El primer dispositivo (teléfono o compu)

1. Llena el perfil: nombre, efectivo y ahorro.
2. Crea tu **PIN** de 6 a 8 dígitos. Es obligatorio y cifra tus datos en ese dispositivo.
3. La app pregunta **"¿Respaldar tus datos en la nube?"**:
   - **Conectar con Google:** entras con tu cuenta y creas la **contraseña de la nube**:
     - debe tener 10 caracteres o más, con letras (por ejemplo `Toby2026casa`);
     - anótala, porque no se puede recuperar.

     La app sube tus datos sola.
   - **Ahora no:** todo queda solo en ese dispositivo. Puedes conectar después en Configuración → Sincronización.

### 2. El segundo dispositivo

1. Consigue la dirección:
   - Desde la app: menú ☰ → **💻 Abrir en la computadora**. Muestra la dirección, botones para copiarla o enviarla (por WhatsApp o correo) y un **código QR**.
   - Desde Play Store, si el segundo es un teléfono.
2. En la bienvenida toca **📲 Ya uso Mi Pisto en otro dispositivo**. No llenes el perfil.
3. Entra con **la misma cuenta de Google**.
4. Escribe la **contraseña de la nube** y crea un **PIN para ese dispositivo**. Puede ser distinto al del otro.

**Si ese dispositivo ya tenía sus propios datos:** al conectarlo, la app ofrece **juntarlos** con los de la nube. No se pierde nada de ningún lado, y desde ahí los dos usan la misma clave.

### 3. En el día a día

- Cada cambio **se sube solo** unos 3 segundos después, mientras la app esté abierta y con internet.
- **🔄 Actualizar** trae al instante lo que anotaste en el otro dispositivo. Está en la barra de arriba en la computadora y en el menú ☰ en el teléfono. Sirve, por ejemplo, para anotar en el teléfono durante el día y en la noche **exportar a Excel** desde la compu.
- Si una misma cosa cambió en los dos dispositivos, gana el cambio más reciente.
- En iPhone, la subida automática solo funciona con la app abierta. Antes de cambiar de dispositivo, toca **🔄 Actualizar**.

## Huella y Face ID

- Se activa en **Configuración → Seguridad → Activar Huella / Face ID**, después de entrar con el PIN.
- La huella **abre la app y los datos sin escribir el PIN**. Usa la extensión **PRF** de WebAuthn: el lector entrega un secreto que solo sale con tu dedo o tu cara, y con ese secreto se guarda una segunda copia cifrada de la clave de los datos.
- **Dónde funciona:**
  - Android con Chrome reciente, incluida la app de Play Store;
  - iPhone con iOS 18 o más nuevo.

  Si el teléfono no tiene PRF, la app lo explica y sigue con el PIN.
- El **PIN siempre sirve** como respaldo. Aunque entres con la huella, para **cambiar el PIN** se pide el PIN actual.
- La huella queda ligada a la **dirección** de la app. Si la dirección cambia, hay que activarla otra vez.
- Si al sincronizar tus datos pasan a otra clave (al juntar o al bajar), la huella se desactiva sola y la app avisa que la vuelvas a activar.

## Qué se guarda y quién lo puede ver

Hay tres claves distintas:

| Qué | Para qué sirve | Dónde vive |
|---|---|---|
| **Cuenta de Google** | Solo identifica **tu espacio** en la nube. Cada cuenta ve únicamente sus datos. | Google / Supabase |
| **Contraseña de la nube** | Abre la clave de tus datos en un dispositivo nuevo | Solo en tu cabeza (no se guarda en ningún lado) |
| **PIN** (y huella) | Cifra los datos **en cada dispositivo** y bloquea la app | Cada dispositivo tiene el suyo |

- A la nube (Supabase, tabla `encrypted_states`) sube un **bloque cifrado con AES-256**. El servidor no puede leerlo, y nosotros tampoco.
- Junto al bloque va la clave de los datos (DEK), cifrada con la contraseña de la nube (PBKDF2, 600 000 iteraciones).
- Las reglas de acceso (RLS) de Supabase solo dejan que cada usuario lea y escriba **su propia fila**. Nadie puede ver los datos de otra persona.
- La contraseña de la nube pide **10 caracteres o más y no solo números**. Diez dígitos solos se pueden adivinar en días con una computadora potente, porque quien tenga el bloque cifrado puede probar sin límite.

## "No conecta": causas y soluciones

| Lo que ves | Causa | Solución |
|---|---|---|
| "La cuenta … todavía no tiene datos en la nube" | Entraste con **otra cuenta de Google**, o el primer dispositivo nunca subió | En el primer dispositivo: Configuración → Sincronización y revisa el correo que aparece bajo "Conectado". Entra en el otro con **ese** correo. |
| "Contraseña de la nube incorrecta" | La contraseña no es la que se creó | Escríbela igual, respetando mayúsculas y espacios. Si se perdió: "Eliminar mi cuenta y mis datos de la nube" en el dispositivo bueno (sus datos no se borran) y vuelve a conectar. |
| "La nube ya tiene datos de … Se van a juntar" | Los dos dispositivos empezaron por separado | Toca **Juntar mis datos**. |
| "Este dispositivo no tiene movimientos, pero la nube ya tiene datos" | Ibas a subir una app vacía encima de tus datos | Toca **Bajar mis datos**. |
| "No hay conexión con el servidor de sincronización" | Sin internet, o algo bloquea `supabase.co` (red de la oficina, bloqueador de anuncios) | Prueba otra red o desactiva el bloqueador para esta página. |
| Google da error al volver | La dirección de la app no está permitida en Supabase | Supabase → Authentication → URL Configuration → Redirect URLs: agrega la dirección de la app con `/**` al final. |

## La dirección de la app

- **Hoy:** `https://johansan99-js.github.io/mi-pisto-hn/`.
- **Plan:** una organización gratis de GitHub llamada `mipistohn`, con el repositorio `mipistohn.github.io`. La dirección quedaría `https://mipistohn.github.io/`.
- **Hacerlo antes de publicar en Play Store**, por tres razones:
  - la app de Play Store queda amarrada a la dirección;
  - los datos locales pertenecen a cada dirección, así que quien ya tiene datos en la dirección vieja los pasa con la nube;
  - la huella hay que activarla otra vez.
- El repositorio es **público** (GitHub Pages gratis lo exige): se ve el código, **no** los datos de nadie. En el código no hay claves secretas; la "anon key" de Supabase es pública a propósito.

## Para el desarrollador

- **`js/12-nube.js`:**
  - `cloudSync.init()` usa el flujo PKCE y detecta el regreso de Google con `?code=` antes de que el SDK limpie la URL.
  - `_alVolverDelLogin()` decide el paso siguiente según las marcas de localStorage:
    - `mph_nube_empezar`: conectó al crear el perfil; sigue con `_primeraConexion()`, que sube, recibe o junta;
    - `mph_nube_traer`: botón "Ya uso Mi Pisto"; abre `abrirModalBajarCloud()`.
  - `asegurarClaveNube()`: si la nube se cifró con otra DEK, llama a `_juntarConLaNube()`. Esta baja con la contraseña, hace `mergeStates`, adopta la DEK de la nube y vuelve a proteger con el PIN del dispositivo.
  - `subirDatosCloud()` no sube desde un dispositivo sin movimientos si la nube ya tiene datos de otro.
  - Subida automática: `_scheduleAutoSync()` → `_autoMergeAndUpload()`. Primero baja y combina, después sube. Si no pudo leer la versión más nueva, no sube.
- **`js/41-acceso-y-nube.js`:**
  - huella con PRF: `registrarBiometria`, `_desbloquearConHuella`, `_olvidarHuella`;
  - `ofrecerNubeAlEmpezar`, `actualizarDesdeNube`, `abrirEnLaComputadora` (QR con `js/vendor/qrcode.js`, licencia MIT).
- **`js/09-saldos-y-sincronizacion.js`:** `_continuarDesbloqueo()` es el camino común después de tener la DEK, sea por PIN o por huella.
- **Pruebas:**
  - `tests/sincronizacion.test.js`, `tests/nube-compu.test.js` y `tests/huella-y-nube.test.js`;
  - Supabase simulado: `conectarNube` en `tests/helpers.js`;
  - lector de huellas simulado con PRF.

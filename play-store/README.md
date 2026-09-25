# Materiales para Google Play

## Gráfico destacado
- `feature-graphic-1024x500.png`: el gráfico destacado que pide la ficha de Play Store (1024 × 500, PNG).
- `filosofia-diseno.md`: la idea detrás del diseño.
  - El anillo de afuera tiene 365 marcas, una por cada día del año. Las 24 doradas son los días de pago de cada quincena (el 15 y el último día de cada mes).
  - El anillo del medio tiene 52 marcas, una por semana.
  - El anillo de adentro tiene 12 marcas, una por mes.

Colores: fondo `#130507`, rojo `#FF4444` y amarillo `#F5C800`, los mismos de la app. Fuentes: Outfit, Instrument Serif y DM Mono (todas con licencia OFL).

## Activar Mi Pisto Premium
El código ya está listo en `js/21-premium.js`, pero apagado (`PREMIUM.activo = false`). Mientras siga apagado, `tienePremium()` responde que sí a todos y nada se bloquea.

Para activarlo:
1. En Play Console, entra a **Monetizar → Productos → Suscripciones** y crea `mipisto_premium`.
   - Ponle un precio en lempiras.
   - Agrega una prueba gratis de 30 días.
2. Genera el `.aab` con PWABuilder y activa **Play Billing** (Digital Goods API) en las opciones de Android.
3. Cambia `PREMIUM.activo` a `true`. Ajusta `PREMIUM.precio` y `PREMIUM.tipo` para que digan lo mismo que la ficha de Play Store.
4. Pruébalo con una cuenta de prueba de licencias de Play Console antes de publicar.

Reglas que no se rompen (salen de las quejas en las opiniones de otras apps):
- Tus datos nunca se bloquean. Si el Premium termina, la persona sigue viendo, editando y exportando todo.
- El botón **Restaurar mi compra** está siempre visible, y el aviso explica qué hacer si la compra se hizo con otra cuenta de Google.
- El precio y el tipo de pago se dicen antes de comprar.

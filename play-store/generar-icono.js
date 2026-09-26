// Genera el ícono de la app: una flecha zigzag verde que sube sobre una
// cuadrícula oscura. Dibujo propio en SVG (sin imágenes de terceros), exportado
// a todos los tamaños que usan el manifest, iOS y Play Store.
//   node play-store/generar-icono.js
const { chromium } = require('playwright');
const path = require('path');
const raiz = process.env.SALIDA || path.join(__dirname, '..');

// Puntos de la flecha en un lienzo de 512 (antes de escalar al área segura)
const PUNTOS = [[78, 392], [170, 318], [222, 350], [300, 250], [350, 286], [424, 170]];

function svg({ tam = 512, redondeo = true, margen = 0, seguro = 1 }) {
  // margen: espacio transparente alrededor (íconos "any"); seguro: escala del dibujo (maskable)
  const lado = 512 - margen * 2;
  const r = redondeo ? lado * 0.2 : 0;
  // La punta: sigue la dirección del último tramo
  const [a, b] = PUNTOS.slice(-2);
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  const largo = 92, ancho = 104;
  const tip = [b[0] + ux * largo * 0.62, b[1] + uy * largo * 0.62];
  const base = [tip[0] - ux * largo, tip[1] - uy * largo];
  const izq = [base[0] + uy * ancho / 2, base[1] - ux * ancho / 2], der = [base[0] - uy * ancho / 2, base[1] + ux * ancho / 2];
  const linea = PUNTOS.map(p => p.join(',')).join(' ');
  const cabeza = [tip, izq, der].map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  const cuadricula = [];
  for (let i = 64; i < 512; i += 64) cuadricula.push(`<path d="M${i} 0V512M0 ${i}H512"/>`);
  const k = seguro, off = 256 * (1 - k);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tam}" height="${tam}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B2415"/><stop offset=".55" stop-color="#05110A"/><stop offset="1" stop-color="#020604"/></linearGradient>
    <radialGradient id="halo" cx=".62" cy=".42" r=".6"><stop offset="0" stop-color="#22C55E" stop-opacity=".30"/><stop offset="1" stop-color="#22C55E" stop-opacity="0"/></radialGradient>
    <linearGradient id="flecha" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#16A34A"/><stop offset=".55" stop-color="#4ADE80"/><stop offset="1" stop-color="#B6FF6A"/></linearGradient>
    <filter id="brillo" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
    <clipPath id="forma"><rect x="${margen}" y="${margen}" width="${lado}" height="${lado}" rx="${r}"/></clipPath>
  </defs>
  <g clip-path="url(#forma)">
    <rect width="512" height="512" fill="url(#fondo)"/>
    <rect width="512" height="512" fill="url(#halo)"/>
    <g transform="translate(${off} ${off}) scale(${k})">
      <g stroke="#22C55E" stroke-opacity=".13" stroke-width="2">${cuadricula.join('')}</g>
      <path d="M40 440H472" stroke="#22C55E" stroke-opacity=".35" stroke-width="3"/>
      <!-- brillo -->
      <g filter="url(#brillo)" opacity=".85">
        <polyline points="${linea}" fill="none" stroke="#4ADE80" stroke-width="44" stroke-linejoin="round" stroke-linecap="round"/>
        <polygon points="${cabeza}" fill="#86EF5C"/>
      </g>
      <!-- flecha -->
      <polyline points="${linea}" fill="none" stroke="url(#flecha)" stroke-width="40" stroke-linejoin="round" stroke-linecap="round"/>
      <polygon points="${cabeza}" fill="url(#flecha)" stroke="url(#flecha)" stroke-width="10" stroke-linejoin="round"/>
      <!-- línea fina con puntos, como en un gráfico -->
      <polyline points="92,420 176,368 232,384 312,300 362,318 432,236" fill="none" stroke="#86EFAC" stroke-opacity=".55" stroke-width="5" stroke-linejoin="round"/>
      ${[[176, 368], [312, 300], [432, 236]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#D9FFE6"/>`).join('')}
    </g>
  </g>
</svg>`;
}

(async () => {
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();
  const salidas = [
    // "any": cuadro redondeado con un poco de aire alrededor, fondo transparente
    { archivo: 'icon-192.png', tam: 192, op: { margen: 16, redondeo: true }, transparente: true },
    { archivo: 'icon-512.png', tam: 512, op: { margen: 16, redondeo: true }, transparente: true },
    // "maskable": llena todo; el dibujo cabe en el 80% central (Android le pone su forma)
    { archivo: 'icon-maskable-192.png', tam: 192, op: { redondeo: false, seguro: 0.8 } },
    { archivo: 'icon-maskable-512.png', tam: 512, op: { redondeo: false, seguro: 0.8 } },
    // iOS redondea solo: cuadro lleno
    { archivo: 'apple-touch-icon.png', tam: 180, op: { redondeo: false, seguro: 0.92 } },
    // Play Store: 512 cuadrado sin transparencia; Google le pone las esquinas
    { archivo: 'play-store/icono-512.png', tam: 512, op: { redondeo: false, seguro: 0.92 } },
  ];
  for (const s of salidas) {
    await pagina.setViewportSize({ width: s.tam, height: s.tam });
    await pagina.setContent(`<html><body style="margin:0;background:transparent">${svg(Object.assign({ tam: s.tam }, s.op))}</body></html>`);
    await pagina.screenshot({ path: path.join(raiz, s.archivo), omitBackground: !!s.transparente, clip: { x: 0, y: 0, width: s.tam, height: s.tam } });
    console.log('✓', s.archivo);
  }
  await navegador.close();
})();

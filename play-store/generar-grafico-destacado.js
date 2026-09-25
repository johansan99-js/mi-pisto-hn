const fs = require('fs'), path = require('path');
// Gráfico destacado de Play Store (1024x500). Para rehacerlo: node play-store/generar-grafico-destacado.js
// (usa la captura 03-analisis, así que primero corre generar-capturas.js si cambió la app)
const os = require('os');
const { chromium } = require('playwright');
const R = path.join(__dirname, '..'), S = fs.mkdtempSync(path.join(os.tmpdir(), 'destacado-'));
const b64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
(async () => {
  const br = await chromium.launch();
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:Outfit;src:url(file://${R}/play-store/fuentes/Outfit-Bold.ttf);font-weight:700}
  @font-face{font-family:Outfit;src:url(file://${R}/play-store/fuentes/Outfit-Regular.ttf);font-weight:400}
  html,body{margin:0;width:1024px;height:500px;overflow:hidden}
  body{background:radial-gradient(90% 120% at 20% 30%,#16B364 0%,#0A8F4E 40%,#064D2C 100%);font-family:Outfit;color:#fff;position:relative}
  .ave{position:absolute;left:40px;top:40px;width:230px}
  .txt{position:absolute;left:285px;top:100px;width:440px}
  .t{font-weight:700;font-size:74px;letter-spacing:-2px;line-height:1}
  .s{font-size:28px;line-height:1.25;margin-top:18px;color:rgba(255,255,255,.9)}
  .chips{margin-top:26px;display:flex;gap:10px;flex-wrap:wrap}
  .chips span{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:20px;padding:7px 14px;font-size:19px}
  .tel{position:absolute;right:46px;top:52px;width:250px;height:520px;border-radius:34px;background:#0B0B0B;padding:9px;box-sizing:border-box;box-shadow:0 20px 60px rgba(0,0,0,.45);transform:rotate(6deg);overflow:hidden}
  .tel div{width:100%;height:100%;border-radius:26px;background:url(${b64(R+'/play-store/capturas-ficha/03-analisis.png')}) no-repeat;background-size:292px auto;background-position:-24px -142px}
  </style></head><body>
  <img class="ave" src="${b64(R+'/guacamaya.png')}">
  <div class="txt"><div class="t">Mi Pisto HN</div><div class="s">Tus lempiras claras, día por día</div>
  <div class="chips"><span>Presupuesto por quincena</span><span>Tarjetas</span><span>Dólar de tu banco</span></div></div>
  <div class="tel"><div></div></div></body></html>`;
  fs.writeFileSync(S + '/dest.html', html);
  const p = await br.newPage({ viewport: { width: 1024, height: 500 } });
  await p.goto('file://' + S + '/dest.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
  await p.screenshot({ path: R + '/play-store/grafico-destacado.png' });
  await br.close();
})();

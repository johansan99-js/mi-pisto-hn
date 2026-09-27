const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase, conectarNube } = require('./helpers');

// Teléfono con PIN y cuenta conectada, pero sin la contraseña de la nube en este
// dispositivo: la nube tiene datos de "Android" que todavía no se pueden juntar solos
async function telefonoSinClave(env, transactions) {
  const page = await env.pagina();
  await sembrar(page, estadoBase({ nombre: 'Ana', transactions }));
  page.respuestas = ['123456', '123456', true];
  await page.evaluate(() => configurarPIN());
  await page.waitForFunction(() => !!_sessionDEK, null, { timeout: 15000 });
  const hace = new Date(Date.now() - 5 * 60000).toISOString();
  await conectarNube(page, { ciphertext: 'x', version: 5, updated_at: hace, device_id: 'otro', device_name: 'Android', size_bytes: 2048 });
  await page.evaluate(() => localStorage.setItem(CLOUD_SYNC_CONFIG.enabledKey, 'true'));
  return page;
}

describe('Aviso de datos en la nube', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('en un dispositivo vacío ofrece traer los datos, y el texto no queda apretado', async () => {
    const page = await telefonoSinClave(env, []);
    await page.evaluate(() => cloudSync.checkForNewerVersion());
    await page.waitForSelector('#cloud-newer-banner');
    assert.match(await page.textContent('#cloud-newer-banner'), /Tu cuenta tiene datos de Android.*Traer mis datos/);
    const caja = await page.evaluate(() => {
      const b = document.getElementById('cloud-newer-banner').getBoundingClientRect();
      const t = document.querySelector('#cloud-newer-banner span').getBoundingClientRect();
      return { ancho: b.width, texto: t.width, alto: t.height };
    });
    assert.ok(caja.ancho > 300, 'el aviso usa el ancho de la pantalla');
    assert.ok(caja.alto < 60, 'el texto cabe en pocas líneas');
    await page.click('#cloud-newer-banner button');
    await page.waitForFunction(() => { const m = document.getElementById('modal-cloud-download'); return m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 5000 });
  });

  it('con movimientos propios sigue ofreciendo combinar', async () => {
    const page = await telefonoSinClave(env, [{ id: 'tx0001', type: 'expense', amount: 50, cat: 'Comida', cuenta: 'efectivo', date: '2026-09-01T10:00:00Z' }]);
    await page.evaluate(() => cloudSync.checkForNewerVersion());
    await page.waitForSelector('#cloud-newer-banner');
    assert.match(await page.textContent('#cloud-newer-banner'), /Datos nuevos en la nube.*Combinar/);
  });

  it('en el teléfono, "Sincronizado" no tapa el nombre de la app', async () => {
    const page = await telefonoSinClave(env, []);
    const r = await page.evaluate(() => {
      cloudSync._updateIndicator('synced');
      const i = document.getElementById('cloud-sync-indicator').getBoundingClientRect();
      const t = document.querySelector('.hamburger-title span').getBoundingClientRect();
      return { choca: i.left < t.right && i.right > t.left && i.top < t.bottom && i.bottom > t.top, visible: i.width > 0, titulo: document.getElementById('cloud-sync-indicator').title };
    });
    assert.equal(r.visible, true);
    assert.equal(r.choca, false);
    assert.equal(r.titulo, 'Sincronizado');
  });
});

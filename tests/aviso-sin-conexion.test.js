// Cuando la nube falla por falta de señal (el navegador tira "Failed to fetch"),
// la app muestra un aviso amable en vez del error técnico. Un error real de la
// nube (permiso, datos corruptos) sí se sigue mostrando tal cual.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

describe('Aviso amable sin conexión', () => {
  let env, page;
  before(async () => { env = await crearEntorno(); page = await env.pagina(); await sembrar(page, estadoBase({ nombre: 'Ana' })); });
  after(async () => { await env.cerrar(); });

  it('reconoce los fallos de red y no los técnicos', async () => {
    const r = await page.evaluate(() => ({
      failedToFetch: _esFalloDeRed(new TypeError('Failed to fetch')),
      networkError: _esFalloDeRed(new Error('NetworkError when attempting to fetch resource')),
      texto: _esFalloDeRed('No se pudo consultar la nube: TypeError: Failed to fetch'),
      permiso: _esFalloDeRed(new Error('permission denied for table encrypted_states')),
      corrupto: _esFalloDeRed(new Error('clave incorrecta')),
    }));
    assert.deepEqual(r, { failedToFetch: true, networkError: true, texto: true, permiso: false, corrupto: false });
  });

  it('muestra el aviso amable ante un fallo de red y el técnico ante un error real', async () => {
    const r = await page.evaluate(() => ({
      red: _avisoNube(new TypeError('Failed to fetch'), '❌ No se pudo actualizar: Failed to fetch'),
      redTexto: _avisoNube('❌ No se pudo actualizar: No se pudo consultar la nube: TypeError: Failed to fetch', 'tecnico'),
      real: _avisoNube(new Error('permission denied'), '❌ No se pudo actualizar: permission denied'),
    }));
    assert.match(r.red, /Sin conexión ahora/);
    assert.doesNotMatch(r.red, /Failed to fetch/);
    assert.match(r.redTexto, /Sin conexión ahora/);
    assert.equal(r.real, '❌ No se pudo actualizar: permission denied');
  });
});

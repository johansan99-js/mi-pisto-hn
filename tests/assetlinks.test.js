const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Android lee este archivo para abrir la app de Play sin la barra de Chrome
describe('Digital Asset Links', () => {
  it('assetlinks.json es válido y apunta al paquete de la app', () => {
    const datos = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.well-known', 'assetlinks.json'), 'utf8'));
    assert.ok(Array.isArray(datos) && datos.length > 0);
    const t = datos[0];
    assert.deepEqual(t.relation, ['delegate_permission/common.handle_all_urls']);
    assert.equal(t.target.namespace, 'android_app');
    assert.equal(t.target.package_name, 'hn.mipisto.app');
    assert.ok(t.target.sha256_cert_fingerprints.length >= 1);
    for (const h of t.target.sha256_cert_fingerprints) assert.match(h, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });
});

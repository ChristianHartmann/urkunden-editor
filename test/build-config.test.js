'use strict';

// Jede Variante braucht genau eine Build-Konfiguration, und diese muss die
// eigene Varianten-ID einbrennen sowie fremde Varianten aus dem Paket lassen.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { alleVarianten } = require('./varianten');

const ROOT = path.join(__dirname, '..');
const VARIANT_PATHS = [path.join(ROOT, 'variants')];
const VARIANTEN = alleVarianten(VARIANT_PATHS);

test('package.json trägt keine Build-Konfiguration mehr', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.build, undefined, 'build gehört in build/builder.<variante>.yml');
});

for (const id of VARIANTEN) {
  test(`${id}: Build-Konfiguration und Skripte sind vorhanden`, () => {
    const yml = fs.readFileSync(path.join(ROOT, 'build', `builder.${id}.yml`), 'utf8');
    assert.match(yml, new RegExp(`variant:\\s*${id}`), 'extraMetadata.variant fehlt');
    assert.match(yml, new RegExp(`variants/${id}/`), 'eigene Variante nicht in files');
    for (const fremd of VARIANTEN.filter((v) => v !== id)) {
      assert.ok(!yml.includes(`variants/${fremd}/`), `fremde Variante ${fremd} im Paket`);
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts[`build:win:${id}`], `Skript build:win:${id} fehlt`);
    assert.ok(pkg.scripts[`build:linux:${id}`], `Skript build:linux:${id} fehlt`);
  });
}

// Liest einen einzelnen Wert "schlüssel: wert" aus der (flachen) YAML-Datei.
function readYamlValue(yml, key) {
  const m = yml.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : undefined;
}

test('appId, productName und Debian-Paketname unterscheiden sich zwischen den Varianten', () => {
  // Grundlage dafür, dass mehrere Varianten parallel installiert sein können,
  // ohne sich gespeicherte Urkunden zu vermischen (productName bestimmt den
  // userData-Ordner) oder sich beim Installieren gegenseitig zu verdrängen.
  const werte = { appId: new Map(), productName: new Map(), 'deb.packageName': new Map() };
  for (const id of VARIANTEN) {
    const yml = fs.readFileSync(path.join(ROOT, 'build', `builder.${id}.yml`), 'utf8');
    const debBlock = yml.match(/^deb:\n([\s\S]*)$/m);
    const packageName = debBlock ? readYamlValue(debBlock[1], 'packageName') : undefined;

    for (const [feld, wert] of [
      ['appId', readYamlValue(yml, 'appId')],
      ['productName', readYamlValue(yml, 'productName')],
      ['deb.packageName', packageName],
    ]) {
      assert.ok(wert, `${id}: ${feld} fehlt in builder.${id}.yml`);
      const traeger = werte[feld].get(wert);
      assert.ok(
        !traeger,
        `${id} und ${traeger}: gleicher Wert "${wert}" für ${feld}`
      );
      werte[feld].set(wert, id);
    }
  }
});

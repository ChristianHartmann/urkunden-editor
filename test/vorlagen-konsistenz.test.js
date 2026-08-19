'use strict';

// Prüft für jede Variante und jede ihrer Vorlagen, dass Markup und Feldliste
// zueinander passen. Ein data-field ohne Feld bleibt in der App stumm leer,
// ein Feld ohne Wirkung ist ein Bedienelement, das nichts tut.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { alleVarianten } = require('./varianten');

const { loadVariant } = require('../src/main/variant');

const ROOT = path.join(__dirname, '..');
const VARIANT_PATHS = [path.join(ROOT, 'variants')];
const VARIANTEN = alleVarianten(VARIANT_PATHS);

function dataFields(html) {
  return new Set([...html.matchAll(/data-field="([^"]+)"/g)].map((m) => m[1]));
}

// Ein Feld wirkt entweder auf ein data-field-Element, oder es setzt eine
// CSS-Variable, oder es steuert die Hintergrundfarbe (Sonderfall in render.js).
function wirktOhneElement(field) {
  return Boolean(field.cssVar) || field.key === 'background';
}

test('die Standard-Variante ist vorhanden', () => {
  assert.ok(VARIANTEN.includes('standard'), 'standard fehlt');
});

for (const id of VARIANTEN) {
  test(`Variante ${id}: Markup und Felder passen zusammen`, () => {
    const boot = loadVariant(id, { rootDir: ROOT, variantPaths: VARIANT_PATHS });
    assert.ok(boot.templates.length > 0, `${id} bietet keine Vorlage an`);

    for (const tpl of boot.templates) {
      const felder = tpl.manifest.fields;
      const keys = new Set(felder.map((f) => f.key));
      const imMarkup = dataFields(boot.shell + '\n' + tpl.html);
      const wo = `${id}/${tpl.manifest.id}`;

      for (const key of imMarkup) {
        assert.ok(keys.has(key), `${wo}: data-field="${key}" hat kein Feld im Manifest`);
      }
      for (const f of felder) {
        if (wirktOhneElement(f)) continue;
        assert.ok(imMarkup.has(f.key), `${wo}: Feld "${f.key}" hat kein data-field im Markup`);
      }
      for (const f of felder) {
        assert.ok(f.label, `${wo}: Feld "${f.key}" ohne Beschriftung`);
        assert.ok(f.type, `${wo}: Feld "${f.key}" ohne Typ`);
      }
    }
  });

  test(`Variante ${id}: Bild-Defaults sind mitgeliefert`, () => {
    const boot = loadVariant(id, { rootDir: ROOT, variantPaths: VARIANT_PATHS });
    for (const tpl of boot.templates) {
      for (const f of tpl.manifest.fields) {
        if (f.type !== 'image' || !f.default) continue;
        assert.ok(
          boot.assets[f.default],
          `${id}/${tpl.manifest.id}: Bild "${f.default}" für Feld "${f.key}" fehlt in den Assets`
        );
      }
    }
  });
}

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { loadVariant } = require('../src/main/variant');
const { makeRoot } = require('./varianten');

const ROOT = path.join(__dirname, '..');
const VARIANT_PATHS = [path.join(ROOT, 'variants')];

test('Shell-Felder sind in jeder Vorlage vorhanden', () => {
  // Diese Schlüssel wandern laut Spec aus den Vorlagen-Manifesten in
  // shell.fields.json, behalten dabei aber ihren Namen: gespeicherte
  // Urkunden werden nach Schlüssel geladen, eine Umbenennung würde sie
  // verwaisen lassen.
  const boot = loadVariant('standard', { rootDir: ROOT, variantPaths: VARIANT_PATHS });
  for (const tpl of boot.templates) {
    const keys = tpl.manifest.fields.map((f) => f.key);
    assert.ok(keys.includes('signatureLeft'), `${tpl.manifest.id} ohne signatureLeft`);
    assert.ok(keys.includes('signatureRight'), `${tpl.manifest.id} ohne signatureRight`);
    assert.ok(keys.includes('emblem'), `${tpl.manifest.id} ohne emblem`);
    assert.ok(keys.includes('background'), `${tpl.manifest.id} ohne background`);
  }
});

test('das Vereinsjubiläum blendet den Wappen-Kopf per shellDefaults aus', () => {
  const boot = loadVariant('standard', { rootDir: ROOT, variantPaths: VARIANT_PATHS });
  const jub = boot.templates.find((t) => t.manifest.id === 'vereinsjubilaeum');
  assert.equal(jub.manifest.fields.find((f) => f.key === 'showEmblem').default, false);
});

test('overrides der Variante setzen den Vorgabewert einer geteilten Vorlage', () => {
  const root = makeRoot({
    'templates/base.css': '.urkunde { --accent: #000; }',
    'templates/shell.html': '<div class="urkunde">{{CONTENT}}</div>',
    'templates/gruss/template.html': '<p data-field="body">x</p>',
    'templates/gruss/manifest.json': JSON.stringify({
      id: 'gruss',
      fields: [{ key: 'body', label: 'Fließtext', type: 'textarea', default: 'Basistext' }],
    }),
    'assets/fonts/fonts.css': '@font-face {}',
    'variants/verein/variant.json': JSON.stringify({
      name: 'Verein',
      templates: ['gruss'],
      overrides: { gruss: { body: 'Eigener Text' } },
    }),
  });
  const boot = loadVariant('verein', {
    rootDir: root,
    variantPaths: [path.join(root, 'variants')],
  });
  const feld = boot.templates[0].manifest.fields.find((f) => f.key === 'body');
  assert.equal(feld.default, 'Eigener Text');
});

test('Shell, CSS, Schriften und Wappen sind im Paket', () => {
  const boot = loadVariant('standard', { rootDir: ROOT, variantPaths: VARIANT_PATHS });
  assert.match(boot.shell, /\{\{CONTENT\}\}/);
  assert.match(boot.baseCss, /--accent/);
  assert.match(boot.fontsCss, /@font-face/);
  assert.ok(boot.assets['wappen-platzhalter.svg'].startsWith('data:image/svg+xml;base64,'));
});

test('eine unbekannte Variante ist ein Fehler beim Start', () => {
  assert.throws(() => loadVariant('gibtsnicht', { rootDir: ROOT, variantPaths: VARIANT_PATHS }), /gibtsnicht/);
});

test('die Standard-Variante lädt und erbt alles aus templates/', () => {
  const boot = loadVariant('standard', { rootDir: ROOT, variantPaths: VARIANT_PATHS });
  assert.equal(boot.variant.name, 'Standard');
  assert.deepEqual(
    boot.templates.map((t) => t.manifest.id),
    ['vereinsjubilaeum', 'geburtstag', 'hochzeit']
  );
  assert.match(boot.shell, /\{\{CONTENT\}\}/);
  assert.match(boot.baseCss, /--accent/);
});

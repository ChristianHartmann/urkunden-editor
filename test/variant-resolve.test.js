'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const variant = require('../src/main/variant');
const { makeRoot } = require('./varianten');

const MINIMAL_CONFIG = JSON.stringify({
  name: 'Musterverein Beispielstadt',
  templates: ['geburtstag'],
});

test('geteilte Datei wird gefunden, wenn die Variante keine eigene hat', () => {
  const root = makeRoot({
    'templates/shell.html': 'GETEILT',
    'variants/muster/variant.json': MINIMAL_CONFIG,
  });
  const p = variant.resolveShared(path.join(root, 'variants', 'muster'), root, 'shell.html');
  assert.equal(fs.readFileSync(p, 'utf8'), 'GETEILT');
});

test('eigene Datei der Variante gewinnt über die geteilte', () => {
  const root = makeRoot({
    'templates/shell.html': 'GETEILT',
    'variants/muster/shell.html': 'EIGEN',
    'variants/muster/variant.json': MINIMAL_CONFIG,
  });
  const p = variant.resolveShared(path.join(root, 'variants', 'muster'), root, 'shell.html');
  assert.equal(fs.readFileSync(p, 'utf8'), 'EIGEN');
});

test('fehlt die Datei in beiden Pfaden, kommt null zurück', () => {
  const root = makeRoot({ 'variants/muster/variant.json': MINIMAL_CONFIG });
  assert.equal(variant.resolveShared(path.join(root, 'variants', 'muster'), root, 'base.css'), null);
});

test('Vorlagen werden erst in der Variante, dann geteilt gesucht', () => {
  const root = makeRoot({
    'templates/geburtstag/template.html': 'GETEILT',
    'variants/muster/templates/pokalkampf/template.html': 'EIGEN',
    'variants/muster/variant.json': MINIMAL_CONFIG,
  });
  const variantDir = path.join(root, 'variants', 'muster');
  const shared = variant.resolveTemplateFile(variantDir, root, 'geburtstag', 'template.html');
  const own = variant.resolveTemplateFile(variantDir, root, 'pokalkampf', 'template.html');
  assert.equal(fs.readFileSync(shared, 'utf8'), 'GETEILT');
  assert.equal(fs.readFileSync(own, 'utf8'), 'EIGEN');
});

test('variant.json wird gelesen', () => {
  const root = makeRoot({
    'variants/musterverein/variant.json': JSON.stringify({
      name: 'Verein Musterhausen',
      templates: ['geburtstag'],
    }),
  });
  const cfg = variant.readVariantConfig(path.join(root, 'variants', 'musterverein'));
  assert.equal(cfg.id, 'musterverein');
  assert.equal(cfg.name, 'Verein Musterhausen');
  assert.deepEqual(cfg.templates, ['geburtstag']);
  assert.deepEqual(cfg.overrides, {});
});

test('Assets der Variante überschreiben gleichnamige geteilte', () => {
  const root = makeRoot({
    'assets/emblems/logo.svg': '<svg>geteilt</svg>',
    'assets/emblems/nur-geteilt.svg': '<svg>a</svg>',
    'variants/muster/assets/logo.svg': '<svg>eigen</svg>',
    'variants/muster/variant.json': MINIMAL_CONFIG,
  });
  const assets = variant.collectAssets(path.join(root, 'variants', 'muster'), root);
  assert.ok(assets['nur-geteilt.svg'].startsWith('data:image/svg+xml;base64,'));
  const decoded = Buffer.from(assets['logo.svg'].split(',')[1], 'base64').toString('utf8');
  assert.equal(decoded, '<svg>eigen</svg>');
});

test('findVariantDir liefert das Verzeichnis der Variante', () => {
  const root = makeRoot({ 'variants/muster/variant.json': MINIMAL_CONFIG });
  const dir = variant.findVariantDir('muster', [path.join(root, 'variants')]);
  assert.equal(dir, path.join(root, 'variants', 'muster'));
});

test('findVariantDir nimmt den ersten Suchpfad, der die Variante führt', () => {
  const a = makeRoot({ 'variants/muster/variant.json': MINIMAL_CONFIG });
  const b = makeRoot({ 'variants/muster/variant.json': MINIMAL_CONFIG });
  const dir = variant.findVariantDir('muster', [
    path.join(a, 'variants'),
    path.join(b, 'variants'),
  ]);
  assert.equal(dir, path.join(a, 'variants', 'muster'));
});

test('findVariantDir überspringt Suchpfade ohne passende variant.json', () => {
  // Ein Ordner ohne variant.json zählt nicht: sonst bräche die Suche ab,
  // sobald jemand die Bilder einer neuen Variante ablegt, bevor deren
  // Konfiguration steht.
  const leer = makeRoot({ 'variants/muster/assets/logo.svg': '<svg/>' });
  const echt = makeRoot({ 'variants/muster/variant.json': MINIMAL_CONFIG });
  const dir = variant.findVariantDir('muster', [
    path.join(leer, 'variants'),
    path.join(echt, 'variants'),
  ]);
  assert.equal(dir, path.join(echt, 'variants', 'muster'));
});

test('findVariantDir nennt ID und durchsuchte Pfade im Fehler', () => {
  const root = makeRoot({ 'templates/shell.html': 'x' });
  assert.throws(
    () => variant.findVariantDir('gibtsnicht', [path.join(root, 'variants')]),
    (err) => /gibtsnicht/.test(err.message) && err.message.includes(root)
  );
});

test('findVariantDir verträgt Suchpfade, die es gar nicht gibt', () => {
  const root = makeRoot({ 'variants/muster/variant.json': MINIMAL_CONFIG });
  const dir = variant.findVariantDir('muster', [
    '/gibt/es/nicht',
    path.join(root, 'variants'),
  ]);
  assert.equal(dir, path.join(root, 'variants', 'muster'));
});

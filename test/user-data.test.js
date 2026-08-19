'use strict';

// Jede Variante speichert ihre Urkunden in einem eigenen Ordner. Vorher hing
// der Ordner am Feld "name" der package.json und war damit für alle Varianten
// dasselbe - eine Urkunde der einen Variante tauchte bei der anderen unter
// "Meine Urkunden" auf, und zwar in der Entwicklung wie im fertigen Installer.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { userDataOrdner, uebernimmAltenOrdner } = require('../src/main/user-data');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'urkunden-test-'));
}

test('der Ordnername trägt die Varianten-ID', () => {
  assert.equal(userDataOrdner('urkunden-editor', 'variante-a'), 'urkunden-editor-variante-a');
  assert.equal(userDataOrdner('urkunden-editor', 'variante-b'), 'urkunden-editor-variante-b');
});

test('zwei Varianten bekommen nie denselben Ordner', () => {
  const a = userDataOrdner('urkunden-editor', 'variante-a');
  const b = userDataOrdner('urkunden-editor', 'variante-b');
  assert.notEqual(a, b);
});

test('der Ordner der Vorgängerversion wird einmalig übernommen', () => {
  const wurzel = tempDir();
  const alt = path.join(wurzel, 'urkunden-editor');
  fs.mkdirSync(path.join(alt, 'urkunden'), { recursive: true });
  fs.writeFileSync(path.join(alt, 'urkunden', 'urk_1.json'), '{}');
  const neu = path.join(wurzel, 'urkunden-editor-variante-a');

  assert.equal(uebernimmAltenOrdner(alt, neu), true);
  assert.ok(fs.existsSync(path.join(neu, 'urkunden', 'urk_1.json')));
  assert.ok(!fs.existsSync(alt));
});

test('ein bereits vorhandener Ordner wird nicht überschrieben', () => {
  const wurzel = tempDir();
  const alt = path.join(wurzel, 'urkunden-editor');
  fs.mkdirSync(alt, { recursive: true });
  fs.writeFileSync(path.join(alt, 'alt.json'), '{}');
  const neu = path.join(wurzel, 'urkunden-editor-variante-b');
  fs.mkdirSync(neu, { recursive: true });
  fs.writeFileSync(path.join(neu, 'neu.json'), '{}');

  assert.equal(uebernimmAltenOrdner(alt, neu), false);
  assert.ok(fs.existsSync(path.join(neu, 'neu.json')));
  assert.ok(fs.existsSync(path.join(alt, 'alt.json')), 'der alte Ordner bleibt unangetastet');
});

test('ohne alten Ordner passiert nichts', () => {
  const wurzel = tempDir();
  const neu = path.join(wurzel, 'urkunden-editor-variante-b');
  assert.equal(uebernimmAltenOrdner(path.join(wurzel, 'gibtsnicht'), neu), false);
  assert.ok(!fs.existsSync(neu));
});

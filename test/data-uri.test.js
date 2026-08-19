'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { entflechteDatenUris } = require('../src/main/data-uri');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'urkunden-test-'));
}

const EIN_PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('eine eingebettete Datei wird ausgelagert und referenziert', () => {
  const dir = tempDir();
  const { html, dateien } = entflechteDatenUris(`<img src="${EIN_PNG}">`, dir);
  assert.equal(dateien.length, 1);
  assert.match(html, /<img src="datei_1\.png">/);
  assert.ok(fs.existsSync(path.join(dir, 'datei_1.png')));
});

test('dieselbe Datei auf vielen Seiten wird nur einmal geschrieben', () => {
  const dir = tempDir();
  const seiten = Array.from({ length: 40 }, () => `<img src="${EIN_PNG}">`).join('');
  const { html, dateien } = entflechteDatenUris(seiten, dir);
  assert.equal(dateien.length, 1);
  assert.equal(html.split('datei_1.png').length - 1, 40);
});

test('Schriften in CSS werden ebenso ausgelagert', () => {
  const dir = tempDir();
  const css = '@font-face{src:url(data:font/woff2;base64,d29mZg==) format("woff2")}';
  const { html, dateien } = entflechteDatenUris(css, dir);
  assert.equal(dateien.length, 1);
  assert.match(html, /url\(datei_1\.woff2\)/);
});

test('HTML ohne eingebettete Dateien bleibt unverändert', () => {
  const dir = tempDir();
  const { html, dateien } = entflechteDatenUris('<p>ohne Bild</p>', dir);
  assert.equal(html, '<p>ohne Bild</p>');
  assert.deepEqual(dateien, []);
});

test('unbekannter MIME-Typ bleibt als data-URI stehen und erzeugt keine Datei', () => {
  const dir = tempDir();
  const unbekannt = 'data:application/x-irgendwas;base64,iVBORw0KGgo=';
  const { html, dateien } = entflechteDatenUris(`<img src="${unbekannt}">`, dir);
  assert.equal(html, `<img src="${unbekannt}">`);
  assert.deepEqual(dateien, []);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('data-URI ohne ;base64 bleibt unangetastet', () => {
  const dir = tempDir();
  const svg = 'data:image/svg+xml,<svg></svg>';
  const { html, dateien } = entflechteDatenUris(`<img src="${svg}">`, dir);
  assert.equal(html, `<img src="${svg}">`);
  assert.deepEqual(dateien, []);
});

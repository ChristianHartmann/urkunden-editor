'use strict';

// Wacht darüber, dass keine Vereinsdaten in den Kern geraten. Der Kern wird
// veröffentlicht; ein Klarname oder ein Gemeindewappen, das sich hier
// einschleicht, ist nach dem Push nicht mehr zurückzuholen.
//
// assets/fonts bleibt außen vor: die eingebetteten woff2 sind base64 und
// treffen jedes Muster zufällig.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const TEXT_VERZEICHNISSE = [
  'src',
  'templates',
  'test',
  'tools',
  'build',
  'docs',
  'assets/emblems',
  'variants/standard',
];

// 'build' steht in beiden Listen: der Textscan prüft es wie jedes andere
// Verzeichnis auf Vereinsbegriffe, die Bildprüfung zusätzlich auf
// Bilddateien - dort liegt das App-Icon, das ausdrücklich erlaubt ist.
//
// In 'docs' liegen die README-Screenshots - ausschließlich von der Variante
// `standard` und ausdrücklich einzeln unten erlaubt. Ohne den Eintrag hier
// würde ein später dort abgelegtes Bild (z. B. versehentlich von einer
// anderen Variante) unbemerkt mitveröffentlicht.
const BILD_VERZEICHNISSE = [
  'assets/emblems',
  'build',
  'docs',
  'templates',
  'variants/standard',
];

const EINZELDATEIEN = ['README.md', 'package.json'];

const TEXTDATEI = /\.(js|mjs|json|html|css|md|ya?ml|svg|txt)$/i;

// Diese Datei selbst nennt die Begriffe naturgemäß.
const AUSGENOMMEN = new Set([path.join('test', 'keine-vereinsdaten.test.js')]);

const VERBOTEN = [
  /westheim/i,
  /fuchsstadt/i,
  /gssv/i,
  /hammelburg/i,
  /feuerwehr/i,
  /kamerad/i,
  /kommandant/i,
  /hundeplatz/i,
  /zeier/i,
];

// Jede Datei unter den genannten Verzeichnissen, als Pfad relativ zu ROOT.
function dateien(verzeichnisse) {
  const gesammelt = [];
  const stapel = [...verzeichnisse];
  while (stapel.length) {
    const rel = stapel.pop();
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const kind = path.join(rel, e.name);
      if (e.isDirectory()) stapel.push(kind);
      else gesammelt.push(kind);
    }
  }
  return gesammelt;
}

test('kein Vereinsbegriff steht im Kern', () => {
  const zuPruefen = [
    ...dateien(TEXT_VERZEICHNISSE).filter((rel) => TEXTDATEI.test(rel) && !AUSGENOMMEN.has(rel)),
    ...EINZELDATEIEN,
  ];
  const treffer = [];
  for (const rel of zuPruefen) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const muster of VERBOTEN) {
      const m = text.match(muster);
      if (m) treffer.push(`${rel}: "${m[0]}"`);
    }
  }
  assert.deepEqual(treffer, [], `Vereinsbegriffe im Kern:\n${treffer.join('\n')}`);
});

test('im Kern liegen keine Bilddateien außer den Platzhaltern', () => {
  // Gemeindewappen sind Hoheitszeichen und dürfen nicht veröffentlicht
  // werden. Erlaubt sind nur das App-Icon, die Platzhalter und die
  // README-Screenshots - einzeln aufgeführt statt 'docs' pauschal freizugeben,
  // damit ein künftig dort abgelegtes viertes Bild den Test zum Anschlagen
  // bringt, statt unbemerkt mitveröffentlicht zu werden.
  const erlaubt = new Set([
    path.join('build', 'icon.png'),
    path.join('assets', 'emblems', 'wappen-platzhalter.svg'),
    path.join('docs', 'screenshots', 'galerie.png'),
    path.join('docs', 'screenshots', 'editor.png'),
  ]);
  const bilder = dateien(BILD_VERZEICHNISSE).filter(
    (rel) => /\.(png|jpe?g|gif|webp|svg)$/i.test(rel) && !erlaubt.has(rel)
  );
  assert.deepEqual(bilder, [], `unerwartete Bilddateien im Kern:\n${bilder.join('\n')}`);
});

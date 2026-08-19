'use strict';

// Welche Varianten ausgeliefert werden, entscheidet das Vorhandensein einer
// variant.json - nicht das bloße Vorhandensein eines Ordners. Sonst bricht die
// halbe Testsuite, sobald jemand die Bilder einer neuen Variante ablegt, bevor
// deren Konfiguration steht. Gesucht wird über mehrere Verzeichnisse; ein
// Name gewinnt im ersten Pfad, in dem er auftaucht.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Baut ein Mini-Projekt in einem Temp-Verzeichnis auf. `files` ist eine Map
// von relativem Pfad zu Inhalt.
function makeRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'urkunden-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return root;
}

function alleVarianten(variantPaths) {
  const gefunden = [];
  for (const base of variantPaths) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      if (!fs.existsSync(path.join(base, d.name, 'variant.json'))) continue;
      if (!gefunden.includes(d.name)) gefunden.push(d.name);
    }
  }
  return gefunden;
}

module.exports = { alleVarianten, makeRoot };

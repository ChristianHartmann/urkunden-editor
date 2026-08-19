'use strict';

// Dateien als data-URI einbetten. Wird vom Varianten-Loader für die
// mitgelieferten Bilder und vom Main-Prozess für den Bild-Dialog gebraucht.

const fs = require('fs');
const path = require('path');

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return (
    {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    }[ext] || 'application/octet-stream'
  );
}

function toDataUri(file) {
  const buf = fs.readFileSync(file);
  return `data:${mimeFor(file)};base64,${buf.toString('base64')}`;
}

const ENDUNGEN = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
};

// Schreibt jede eingebettete Datei einmal in das Verzeichnis und ersetzt alle
// Vorkommen durch ihren Dateinamen. Ein Stapel aus 40 Urkunden trägt sonst 40
// Mal dieselben Logos und Schriften im Dokument.
//
// Nur MIME-Typen aus ENDUNGEN werden ausgelagert. Ein unbekannter Typ bleibt
// bewusst als data-URI im Dokument stehen, statt ihn unter einer erfundenen
// Endung wie ".bin" abzulegen: die Datei liegt dann nicht mehr eingebettet im
// HTML, sondern als eigenständige Datei daneben, und Chromium bestimmt ihren
// Typ beim Laden über die Endung, nicht mehr über den MIME-Typ aus der
// data-URI. Eine erfundene Endung lädt im besten Fall gar nicht, im
// schlechtesten Fall erst auf dem gedruckten Blatt auffällig falsch. Die
// Zwischenablage liefert MIME-Typen, die diese Tabelle nicht kennt
// (etwa beim Einfügen aus der Zwischenablage) - deshalb keine Fänger-Endung ergänzen.
function entflechteDatenUris(html, verzeichnis) {
  const gesehen = new Map();
  const muster = /data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)/gi;

  const neu = html.replace(muster, (treffer, mime, base64) => {
    const endung = ENDUNGEN[mime.toLowerCase()];
    if (!endung) return treffer;
    if (!gesehen.has(treffer)) {
      const datei = `datei_${gesehen.size + 1}.${endung}`;
      fs.writeFileSync(path.join(verzeichnis, datei), Buffer.from(base64, 'base64'));
      gesehen.set(treffer, datei);
    }
    return gesehen.get(treffer);
  });

  return { html: neu, dateien: [...gesehen.values()] };
}

module.exports = { mimeFor, toDataUri, entflechteDatenUris };

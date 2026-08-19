'use strict';

// Speicher für ausgefüllte Urkunden: je Urkunde eine JSON-Datei im
// userData-Ordner der App. Vollständig lokal, kein Netz.

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

function dir() {
  const d = path.join(app.getPath('userData'), 'urkunden');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function fileFor(id) {
  // id ist bereits sanitisiert (siehe newId); zusätzlich basename absichern.
  return path.join(dir(), `${path.basename(id)}.json`);
}

function newId() {
  // Zeit-basierte, gut sortierbare ID ohne externe Abhängigkeit.
  const rnd = Math.floor(performance.now() * 1000) % 100000;
  return `urk_${Date.now()}_${rnd}`;
}

// Liste aller gespeicherten Urkunden (leichtgewichtig, ohne Bilddaten).
function list() {
  const out = [];
  for (const f of fs.readdirSync(dir())) {
    if (!f.endsWith('.json')) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir(), f), 'utf8'));
      out.push({
        id: doc.id,
        name: doc.name || '(ohne Titel)',
        templateId: doc.templateId,
        savedAt: doc.savedAt,
      });
    } catch (e) {
      // beschädigte Datei überspringen
    }
  }
  out.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  return out;
}

function read(id) {
  return JSON.parse(fs.readFileSync(fileFor(id), 'utf8'));
}

// Speichert eine Urkunde. Ohne id wird eine neue angelegt. savedAt wird
// im Main gesetzt (Renderer hat kein Date-Monopol, aber hier ist es egal).
function save(doc) {
  const id = doc.id || newId();
  const full = { ...doc, id, savedAt: new Date().toISOString() };
  fs.writeFileSync(fileFor(id), JSON.stringify(full, null, 2), 'utf8');
  return full;
}

function remove(id) {
  try {
    fs.unlinkSync(fileFor(id));
  } catch (e) {
    /* egal, ist schon weg */
  }
  return true;
}

module.exports = { list, read, save, remove };

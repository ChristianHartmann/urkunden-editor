'use strict';

// Datenmodell einer Urkunde und Zugriff auf die geladenen Templates.

function allTemplates() {
  return window.BOOT.templates;
}

function templateById(id) {
  return window.BOOT.templates.find((t) => t.manifest.id === id) || null;
}

function defaultValues(tpl) {
  const v = {};
  for (const f of tpl.manifest.fields) v[f.key] = f.default;
  return v;
}

// Neue, leere Urkunde auf Basis eines Templates.
function newDoc(tpl) {
  return {
    docId: null,
    templateId: tpl.manifest.id,
    name: tpl.manifest.name,
    values: defaultValues(tpl),
  };
}

// Vorschlag für den Dateinamen beim PDF-Export.
function suggestFileName(current) {
  const base = (current.name || 'Urkunde')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${base || 'Urkunde'}.pdf`;
}

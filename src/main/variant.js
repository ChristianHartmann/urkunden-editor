'use strict';

// Lädt eine Build-Variante und baut daraus das komplette
// Bootstrap-Paket für den Renderer.
//
// Auflösung: findVariantDir bestimmt einmalig, in welchem Verzeichnis eine
// Variante liegt (mehrere Suchpfade sind möglich, siehe dort). Danach wird
// jede Datei zuerst dort gesucht, dann unter templates/. Damit erbt eine
// Variante ohne eigene Dateien die geteilte Optik und kann jede davon durch
// eine gleichnamige Datei ersetzen.

const fs = require('fs');
const path = require('path');
const { toDataUri } = require('./data-uri');

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

function firstExisting(candidates) {
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// Findet das eine Verzeichnis, in dem <id>/variant.json liegt. Maßgeblich ist
// die variant.json, nicht der bloße Ordner: sonst bräche die Suche ab, sobald
// jemand die Bilder einer neuen Variante ablegt, bevor deren Konfiguration
// steht.
function findVariantDir(id, variantPaths) {
  for (const base of variantPaths || []) {
    const dir = path.join(base, id);
    if (fs.existsSync(path.join(dir, 'variant.json'))) return dir;
  }
  throw new Error(
    `Unbekannte Variante "${id}": in keinem dieser Verzeichnisse gefunden:\n` +
      (variantPaths || []).map((p) => `  ${p}`).join('\n')
  );
}

// shell.html, shell.fields.json, base.css
function resolveShared(variantDir, rootDir, name) {
  return firstExisting([
    path.join(variantDir, name),
    path.join(rootDir, 'templates', name),
  ]);
}

// Dateien einer einzelnen Vorlage
function resolveTemplateFile(variantDir, rootDir, tplId, file) {
  return firstExisting([
    path.join(variantDir, 'templates', tplId, file),
    path.join(rootDir, 'templates', tplId, file),
  ]);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readVariantConfig(variantDir) {
  const file = path.join(variantDir, 'variant.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Variante in "${variantDir}": variant.json fehlt.`);
  }
  const cfg = readJson(file);
  return {
    id: path.basename(variantDir),
    name: cfg.name || path.basename(variantDir),
    // Erbt diese Variante den Speicher der Vorgängerversion ohne Varianten?
    vorgaengerSpeicher: cfg.vorgaengerSpeicher === true,
    templates: cfg.templates || [],
    overrides: cfg.overrides || {},
  };
}

// Bilder eines Verzeichnisses (rekursiv) als data-URIs, Schlüssel ist der
// Dateiname ohne Pfad - so, wie ihn ein Feld-Default angibt.
function readImageDir(dir, into) {
  if (!fs.existsSync(dir)) return into;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) readImageDir(abs, into);
    else if (IMAGE_RE.test(entry.name)) into[entry.name] = toDataUri(abs);
  }
  return into;
}

function collectAssets(variantDir, rootDir) {
  const assets = {};
  // assets/emblems trägt die Platzhalter des Kerns; die Variante gewinnt über
  // gleichnamige Dateien, weil sie danach gelesen wird.
  readImageDir(path.join(rootDir, 'assets', 'emblems'), assets);
  readImageDir(path.join(variantDir, 'assets'), assets);
  return assets;
}

// Baut die flache Feldliste einer Vorlage: Shell-Felder umschließen die Felder
// der Vorlage. Die Kette der Default-Werte, von schwach nach stark:
//   1. default im shell.fields.json bzw. manifest.json
//   2. shellDefaults der Vorlage
//   3. overrides der Variante
// Unbekannte Schlüssel in shellDefaults oder overrides sind Fehler und keine
// stille Auslassung: ein Tippfehler fiele sonst erst am gedruckten Blatt auf.
function mergeFields({ tplId, shellFields, manifest, overrides }) {
  const shell = shellFields || {};
  const fields = [
    ...(shell.before || []),
    ...(manifest.fields || []),
    ...(shell.after || []),
  ].map((f) => ({ ...f }));

  const byKey = new Map();
  for (const f of fields) {
    if (byKey.has(f.key)) {
      throw new Error(`Vorlage "${tplId}": Feldschlüssel "${f.key}" ist doppelt vergeben.`);
    }
    byKey.set(f.key, f);
  }

  const apply = (values, quelle) => {
    for (const [key, value] of Object.entries(values || {})) {
      const field = byKey.get(key);
      if (!field) {
        throw new Error(`Vorlage "${tplId}": ${quelle} verweist auf unbekanntes Feld "${key}".`);
      }
      field.default = value;
    }
  };

  apply(manifest.shellDefaults, 'shellDefaults');
  apply(overrides, 'overrides der Variante');

  return {
    fields,
    groups: { ...(shell.groups || {}), ...(manifest.groups || {}) },
  };
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function requireFile(file, was) {
  if (!file) throw new Error(`${was} nicht gefunden.`);
  return file;
}

// Alles, was der Renderer zum Start braucht: Vorlagen mit aufgelösten Feldern,
// geteilte Optik, Schriften und die mitgelieferten Bilder als data-URIs.
function loadVariant(id, { rootDir, variantPaths }) {
  const variantDir = findVariantDir(id, variantPaths);
  const cfg = readVariantConfig(variantDir);

  const shellFieldsPath = resolveShared(variantDir, rootDir, 'shell.fields.json');
  const shellFields = shellFieldsPath ? readJson(shellFieldsPath) : {};

  const templates = cfg.templates.map((tplId) => {
    const manifest = readJson(
      requireFile(
        resolveTemplateFile(variantDir, rootDir, tplId, 'manifest.json'),
        `Variante "${id}": manifest.json der Vorlage "${tplId}"`
      )
    );
    const html = readText(
      requireFile(
        resolveTemplateFile(variantDir, rootDir, tplId, 'template.html'),
        `Variante "${id}": template.html der Vorlage "${tplId}"`
      )
    );
    const { fields, groups } = mergeFields({
      tplId,
      shellFields,
      manifest,
      overrides: cfg.overrides[tplId],
    });
    return { manifest: { ...manifest, id: tplId, fields, groups }, html };
  });

  return {
    variant: {
      id: cfg.id,
      name: cfg.name,
      vorgaengerSpeicher: cfg.vorgaengerSpeicher,
    },
    templates,
    shell: readText(requireFile(resolveShared(variantDir, rootDir, 'shell.html'), 'shell.html')),
    baseCss: readText(requireFile(resolveShared(variantDir, rootDir, 'base.css'), 'base.css')),
    fontsCss: readText(path.join(rootDir, 'assets', 'fonts', 'fonts.css')),
    assets: collectAssets(variantDir, rootDir),
  };
}

module.exports = {
  findVariantDir,
  resolveShared,
  resolveTemplateFile,
  readVariantConfig,
  collectAssets,
  mergeFields,
  loadVariant,
};

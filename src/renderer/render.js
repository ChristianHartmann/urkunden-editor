'use strict';

// Setzt Feldwerte in ein Template und baut das druckfertige A4-Dokument.
// Nutzt die globalen Bootstrap-Daten (window.BOOT: shell, baseCss, fontsCss, assets).

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

function resolveImage(value, assets) {
  if (!value) return '';
  if (String(value).startsWith('data:')) return value;
  return (assets && assets[value]) || '';
}

function bgColor(value) {
  return value === 'creme' ? '#FBF8F1' : '#FFFFFF';
}

function toBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

// Wie ein Feld auf das Template wirkt, wenn nicht ausdrücklich per field.bind gesetzt:
// image → Bildquelle, checkbox → Element ein-/ausblenden, range → CSS-Eigenschaft,
// sonst → Textinhalt. Ausdrücklich zu setzen ist "count": so viele
// durchnummerierte Kinder eines Containers zeigen, wie der Wert sagt.
function bindOf(field) {
  if (field.bind) return field.bind;
  if (field.type === 'image') return 'image';
  if (field.type === 'checkbox') return 'toggle';
  if (field.type === 'range') return 'style';
  return 'content';
}

function applyField(el, field, value, assets) {
  const v = value === undefined || value === null ? field.default : value;
  switch (bindOf(field)) {
    case 'image':
      el.setAttribute('src', resolveImage(v, assets));
      return;
    case 'toggle':
      // Ursprüngliches display (z. B. inline "flex") einmalig merken, sonst
      // würde das Einblenden mit "" das Layout der Spalte zerstören.
      if (el.dataset.origDisplay === undefined) {
        el.dataset.origDisplay = el.style.display || '';
      }
      el.style.display = toBool(v) ? el.dataset.origDisplay : 'none';
      return;
    case 'style':
      el.style.setProperty(field.styleProp, String(v) + (field.unit || ''));
      return;
    case 'count': {
      // Zeigt in einem Container so viele durchnummerierte Kinder, wie der Wert
      // sagt (data-count="1", "2", ...), und blendet die übrigen aus. Für
      // Vorlagen, bei denen die Anzahl der Einträge zur Urkunde gehört.
      const anzahl = Number(v) || 0;
      for (const kind of el.querySelectorAll('[data-count]')) {
        if (kind.dataset.origDisplay === undefined) {
          kind.dataset.origDisplay = kind.style.display || '';
        }
        kind.style.display = Number(kind.dataset.count) <= anzahl ? kind.dataset.origDisplay : 'none';
      }
      return;
    }
    default:
      if (field.type === 'textarea') {
        el.innerHTML = escapeHtml(v == null ? '' : v).replace(/\n/g, '<br>');
      } else {
        el.textContent = v == null ? '' : v;
      }
      // Ob ein Feld leer geblieben ist, sieht ein Stylesheet dem Text nicht an:
      // ":empty" greift schon bei einem Leerzeichen nicht mehr. Der Marker
      // stellt es der Optik zur Verfügung - etwa für Felder, die nur ohne Wert
      // eine Linie zum Eintragen von Hand zeigen sollen.
      el.toggleAttribute('data-leer', String(v == null ? '' : v).trim() === '');
  }
}

// Schreibt alle Werte in ein bereits vorhandenes .urkunde-Wurzelelement
// (egal ob losgelöst oder im Vorschau-iframe) - für Live-Updates.
function applyValues(root, tpl, values, assets) {
  root.style.setProperty('--bg', bgColor(values.background));
  for (const f of tpl.manifest.fields) {
    if (f.key === 'background') continue; // steuert nur die Hintergrundfarbe

    // cssvar-Felder setzen eine CSS-Variable direkt auf der Urkunde-Wurzel
    // (z. B. Abstände via --mt-*/--gap-scale) - kein data-field-Element nötig.
    if (f.cssVar) {
      const raw = values[f.key] === undefined || values[f.key] === null ? f.default : values[f.key];
      root.style.setProperty(f.cssVar, String(raw) + (f.unit || ''));
      continue;
    }

    const el = root.querySelector(`[data-field="${f.key}"]`);
    if (el) applyField(el, f, values[f.key], assets);
  }
}

// Baut ein frisches .urkunde-Wurzelelement (Rahmen + Template-Inhalt).
function buildRoot(tpl) {
  const c = document.createElement('div');
  c.innerHTML = window.BOOT.shell.replace('{{CONTENT}}', tpl.html);
  return c.querySelector('.urkunde');
}

// Vollständiges, in sich geschlossenes HTML-Dokument (Vorschau + PDF/Druck).
function buildFullHtml(tpl, values) {
  const root = buildRoot(tpl);
  applyValues(root, tpl, values, window.BOOT.assets);
  return (
    '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">' +
    '<style>' +
    window.BOOT.fontsCss +
    '\n' +
    window.BOOT.baseCss +
    '\nhtml,body{margin:0;padding:0;background:#fff;}' +
    '</style></head><body>' +
    root.outerHTML +
    '</body></html>'
  );
}

// Ein Dokument mit einem Urkundenblock je Wertesatz. Schriften und Stile
// stehen einmal darin, zwischen den Blättern steht ein Seitenumbruch.
function buildSerienHtml(tpl, wertesaetze) {
  const bloecke = wertesaetze
    .map((values) => {
      const root = buildRoot(tpl);
      applyValues(root, tpl, values, window.BOOT.assets);
      return root.outerHTML;
    })
    .join('\n');

  return (
    '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">' +
    '<style>' +
    window.BOOT.fontsCss +
    '\n' +
    window.BOOT.baseCss +
    '\nhtml,body{margin:0;padding:0;background:#fff;}' +
    '\n.urkunde{page-break-after:always;}' +
    '\n.urkunde:last-of-type{page-break-after:auto;}' +
    '</style></head><body>' +
    bloecke +
    '</body></html>'
  );
}

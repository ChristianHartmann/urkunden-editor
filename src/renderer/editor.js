'use strict';

// Steuert die Oberfläche: Startbildschirm (Galerie + gespeicherte Urkunden)
// und den Editor mit Live-Vorschau.

let current = null; // { docId, tpl, templateId, name, values }
let previewFrame = null;

// Änderungs-Historie (für Rückgängig/Zurücksetzen)
let history = []; // Liste von Werte-Schnappschüssen; history[0] = Ausgangszustand
let histIndex = 0; // Zeiger auf den aktuellen Schnappschuss
let commitTimer = null; // Debounce, damit Tippen zu sinnvollen Schritten wird

const $ = (sel) => document.querySelector(sel);

const clone = (obj) => JSON.parse(JSON.stringify(obj));

// ---------- Vorschau-iframe einhängen & skalieren ----------

function mountPreview(stage, html, onLoad) {
  stage.innerHTML = '';
  const frame = document.createElement('iframe');
  frame.className = 'sheet';
  frame.setAttribute('scrolling', 'no');
  // Eine Urkunde braucht kein Skript; srcdoc erbt sonst den Ursprung des
  // Hauptfensters samt window.api. Betrifft auch die Serien-Vorschau, wo
  // Inhalt aus einer fremden CSV-Datei hier landet.
  // allow-same-origin, nicht die leere Sandbox: Skripte bleiben verboten, aber
  // die Live-Vorschau schreibt Änderungen von außen in dieses Dokument.
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.srcdoc = html;
  if (onLoad) frame.addEventListener('load', onLoad, { once: true });
  stage.appendChild(frame);
  return frame;
}

// Skaliert ein A4-Vorschau-iframe auf die Breite seiner Bühne. Geteilt mit
// der Serien-Ansicht (serie-ui.js), damit beide Vorschauen sich gleich verhalten.
function fitFrame(stage, frame) {
  if (!frame) return;
  const avail = stage.clientWidth - 32; // etwas Rand
  const scale = Math.min(avail / 794, 1);
  frame.style.transform = `translateX(-50%) scale(${scale})`;
  stage.style.height = `${1123 * scale + 24}px`;
}

function fitPreview() {
  fitFrame($('#preview-stage'), previewFrame);
}

// ---------- Galerie ----------

function templateCard(tpl) {
  const card = document.createElement('div');
  card.className = 'card';

  const prev = document.createElement('div');
  prev.className = 'card-preview';
  const frame = document.createElement('iframe');
  frame.setAttribute('scrolling', 'no');
  // allow-same-origin, nicht die leere Sandbox: Skripte bleiben verboten, aber
  // die Live-Vorschau schreibt Änderungen von außen in dieses Dokument.
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.srcdoc = buildFullHtml(tpl, defaultValues(tpl));
  prev.appendChild(frame);

  const body = document.createElement('div');
  body.className = 'card-body';
  const h = document.createElement('h3');
  h.textContent = tpl.manifest.name;
  const p = document.createElement('p');
  p.textContent = tpl.manifest.description || '';
  const btn = document.createElement('button');
  btn.className = 'btn primary';
  btn.textContent = 'Neu erstellen';
  btn.addEventListener('click', () => openNew(tpl));
  body.append(h, p, btn);

  card.append(prev, body);
  return card;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function renderSavedList() {
  const list = $('#saved-list');
  const empty = $('#saved-empty');
  const items = await window.api.store.list();
  list.innerHTML = '';
  empty.classList.toggle('hidden', items.length > 0);

  for (const item of items) {
    const tpl = templateById(item.templateId);
    const tplName = tpl ? tpl.manifest.name : item.templateId;

    const row = document.createElement('div');
    row.className = 'saved-item';

    const info = document.createElement('div');
    info.className = 'saved-info';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const meta = document.createElement('span');
    meta.textContent = `${tplName} · ${formatDate(item.savedAt)}`;
    info.append(name, meta);

    const actions = document.createElement('div');
    actions.className = 'saved-actions';
    const open = document.createElement('button');
    open.className = 'btn small';
    open.textContent = 'Öffnen';
    open.addEventListener('click', () => openSaved(item));
    const del = document.createElement('button');
    del.className = 'btn small ghost';
    del.textContent = 'Löschen';
    del.addEventListener('click', async () => {
      if (confirm(`„${item.name}" wirklich löschen?`)) {
        await window.api.store.remove(item.id);
        renderSavedList();
      }
    });
    actions.append(open, del);

    row.append(info, actions);
    list.appendChild(row);
  }
}

async function showGallery() {
  const cards = $('#template-cards');
  cards.innerHTML = '';
  for (const tpl of allTemplates()) cards.appendChild(templateCard(tpl));
  await renderSavedList();
  $('#view-editor').classList.add('hidden');
  $('#view-serie').classList.add('hidden');
  $('#view-gallery').classList.remove('hidden');
}

// ---------- Editor ----------

function openNew(tpl) {
  const doc = newDoc(tpl);
  current = { ...doc, tpl };
  enterEditor();
}

async function openSaved(item) {
  const doc = await window.api.store.read(item.id);
  const tpl = templateById(doc.templateId);
  if (!tpl) {
    alert('Zu dieser Urkunde fehlt die Vorlage.');
    return;
  }
  current = {
    docId: doc.id,
    tpl,
    templateId: doc.templateId,
    name: doc.name,
    values: { ...defaultValues(tpl), ...doc.values },
  };
  enterEditor();
}

function refreshPreview() {
  const doc = previewFrame && previewFrame.contentDocument;
  const root = doc && doc.querySelector('.urkunde');
  if (root) applyValues(root, current.tpl, current.values, window.BOOT.assets);
}

function onFieldChange(key, value) {
  current.values[key] = value;
  refreshPreview();
  scheduleCommit();
}

// ---------- Historie: Rückgängig / Zurücksetzen ----------

// Aufeinanderfolgende Änderungen (Tippen, Slider-Ziehen) werden zu EINEM
// Historien-Schritt zusammengefasst.
function scheduleCommit() {
  clearTimeout(commitTimer);
  commitTimer = setTimeout(commitHistory, 450);
}

function flushPending() {
  if (commitTimer) {
    clearTimeout(commitTimer);
    commitTimer = null;
    commitHistory();
  }
}

function commitHistory() {
  commitTimer = null;
  const snap = clone(current.values);
  if (JSON.stringify(snap) === JSON.stringify(history[histIndex])) return; // nichts Neues
  history = history.slice(0, histIndex + 1); // spätere „Redo"-Zweige verwerfen
  history.push(snap);
  histIndex = history.length - 1;
  updateHistoryButtons();
}

// Setzt einen Schnappschuss als aktuellen Zustand (ohne neuen Historien-Eintrag),
// baut das Formular neu und erhält dabei offene Gruppen.
function applyState(values) {
  const openGroups = new Set(
    [...document.querySelectorAll('#form .group')]
      .filter((g) => !g.querySelector('.group-body').classList.contains('hidden'))
      .map((g) => g.dataset.group)
  );

  current.values = clone(values);
  buildForm($('#form'), current.tpl, current.values, onFieldChange);

  for (const g of document.querySelectorAll('#form .group')) {
    if (openGroups.has(g.dataset.group)) {
      g.querySelector('.group-body').classList.remove('hidden');
      g.querySelector('.caret').textContent = '▾';
    }
  }
  refreshPreview();
}

function changedFromBaseline() {
  return JSON.stringify(current.values) !== JSON.stringify(history[0]);
}

function updateHistoryButtons() {
  $('#btn-undo').disabled = histIndex <= 0;
  $('#btn-reset').disabled = !changedFromBaseline();
}

function undo() {
  flushPending();
  if (histIndex <= 0) return;
  histIndex -= 1;
  applyState(history[histIndex]);
  updateHistoryButtons();
}

// Zurücksetzen auf den Ausgangszustand - selbst als Historien-Schritt, also
// per Rückgängig wieder umkehrbar.
function resetToBaseline() {
  flushPending();
  if (!changedFromBaseline()) return;
  history = history.slice(0, histIndex + 1);
  history.push(clone(history[0]));
  histIndex = history.length - 1;
  applyState(history[histIndex]);
  updateHistoryButtons();
}

function enterEditor() {
  $('#editor-template-name').textContent = current.tpl.manifest.name;
  const title = $('#editor-title');
  title.value = current.name || '';
  title.oninput = () => {
    current.name = title.value;
  };

  // Historie mit dem Ausgangszustand starten
  clearTimeout(commitTimer);
  commitTimer = null;
  history = [clone(current.values)];
  histIndex = 0;

  buildForm($('#form'), current.tpl, current.values, onFieldChange);
  updateHistoryButtons();

  previewFrame = mountPreview(
    $('#preview-stage'),
    buildFullHtml(current.tpl, current.values),
    fitPreview
  );

  $('#view-gallery').classList.add('hidden');
  $('#view-editor').classList.remove('hidden');
  fitPreview();
}

// ---------- Aktionen ----------

async function doSave() {
  const doc = {
    id: current.docId,
    name: current.name || 'Urkunde',
    templateId: current.templateId,
    values: current.values,
  };
  const saved = await window.api.store.save(doc);
  current.docId = saved.id;
  toast('Urkunde gespeichert');
}

async function doExportPdf() {
  const html = buildFullHtml(current.tpl, current.values);
  const res = await window.api.exportPdf(html, suggestFileName(current));
  if (res.ok) {
    toast('PDF gespeichert');
    window.api.openPdf(res.filePath);
  } else if (!res.canceled) {
    alert('PDF konnte nicht erstellt werden:\n' + (res.error || 'Unbekannter Fehler'));
  }
}

async function doPrint() {
  const html = buildFullHtml(current.tpl, current.values);
  await window.api.print(html);
}

// ---------- Toast ----------

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- Start ----------

function wireButtons() {
  $('#btn-back').addEventListener('click', showGallery);
  $('#btn-save').addEventListener('click', doSave);
  $('#btn-pdf').addEventListener('click', doExportPdf);
  $('#btn-print').addEventListener('click', doPrint);
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-reset').addEventListener('click', resetToBaseline);
  $('#btn-serie').addEventListener('click', () => oeffneSerie(current.tpl, current.values, current.name));
  wireSerieUi();
  window.addEventListener('resize', fitPreview);
  window.addEventListener('keydown', (e) => {
    if (!current || $('#view-editor').classList.contains('hidden')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    }
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  window.BOOT = await window.api.bootstrap();
  $('#brand-sub').textContent = window.BOOT.variant.name;
  wireButtons();
  showGallery();
});

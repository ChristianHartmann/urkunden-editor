'use strict';

// Serie aus einer Teilnehmerliste: Muster-CSV geben, Liste einlesen, prüfen,
// und den Stapel als Sammel-PDF, als Einzeldateien oder direkt zum Drucker.

let serie = null; // { tpl, basis, name, spalten, zeilen, wertesaetze, musterbare }
let abbruch = false;
let serieFrame = null; // aktuelles Vorschau-iframe, für die Einpassung bei Größenänderung

function serieVorschau(index) {
  if (!serie || !serie.wertesaetze.length) return;
  const stage = document.querySelector('#serie-stage');
  const html = buildFullHtml(serie.tpl, serie.wertesaetze[index]);
  serieFrame = mountPreview(stage, html, () => fitFrame(stage, serieFrame));
}

// Baut einen einzelnen Absatz für den Bericht. Werte kommen aus der
// eingelesenen CSV, also aus einer Datei außerhalb der App - textContent
// statt innerHTML, damit dort kein Markup (z. B. <img onerror=...>) ausgeführt
// werden kann.
function berichtZeile(el, ...teile) {
  const p = document.createElement('p');
  for (const teil of teile) p.appendChild(teil);
  el.appendChild(p);
}

function zeigeBericht() {
  const el = document.querySelector('#serie-bericht');
  el.innerHTML = '';
  if (!serie) return;

  const anzahl = document.createElement('strong');
  anzahl.textContent = String(serie.zeilen.length);
  berichtZeile(
    el,
    anzahl,
    document.createTextNode(` Zeilen aus „${serie.name}" gelesen.`)
  );

  const erkannt = serie.spalten.filter((s) => !serie.unbekannteSpalten.includes(s));
  berichtZeile(
    el,
    document.createTextNode(`Erkannte Spalten: ${erkannt.join(', ') || 'keine'}`)
  );
  if (serie.unbekannteSpalten.length) {
    berichtZeile(el, document.createTextNode(`Ignoriert: ${serie.unbekannteSpalten.join(', ')}`));
  }
  for (const a of serie.auffaellig) {
    berichtZeile(el, document.createTextNode(`Zeile ${a.zeile}: ${a.grund}`));
  }
  for (const h of serie.hinweise || []) {
    berichtZeile(el, document.createTextNode(`Zeile ${h.zeile}: ${hinweisText(h)}`));
  }
}

// Text zu den Hinweisen aus leseCsv - siehe src/main/csv.js.
function hinweisText(h) {
  switch (h.art) {
    case 'zuWenigeSpalten':
      return 'weniger Spalten als die Kopfzeile';
    case 'zuVieleSpalten':
      return 'mehr Spalten als die Kopfzeile';
    case 'leereZeile':
      return 'komplett leer';
    case 'doppelteSpalte':
      return `Spalte „${h.spalte}" mehrfach in der Kopfzeile`;
    default:
      return h.art;
  }
}

function zeigeNamensspalten() {
  const el = document.querySelector('#serie-namensspalten');
  el.innerHTML = '';
  const erkannt = serie.spalten.filter((s) => !serie.unbekannteSpalten.includes(s));
  erkannt.forEach((spalte, i) => {
    const label = document.createElement('label');
    label.className = 'check-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = spalte;
    cb.checked = i === 0; // erste erkannte Spalte als Vorschlag
    const text = document.createElement('span');
    text.textContent = spalte;
    label.append(cb, text);
    el.appendChild(label);
  });
}

function gewaehlteNamensspalten() {
  return [...document.querySelectorAll('#serie-namensspalten input:checked')].map((c) => c.value);
}

async function serieMusterSpeichern() {
  const spalten = serie.musterbare;
  const beispiel = {};
  for (const s of spalten) beispiel[s] = serie.basis[s] ?? '';
  const res = await window.api.serie.musterSpeichern(spalten, [beispiel], 'Teilnehmer.csv');
  if (res.ok) toast('Muster-CSV gespeichert');
  else if (!res.canceled) alert('Muster konnte nicht gespeichert werden:\n' + res.error);
}

async function serieCsvLaden() {
  const res = await window.api.serie.csvLaden();
  if (!res.ok) {
    if (!res.canceled) alert('Liste konnte nicht gelesen werden:\n' + res.error);
    return;
  }
  const vorbereitet = await window.api.serie.vorbereiten(
    serie.tpl.manifest.fields,
    serie.basis,
    res.spalten,
    res.zeilen
  );
  Object.assign(serie, res, vorbereitet);
  zeigeBericht();
  zeigeNamensspalten();
  const leer = serie.zeilen.length === 0;
  document.querySelector('#serie-ausgabe').classList.toggle('hidden', leer);
  document.querySelector('#serie-vorschau-kopf').classList.toggle('hidden', leer);
  serieVorschau(0);
}

// Sperrt bzw. entsperrt die vier Knöpfe, die während eines laufenden
// Serien-Laufs nicht ein zweites Mal angestoßen werden dürfen: die drei
// Ausgaben und der Listenimport, der sonst mitten im Lauf einen neuen
// Namensvorrat unter den Füßen der laufenden Schleife wegzöge.
function serieSperren(gesperrt) {
  for (const sel of ['#btn-serie-pdf', '#btn-serie-dateien', '#btn-serie-druck', '#btn-serie-csv']) {
    document.querySelector(sel).disabled = gesperrt;
  }
}

async function serieSammelPdf() {
  serieSperren(true);
  try {
    const html = buildSerienHtml(serie.tpl, serie.wertesaetze);
    const res = await window.api.exportPdf(html, `${serie.tpl.manifest.name} - Serie.pdf`);
    if (res.ok) {
      toast(`${serie.wertesaetze.length} Urkunden gespeichert`);
      window.api.openPdf(res.filePath);
    } else if (!res.canceled) {
      alert('PDF konnte nicht erstellt werden:\n' + (res.error || 'Unbekannter Fehler'));
    }
  } finally {
    serieSperren(false);
  }
}

async function serieDrucken() {
  serieSperren(true);
  try {
    await window.api.print(buildSerienHtml(serie.tpl, serie.wertesaetze));
  } finally {
    serieSperren(false);
  }
}

async function serieEinzeldateien() {
  const spalten = gewaehlteNamensspalten();
  if (!spalten.length) {
    alert('Bitte mindestens eine Spalte für den Dateinamen wählen.');
    return;
  }

  serieSperren(true);
  const fortschritt = document.querySelector('#serie-fortschritt');
  const text = document.querySelector('#serie-fortschritt-text');
  try {
    const ordner = await window.api.serie.ordnerWaehlen();
    if (!ordner) return;

    const namen = await window.api.serie.dateinamen(serie.zeilen, spalten);
    fortschritt.classList.remove('hidden');
    abbruch = false;
    let geschrieben = 0;

    for (let i = 0; i < serie.wertesaetze.length; i++) {
      if (abbruch) break;
      text.textContent = `Urkunde ${i + 1} von ${serie.wertesaetze.length}: ${namen[i]}`;
      const html = buildFullHtml(serie.tpl, serie.wertesaetze[i]);
      const res = await window.api.serie.pdfSchreiben(html, ordner, namen[i]);
      if (!res.ok) {
        alert(`„${namen[i]}" konnte nicht geschrieben werden:\n${res.error}`);
        break;
      }
      geschrieben++;
    }

    toast(
      geschrieben === serie.wertesaetze.length
        ? `${geschrieben} Urkunden gespeichert`
        : `${geschrieben} von ${serie.wertesaetze.length} Urkunden gespeichert`
    );
  } finally {
    fortschritt.classList.add('hidden');
    serieSperren(false);
  }
}

async function oeffneSerie(tpl, values, name) {
  const eigene = {
    tpl,
    basis: values,
    name: '',
    spalten: [],
    zeilen: [],
    wertesaetze: [],
    unbekannteSpalten: [],
    auffaellig: [],
    musterbare: [],
  };
  // Erst abwarten, dann zuweisen: sonst schriebe eine schnell danach zweite
  // Öffnung der Ansicht die (später ankommende) Antwort der ersten in den
  // dann schon aktuellen Zustand.
  const vorbereitet = await window.api.serie.vorbereiten(tpl.manifest.fields, values, [], []);
  Object.assign(eigene, vorbereitet);
  serie = eigene;
  serieFrame = null;

  document.querySelector('#serie-vorlage').textContent = `${tpl.manifest.name}: ${name || 'ohne Titel'}`;
  document.querySelector('#serie-bericht').innerHTML = '';
  document.querySelector('#serie-ausgabe').classList.add('hidden');
  document.querySelector('#serie-vorschau-kopf').classList.add('hidden');
  document.querySelector('#serie-fortschritt').classList.add('hidden');
  document.querySelector('#serie-stage').innerHTML = '';
  document.querySelector('#view-editor').classList.add('hidden');
  document.querySelector('#view-serie').classList.remove('hidden');
}

function wireSerieUi() {
  document.querySelector('#btn-serie-muster').addEventListener('click', serieMusterSpeichern);
  document.querySelector('#btn-serie-csv').addEventListener('click', serieCsvLaden);
  document.querySelector('#btn-serie-pdf').addEventListener('click', serieSammelPdf);
  document.querySelector('#btn-serie-druck').addEventListener('click', serieDrucken);
  document.querySelector('#btn-serie-dateien').addEventListener('click', serieEinzeldateien);
  document.querySelector('#btn-serie-abbrechen').addEventListener('click', () => {
    abbruch = true;
  });
  document.querySelector('#btn-serie-erste').addEventListener('click', () => serieVorschau(0));
  document.querySelector('#btn-serie-letzte').addEventListener('click', () =>
    serieVorschau(serie.wertesaetze.length - 1)
  );
  document.querySelector('#btn-serie-back').addEventListener('click', () => {
    document.querySelector('#view-serie').classList.add('hidden');
    document.querySelector('#view-editor').classList.remove('hidden');
  });
  window.addEventListener('resize', () => fitFrame(document.querySelector('#serie-stage'), serieFrame));
}

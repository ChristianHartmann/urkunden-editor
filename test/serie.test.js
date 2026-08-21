'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { musterSpalten, mischeWerte, pruefe, dateiname } = require('../src/main/serie');

const FELDER = [
  { key: 'handlerName', type: 'text' },
  { key: 'body', type: 'textarea' },
  { key: 'nummer', type: 'number' },
  { key: 'emblem', type: 'image' },
  { key: 'showEmblem', type: 'checkbox' },
  { key: 'background', type: 'select' },
  { key: 'gapScale', type: 'range', cssVar: '--gap-scale' },
  { key: 'emblemGap', type: 'range', styleProp: 'gap' },
  { key: 'paare', type: 'range', bind: 'count' },
  { key: 'teamName', type: 'text', bind: 'team' },
];

const FELDER_MIT_GRENZEN = [
  { key: 'handlerName', type: 'text' },
  { key: 'paare', label: 'Teampaare', type: 'range', bind: 'count', min: 1, max: 4, step: 1 },
];

test('Text-, Mehrzeilen-, Zahlen- und Anzahl-Felder kommen in die Muster-CSV', () => {
  assert.deepEqual(musterSpalten(FELDER), ['handlerName', 'body', 'nummer', 'paare']);
});

test('die Anzahl aus der Zeile überschreibt die der Blaupause', () => {
  // Wie viele Teilnehmer eine Urkunde nennt, gehört zur Teilnehmerliste und
  // nicht zur Gestaltung: in einer Serie stehen Zweier- und Einzelteams
  // nebeneinander.
  const bekannt = musterSpalten(FELDER);
  assert.equal(mischeWerte({ paare: 2 }, { paare: '1' }, bekannt).paare, '1');
  assert.equal(mischeWerte({ paare: 2 }, { paare: '' }, bekannt).paare, 2);
});

test('eine Anzahl außerhalb des erlaubten Bereichs ist auffällig', () => {
  const { auffaellig } = pruefe({
    fields: FELDER_MIT_GRENZEN,
    spalten: ['handlerName', 'paare'],
    zeilen: [
      { handlerName: 'Muster', paare: '1' },
      { handlerName: 'Muster', paare: 'zwei' },
      { handlerName: 'Muster', paare: '9' },
      { handlerName: 'Muster', paare: '' },
    ],
    bekannteSchluessel: musterSpalten(FELDER_MIT_GRENZEN),
  });
  assert.deepEqual(
    auffaellig.map((a) => a.zeile),
    [3, 4]
  );
  assert.match(auffaellig[0].grund, /Teampaare/);
  assert.match(auffaellig[0].grund, /1 bis 4/);
});

test('die Zeile überschreibt die Blaupause', () => {
  const werte = mischeWerte({ handlerName: 'Muster', body: 'Basistext' }, { handlerName: 'Gast' }, [
    'handlerName',
    'body',
  ]);
  assert.equal(werte.handlerName, 'Gast');
  assert.equal(werte.body, 'Basistext');
});

test('eine leere Zelle behält den Wert der Blaupause', () => {
  const werte = mischeWerte({ points: '12' }, { points: '' }, ['points']);
  assert.equal(werte.points, '12');
});

test('wer ein Feld leer haben will, lässt es in der Blaupause leer', () => {
  const werte = mischeWerte({ points: '' }, { points: '' }, ['points']);
  assert.equal(werte.points, '');
});

test('ein einzelnes Leerzeichen ist ein Wert, keine leere Zelle', () => {
  // Die Vorlagen setzen ein Leerzeichen, damit Ausfüll-Linien sichtbar bleiben.
  const werte = mischeWerte({ points: '12' }, { points: ' ' }, ['points']);
  assert.equal(werte.points, ' ');
});

test('unbekannte Spalten werden nicht übernommen', () => {
  const werte = mischeWerte({ a: '1' }, { a: '2', startnummer: '7' }, ['a']);
  assert.deepEqual(werte, { a: '2' });
});

test('die Blaupause wird nicht verändert', () => {
  const basis = { a: '1' };
  mischeWerte(basis, { a: '2' }, ['a']);
  assert.equal(basis.a, '1');
});

test('unbekannte Spalten werden gemeldet', () => {
  const { unbekannteSpalten } = pruefe({
    spalten: ['handlerName', 'startnummer'],
    zeilen: [{ handlerName: 'Muster', startnummer: '7' }],
    bekannteSchluessel: ['handlerName'],
    basis: { handlerName: 'Muster' },
  });
  assert.deepEqual(unbekannteSpalten, ['startnummer']);
});

test('eine Zeile ohne einen einzigen Wert ist auffällig', () => {
  const { auffaellig } = pruefe({
    spalten: ['handlerName'],
    zeilen: [{ handlerName: 'Muster' }, { handlerName: '' }],
    bekannteSchluessel: ['handlerName'],
    basis: { handlerName: 'Muster' },
  });
  assert.equal(auffaellig.length, 1);
  assert.equal(auffaellig[0].zeile, 3);
  assert.match(auffaellig[0].grund, /keinen Wert/);
});

test('eine Spalte, die wie ein Gestaltungsfeld heißt, überschreibt es nicht und wird als unbekannt gemeldet', () => {
  // bekannteSchluessel kommt aus musterSpalten, nicht aus allen Feldschlüsseln
  // der Vorlage - sonst würde eine Spalte "emblem" das Wappenbild überschreiben.
  const bekannteSchluessel = musterSpalten(FELDER);

  const { unbekannteSpalten } = pruefe({
    spalten: ['handlerName', 'emblem'],
    zeilen: [{ handlerName: 'Muster', emblem: 'data:sollte-nicht-gelten' }],
    bekannteSchluessel,
    basis: { handlerName: 'Muster', emblem: 'data:original' },
  });
  assert.deepEqual(unbekannteSpalten, ['emblem']);

  const werte = mischeWerte(
    { handlerName: 'Muster', emblem: 'data:original' },
    { handlerName: 'Muster', emblem: 'data:sollte-nicht-gelten' },
    bekannteSchluessel
  );
  assert.equal(werte.emblem, 'data:original');
});

test('Dateinamen werden von Sonderzeichen befreit', () => {
  const vergeben = new Set();
  assert.equal(dateiname({ a: 'Muster/Max', b: 'Stufe 3' }, ['a', 'b'], vergeben), 'Muster Max Stufe 3.pdf');
});

test('gleiche Namen werden durchnummeriert statt überschrieben', () => {
  const vergeben = new Set();
  assert.equal(dateiname({ a: 'Muster' }, ['a'], vergeben), 'Muster.pdf');
  assert.equal(dateiname({ a: 'Muster' }, ['a'], vergeben), 'Muster (2).pdf');
  assert.equal(dateiname({ a: 'muster' }, ['a'], vergeben), 'muster (3).pdf');
});

test('ohne brauchbaren Namen gibt es einen Ersatznamen', () => {
  const vergeben = new Set();
  assert.equal(dateiname({ a: '   ' }, ['a'], vergeben), 'Urkunde.pdf');
});

test('ein sehr langer Name wird vor der Endung gekürzt', () => {
  const vergeben = new Set();
  const lang = 'A'.repeat(200);
  const name = dateiname({ a: lang }, ['a'], vergeben);
  assert.equal(name, 'A'.repeat(100) + '.pdf');
});

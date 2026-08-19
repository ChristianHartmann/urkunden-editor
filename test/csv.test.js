'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { dekodiere, leseCsv, schreibeCsv } = require('../src/main/csv');

test('Byte-Order-Mark wird abgeschnitten', () => {
  const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a;b', 'utf8')]);
  assert.equal(dekodiere(buf), 'a;b');
});

test('gültiges UTF-8 bleibt UTF-8', () => {
  assert.equal(dekodiere(Buffer.from('Müller;Straße', 'utf8')), 'Müller;Straße');
});

test('westeuropäisch kodierte Umlaute werden erkannt', () => {
  // So schreibt deutsches Excel eine CSV ohne Zutun: ein Byte je Umlaut.
  assert.equal(dekodiere(Buffer.from('M\xfcller', 'latin1')), 'Müller');
});

test('Semikolon ist das Trennzeichen deutscher Listen', () => {
  const { spalten, zeilen } = leseCsv('name;hund\nMuster;Rex\n');
  assert.deepEqual(spalten, ['name', 'hund']);
  assert.deepEqual(zeilen, [{ name: 'Muster', hund: 'Rex' }]);
});

test('Komma und Tabulator werden ebenso erkannt', () => {
  assert.deepEqual(leseCsv('a,b\n1,2\n').spalten, ['a', 'b']);
  assert.deepEqual(leseCsv('a\tb\n1\t2\n').spalten, ['a', 'b']);
});

test('Anführungszeichen umschließen Trennzeichen, Umbruch und doppelte Zeichen', () => {
  const text = 'name;text\n"Muster; Max";"Zeile1\nZeile2"\n"Er sagte ""hallo""";x\n';
  const { zeilen } = leseCsv(text);
  assert.equal(zeilen[0].name, 'Muster; Max');
  assert.equal(zeilen[0].text, 'Zeile1\nZeile2');
  assert.equal(zeilen[1].name, 'Er sagte "hallo"');
});

test('Windows-Zeilenenden und leere Zeilen stören nicht', () => {
  const { zeilen } = leseCsv('a;b\r\n1;2\r\n\r\n3;4\r\n\r\n');
  assert.deepEqual(zeilen, [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
});

test('zu wenige Spalten werden ergänzt und gemeldet', () => {
  const { zeilen, hinweise } = leseCsv('a;b;c\n1;2\n');
  assert.deepEqual(zeilen, [{ a: '1', b: '2', c: '' }]);
  assert.deepEqual(hinweise, [{ art: 'zuWenigeSpalten', zeile: 2 }]);
});

test('zu viele Spalten werden verworfen und gemeldet', () => {
  const { zeilen, hinweise } = leseCsv('a;b\n1;2;3\n');
  assert.deepEqual(zeilen, [{ a: '1', b: '2' }]);
  assert.deepEqual(hinweise, [{ art: 'zuVieleSpalten', zeile: 2 }]);
});

test('eine komplett leere Zeile zwischen Daten wird gemeldet', () => {
  const { zeilen, hinweise } = leseCsv('a;b\n1;2\n\n3;4\n');
  assert.deepEqual(zeilen, [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  assert.deepEqual(hinweise, [{ art: 'leereZeile', zeile: 3 }]);
});

test('leere Zeilen am Ende der Datei sind kein Hinweis', () => {
  const { zeilen, hinweise } = leseCsv('a;b\n1;2\n\n\n');
  assert.deepEqual(zeilen, [{ a: '1', b: '2' }]);
  assert.deepEqual(hinweise, []);
});

test('doppelte Spaltennamen werden gemeldet', () => {
  const { spalten, hinweise } = leseCsv('a;b;a\n1;2;3\n');
  assert.deepEqual(spalten, ['a', 'b', 'a']);
  assert.deepEqual(hinweise, [{ art: 'doppelteSpalte', zeile: 1, spalte: 'a' }]);
});

test('eine Datei ohne Datenzeilen liefert keine Zeilen', () => {
  const { spalten, zeilen } = leseCsv('a;b\n');
  assert.deepEqual(spalten, ['a', 'b']);
  assert.deepEqual(zeilen, []);
});

test('Rundlauf: was geschrieben wurde, wird wieder gelesen', () => {
  const spalten = ['name', 'text'];
  const zeilen = [{ name: 'Muster; Max', text: 'Er sagte "hallo"\nund ging' }];
  const csv = schreibeCsv(spalten, zeilen);
  assert.ok(csv.startsWith('﻿'), 'Byte-Order-Mark fehlt');
  const zurueck = leseCsv(dekodiere(Buffer.from(csv, 'utf8')));
  assert.deepEqual(zurueck.zeilen, zeilen);
});

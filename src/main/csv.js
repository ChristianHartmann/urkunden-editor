'use strict';

// CSV lesen und schreiben, zugeschnitten auf das, was aus Excel kommt:
// Semikolon als Trennzeichen, Windows-Zeilenenden, und Dateien, die nicht in
// UTF-8 gespeichert wurden. Reine Funktionen, kein Electron.

const TRENNZEICHEN = [';', ',', '\t'];

// Byte-Order-Mark abschneiden und die Kodierung bestimmen. Wer in Excel auf
// "Speichern unter - CSV" klickt, bekommt je nach Version keine UTF-8-Datei;
// ohne diesen Rückfall stünde "MÃ¼ller" auf der Urkunde.
function dekodiere(buffer) {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  const text = buffer.toString('utf8');
  // Das Ersetzungszeichen entsteht nur, wenn die Bytes kein gültiges UTF-8 waren.
  return text.includes('�') ? buffer.toString('latin1') : text;
}

// Häufigstes der bekannten Trennzeichen in der Kopfzeile, außerhalb von
// Anführungszeichen gezählt.
function findeTrennzeichen(text) {
  const kopf = text.split(/\r?\n/)[0] || '';
  let bestes = ';';
  let meiste = 0;
  for (const kandidat of TRENNZEICHEN) {
    let anzahl = 0;
    let inAnfuehrung = false;
    for (const zeichen of kopf) {
      if (zeichen === '"') inAnfuehrung = !inAnfuehrung;
      else if (zeichen === kandidat && !inAnfuehrung) anzahl++;
    }
    if (anzahl > meiste) {
      meiste = anzahl;
      bestes = kandidat;
    }
  }
  return bestes;
}

// Zerlegt den Text in Zeilen aus Feldern. Anführungszeichen dürfen
// Trennzeichen und Zeilenumbrüche enthalten, "" steht für ein Anführungszeichen.
function zerlege(text, trenner) {
  const zeilen = [];
  let felder = [];
  let feld = '';
  let inAnfuehrung = false;

  for (let i = 0; i < text.length; i++) {
    const z = text[i];
    if (inAnfuehrung) {
      if (z === '"' && text[i + 1] === '"') {
        feld += '"';
        i++;
      } else if (z === '"') {
        inAnfuehrung = false;
      } else {
        feld += z;
      }
      continue;
    }
    if (z === '"') inAnfuehrung = true;
    else if (z === trenner) {
      felder.push(feld);
      feld = '';
    } else if (z === '\n') {
      felder.push(feld);
      zeilen.push(felder);
      felder = [];
      feld = '';
    } else if (z !== '\r') {
      feld += z;
    }
  }
  felder.push(feld);
  zeilen.push(felder);
  return zeilen;
}

function istLeer(felder) {
  return felder.every((f) => f.trim() === '');
}

function leseCsv(text) {
  const trenner = findeTrennzeichen(text);
  let roh = zerlege(text, trenner);

  // Leere Zeilen am Ende sind der übliche Abschluss jeder Textdatei (der
  // letzte Zeilenumbruch erzeugt selbst eine) - keine Auffälligkeit. Erst
  // eine leere Zeile, auf die noch Daten folgen, ist eine.
  while (roh.length > 0 && istLeer(roh[roh.length - 1])) roh.pop();

  const hinweise = [];
  const gefuellt = [];
  roh.forEach((felder, i) => {
    if (istLeer(felder)) {
      // Zeilennummer aus Sicht des Anwenders: die Kopfzeile ist Zeile 1.
      hinweise.push({ art: 'leereZeile', zeile: i + 1 });
      return;
    }
    gefuellt.push({ felder, nummer: i + 1 });
  });
  roh = gefuellt;

  if (roh.length === 0) return { spalten: [], zeilen: [], hinweise };

  const spalten = roh[0].felder.map((s) => s.trim());

  // Doppelte Spaltennamen überschreiben sich beim Einlesen sonst still.
  const gesehen = new Set();
  for (const spalte of spalten) {
    if (gesehen.has(spalte)) hinweise.push({ art: 'doppelteSpalte', zeile: 1, spalte });
    gesehen.add(spalte);
  }

  const zeilen = [];
  for (let i = 1; i < roh.length; i++) {
    const { felder, nummer } = roh[i];
    if (felder.length < spalten.length) hinweise.push({ art: 'zuWenigeSpalten', zeile: nummer });
    if (felder.length > spalten.length) hinweise.push({ art: 'zuVieleSpalten', zeile: nummer });

    const zeile = {};
    spalten.forEach((spalte, k) => {
      zeile[spalte] = felder[k] === undefined ? '' : felder[k];
    });
    zeilen.push(zeile);
  }

  return { spalten, zeilen, hinweise };
}

function maskiere(wert) {
  const text = wert == null ? '' : String(wert);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Mit Byte-Order-Mark und CRLF, damit Excel die Datei per Doppelklick richtig
// öffnet: in Spalten getrennt und mit lesbaren Umlauten.
function schreibeCsv(spalten, zeilen) {
  const kopf = spalten.map(maskiere).join(';');
  const rumpf = zeilen.map((z) => spalten.map((s) => maskiere(z[s])).join(';'));
  return '﻿' + [kopf, ...rumpf].join('\r\n') + '\r\n';
}

module.exports = { dekodiere, leseCsv, schreibeCsv };

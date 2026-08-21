'use strict';

// Die Logik einer Serie: welche Felder in die Muster-CSV gehören, wie eine
// Zeile die Blaupause überschreibt, was am Ergebnis auffällig ist und wie die
// Einzeldateien heißen. Reine Funktionen, kein Electron.

// Felder, die sich je Teilnehmer sinnvoll ändern. Bilder, Regler, Häkchen und
// Auswahlfelder gehören zur Gestaltung der Vorlage, nicht zur Teilnehmerliste.
const SERIEN_TYPEN = new Set(['text', 'textarea', 'number']);

// Ausnahme unter den Reglern: ein Anzahl-Feld sagt, wie viele Namen die
// Urkunde nennt. Das ist Teilnehmerangabe und keine Gestaltung - eine Serie
// enthält Einzel- und Zweierteams nebeneinander.
function istAnzahl(field) {
  return field.bind === 'count';
}

function musterSpalten(fields) {
  return fields
    .filter((f) => istAnzahl(f) || (SERIEN_TYPEN.has(f.type) && !f.cssVar && !f.styleProp && !f.bind))
    .map((f) => f.key);
}

// Werte der Blaupause, überschrieben von den Spalten der Zeile. Eine leere
// Zelle überschreibt nichts: sie bedeutet "hier steht, was in der Urkunde
// eingestellt ist". Wer ein Feld leer haben will, lässt es schon in der
// Blaupause leer. Ein Leerzeichen ist dagegen ein Wert - die Vorlagen nutzen
// es, damit Ausfüll-Linien sichtbar bleiben.
function mischeWerte(basis, zeile, bekannteSchluessel) {
  const werte = { ...basis };
  for (const schluessel of bekannteSchluessel) {
    const wert = zeile[schluessel];
    if (wert === undefined || wert === '') continue;
    werte[schluessel] = wert;
  }
  return werte;
}

// Eine Anzahl, die keine ganze Zahl im erlaubten Bereich ist, druckt still das
// falsche Blatt: aus "zwei" wird beim Rendern eine 0, die Urkunde nennt dann
// niemanden. Darum vor dem Erzeugen melden statt hinterher zählen.
function anzahlBeanstandung(field, zelle) {
  const roh = String(zelle ?? '').trim();
  if (roh === '') return null; // leere Zelle: es gilt die Blaupause
  const min = field.min ?? 1;
  const max = field.max ?? Infinity;
  const zahl = Number(roh);
  if (Number.isInteger(zahl) && zahl >= min && zahl <= max) return null;
  const bereich = Number.isFinite(max) ? `${min} bis ${max}` : `ab ${min}`;
  return `"${field.label || field.key}": "${roh}" ist keine ganze Zahl ${bereich}`;
}

function pruefe({ fields, spalten, zeilen, bekannteSchluessel }) {
  const bekannt = new Set(bekannteSchluessel);
  const unbekannteSpalten = spalten.filter((s) => !bekannt.has(s));
  const anzahlFelder = (fields || []).filter((f) => istAnzahl(f) && bekannt.has(f.key));
  const auffaellig = [];

  zeilen.forEach((zeile, index) => {
    // Zeilennummer aus Sicht des Anwenders: die Kopfzeile ist Zeile 1.
    const nummer = index + 2;

    for (const feld of anzahlFelder) {
      const grund = anzahlBeanstandung(feld, zeile[feld.key]);
      if (grund) auffaellig.push({ zeile: nummer, grund });
    }

    // Seit eine leere Zelle den Wert der Blaupause behält, ist nicht mehr die
    // einzelne leere Zelle auffällig, sondern die Zeile, die überhaupt nichts
    // beiträgt: sie ergäbe eine zweite Urkunde mit den Werten der Blaupause.
    const gefuellt = spalten
      .filter((s) => bekannt.has(s))
      .filter((s) => String(zeile[s] ?? '') !== '');
    if (gefuellt.length === 0) {
      auffaellig.push({ zeile: nummer, grund: 'enthält keinen Wert, ergibt eine Kopie der Vorlage' });
    }
  });

  return { unbekannteSpalten, auffaellig };
}

function dateiname(zeile, spalten, vergeben) {
  const roh = spalten
    .map((s) => String(zeile[s] ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const sauber = roh
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Ohne Grenze bringt eine mehrzeilige Spalte einen Dateinamen zustande, an
  // dem das Dateisystem mit einem Systemfehler statt einer Meldung scheitert.
  const name = (sauber || 'Urkunde').slice(0, 100).trim() || 'Urkunde';

  let kandidat = name;
  let n = 2;
  while (vergeben.has(kandidat.toLowerCase())) {
    kandidat = `${name} (${n})`;
    n++;
  }
  vergeben.add(kandidat.toLowerCase());
  return `${kandidat}.pdf`;
}

module.exports = { musterSpalten, mischeWerte, pruefe, dateiname };

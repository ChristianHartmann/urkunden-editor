'use strict';

// Wo eine Variante ihre gespeicherten Urkunden und Wappen ablegt.
//
// Electron leitet den userData-Ordner sonst aus dem Feld "name" der
// package.json ab - und das ist für alle Varianten dasselbe. Zwei Varianten
// schrieben dadurch in denselben Ordner, in der Entwicklung wie im fertigen
// Installer: eine Urkunde der einen Variante tauchte bei der anderen unter
// "Meine Urkunden" auf. Der Ordner hängt deshalb an der Varianten-ID, nicht
// am Produktnamen.

const fs = require('fs');

function userDataOrdner(basisName, variantenId) {
  return `${basisName}-${variantenId}`;
}

// Einmaliger Umzug des Ordners der Vorgängerversion, die noch keine Varianten
// kannte. Nur die Variante, die diese Vorgängerversion fortsetzt, erbt ihn -
// und nur, solange sie selbst noch nichts gespeichert hat. Gibt zurück, ob
// umgezogen wurde.
function uebernimmAltenOrdner(altPfad, neuPfad) {
  if (!fs.existsSync(altPfad) || fs.existsSync(neuPfad)) return false;
  try {
    fs.renameSync(altPfad, neuPfad);
    return true;
  } catch (e) {
    // Liegt der alte Ordner auf einem anderen Dateisystem, ist ein Umzug nicht
    // möglich. Die App startet dann mit leerem Speicher, statt nicht zu starten.
    return false;
  }
}

module.exports = { userDataOrdner, uebernimmAltenOrdner };

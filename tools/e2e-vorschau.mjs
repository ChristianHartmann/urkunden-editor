// Prüft am laufenden Programm, dass eine Änderung im Formular in der Vorschau
// ankommt. Das lässt sich nur so prüfen: die Vorschau ist ein iframe, und ob
// der Renderer hineinschreiben darf, entscheidet sich erst zur Laufzeit.
//
// Aufruf: node tools/e2e-vorschau.mjs [variante]

import { spawn } from 'node:child_process';

const VARIANTE = process.argv[2] || 'standard';
const PORT = 9333;

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));

async function findeSeite() {
  for (let i = 0; i < 60; i++) {
    try {
      const ziele = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const seite = ziele.find((z) => z.type === 'page' && z.webSocketDebuggerUrl);
      if (seite) return seite.webSocketDebuggerUrl;
    } catch (e) {
      /* das Programm startet noch */
    }
    await schlafe(500);
  }
  throw new Error('Das Programm hat sich nicht gemeldet.');
}

// Wartet, bis der übergebene Ausdruck in der Seite wahr auswertet, statt eine
// feste Zeit zu schlafen. 100 Versuche à 50ms sind eine großzügige Zeitgrenze
// von 5 Sekunden, die im Normalfall nie ausgeschöpft wird.
async function wartetAufBedingung(ws, ausdruck, beschreibung, maxVersuche = 100, wartMs = 50) {
  for (let i = 0; i < maxVersuche; i++) {
    if (await werteAus(ws, ausdruck)) return;
    await schlafe(wartMs);
  }
  throw new Error(`Zeitüberschreitung beim Warten auf: ${beschreibung}`);
}

function verbinde(url) {
  return new Promise((fertig, fehler) => {
    const ws = new WebSocket(url);
    ws.onopen = () => fertig(ws);
    ws.onerror = (e) => fehler(new Error('Verbindung fehlgeschlagen: ' + e.message));
  });
}

let nummer = 0;
function werteAus(ws, ausdruck) {
  const id = ++nummer;
  return new Promise((fertig, fehler) => {
    const beiNachricht = (ev) => {
      const nachricht = JSON.parse(ev.data);
      if (nachricht.id !== id) return;
      ws.removeEventListener('message', beiNachricht);
      const ergebnis = nachricht.result;
      if (ergebnis.exceptionDetails) {
        fehler(new Error(ergebnis.exceptionDetails.exception?.description || 'Fehler in der Seite'));
      } else {
        fertig(ergebnis.result.value);
      }
    };
    ws.addEventListener('message', beiNachricht);
    ws.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression: ausdruck, awaitPromise: true, returnByValue: true },
      })
    );
  });
}

const app = spawn('./node_modules/.bin/electron', ['.', '--no-sandbox', `--remote-debugging-port=${PORT}`], {
  env: { ...process.env, VARIANT: VARIANTE },
  stdio: 'ignore',
});

let code = 1;
try {
  const ws = await verbinde(await findeSeite());

  await wartetAufBedingung(
    ws,
    `!!document.querySelector('#template-cards .card button.btn.primary')`,
    'die Vorlagenkarte ist gerendert'
  );

  // Erste Vorlage öffnen
  await werteAus(ws, `document.querySelector('#template-cards .card button.btn.primary').click(); true`);

  await wartetAufBedingung(
    ws,
    `(() => {
      const feld = [...document.querySelectorAll('#form .field')]
        .find((f) => f.querySelector('input[type="text"]'));
      if (!feld) return false;
      const rahmen = document.querySelector('#preview-stage iframe');
      const dok = rahmen && rahmen.contentDocument;
      return !!(dok && dok.body && dok.body.textContent.length > 0);
    })()`,
    'das Formular und die gefüllte Vorschau sind da'
  );

  const ergebnis = await werteAus(
    ws,
    `(async () => {
      const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
      const feld = [...document.querySelectorAll('#form .field')]
        .find((f) => f.querySelector('input[type="text"]'));
      if (!feld) return { fehler: 'kein Textfeld im Formular' };
      const beschriftung = feld.querySelector('label').textContent;
      const eingabe = feld.querySelector('input[type="text"]');

      const rahmen = document.querySelector('#preview-stage iframe');
      const dok = rahmen && rahmen.contentDocument;
      if (!dok) return { fehler: 'die Vorschau ist von außen nicht erreichbar' };

      const vorher = dok.body.textContent;
      eingabe.value = 'Probe der Vorschau';
      eingabe.dispatchEvent(new Event('input', { bubbles: true }));

      // Statt fest zu warten: bis zu 5 Sekunden lang prüfen, ob der Text
      // angekommen ist. Das echte Nichtankommen wird dadurch nicht als
      // "noch nicht fertig" durchgereicht - läuft die Zeit ab, ist der
      // zuletzt gelesene Vorschau-Inhalt derselbe, der auch gemeldet wird.
      let nachher = rahmen.contentDocument.body.textContent;
      for (let i = 0; i < 100 && !nachher.includes('Probe der Vorschau'); i++) {
        await schlafe(50);
        nachher = rahmen.contentDocument.body.textContent;
      }
      return {
        beschriftung,
        angekommen: nachher.includes('Probe der Vorschau'),
        geaendert: vorher !== nachher,
        nachherAusschnitt: nachher.slice(0, 200),
      };
    })()`
  );

  if (ergebnis.fehler) throw new Error(ergebnis.fehler);
  if (!ergebnis.angekommen) {
    throw new Error(
      `Die Änderung am Feld "${ergebnis.beschriftung}" kam in der Vorschau nicht an ` +
        `(Vorschau enthielt stattdessen: "${ergebnis.nachherAusschnitt}").`
    );
  }
  console.log(`In Ordnung: Änderung am Feld "${ergebnis.beschriftung}" erscheint in der Vorschau.`);
  code = 0;
} catch (e) {
  console.error('Fehlgeschlagen:', e.message);
} finally {
  app.kill();
  await schlafe(300);
  process.exit(code);
}

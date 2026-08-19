'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const storage = require('./main/storage');
const { leseCsv, schreibeCsv, dekodiere } = require('./main/csv');
const serie = require('./main/serie');

const { toDataUri, entflechteDatenUris } = require('./main/data-uri');
const { loadVariant, readVariantConfig, findVariantDir } = require('./main/variant');
const { userDataOrdner, uebernimmAltenOrdner } = require('./main/user-data');

const ROOT = app.getAppPath();
const isDev = !app.isPackaged;

// Welche Variante läuft: in der Entwicklung per Umgebung,
// im Installer beim Packen über extraMetadata eingebrannt.
function variantId() {
  if (process.env.VARIANT) return process.env.VARIANT;
  try {
    const pkg = require(path.join(ROOT, 'package.json'));
    if (pkg.variant) return pkg.variant;
  } catch (e) {
    /* ohne package.json: Default */
  }
  return 'standard';
}

// Wo nach Varianten gesucht wird, in dieser Reihenfolge. Steht an einer
// Stelle, damit die Reihenfolge nachlesbar ist statt verteilt zu entstehen.
//
//  1. URKUNDEN_VARIANTS - für die Entwicklung, wenn die Varianten in einem
//     Nachbar-Repo liegen. Mehrere Pfade wie in PATH getrennt.
//  2. resourcesPath - die vom Build ins Paket kopierte Variante. Nur gepackt.
//  3. das eigene variants/ - die mitgelieferte Standard-Variante.
function variantPaths() {
  const pfade = [];
  if (process.env.URKUNDEN_VARIANTS) {
    pfade.push(...process.env.URKUNDEN_VARIANTS.split(path.delimiter).filter(Boolean));
  }
  if (app.isPackaged) pfade.push(path.join(process.resourcesPath, 'variants'));
  pfade.push(path.join(ROOT, 'variants'));
  return pfade;
}

// Lädt ein fertiges Urkunden-HTML in ein unsichtbares Fenster (für PDF/Druck).
async function htmlToWindow(html) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false },
  });
  const dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'urkunde-'));
  // Ab hier entstehen Verzeichnis und Fenster gemeinsam: schlägt etwas fehl,
  // bevor beide an den Aufrufer zurückgereicht sind, kennt niemand sonst mehr
  // den Pfad - also selbst aufräumen und den Fehler weiterreichen.
  try {
    const entflochten = entflechteDatenUris(html, dir);
    const tmp = path.join(dir, 'urkunde.html');
    fs.writeFileSync(tmp, entflochten.html, 'utf8');
    await win.loadFile(tmp);
    // Auf eingebettete Schriften warten, damit das PDF sie enthält.
    await win.webContents
      .executeJavaScript(
        'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true'
      )
      .catch(() => {});
    return { win, dir };
  } catch (err) {
    cleanup(win, dir);
    throw err;
  }
}

function cleanup(win, dir) {
  try {
    win.destroy();
  } catch (e) {}
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {}
}

// ---------- IPC ----------

function registerIpc(boot) {
  ipcMain.handle('app:bootstrap', () => boot);

  ipcMain.handle('dialog:openImage', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Bild auswählen',
      properties: ['openFile'],
      filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
    });
    if (canceled || !filePaths[0]) return null;
    try {
      return toDataUri(filePaths[0]);
    } catch (e) {
      return null;
    }
  });

  ipcMain.handle('urkunde:exportPdf', async (e, { html, suggestedName }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Als PDF speichern',
      defaultPath: suggestedName || 'Urkunde.pdf',
      filters: [{ name: 'PDF-Dokument', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };

    let win, dir;
    try {
      ({ win, dir } = await htmlToWindow(html));
      const data = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      fs.writeFileSync(filePath, data);
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: String(err) };
    } finally {
      if (win) cleanup(win, dir);
    }
  });

  ipcMain.handle('urkunde:openPdf', (e, filePath) => shell.openPath(filePath));

  ipcMain.handle('urkunde:print', async (e, { html }) => {
    let win, dir;
    try {
      ({ win, dir } = await htmlToWindow(html));
    } catch (err) {
      return { ok: false, error: String(err) };
    }
    return await new Promise((resolve) => {
      win.webContents.print(
        {
          silent: false,
          printBackground: true,
          pageSize: 'A4',
          margins: { marginType: 'none' },
        },
        (success, reason) => {
          cleanup(win, dir);
          resolve({ ok: success, reason });
        }
      );
    });
  });

  // Speicherverwaltung
  ipcMain.handle('store:list', () => storage.list());
  ipcMain.handle('store:read', (e, id) => storage.read(id));
  ipcMain.handle('store:save', (e, doc) => storage.save(doc));
  ipcMain.handle('store:delete', (e, id) => storage.remove(id));

  // ---------- Serie ----------

  ipcMain.handle('serie:musterSpeichern', async (e, { spalten, zeilen, vorschlag }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Muster-CSV speichern',
      defaultPath: vorschlag || 'Teilnehmer.csv',
      filters: [{ name: 'CSV-Datei', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(filePath, schreibeCsv(spalten, zeilen), 'utf8');
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('serie:csvLaden', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Teilnehmerliste wählen',
      properties: ['openFile'],
      filters: [{ name: 'CSV-Datei', extensions: ['csv', 'txt'] }],
    });
    if (canceled || !filePaths[0]) return { ok: false, canceled: true };
    try {
      const gelesen = leseCsv(dekodiere(fs.readFileSync(filePaths[0])));
      return { ok: true, name: path.basename(filePaths[0]), ...gelesen };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('serie:ordnerWaehlen', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Ordner für die Urkunden wählen',
      properties: ['openDirectory', 'createDirectory'],
    });
    return canceled || !filePaths[0] ? null : filePaths[0];
  });

  ipcMain.handle('serie:vorbereiten', (e, { fields, basis, spalten, zeilen }) => {
    // Bekannt ist nur, was die Muster-CSV auch anbietet: sonst würde eine
    // Spalte, die zufällig wie ein Gestaltungsfeld heißt (z. B. "emblem"),
    // dieses Feld still überschreiben, statt als unbekannt gemeldet zu werden.
    const musterbare = serie.musterSpalten(fields);
    const bericht = serie.pruefe({ spalten, zeilen, bekannteSchluessel: musterbare, basis });
    const wertesaetze = zeilen.map((z) => serie.mischeWerte(basis, z, musterbare));
    return { musterbare, ...bericht, wertesaetze };
  });

  ipcMain.handle('serie:dateinamen', (e, { zeilen, spalten }) => {
    const vergeben = new Set();
    return zeilen.map((z) => serie.dateiname(z, spalten, vergeben));
  });

  // Schreibt ein PDF an einen bereits bekannten Pfad. Der Renderer ruft das je
  // Zeile auf und führt Fortschritt und Abbruch selbst - dadurch braucht es
  // keine Ereignisse zurück in den Renderer. Ordner und Dateiname kommen
  // getrennt an und werden hier mit path.join zusammengesetzt, statt dass der
  // Renderer sie mit einem Schrägstrich zusammenklebt - unter Windows wäre
  // das der falsche Trenner. path.basename auf den Dateinamen verhindert
  // außerdem, dass ein Dateiname mit Pfadtrennern aus dem gewählten Ordner
  // ausbricht.
  ipcMain.handle('serie:pdfSchreiben', async (e, { html, ordner, dateiname }) => {
    const dateipfad = path.join(ordner, path.basename(dateiname));
    let win, dir;
    try {
      ({ win, dir } = await htmlToWindow(html));
      const data = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      fs.writeFileSync(dateipfad, data);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    } finally {
      if (win) cleanup(win, dir);
    }
  });
}

// ---------- Fenster ----------

function createWindow(variant) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: '#f4f1ea',
    title: `Urkunden-Editor - ${variant.name}`,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Ohne dies überschreibt Electron den Fenstertitel nach dem Laden mit dem
  // statischen <title> aus index.html, und der Variantenname in der Titelzeile
  // (oben gesetzt) verschwindet wieder.
  win.on('page-title-updated', (e) => e.preventDefault());

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  return win;
}

Menu.setApplicationMenu(null);

// Jede Variante speichert für sich. Ohne das läge alles im selben Ordner, weil
// Electron ihn aus dem Feld "name" der package.json ableitet - für alle
// Varianten dasselbe. Das muss vor dem Start geschehen: danach hat Chromium den
// Standardordner bereits angelegt und benutzt.
function setzeSpeicherort() {
  let variante;
  try {
    variante = readVariantConfig(findVariantDir(variantId(), variantPaths()));
  } catch (e) {
    return; // Die Meldung dazu kommt beim Laden der Variante, siehe unten.
  }
  const basis = app.getName();
  const ziel = path.join(app.getPath('appData'), userDataOrdner(basis, variante.id));
  if (variante.vorgaengerSpeicher) {
    uebernimmAltenOrdner(path.join(app.getPath('appData'), basis), ziel);
  }
  app.setPath('userData', ziel);
}

setzeSpeicherort();

app.whenReady().then(() => {
  let boot;
  try {
    boot = loadVariant(variantId(), { rootDir: ROOT, variantPaths: variantPaths() });
  } catch (err) {
    dialog.showErrorBox(
      'Urkunden-Editor kann nicht starten',
      `Die Variante konnte nicht geladen werden:\n\n${err && err.message ? err.message : err}`
    );
    app.quit();
    return;
  }
  registerIpc(boot);
  createWindow(boot.variant);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(boot.variant);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

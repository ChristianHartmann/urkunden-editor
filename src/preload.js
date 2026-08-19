'use strict';

// Sichere Brücke zwischen Oberfläche (Renderer) und Main-Prozess.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  openImage: () => ipcRenderer.invoke('dialog:openImage'),

  exportPdf: (html, suggestedName) =>
    ipcRenderer.invoke('urkunde:exportPdf', { html, suggestedName }),
  openPdf: (filePath) => ipcRenderer.invoke('urkunde:openPdf', filePath),
  print: (html) => ipcRenderer.invoke('urkunde:print', { html }),

  store: {
    list: () => ipcRenderer.invoke('store:list'),
    read: (id) => ipcRenderer.invoke('store:read', id),
    save: (doc) => ipcRenderer.invoke('store:save', doc),
    remove: (id) => ipcRenderer.invoke('store:delete', id),
  },

  serie: {
    musterSpeichern: (spalten, zeilen, vorschlag) =>
      ipcRenderer.invoke('serie:musterSpeichern', { spalten, zeilen, vorschlag }),
    csvLaden: () => ipcRenderer.invoke('serie:csvLaden'),
    ordnerWaehlen: () => ipcRenderer.invoke('serie:ordnerWaehlen'),
    pdfSchreiben: (html, ordner, dateiname) =>
      ipcRenderer.invoke('serie:pdfSchreiben', { html, ordner, dateiname }),
    vorbereiten: (fields, basis, spalten, zeilen) =>
      ipcRenderer.invoke('serie:vorbereiten', { fields, basis, spalten, zeilen }),
    dateinamen: (zeilen, spalten) => ipcRenderer.invoke('serie:dateinamen', { zeilen, spalten }),
  },
});

// Skaliert PNG-Bilder ohne externe Abhängigkeiten.
// Aufruf: node tools/resize-image.mjs <quelle> <ziel> <breite|x<hoehe>>
//
// Warum von Hand statt mit einem Bildwerkzeug: das Projekt soll ohne
// zusätzliche Abhängigkeiten auskommen, ImageMagick ist nicht überall da, und
// der Weg über Electrons Chromium wird auf manchen Rechnern beim Zeichnen
// abgeschossen. zlib bringt Node mit, mehr braucht ein PNG nicht.
//
// Unterstützt 8 Bit, nicht interlaced, mit und ohne Alphakanal - genau das,
// was die Logos und Wasserzeichen dieses Projekts sind.
//
// Werkzeug für einmalige Umrechnungen der mitgelieferten Bilder, keine
// Bibliothek: es deckt nur die Fälle ab, die hier vorkommen, nicht PNG
// allgemein.

import fs from 'node:fs';
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// PNG lesen: Kopfdaten und die entpackten, entfilterten Bildpunkte.
function decodePng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} ist kein PNG.`);

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const depth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(
      `${file}: nur 8 Bit ohne Interlace, mit oder ohne Alpha (Farbtyp 2 oder 6). ` +
        `Gefunden: Tiefe ${depth}, Farbtyp ${colorType}, Interlace ${interlace}.`
    );
  }
  const channels = colorType === 6 ? 4 : 3;

  const teile = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const typ = buf.toString('latin1', pos + 4, pos + 8);
    if (typ === 'IDAT') teile.push(buf.subarray(pos + 8, pos + 8 + len));
    if (typ === 'IEND') break;
    pos += len + 12;
  }
  const roh = zlib.inflateSync(Buffer.concat(teile));

  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = roh[y * (stride + 1)];
    const zeile = roh.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const ziel = y * stride;
    const oben = ziel - stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? px[ziel + i - channels] : 0;
      const b = y > 0 ? px[oben + i] : 0;
      const c = y > 0 && i >= channels ? px[oben + i - channels] : 0;
      let v = zeile[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      px[ziel + i] = v & 0xff;
    }
  }
  return { width, height, channels, colorType, px };
}

// Vergrößern durch bilineare Interpolation. Die Mittelung unten taugt nur zum
// Verkleinern: beim Vergrößern liegt in jedem Zielpunkt genau ein Quellpunkt,
// das Ergebnis wäre stufig. Auch hier wird mit Alpha gewichtet.
function vergroessern(bild, zielBreite, zielHoehe) {
  const { width, height, channels, px } = bild;
  const stride = width * channels;
  const out = Buffer.alloc(zielBreite * zielHoehe * channels);
  const hatAlpha = channels === 4;

  for (let y = 0; y < zielHoehe; y++) {
    const fy = Math.min(height - 1, ((y + 0.5) * height) / zielHoehe - 0.5);
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(height - 1, y0 + 1);
    const wy = fy - y0;

    for (let x = 0; x < zielBreite; x++) {
      const fx = Math.min(width - 1, ((x + 0.5) * width) / zielBreite - 0.5);
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(width - 1, x0 + 1);
      const wx = fx - x0;

      const ecken = [
        [y0 * stride + x0 * channels, (1 - wx) * (1 - wy)],
        [y0 * stride + x1 * channels, wx * (1 - wy)],
        [y1 * stride + x0 * channels, (1 - wx) * wy],
        [y1 * stride + x1 * channels, wx * wy],
      ];

      let r = 0, g = 0, b = 0, a = 0;
      for (const [i, gewicht] of ecken) {
        const deckung = hatAlpha ? px[i + 3] : 255;
        const w = gewicht * deckung;
        r += px[i] * w;
        g += px[i + 1] * w;
        b += px[i + 2] * w;
        a += w;
      }
      const j = (y * zielBreite + x) * channels;
      out[j] = a ? Math.round(r / a) : 0;
      out[j + 1] = a ? Math.round(g / a) : 0;
      out[j + 2] = a ? Math.round(b / a) : 0;
      // Die Gewichte summieren sich zu 1, a ist also bereits der gemittelte Alphawert.
      if (hatAlpha) out[j + 3] = Math.round(a);
    }
  }
  return { width: zielBreite, height: zielHoehe, channels, colorType: bild.colorType, px: out };
}

// Verkleinern durch Mittelung über den Quellbereich jedes Zielpunkts. Bei
// Alpha wird mit dem Alphawert gewichtet, sonst zögen durchsichtige Ränder
// ihre Farbe in die sichtbaren Kanten (sichtbar als heller Saum um ein Logo).
function verkleinern(bild, zielBreite, zielHoehe) {
  const { width, height, channels, px } = bild;
  const stride = width * channels;
  const out = Buffer.alloc(zielBreite * zielHoehe * channels);
  const hatAlpha = channels === 4;

  for (let y = 0; y < zielHoehe; y++) {
    const y0 = Math.floor((y * height) / zielHoehe);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / zielHoehe));
    for (let x = 0; x < zielBreite; x++) {
      const x0 = Math.floor((x * width) / zielBreite);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / zielBreite));

      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = sy * stride + sx * channels;
          const w = hatAlpha ? px[i + 3] : 255;
          r += px[i] * w;
          g += px[i + 1] * w;
          b += px[i + 2] * w;
          a += w;
          n++;
        }
      }
      const j = (y * zielBreite + x) * channels;
      out[j] = a ? Math.round(r / a) : 0;
      out[j + 1] = a ? Math.round(g / a) : 0;
      out[j + 2] = a ? Math.round(b / a) : 0;
      if (hatAlpha) out[j + 3] = Math.round(a / n);
    }
  }
  return { width: zielBreite, height: zielHoehe, channels, colorType: bild.colorType, px: out };
}

function resize(bild, zielBreite, zielHoehe) {
  const groesser = zielBreite > bild.width || zielHoehe > bild.height;
  return groesser
    ? vergroessern(bild, zielBreite, zielHoehe)
    : verkleinern(bild, zielBreite, zielHoehe);
}

// Legt das Bild mittig auf eine durchsichtige quadratische Fläche. App-Icons
// müssen quadratisch sein, die Logos sind es nicht.
function quadrieren(bild, kante) {
  const { width, height, px } = bild;
  const channels = 4;
  const out = Buffer.alloc(kante * kante * channels); // durchsichtig
  const dx = Math.floor((kante - width) / 2);
  const dy = Math.floor((kante - height) / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * bild.channels;
      const j = ((y + dy) * kante + (x + dx)) * channels;
      out[j] = px[i];
      out[j + 1] = px[i + 1];
      out[j + 2] = px[i + 2];
      out[j + 3] = bild.channels === 4 ? px[i + 3] : 255;
    }
  }
  return { width: kante, height: kante, channels, colorType: 6, px: out };
}

function chunk(typ, daten) {
  const kopf = Buffer.alloc(8);
  kopf.writeUInt32BE(daten.length, 0);
  kopf.write(typ, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([kopf.subarray(4), daten])), 0);
  return Buffer.concat([kopf, daten, crc]);
}

function encodePng(bild) {
  const { width, height, channels, colorType, px } = bild;
  const stride = width * channels;
  const roh = Buffer.alloc(height * (stride + 1));
  // Je Zeile den Filter wählen, der die kleinste Summe der Beträge ergibt -
  // die übliche Heuristik. Bei Fotos ist der Unterschied zu "none" erheblich.
  const kandidat = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const zeile = y * stride;
    const oben = zeile - stride;
    let besterTyp = 0;
    let besteSumme = Infinity;
    let beste = null;
    for (let typ = 0; typ <= 4; typ++) {
      let summe = 0;
      for (let i = 0; i < stride; i++) {
        const roher = px[zeile + i];
        const a = i >= channels ? px[zeile + i - channels] : 0;
        const b = y > 0 ? px[oben + i] : 0;
        const c = y > 0 && i >= channels ? px[oben + i - channels] : 0;
        let v = roher;
        if (typ === 1) v = roher - a;
        else if (typ === 2) v = roher - b;
        else if (typ === 3) v = roher - ((a + b) >> 1);
        else if (typ === 4) v = roher - paeth(a, b, c);
        v &= 0xff;
        kandidat[i] = v;
        summe += v < 128 ? v : 256 - v;
      }
      if (summe < besteSumme) {
        besteSumme = summe;
        besterTyp = typ;
        beste = Buffer.from(kandidat);
      }
    }
    roh[y * (stride + 1)] = besterTyp;
    beste.copy(roh, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(roh, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const [src, dest, spec, bitsArg] = process.argv.slice(2);
if (!src || !dest || !spec) {
  console.error('Aufruf: node tools/resize-image.mjs <quelle> <ziel> <breite|x<hoehe>|<kante>s> [farbbits]');
  process.exit(1);
}

const bild = decodePng(src);

// Zielgröße: "920" Breite, "x320" Höhe, "512s" in ein Quadrat dieser Kantenlänge
// einpassen (für App-Icons, die quadratisch sein müssen).
const quadrat = spec.endsWith('s');
const zahl = Number(quadrat ? spec.slice(0, -1) : spec.replace(/^x/, ''));
const skala = quadrat
  ? zahl / Math.max(bild.width, bild.height)
  : spec.startsWith('x')
    ? zahl / bild.height
    : zahl / bild.width;
if (!Number.isFinite(skala) || skala <= 0) throw new Error(`Ungültige Zielgröße: ${spec}`);

let klein = resize(
  bild,
  Math.max(1, Math.round(bild.width * skala)),
  Math.max(1, Math.round(bild.height * skala))
);
if (quadrat) klein = quadrieren(klein, zahl);

// "alpha" als viertes Argument: aus der Helligkeit eine Transparenz machen.
// Ein eingescanntes Blatt bringt sein Papier als Fläche mit; als Wasserzeichen
// hinter Text ist diese Fläche ein sichtbarer Kasten. Helles wird durchsichtig,
// die Zeichnung bleibt stehen.
if (bitsArg === 'alpha') {
  if (klein.channels !== 3) throw new Error('"alpha" erwartet ein Bild ohne Alphakanal.');
  // Ergebnis ist Graustufe plus Alpha (Farbtyp 4): die Zeichnung steckt danach
  // vollständig im Alphakanal, die Farbfläche ist konstant und kostet nichts.
  const mit = Buffer.alloc(klein.width * klein.height * 2);
  for (let i = 0, j = 0; i < klein.px.length; i += 3, j += 2) {
    // Wahrnehmungsgewichte, sonst wirken farbige Flächen falsch hell.
    const hell = 0.299 * klein.px[i] + 0.587 * klein.px[i + 1] + 0.114 * klein.px[i + 2];
    mit[j] = 0;
    mit[j + 1] = 255 - Math.round(hell);
  }
  klein = { width: klein.width, height: klein.height, channels: 2, colorType: 4, px: mit };
}

// Optionale Farbtiefe: Fotos und Scans komprimieren als PNG schlecht. Wo das
// Bild ohnehin blass hinter Text liegt (Wasserzeichen), spart das Abschneiden
// der untersten Bits fast die Hälfte, ohne sichtbar zu werden.
const bits = bitsArg && bitsArg !== 'alpha' ? Number(bitsArg) : 8;
if (!Number.isInteger(bits) || bits < 1 || bits > 8) {
  throw new Error(`Farbbits müssen zwischen 1 und 8 liegen, nicht "${bitsArg}".`);
}
if (bits < 8) {
  const maske = (0xff << (8 - bits)) & 0xff;
  // Nur die Farbkanäle maskieren, nie den Alphakanal - bei zwei Kanälen
  // (Graustufe + Alpha, aus dem "alpha"-Pfad oben) ist das der einzige
  // Farbkanal, sonst gehören die ersten drei Kanäle (RGB) dazu.
  const hatAlpha = klein.colorType === 4 || klein.colorType === 6;
  const farbKanaele = hatAlpha ? klein.channels - 1 : klein.channels;
  for (let i = 0; i < klein.px.length; i += klein.channels) {
    for (let c = 0; c < farbKanaele; c++) klein.px[i + c] &= maske;
  }
}

fs.writeFileSync(dest, encodePng(klein));
console.log(
  `${src} (${bild.width}x${bild.height}) -> ${dest} (${klein.width}x${klein.height})`
);

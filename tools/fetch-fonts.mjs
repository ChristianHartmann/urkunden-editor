import { writeFileSync } from 'node:fs';

// Modern UA so Google Fonts serves woff2.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const families = [
  'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600',
];

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.text();
}

// Split CSS into @font-face blocks, keep only the "latin" subset block
// (the one whose comment says /* latin */ - covers U+0000-00FF incl. äöüß).
function parseFaces(css) {
  const faces = [];
  // Blocks are preceded by a comment like /* latin */
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
  let m;
  while ((m = re.exec(css))) {
    faces.push({ subset: m[1], block: m[2] });
  }
  return faces;
}

async function toDataUri(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`font ${url} -> ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return `data:font/woff2;base64,${buf.toString('base64')}`;
}

let out = `/* Lokal eingebettete Schriften (latin-Subset). Auto-generiert. */\n`;
let count = 0;

for (const famUrl of families) {
  const css = await fetchText(famUrl);
  const faces = parseFaces(css).filter((f) => f.subset === 'latin');
  for (const f of faces) {
    const urlMatch = /url\((https:[^)]+\.woff2)\)/.exec(f.block);
    if (!urlMatch) continue;
    const dataUri = await toDataUri(urlMatch[1]);
    const block = f.block.replace(/url\(https:[^)]+\.woff2\)/, `url(${dataUri})`);
    out += block + '\n';
    count++;
    const fam = /font-family:\s*'([^']+)'/.exec(f.block)?.[1];
    const wght = /font-weight:\s*([^;]+);/.exec(f.block)?.[1];
    const styl = /font-style:\s*([^;]+);/.exec(f.block)?.[1];
    console.log(`embedded ${fam} ${wght} ${styl}`);
  }
}

writeFileSync('assets/fonts/fonts.css', out);
console.log(`\nWrote assets/fonts/fonts.css with ${count} faces, ${(out.length/1024).toFixed(0)} KB`);

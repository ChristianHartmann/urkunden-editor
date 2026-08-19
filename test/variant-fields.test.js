'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { mergeFields } = require('../src/main/variant');

const SHELL = {
  groups: { signatures: { label: 'Unterschriften', collapsed: true } },
  before: [{ key: 'emblem', label: 'Wappen (oben)', type: 'image', default: 'a.png' }],
  after: [{ key: 'signatureLeft', label: 'Unterschrift links', type: 'text', default: 'Vorsitz', group: 'signatures' }],
};

const MANIFEST = {
  id: 'geburtstag',
  name: 'Geburtstag',
  groups: { spacing: { label: 'Abstände', collapsed: true } },
  fields: [{ key: 'body', label: 'Fließtext', type: 'textarea', default: 'Basistext' }],
};

test('Shell-Felder umschließen die Felder der Vorlage', () => {
  const { fields } = mergeFields({ tplId: 'geburtstag', shellFields: SHELL, manifest: MANIFEST, overrides: {} });
  assert.deepEqual(fields.map((f) => f.key), ['emblem', 'body', 'signatureLeft']);
});

test('Gruppen von Shell und Vorlage werden vereinigt', () => {
  const { groups } = mergeFields({ tplId: 'geburtstag', shellFields: SHELL, manifest: MANIFEST, overrides: {} });
  assert.deepEqual(Object.keys(groups).sort(), ['signatures', 'spacing']);
});

test('shellDefaults der Vorlage setzt einen Shell-Default um', () => {
  const manifest = { ...MANIFEST, shellDefaults: { emblem: 'b.png' } };
  const { fields } = mergeFields({ tplId: 'geburtstag', shellFields: SHELL, manifest, overrides: {} });
  assert.equal(fields.find((f) => f.key === 'emblem').default, 'b.png');
});

test('overrides der Variante gewinnt über shellDefaults', () => {
  const manifest = { ...MANIFEST, shellDefaults: { emblem: 'b.png' } };
  const { fields } = mergeFields({
    tplId: 'geburtstag',
    shellFields: SHELL,
    manifest,
    overrides: { emblem: 'c.png' },
  });
  assert.equal(fields.find((f) => f.key === 'emblem').default, 'c.png');
});

test('overrides wirkt auch auf Felder der Vorlage', () => {
  const { fields } = mergeFields({
    tplId: 'geburtstag',
    shellFields: SHELL,
    manifest: MANIFEST,
    overrides: { body: 'Anderer-Text' },
  });
  assert.equal(fields.find((f) => f.key === 'body').default, 'Anderer-Text');
});

test('die Eingaben werden nicht verändert', () => {
  mergeFields({
    tplId: 'geburtstag',
    shellFields: SHELL,
    manifest: MANIFEST,
    overrides: { body: 'Anderer-Text' },
  });
  assert.equal(MANIFEST.fields[0].default, 'Basistext');
  assert.equal(SHELL.before[0].default, 'a.png');
});

test('doppelter Feldschlüssel ist ein Fehler', () => {
  const manifest = { ...MANIFEST, fields: [{ key: 'emblem', type: 'text', default: 'x' }] };
  assert.throws(
    () => mergeFields({ tplId: 'geburtstag', shellFields: SHELL, manifest, overrides: {} }),
    /geburtstag.*emblem/
  );
});

test('override auf unbekanntes Feld ist ein Fehler', () => {
  assert.throws(
    () => mergeFields({ tplId: 'geburtstag', shellFields: SHELL, manifest: MANIFEST, overrides: { tippfehler: 'x' } }),
    /geburtstag.*tippfehler/
  );
});

test('shellDefaults auf unbekanntes Feld ist ein Fehler', () => {
  const manifest = { ...MANIFEST, shellDefaults: { tippfehler: true } };
  assert.throws(
    () => mergeFields({ tplId: 'geburtstag', shellFields: SHELL, manifest, overrides: {} }),
    /geburtstag.*tippfehler/
  );
});

test('fehlende Shell-Felder sind erlaubt', () => {
  const { fields } = mergeFields({ tplId: 'x', shellFields: {}, manifest: MANIFEST, overrides: {} });
  assert.deepEqual(fields.map((f) => f.key), ['body']);
});

test('fehlende overrides sind erlaubt, Basiswerte bleiben stehen', () => {
  const { fields } = mergeFields({ tplId: 'geburtstag', shellFields: SHELL, manifest: MANIFEST, overrides: undefined });
  assert.equal(fields.find((f) => f.key === 'body').default, 'Basistext');
});

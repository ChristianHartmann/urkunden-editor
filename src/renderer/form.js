'use strict';

// Erzeugt aus dem Template-Manifest automatisch die Eingabefelder.

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
  }
  for (const c of children || []) node.appendChild(c);
  return node;
}

function thumbSrc(value) {
  return resolveImage(value, window.BOOT.assets);
}

// Baut die Eingabezeile für ein einzelnes Feld und hängt sie an `target`.
function renderField(target, field, values, onChange) {
  const row = el('div', { class: 'field' });
  const value = values[field.key];

  if (field.type === 'checkbox') {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = toBool(value);
    cb.addEventListener('change', () => onChange(field.key, cb.checked));
    row.appendChild(el('label', { class: 'check-row' }, [cb, el('span', { text: field.label })]));
    target.appendChild(row);
    return;
  }

  row.appendChild(el('label', { text: field.label }));

  if (field.type === 'range') {
    const input = el('input', {
      type: 'range',
      min: String(field.min ?? 0),
      max: String(field.max ?? 100),
      step: String(field.step ?? 1),
    });
    input.value = value == null ? String(field.default ?? 0) : String(value);
    const out = el('output', { text: `${input.value}${field.unit || ''}` });
    input.addEventListener('input', () => {
      out.textContent = `${input.value}${field.unit || ''}`;
      onChange(field.key, Number(input.value));
    });
    row.appendChild(el('div', { class: 'range-row' }, [input, out]));
  } else if (field.type === 'textarea') {
    const ta = el('textarea', { rows: '3' });
    ta.value = value == null ? '' : value;
    ta.addEventListener('input', () => onChange(field.key, ta.value));
    row.appendChild(ta);
  } else if (field.type === 'select') {
    const sel = el('select');
    for (const opt of field.options) {
      const val = typeof opt === 'object' ? opt.value : opt;
      const lbl = typeof opt === 'object' ? opt.label : opt;
      const o = el('option', { value: val, text: lbl });
      if (val === value) o.setAttribute('selected', 'selected');
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(field.key, sel.value));
    row.appendChild(sel);
  } else if (field.type === 'image') {
    const img = el('img', { class: 'thumb', src: thumbSrc(value), alt: '' });
    const pick = el('button', { class: 'btn small', type: 'button', text: 'Bild wählen…' });
    const reset = el('button', { class: 'btn small ghost', type: 'button', text: 'Standard' });

    const use = (dataUri) => {
      img.src = dataUri;
      onChange(field.key, dataUri);
    };

    pick.addEventListener('click', async () => {
      const dataUri = await window.api.openImage();
      if (dataUri) use(dataUri);
    });
    reset.addEventListener('click', () => {
      img.src = thumbSrc(field.default);
      onChange(field.key, field.default);
    });
    const actions = [pick, reset];
    row.appendChild(
      el('div', { class: 'image-field' }, [img, el('div', { class: 'image-actions' }, actions)])
    );
  } else {
    // text / number
    const input = el('input', { type: 'text' });
    if (field.type === 'number') input.setAttribute('inputmode', 'numeric');
    input.value = value == null ? '' : value;
    input.addEventListener('input', () => onChange(field.key, input.value));
    row.appendChild(input);
  }

  target.appendChild(row);
}

// Legt einen ausklappbaren Gruppen-Block an (z. B. „Abstände") und gibt den
// inneren Body zurück, in den die Felder der Gruppe wandern.
function createGroup(container, key, meta) {
  const collapsed = meta.collapsed !== false; // standardmäßig eingeklappt
  const body = el('div', { class: 'group-body' });
  const caret = el('span', { class: 'caret', text: collapsed ? '▸' : '▾' });
  const header = el('button', { class: 'group-header', type: 'button' }, [
    caret,
    el('span', { text: meta.label }),
  ]);
  if (collapsed) body.classList.add('hidden');
  header.addEventListener('click', () => {
    const nowHidden = body.classList.toggle('hidden');
    caret.textContent = nowHidden ? '▸' : '▾';
  });
  const group = el('div', { class: 'group' }, [header, body]);
  group.dataset.group = key;
  container.appendChild(group);
  return body;
}

// Baut das komplette Formular in `container`. onChange(key, value) wird bei
// jeder Änderung gerufen. Felder mit `group` landen in einem ausklappbaren Block.
function buildForm(container, tpl, values, onChange) {
  container.innerHTML = '';
  const groupMeta = tpl.manifest.groups || {};
  const groupBodies = {}; // key -> Body-Element (einmalig erzeugt, Reihenfolge bleibt)

  for (const field of tpl.manifest.fields) {
    let target = container;
    if (field.group) {
      if (!groupBodies[field.group]) {
        const meta = groupMeta[field.group] || { label: field.group };
        groupBodies[field.group] = createGroup(container, field.group, meta);
      }
      target = groupBodies[field.group];
    }
    renderField(target, field, values, onChange);
  }
}

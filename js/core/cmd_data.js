// Comandos de manejo de datos: abrir, mirar, crear variables, depurar, etiquetar y recodificar.

import { Dataset, ErrorStata } from './dataset.js';
import { evaluarTodo, mascara, compilar } from './expr.js';
import { esNulo, aNumero, resumen, ordenados, percentil, formaDist, padD, padI, corta, fmtG, masParecido } from './util.js';
import { resolverIn } from './parser.js';
import * as F from './format.js';
import { CATALOGO, cargar } from '../data/datasets.js';

const REG = {};
export function registrar(nombre, fn) { REG[nombre] = fn; }
export function obtener(nombre) { return REG[nombre]; }
export const COMANDOS_DATOS = REG;

function exigeDatos(ses) {
  if (!ses.ds.cargado) {
    throw new ErrorStata('no hay datos en memoria', 4,
      'Primero abre una base. Por ejemplo: <code>use enemdu_eloro_2024, clear</code>');
  }
}

function indicesActivos(p, ses) {
  exigeDatos(ses);
  const ds = ses.ds;
  let m = p.ifExp ? mascara(p.ifExp, ds, ses.ctxExpr()) : new Array(ds.n).fill(true);
  if (p.inRango) {
    const [a, b] = resolverIn(p.inRango, ds.n);
    m = m.map((v, i) => v && i >= a && i <= b);
  }
  const idx = [];
  for (let i = 0; i < ds.n; i++) if (m[i]) idx.push(i);
  return { mascara: m, idx };
}

// ---------------------------------------------------------------- abrir / cerrar

registrar('use', (p, ses) => {
  let nombre = (p.tokens[0] || p.using || '').replace(/^"|"$/g, '').replace(/\.dta$/i, '');
  if (!nombre) {
    ses.txt('Bases disponibles en el simulador:\n');
    ses.txt(F.tablaSimple(
      ['Nombre', 'Obs', 'De qué se trata'],
      CATALOGO.map((c) => [c.nombre, c.obs, c.desc]),
      ['i', 'd', 'i']
    ));
    ses.txt('\nÁbrela así:  use enemdu_eloro_2024, clear');
    return;
  }
  const enCatalogo = CATALOGO.find((c) => c.nombre === nombre);
  if (!enCatalogo) {
    if (ses.archivosSubidos && ses.archivosSubidos[nombre]) {
      ses.ds = Dataset.desdeCrudo(ses.archivosSubidos[nombre]);
      ses.trasCargar();
      ses.ok(`Base "${nombre}" abierta: ${ses.ds.n} observaciones, ${ses.ds.vars.length} variables.`);
      return;
    }
    const sug = masParecido(nombre, CATALOGO.map((c) => c.nombre));
    throw new ErrorStata(`el archivo ${nombre}.dta no se encuentra`, 601,
      sug ? `¿Quisiste abrir <code>${sug}</code>?`
        : `Bases disponibles: ${CATALOGO.map((c) => `<code>${c.nombre}</code>`).join(', ')}. También puedes subir tu propio archivo CSV con el botón "Subir datos".`);
  }
  if (ses.ds.cargado && ses.ds.modificado && !p.opciones.clear) {
    throw new ErrorStata('hay datos en memoria sin guardar', 4,
      'Agrega <code>, clear</code> al final para reemplazarlos:<br><code>use ' + nombre + ', clear</code>');
  }
  ses.ds = Dataset.desdeCrudo(cargar(nombre));
  ses.trasCargar();
  ses.ok(`Base "${nombre}" abierta: ${ses.ds.n} observaciones, ${ses.ds.vars.length} variables.`);
  if (ses.ds.notas.length) ses.txt('\n' + ses.ds.notas.join('\n'));
});
registrar('sysuse', (p, ses) => REG.use(p, ses));
registrar('webuse', (p, ses) => REG.use(p, ses));

registrar('clear', (p, ses) => {
  ses.ds.limpiar();
  ses.ultimoModelo = null;
  ses.ok('Memoria vacía.');
});

registrar('save', (p, ses) => {
  exigeDatos(ses);
  const nom = (p.tokens[0] || p.using || 'mis_datos').replace(/\.dta$/i, '');
  ses.guardarLocal(nom);
  ses.ds.modificado = false;
  ses.ok(`Base guardada como "${nom}" en este dispositivo. Vuelve a abrirla con: use ${nom}, clear`);
});

// ---------------------------------------------------------------- mirar

registrar('describe', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const lista = p.tokens.length ? ds.expandir(p.tokens) : ds.nombres();
  ses.txt(`Contiene datos de ${ds.nombre || 'sin nombre'}`);
  ses.txt(` Observaciones:${padI(ds.n, 12)}`);
  ses.txt(`    Variables:${padI(ds.vars.length, 14)}`);
  ses.txt('');
  const filas = lista.map((nm) => {
    const m = ds.meta(nm);
    return [m.name, m.type === 'string' ? 'texto' : 'número', m.format, m.vallab || '', m.label || ''];
  });
  ses.txt(F.tablaSimple(['Variable', 'Tipo', 'Formato', 'Etiq. valor', 'Qué significa'], filas, ['i', 'i', 'i', 'i', 'i']));
  const strs = lista.filter((nm) => ds.esString(nm));
  if (strs.length) {
    ses.aviso(`Ojo: ${strs.map((s) => `<code>${s}</code>`).join(', ')} ${strs.length === 1 ? 'es de texto' : 'son de texto'}. Ninguna variable de texto entra en una regresión: hay que convertirla con <code>encode</code> (si son categorías) o <code>destring</code> (si son números escritos como texto).`);
  }
});

registrar('codebook', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const lista = p.tokens.length ? ds.expandir(p.tokens) : ds.nombres();
  for (const nm of lista) {
    const m = ds.meta(nm);
    const c = ds.col(nm);
    ses.txt(F.raya('-'));
    ses.txt(`${nm}${m.label ? '  ·  ' + m.label : ''}`);
    ses.txt(F.raya('-'));
    if (m.type === 'string') {
      const vals = c.filter((v) => v !== '' && v != null);
      const unicos = new Set(vals);
      ses.txt(`  tipo: texto`);
      ses.txt(`  observaciones no vacías: ${vals.length}`);
      ses.txt(`  valores distintos: ${unicos.size}`);
      ses.txt(`  vacías: ${ds.n - vals.length}`);
      const muestra = [...unicos].slice(0, 12);
      ses.txt(`  ejemplos: ${muestra.map((v) => `"${v}"`).join(', ')}${unicos.size > 12 ? ' ...' : ''}`);
      if (unicos.size <= 20) {
        ses.aviso(`<code>${nm}</code> tiene solo ${unicos.size} valores distintos: es una variable de categorías guardada como texto. Conviértela con <code>encode ${nm}, gen(${nm}_n)</code>.`);
      }
    } else {
      const r = resumen(c);
      const niv = ds.niveles(nm);
      ses.txt(`  tipo: número (${m.format})`);
      ses.txt(`  observaciones con dato: ${r.n}`);
      ses.txt(`  faltantes: ${ds.n - r.n}`);
      ses.txt(`  valores distintos: ${niv.length}`);
      if (r.n) {
        ses.txt(`  media: ${fmtG(r.media)}   desv. est.: ${fmtG(r.sd)}`);
        const o = ordenados(c);
        ses.txt(`  mínimo: ${fmtG(r.min)}   mediana: ${fmtG(percentil(o, 50))}   máximo: ${fmtG(r.max)}`);
        ses.txt(`  percentiles 10/25/75/90: ${[10, 25, 75, 90].map((q) => fmtG(percentil(o, q))).join('  ')}`);
      }
      if (niv.length <= 12 && niv.length > 1) {
        ses.txt('  frecuencias:');
        for (const v of niv) {
          const k = c.filter((x) => x === v).length;
          const et = ds.etiquetaDe(nm, v);
          ses.txt(`     ${padI(v, 6)}  ${padD(et ? et : '', 22)} ${padI(k, 7)}  (${((k / r.n) * 100).toFixed(1)}%)`);
        }
      }
      const sospechosos = [99, 999, 9999, -99, -999, 88, 98].filter((s) => c.includes(s) && r.max >= s);
      if (sospechosos.length && niv.length > 3) {
        ses.aviso(`<code>${nm}</code> tiene valores ${sospechosos.join(', ')} que suelen ser códigos de "no sabe / no responde", no datos reales. Si es el caso: <code>mvdecode ${nm}, mv(${sospechosos.join(' ')})</code>`);
      }
    }
    ses.txt('');
  }
});

registrar('list', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const { idx } = indicesActivos(p, ses);
  const lista = p.tokens.length ? ds.expandir(p.tokens) : ds.nombres().slice(0, 8);
  const limite = p.opciones.n ? parseInt(p.opciones.n, 10) : (p.inRango || p.ifExp ? idx.length : 20);
  const usar = idx.slice(0, Math.min(limite, 500));
  const sinEtiqueta = !!p.opciones.nolabel;
  const filas = usar.map((i) => [String(i + 1) + '.', ...lista.map((nm) => {
    const v = ds.cols[nm][i];
    if (esNulo(v)) return '.';
    if (!sinEtiqueta) {
      const et = ds.etiquetaDe(nm, v);
      if (et) return et;
    }
    return typeof v === 'number' ? fmtG(v) : String(v);
  })]);
  ses.txt(F.tablaSimple(['', ...lista], filas, ['d', ...lista.map(() => 'd')]));
  if (idx.length > usar.length) ses.txt(`\n(se muestran ${usar.length} de ${idx.length} observaciones; usa "in 1/50" o la opción n() para ver otras)`);
});

registrar('browse', (p, ses) => {
  exigeDatos(ses);
  ses.abrirTabla(p.tokens.length ? ses.ds.expandir(p.tokens) : null);
  ses.ok('Vista de tabla abierta.');
});
registrar('edit', (p, ses) => REG.browse(p, ses));

registrar('count', (p, ses) => {
  const { idx } = indicesActivos(p, ses);
  ses.txt(`  ${idx.length}`);
  ses.guardarR({ N: idx.length });
  if (p.ifExp) ses.ok(`${idx.length} de ${ses.ds.n} observaciones cumplen la condición (${((idx.length / ses.ds.n) * 100).toFixed(1)}%).`);
});

registrar('inspect', (p, ses) => {
  exigeDatos(ses);
  const lista = p.tokens.length ? ses.ds.expandir(p.tokens) : ses.ds.nombres();
  for (const nm of lista) {
    if (ses.ds.esString(nm)) continue;
    const c = ses.ds.col(nm);
    const r = resumen(c);
    const enteros = c.filter((v) => !esNulo(v) && Number.isInteger(v)).length;
    ses.txt(`${nm}: ${r.n} con dato, ${ses.ds.n - r.n} faltantes, ${ses.ds.niveles(nm).length} valores distintos, ${enteros === r.n ? 'todos enteros' : 'con decimales'}`);
  }
});

// ---------------------------------------------------------------- crear y cambiar

registrar('generate', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  let destino = p.destino.trim();
  let tipoForzado = null;
  const mTipo = destino.match(/^(byte|int|long|float|double|str\d*|strL)\s+(.+)$/i);
  if (mTipo) { tipoForzado = mTipo[1].toLowerCase(); destino = mTipo[2].trim(); }
  if (ds.existe(destino)) {
    throw new ErrorStata(`la variable ${destino} ya existe`, 110,
      `Si quieres cambiar sus valores usa <code>replace ${destino} = ...</code>. Si quieres una nueva, ponle otro nombre.`);
  }
  const { valores, esTexto } = evaluarTodo(p.exp, ds, ses.ctxExpr());
  let vals = valores;
  const esS = esTexto || tipoForzado?.startsWith('str');
  if (!esS) vals = valores.map((v) => (typeof v === 'string' ? (v === '' ? null : aNumero(v)) : v));
  const { idx } = indicesActivos(p, ses);
  if (p.ifExp || p.inRango) {
    const base = new Array(ds.n).fill(esS ? '' : null);
    for (const i of idx) base[i] = vals[i];
    vals = base;
  }
  ds.poner(destino, vals, { type: esS ? 'string' : 'numeric' });
  const faltan = vals.filter((v) => (esS ? v === '' : esNulo(v))).length;
  ses.ok(`Variable <code>${destino}</code> creada.` + (faltan ? ` (${faltan} valores faltantes generados)` : ''));
  if (faltan && !p.ifExp) {
    ses.aviso(`Se generaron ${faltan} faltantes. Casi siempre es porque la expresión no se puede calcular en esas filas: por ejemplo <code>ln()</code> de un número cero o negativo, o una división entre cero, o porque la variable original ya venía vacía.`);
  }
});

registrar('replace', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const destino = p.destino.trim();
  if (!ds.existe(destino)) {
    throw new ErrorStata(`la variable ${destino} no existe`, 111,
      `<code>replace</code> solo cambia variables que ya existen. Para crear una nueva usa <code>generate ${destino} = ...</code>.`);
  }
  const { valores, esTexto } = evaluarTodo(p.exp, ds, ses.ctxExpr());
  const { idx } = indicesActivos(p, ses);
  const col = ds.cols[destino];
  const esS = ds.esString(destino);
  if (esS !== esTexto && !esS) {
    // permitimos que un texto entre a numérico solo si se puede convertir
  }
  let cambios = 0;
  for (const i of idx) {
    let v = valores[i];
    if (!esS && typeof v === 'string') v = aNumero(v);
    if (col[i] !== v) cambios++;
    col[i] = v;
  }
  ds.modificado = true;
  ses.ok(`${cambios} cambios realizados en <code>${destino}</code>.`);
  if (cambios === 0) {
    ses.aviso('No cambió ningún valor. Revisa la condición del <code>if</code>: puede que ninguna fila la cumpla.');
  }
});

const EGEN_FUNCS = ['mean', 'sd', 'min', 'max', 'sum', 'total', 'count', 'median', 'group',
  'cut', 'tag', 'rank', 'rowmean', 'rowtotal', 'rowmiss', 'rownonmiss', 'rowmax', 'rowmin',
  'seq', 'pctile', 'std', 'iqr', 'mode', 'concat'];

registrar('egen', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const destino = p.destino.trim().replace(/^(byte|int|long|float|double)\s+/i, '');
  const m = p.exp.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/s);
  if (!m) {
    throw new ErrorStata('egen necesita una función', 198,
      `Se escribe: <code>egen nueva = función(variables), by(grupo)</code>.<br>Funciones disponibles: ${EGEN_FUNCS.map((f) => `<code>${f}</code>`).join(', ')}`);
  }
  const fn = m[1].toLowerCase();
  const argTxt = m[2].trim();
  if (!EGEN_FUNCS.includes(fn)) {
    const sug = masParecido(fn, EGEN_FUNCS);
    throw new ErrorStata(`egen no conoce la función ${fn}()`, 133,
      sug ? `¿Quisiste decir <code>${sug}()</code>?` : `Funciones disponibles: ${EGEN_FUNCS.join(', ')}`);
  }
  const por = p.opciones.by ? String(p.opciones.by).split(/\s+/) : (p.prefijos.by || null);
  const { mascara: msk } = indicesActivos(p, ses);

  // grupos
  let grupos = new Map();
  if (por) {
    const cols = por.map((g) => ds.col(g));
    for (let i = 0; i < ds.n; i++) {
      const k = cols.map((c) => String(c[i])).join('');
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(i);
    }
  } else {
    grupos.set('__todo', Array.from({ length: ds.n }, (_, i) => i));
  }

  const out = new Array(ds.n).fill(null);

  if (['rowmean', 'rowtotal', 'rowmiss', 'rownonmiss', 'rowmax', 'rowmin'].includes(fn)) {
    const vars = ds.expandir(argTxt.split(/\s+/));
    for (let i = 0; i < ds.n; i++) {
      const vals = vars.map((v) => ds.cols[v][i]).filter((v) => !esNulo(v));
      const faltan = vars.length - vals.length;
      if (fn === 'rowmiss') out[i] = faltan;
      else if (fn === 'rownonmiss') out[i] = vals.length;
      else if (!vals.length) out[i] = fn === 'rowtotal' ? 0 : null;
      else if (fn === 'rowmean') out[i] = vals.reduce((a, b) => a + b, 0) / vals.length;
      else if (fn === 'rowtotal') out[i] = vals.reduce((a, b) => a + b, 0);
      else if (fn === 'rowmax') out[i] = Math.max(...vals);
      else if (fn === 'rowmin') out[i] = Math.min(...vals);
    }
  } else if (fn === 'group') {
    const vars = ds.expandir(argTxt.split(/\s+/));
    const cols = vars.map((v) => ds.col(v));
    const claves = [];
    const mapa = new Map();
    for (let i = 0; i < ds.n; i++) {
      const k = cols.map((c) => String(c[i])).join('');
      if (!mapa.has(k)) { claves.push(k); mapa.set(k, 0); }
    }
    claves.sort();
    claves.forEach((k, j) => mapa.set(k, j + 1));
    for (let i = 0; i < ds.n; i++) out[i] = mapa.get(cols.map((c) => String(c[i])).join(''));
  } else if (fn === 'tag') {
    const vars = ds.expandir(argTxt.split(/\s+/));
    const cols = vars.map((v) => ds.col(v));
    const visto = new Set();
    for (let i = 0; i < ds.n; i++) {
      if (!msk[i]) { out[i] = 0; continue; }
      const k = cols.map((c) => String(c[i])).join('');
      out[i] = visto.has(k) ? 0 : 1;
      visto.add(k);
    }
  } else if (fn === 'seq') {
    let k = 0;
    for (const [, filas] of grupos) { k = 0; for (const i of filas) out[i] = ++k; }
  } else if (fn === 'cut') {
    const v = argTxt.trim();
    const col = ds.col(v);
    const opAt = p.opciones.at ? String(p.opciones.at).split(/[\s,]+/).map(Number) : null;
    const grup = p.opciones.group ? parseInt(p.opciones.group, 10) : null;
    let cortes = opAt;
    if (!cortes && grup) {
      const o = ordenados(col);
      cortes = [];
      for (let g = 0; g < grup; g++) cortes.push(percentil(o, (g * 100) / grup));
      cortes.push(Infinity);
    }
    if (!cortes) throw new ErrorStata('egen cut necesita at() o group()', 198,
      'Por ejemplo: <code>egen tramo = cut(ingreso), group(4)</code> para hacer cuartiles.');
    for (let i = 0; i < ds.n; i++) {
      const x = col[i];
      if (esNulo(x)) continue;
      let k = null;
      for (let j = 0; j < cortes.length - 1; j++) if (x >= cortes[j] && x < cortes[j + 1]) { k = p.opciones.group ? j : cortes[j]; break; }
      out[i] = k;
    }
  } else {
    // funciones de resumen por grupo
    const v = argTxt.trim();
    const col = ds.col(v);
    for (const [, filas] of grupos) {
      const vals = filas.filter((i) => msk[i]).map((i) => col[i]).filter((x) => !esNulo(x));
      let r = null;
      if (vals.length) {
        const s = resumen(vals);
        if (fn === 'mean') r = s.media;
        else if (fn === 'sd') r = s.sd;
        else if (fn === 'min') r = s.min;
        else if (fn === 'max') r = s.max;
        else if (fn === 'sum' || fn === 'total') r = s.suma;
        else if (fn === 'count') r = s.n;
        else if (fn === 'median') r = percentil(vals.slice().sort((a, b) => a - b), 50);
        else if (fn === 'iqr') { const o = vals.slice().sort((a, b) => a - b); r = percentil(o, 75) - percentil(o, 25); }
        else if (fn === 'pctile') { const q = p.opciones.p ? Number(p.opciones.p) : 50; r = percentil(vals.slice().sort((a, b) => a - b), q); }
        else if (fn === 'mode') {
          const cuenta = new Map();
          for (const x of vals) cuenta.set(x, (cuenta.get(x) || 0) + 1);
          r = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0];
        }
      }
      if (fn === 'std') {
        const s = resumen(vals);
        for (const i of filas) out[i] = esNulo(col[i]) ? null : (col[i] - s.media) / s.sd;
      } else if (fn === 'rank') {
        const orden = filas.filter((i) => !esNulo(col[i])).sort((a, b) => col[a] - col[b]);
        orden.forEach((i, k) => { out[i] = k + 1; });
      } else {
        for (const i of filas) out[i] = r;
      }
    }
  }

  ds.poner(destino, out, { type: 'numeric' });
  ses.ok(`Variable <code>${destino}</code> creada con <code>egen ${fn}()</code>.`);
});

// ---------------------------------------------------------------- borrar / conservar

registrar('drop', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  if (p.ifExp || p.inRango) {
    const { mascara: m } = indicesActivos(p, ses);
    const quedan = m.map((v) => !v);
    const borradas = ds.filtrar(quedan);
    ses.ok(`${borradas} observaciones borradas. Quedan ${ds.n}.`);
    if (p.ifExp && /[<>]=?/.test(p.ifExp) && !/missing|!=\s*\./.test(p.ifExp)) {
      ses.aviso('Recuerda: en Stata el faltante <code>.</code> vale más que cualquier número. Si borraste con <code>&gt;</code> o <code>&gt;=</code>, también se fueron las filas vacías. Compruébalo antes con <code>count if missing(variable)</code>.');
    }
    return;
  }
  if (!p.tokens.length) throw new ErrorStata('drop necesita saber qué borrar', 100,
    'Se usa así:<br>· <code>drop variable1 variable2</code> borra columnas<br>· <code>drop if edad &lt; 18</code> borra filas<br>· <code>drop _all</code> borra todo');
  if (p.tokens[0] === '_all') { ds.limpiar(); ses.ok('Todo borrado.'); return; }
  const vars = ds.expandir(p.tokens);
  ds.eliminar(vars);
  ses.ok(`${vars.length} variable(s) borradas: ${vars.join(', ')}. Quedan ${ds.vars.length}.`);
});

registrar('keep', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  if (p.ifExp || p.inRango) {
    const { mascara: m } = indicesActivos(p, ses);
    const antes = ds.n;
    const borradas = ds.filtrar(m);
    ses.ok(`${borradas} observaciones eliminadas. Quedan ${ds.n} de ${antes}.`);
    if (p.ifExp && /[<>]=?/.test(p.ifExp)) {
      const conFaltante = /missing|!=\s*\.|<\s*\./.test(p.ifExp);
      if (!conFaltante) {
        ses.aviso('Cuidado con la trampa clásica: para Stata el faltante <code>.</code> es más grande que cualquier número, así que una condición como <code>keep if edad &gt;= 18</code> <strong>se queda también con las filas donde edad está vacía</strong>. Si no las quieres: <code>keep if edad &gt;= 18 &amp; !missing(edad)</code>.');
      }
    }
    return;
  }
  if (!p.tokens.length) throw new ErrorStata('keep necesita saber qué conservar', 100,
    '· <code>keep variable1 variable2</code> conserva columnas<br>· <code>keep if edad &gt;= 18</code> conserva filas');
  const vars = ds.expandir(p.tokens);
  ds.conservar(vars);
  ses.ok(`Se conservan ${vars.length} variables: ${vars.join(', ')}.`);
});

registrar('rename', (p, ses) => {
  exigeDatos(ses);
  if (p.tokens.length !== 2) throw new ErrorStata('rename necesita dos nombres', 198,
    'Se escribe: <code>rename nombreViejo nombreNuevo</code>');
  ses.ds.renombrar(p.tokens[0], p.tokens[1]);
  ses.ok(`<code>${p.tokens[0]}</code> ahora se llama <code>${p.tokens[1]}</code>.`);
});

registrar('order', (p, ses) => {
  exigeDatos(ses);
  const vars = ses.ds.expandir(p.tokens);
  ses.ds.ordenarColumnas(vars, { alFinal: !!p.opciones.last });
  ses.ok('Columnas reordenadas.');
});

registrar('sort', (p, ses) => {
  exigeDatos(ses);
  ses.ds.ordenarPor(ses.ds.expandir(p.tokens));
  ses.ok(`Datos ordenados por ${p.tokens.join(', ')}.`);
});

registrar('gsort', (p, ses) => {
  exigeDatos(ses);
  const desc = p.tokens.some((t) => t.startsWith('-'));
  const vars = ses.ds.expandir(p.tokens.map((t) => t.replace(/^[-+]/, '')));
  ses.ds.ordenarPor(vars, desc);
  ses.ok(`Datos ordenados ${desc ? 'de mayor a menor' : 'de menor a mayor'} por ${vars.join(', ')}.`);
});

registrar('compress', (p, ses) => { ses.ok('Listo (en el simulador no hace falta optimizar la memoria).'); });

registrar('preserve', (p, ses) => {
  exigeDatos(ses);
  ses.pila.push(ses.ds.copia());
  ses.ok('Copia temporal guardada. Usa <code>restore</code> para volver a este punto.');
});

registrar('restore', (p, ses) => {
  if (!ses.pila.length) throw new ErrorStata('no hay ninguna copia guardada', 622,
    'Primero hay que escribir <code>preserve</code>.');
  ses.ds = ses.pila.pop();
  ses.trasCargar();
  ses.ok('Datos restaurados al punto del preserve.');
});

// ---------------------------------------------------------------- etiquetas

registrar('label', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const sub = (p.tokens[0] || '').toLowerCase();
  const resto = p.cuerpo.slice(p.tokens[0] ? p.cuerpo.indexOf(p.tokens[0]) + p.tokens[0].length : 0).trim();

  if (sub.startsWith('var')) {
    const m = resto.match(/^(\S+)\s+"?(.*?)"?$/s);
    if (!m) throw new ErrorStata('falta el texto de la etiqueta', 198,
      'Se escribe: <code>label variable ingreso "Ingreso mensual en dólares"</code>');
    const nm = m[1];
    if (!ds.existe(nm)) throw ds.errorVariable(nm);
    ds.meta(nm).label = m[2];
    ds.modificado = true;
    ses.ok(`<code>${nm}</code> ahora se lee como "${m[2]}".`);
    return;
  }
  if (sub.startsWith('def')) {
    // label define lbl 0 "Hombre" 1 "Mujer" [, modify replace]
    const m = resto.match(/^(\S+)\s+(.*)$/s);
    if (!m) throw new ErrorStata('falta el contenido de la etiqueta', 198,
      'Se escribe: <code>label define lbl_sexo 0 "Hombre" 1 "Mujer"</code>');
    const nombre = m[1];
    const pares = [...m[2].matchAll(/(-?\d+)\s+"([^"]*)"/g)];
    if (!pares.length) throw new ErrorStata('no encontré pares número-texto', 198,
      'Cada valor lleva su texto entre comillas: <code>label define lbl 1 "Bajo" 2 "Medio" 3 "Alto"</code>');
    const tabla = (p.opciones.modify || p.opciones.add) ? (ds.valueLabels[nombre] || {}) : {};
    for (const [, k, v] of pares) tabla[k] = v;
    ds.valueLabels[nombre] = tabla;
    ds.modificado = true;
    ses.ok(`Etiqueta de valores <code>${nombre}</code> creada con ${pares.length} categorías. Ahora falta pegársela a una variable con <code>label values</code>.`);
    return;
  }
  if (sub.startsWith('val')) {
    const t = resto.split(/\s+/).filter(Boolean);
    if (t.length < 1) throw new ErrorStata('falta la variable', 198,
      'Se escribe: <code>label values sexo lbl_sexo</code>');
    const nm = t[0], lbl = t[1];
    if (!ds.existe(nm)) throw ds.errorVariable(nm);
    if (!lbl || lbl === '.') { ds.meta(nm).vallab = null; ses.ok(`Se quitaron las etiquetas de <code>${nm}</code>.`); return; }
    if (!ds.valueLabels[lbl]) throw new ErrorStata(`la etiqueta ${lbl} no existe`, 111,
      `Créala primero: <code>label define ${lbl} 1 "..." 2 "..."</code>. Etiquetas que existen: ${Object.keys(ds.valueLabels).join(', ') || '(ninguna)'}`);
    ds.meta(nm).vallab = lbl;
    ds.modificado = true;
    ses.ok(`<code>${nm}</code> ahora muestra los textos de <code>${lbl}</code>. Compruébalo con <code>tab ${nm}</code>.`);
    return;
  }
  if (sub.startsWith('lis') || sub.startsWith('dir')) {
    const cuales = resto.trim() ? resto.trim().split(/\s+/) : Object.keys(ds.valueLabels);
    if (!cuales.length) { ses.txt('(no hay etiquetas de valores definidas)'); return; }
    for (const nm of cuales) {
      const t = ds.valueLabels[nm];
      if (!t) continue;
      ses.txt(nm + ':');
      for (const k of Object.keys(t).sort((a, b) => Number(a) - Number(b))) ses.txt(`${padI(k, 12)} ${t[k]}`);
    }
    return;
  }
  if (sub.startsWith('dat')) {
    ds.notas = [resto.replace(/^"|"$/g, '')];
    ses.ok('Etiqueta de la base cambiada.');
    return;
  }
  if (sub.startsWith('dro')) {
    const cuales = resto.trim() === '_all' ? Object.keys(ds.valueLabels) : resto.trim().split(/\s+/);
    for (const c of cuales) delete ds.valueLabels[c];
    ses.ok('Etiquetas borradas.');
    return;
  }
  throw new ErrorStata(`no reconozco "label ${sub}"`, 198,
    'Las cuatro formas de <code>label</code>:<br>· <code>label variable ingreso "texto"</code> — nombra la columna<br>· <code>label define lbl 0 "Hombre" 1 "Mujer"</code> — crea el diccionario<br>· <code>label values sexo lbl</code> — pega el diccionario a la variable<br>· <code>label list</code> — muestra los diccionarios');
});

registrar('notes', (p, ses) => {
  exigeDatos(ses);
  if (!p.cuerpo.trim()) { ses.txt(ses.ds.notas.join('\n') || '(sin notas)'); return; }
  ses.ds.notas.push(p.cuerpo.replace(/^:\s*/, ''));
  ses.ok('Nota agregada.');
});

// ---------------------------------------------------------------- tipos

registrar('encode', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const nm = p.tokens[0];
  if (!nm) throw new ErrorStata('encode necesita una variable', 100,
    'Se escribe: <code>encode sexo_txt, gen(sexo)</code>');
  if (!ds.existe(nm)) throw ds.errorVariable(nm);
  if (!ds.esString(nm)) throw new ErrorStata(`${nm} ya es numérica`, 182,
    `<code>encode</code> solo sirve para variables de texto. <code>${nm}</code> ya es un número.`);
  const nuevo = p.opciones.gen || p.opciones.generate;
  if (!nuevo || nuevo === true) throw new ErrorStata('falta gen()', 198,
    `<code>encode</code> siempre crea una variable nueva: <code>encode ${nm}, gen(${nm.replace(/_txt$/, '')}_n)</code>`);
  if (ds.existe(nuevo)) throw new ErrorStata(`${nuevo} ya existe`, 110, 'Elige otro nombre.');
  const col = ds.col(nm);
  const valores = [...new Set(col.filter((v) => v !== '' && v != null))].sort();
  const mapa = new Map(valores.map((v, i) => [v, i + 1]));
  const out = col.map((v) => (v === '' || v == null ? null : mapa.get(v)));
  const lblName = p.opciones.label && p.opciones.label !== true ? p.opciones.label : nuevo;
  const tabla = {};
  for (const [v, k] of mapa) tabla[k] = v;
  ds.valueLabels[lblName] = tabla;
  ds.poner(nuevo, out, { type: 'numeric', vallab: lblName, label: ds.meta(nm).label });
  ses.ok(`<code>${nuevo}</code> creada: ${valores.length} categorías numeradas de 1 a ${valores.length}, con sus etiquetas puestas.`);
  ses.txt(valores.map((v, i) => `   ${i + 1} = ${v}`).join('\n'));
  if (valores.length > 12) {
    ses.aviso(`Salieron ${valores.length} categorías distintas. Suele pasar cuando el texto viene sucio ("Mujer", "MUJER ", "mujer" cuentan como tres). Limpia antes con:<br><code>replace ${nm} = upper(trim(${nm}))</code>`);
  }
});

registrar('decode', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const nm = p.tokens[0];
  if (!ds.existe(nm)) throw ds.errorVariable(nm);
  const nuevo = p.opciones.gen || p.opciones.generate;
  if (!nuevo || nuevo === true) throw new ErrorStata('falta gen()', 198, `Se escribe: <code>decode ${nm}, gen(${nm}_txt)</code>`);
  const col = ds.col(nm);
  const out = col.map((v) => {
    if (esNulo(v)) return '';
    const e = ds.etiquetaDe(nm, v);
    return e === null ? String(v) : e;
  });
  ds.poner(nuevo, out, { type: 'string' });
  ses.ok(`<code>${nuevo}</code> creada con el texto de las etiquetas.`);
});

registrar('destring', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const vars = ds.expandir(p.tokens.length ? p.tokens : ds.nombres().filter((v) => ds.esString(v)));
  const reemplazar = !!p.opciones.replace;
  const gen = p.opciones.gen || p.opciones.generate;
  const ignorar = p.opciones.ignore && p.opciones.ignore !== true ? String(p.opciones.ignore).replace(/^"|"$/g, '') : '';
  const forzar = !!p.opciones.force;
  if (!reemplazar && !gen) throw new ErrorStata('falta decir dónde guardar', 198,
    `Elige una:<br>· <code>destring ${vars[0]}, replace</code> — pisa la variable original<br>· <code>destring ${vars[0]}, gen(${vars[0]}_num)</code> — crea una nueva`);
  for (const nm of vars) {
    if (!ds.esString(nm)) { ses.txt(`${nm}: ya era numérica, no se toca`); continue; }
    const col = ds.col(nm);
    let problemas = 0;
    const ejemplos = new Set();
    const out = col.map((v) => {
      let s = String(v == null ? '' : v).trim();
      if (s === '') return null;
      for (const c of ignorar) s = s.split(c).join('');
      // formato "1.234,50" -> 1234.50
      if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
      else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
      const n = Number(s);
      if (isNaN(n)) { problemas++; if (ejemplos.size < 5) ejemplos.add(String(v)); return null; }
      return n;
    });
    if (problemas && !forzar && !ignorar) {
      throw new ErrorStata(`${nm} tiene ${problemas} valores que no son números`, 109,
        `Ejemplos de lo que estorba: ${[...ejemplos].map((e) => `"${e}"`).join(', ')}.<br>Dos salidas:<br>· quitar esos caracteres: <code>destring ${nm}, ${reemplazar ? 'replace' : `gen(${gen})`} ignore(".,$ ")</code><br>· convertirlos en faltante: agrega <code>force</code> (los valores raros quedan vacíos)`);
    }
    const destino = reemplazar ? nm : (vars.length === 1 ? gen : `${gen}${vars.indexOf(nm) + 1}`);
    if (reemplazar) {
      const meta = ds.meta(nm);
      ds.poner(nm, out, { type: 'numeric', label: meta.label });
    } else {
      ds.poner(destino, out, { type: 'numeric', label: ds.meta(nm).label });
    }
    ses.ok(`<code>${nm}</code> → <code>${destino}</code> convertida a número.` + (problemas ? ` ${problemas} valores no numéricos quedaron como faltantes.` : ''));
  }
});

registrar('tostring', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const vars = ds.expandir(p.tokens);
  const reemplazar = !!p.opciones.replace;
  const gen = p.opciones.gen || p.opciones.generate;
  if (!reemplazar && !gen) throw new ErrorStata('falta replace o gen()', 198,
    `Se escribe: <code>tostring ${vars[0]}, gen(${vars[0]}_txt)</code>`);
  for (const nm of vars) {
    const col = ds.col(nm);
    const out = col.map((v) => (esNulo(v) ? '' : String(v)));
    const destino = reemplazar ? nm : gen;
    ds.poner(destino, out, { type: 'string', label: ds.meta(nm).label });
    ses.ok(`<code>${destino}</code> ahora es texto.`);
  }
});

// ---------------------------------------------------------------- depuración

registrar('misstable', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const sub = (p.tokens[0] || 'summarize').toLowerCase();
  const lista = p.tokens.slice(1).length ? ds.expandir(p.tokens.slice(1)) : ds.nombres();
  const filas = [];
  for (const nm of lista) {
    const k = ds.contarFaltantes(nm);
    if (!k) continue;
    filas.push([nm, k, ds.n - k, ((k / ds.n) * 100).toFixed(1) + '%', ds.niveles(nm).length]);
  }
  if (!filas.length) {
    ses.ok('No hay ningún valor faltante en las variables revisadas. La base está completa.');
    return;
  }
  ses.txt('Valores faltantes por variable\n');
  ses.txt(F.tablaSimple(['Variable', 'Faltantes', 'Con dato', '% faltante', 'Valores distintos'], filas, ['i', 'd', 'd', 'd', 'd']));
  const total = ds.filasCompletas(lista).length;
  ses.txt(`\nFilas sin ningún faltante (en estas variables): ${total} de ${ds.n} (${((total / ds.n) * 100).toFixed(1)}%)`);
  void sub;
  ses.profeTexto('Qué hacer con los faltantes', [
    { tono: 'info', texto: 'Primero pregúntate <strong>por qué</strong> faltan. Si faltan al azar, borrar esas filas no sesga nada. Si faltan por una razón (por ejemplo, los que más ganan no contestan), borrarlas sí sesga el resultado y hay que decirlo en el informe.' },
    { tono: 'ojo', texto: 'Si borras con <code>drop if missing(x)</code>, hazlo <strong>una sola vez y al inicio</strong>, para que todos los modelos usen exactamente la misma muestra. Si cada modelo borra filas distintas, los R² y los coeficientes ya no son comparables entre sí.' },
    { tono: 'info', texto: `Para quedarte solo con las filas completas de tu modelo:<br><code>drop if missing(${lista.slice(0, 3).join(', ')})</code>` },
  ]);
});

registrar('mvdecode', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const vars = ds.expandir(p.tokens[0] === '_all' ? ds.nombres().filter((v) => !ds.esString(v)) : p.tokens);
  const mv = p.opciones.mv;
  if (!mv || mv === true) throw new ErrorStata('falta mv()', 198,
    'Se escribe: <code>mvdecode edad educ, mv(99)</code> o con varios códigos <code>mv(99 999)</code>');
  const codigos = String(mv).split(/[\s,]+/).map(Number).filter((v) => !isNaN(v));
  let total = 0;
  for (const nm of vars) {
    if (ds.esString(nm)) continue;
    const col = ds.cols[nm];
    let k = 0;
    for (let i = 0; i < col.length; i++) if (codigos.includes(col[i])) { col[i] = null; k++; }
    if (k) ses.txt(`${nm}: ${k} valores convertidos en faltante`);
    total += k;
  }
  ds.modificado = true;
  ses.ok(`${total} valores convertidos en faltante (.).`);
  if (!total) ses.aviso(`Ningún valor coincidía con ${codigos.join(', ')}. Revisa con <code>tab variable</code> cuáles son los códigos de no respuesta reales.`);
});

registrar('mvencode', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const vars = ds.expandir(p.tokens);
  const mv = Number(p.opciones.mv || 0);
  let total = 0;
  for (const nm of vars) {
    const col = ds.cols[nm];
    for (let i = 0; i < col.length; i++) if (esNulo(col[i])) { col[i] = mv; total++; }
  }
  ses.ok(`${total} faltantes reemplazados por ${mv}.`);
  ses.aviso('Cuidado: convertir faltantes en ceros cambia los promedios. Solo hazlo si el cero significa de verdad "ninguno" en tu variable.');
});

registrar('duplicates', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const sub = (p.tokens[0] || 'report').toLowerCase();
  const vars = p.tokens.slice(1).length ? ds.expandir(p.tokens.slice(1)) : ds.nombres();
  const cols = vars.map((v) => ds.cols[v]);
  const claves = new Map();
  for (let i = 0; i < ds.n; i++) {
    const k = cols.map((c) => String(c[i])).join('');
    if (!claves.has(k)) claves.set(k, []);
    claves.get(k).push(i);
  }
  const gruposRep = [...claves.values()].filter((g) => g.length > 1);
  const sobrantes = gruposRep.reduce((a, g) => a + g.length - 1, 0);

  if (sub.startsWith('rep')) {
    const conteo = new Map();
    for (const g of claves.values()) conteo.set(g.length, (conteo.get(g.length) || 0) + g.length);
    ses.txt('Filas repetidas (mirando ' + (p.tokens.slice(1).length ? vars.join(' ') : 'todas las variables') + ')\n');
    ses.txt(F.tablaSimple(['Copias', 'Observaciones', 'Sobran'],
      [...conteo.entries()].sort((a, b) => a[0] - b[0]).map(([c, n]) => [c, n, c > 1 ? n - n / c : 0]),
      ['d', 'd', 'd']));
    if (sobrantes) {
      ses.aviso(`Hay ${sobrantes} filas de más (${gruposRep.length} casos repetidos). Míralas con <code>duplicates list</code> y bórralas con <code>duplicates drop</code>.`);
    } else {
      ses.ok('No hay filas repetidas.');
    }
    return;
  }
  if (sub.startsWith('lis')) {
    const filas = [];
    for (const g of gruposRep.slice(0, 30)) for (const i of g) filas.push([i + 1, ...vars.slice(0, 6).map((v) => String(ds.cols[v][i]))]);
    ses.txt(F.tablaSimple(['obs', ...vars.slice(0, 6)], filas, ['d', ...vars.slice(0, 6).map(() => 'd')]));
    return;
  }
  if (sub.startsWith('dro')) {
    const conservar = new Array(ds.n).fill(false);
    for (const g of claves.values()) conservar[g[0]] = true;
    const borradas = ds.filtrar(conservar);
    ses.ok(`${borradas} filas repetidas eliminadas. Quedan ${ds.n} observaciones.`);
    return;
  }
  if (sub.startsWith('tag')) {
    const gen = p.opciones.gen || p.opciones.generate || 'dup';
    const out = new Array(ds.n).fill(0);
    for (const g of claves.values()) g.forEach((i, k) => { out[i] = k; });
    ds.poner(gen, out, { type: 'numeric', label: 'Número de copia (0 = primera)' });
    ses.ok(`<code>${gen}</code> creada: 0 en la primera aparición, 1, 2... en las repetidas.`);
    return;
  }
  throw new ErrorStata(`no reconozco "duplicates ${sub}"`, 198,
    'Las cuatro formas:<br>· <code>duplicates report</code> — cuántas hay<br>· <code>duplicates list</code> — cuáles son<br>· <code>duplicates tag, gen(dup)</code> — marcarlas<br>· <code>duplicates drop</code> — borrarlas');
});

registrar('assert', (p, ses) => {
  exigeDatos(ses);
  const m = mascara(p.exp || p.cuerpo, ses.ds, ses.ctxExpr());
  const fallan = m.filter((v) => !v).length;
  if (fallan) {
    throw new ErrorStata(`la comprobación falla en ${fallan} observaciones`, 9,
      'Revisa esas filas con <code>list if !(' + (p.cuerpo) + ')</code>');
  }
  ses.ok('Comprobación superada: se cumple en todas las observaciones.');
});

registrar('recode', (p, ses) => {
  exigeDatos(ses);
  const ds = ses.ds;
  const vars = [];
  let i = 0;
  while (i < p.tokens.length && !p.tokens[i].startsWith('(')) { vars.push(p.tokens[i]); i++; }
  if (!vars.length) throw new ErrorStata('recode necesita una variable', 100,
    'Se escribe: <code>recode satisf (1 2 = 1) (3 = 2) (4 5 = 3), gen(satisf3)</code>');
  const reglasTxt = p.cuerpo.slice(p.cuerpo.indexOf('('));
  const reglas = [...reglasTxt.matchAll(/\(([^)]*)\)/g)].map((m2) => m2[1]);
  if (!reglas.length) throw new ErrorStata('faltan las reglas entre paréntesis', 198,
    'Cada regla va entre paréntesis: <code>recode satisf (1 2 = 1) (3 = 2) (4 5 = 3), gen(satisf3)</code><br>También sirven los rangos: <code>(1/2 = 1)</code> y <code>(else = .)</code>.');
  const expandidas = ds.expandir(vars);
  const gen = p.opciones.gen || p.opciones.generate;
  const etiqueta = p.opciones.label;

  const compiladas = reglas.map((r) => {
    const [izqTxt, derTxt] = r.split('=').map((s) => s.trim());
    const destino = derTxt === '.' || derTxt === '' ? null : (isNaN(Number(derTxt)) ? derTxt.replace(/"/g, '') : Number(derTxt));
    const partes = izqTxt.split(/\s+/).filter(Boolean);
    return { partes, destino, esElse: partes.includes('else') || partes.includes('*'), esMissing: partes.includes('missing') || partes.includes('.') };
  });

  for (const nm of expandidas) {
    const col = ds.col(nm);
    const out = col.map((v) => {
      for (const r of compiladas) {
        if (r.esMissing && esNulo(v)) return r.destino;
        if (r.esElse) continue;
        if (esNulo(v)) continue;
        for (const parte of r.partes) {
          if (parte.includes('/')) {
            const [a, b] = parte.split('/');
            const lo = a === 'min' ? -Infinity : Number(a);
            const hi = b === 'max' ? Infinity : Number(b);
            if (v >= lo && v <= hi) return r.destino;
          } else if (Number(parte) === v) return r.destino;
        }
      }
      const els = compiladas.find((r) => r.esElse);
      if (els) return els.destino;
      return v;
    });
    const destino = gen && gen !== true ? (expandidas.length === 1 ? gen : `${gen}_${nm}`) : nm;
    ds.poner(destino, out, { type: 'numeric', label: ds.meta(nm).label ? 'Recodificada: ' + ds.meta(nm).label : '' });
    if (etiqueta && etiqueta !== true && ds.valueLabels[etiqueta]) ds.meta(destino).vallab = etiqueta;
    const antes = ds.niveles(nm).length, despues = ds.niveles(destino).length;
    ses.ok(`<code>${destino}</code> lista: pasó de ${antes} categorías a ${despues}.`);
    if (destino !== nm) {
      ses.profeTexto('Siempre comprueba una recodificación', [
        { tono: 'info', texto: `Cruza la vieja contra la nueva para ver que cada valor cayó donde debía:<br><code>tab ${nm} ${destino}</code>` },
        { tono: 'ojo', texto: `Y ponle etiquetas al resultado, si no la tabla sale con números pelados:<br><code>label define lbl_${destino} 1 "Triste" 2 "Normal" 3 "Feliz"</code><br><code>label values ${destino} lbl_${destino}</code>` },
      ]);
    }
  }
});

// ---------------------------------------------------------------- importar / exportar

registrar('import', (p, ses) => {
  const sub = (p.tokens[0] || '').toLowerCase();
  if (!sub.startsWith('del') && !sub.startsWith('exc')) {
    throw new ErrorStata('solo entiendo "import delimited"', 198,
      'Para traer tus propios datos usa el botón <strong>Subir datos</strong> de la barra de arriba (acepta CSV y Excel guardado como CSV).');
  }
  throw new ErrorStata('en el simulador los archivos se suben con el botón', 601,
    'Usa el botón <strong>Subir datos</strong> arriba a la derecha. Se abre solo y queda disponible con <code>use nombre, clear</code>.');
});

registrar('export', (p, ses) => {
  exigeDatos(ses);
  ses.exportarCSV();
  ses.ok('Archivo CSV descargado.');
});

registrar('input', (p, ses) => {
  throw new ErrorStata('input no está disponible en el simulador', 199,
    'Para datos propios usa el botón <strong>Subir datos</strong>, o abre una de las bases de ejemplo con <code>use</code>.');
});

// ---------------------------------------------------------------- sistema

registrar('set', (p, ses) => {
  const que = (p.tokens[0] || '').toLowerCase();
  if (que === 'seed') { ses.semilla = parseInt(p.tokens[1], 10) || 12345; ses.reiniciarRng(); ses.ok(`Semilla fijada en ${ses.semilla}: los números aleatorios saldrán siempre iguales.`); return; }
  if (que === 'more') { ses.ok('Listo (en el simulador la salida nunca se corta).'); return; }
  if (que === 'obs') {
    const n = parseInt(p.tokens[1], 10);
    if (!ses.ds.cargado) { ses.ds.n = n; ses.ok(`Base vacía con ${n} observaciones.`); return; }
    ses.ok('En el simulador no hace falta.');
    return;
  }
  ses.ok('Listo.');
});

registrar('display', (p, ses) => {
  const txt = p.cuerpo.trim();
  if (!txt) { ses.txt(''); return; }
  if (/^"[^"]*"$/.test(txt)) { ses.txt(txt.slice(1, -1)); return; }
  try {
    const ds = ses.ds.cargado ? ses.ds : Object.assign(new Dataset(), { n: 1 });
    const c = compilar(txt.replace(/^as\s+\w+\s+/, ''), ds.cargado ? ds : null, ses.ctxExpr());
    const v = c.evaluar(0);
    ses.txt(esNulo(v) ? '.' : (typeof v === 'number' ? fmtG(v, 10) : String(v)));
  } catch (e) {
    if (e.esStata) throw e;
    ses.txt(txt.replace(/"/g, ''));
  }
});

registrar('exit', (p, ses) => { ses.ok('Fin del do-file.'); });
registrar('log', (p, ses) => {
  const sub = (p.tokens[0] || '').toLowerCase();
  if (sub === 'close') { ses.ok('Registro cerrado.'); return; }
  ses.ok('En el simulador todo queda registrado solo; puedes descargar la sesión con el botón "Descargar log".');
});
registrar('doedit', (p, ses) => { ses.abrirEditor(); ses.ok('Editor de do-file abierto.'); });
registrar('append', () => { throw new ErrorStata('append no está disponible todavía', 199, 'El simulador trabaja con una base a la vez.'); });
registrar('merge', () => { throw new ErrorStata('merge no está disponible todavía', 199, 'El simulador trabaja con una base a la vez.'); });

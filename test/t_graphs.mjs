/* ============================================================
   t_graphs.mjs — prueba de js/core/graphs.js
   Genera test/preview_graphs.html con todos los gráficos y
   verifica que cada función devuelva un SVG válido sin NaN.
   Uso:  node test/t_graphs.mjs
   ============================================================ */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RUTA_MOD = path.join(AQUI, '..', 'js', 'core', 'graphs.js');
const SALIDA = path.join(AQUI, 'preview_graphs.html');

// Si el package.json de la raíz no tiene "type":"module", Node trata el .js
// como CommonJS; en ese caso se importa una copia temporal con extensión .mjs.
async function cargarModulo() {
  try {
    return await import(pathToFileURL(RUTA_MOD).href);
  } catch (e) {
    const tmp = path.join(os.tmpdir(), 'stataprofe_graphs_prueba.mjs');
    fs.writeFileSync(tmp, fs.readFileSync(RUTA_MOD, 'utf8'), 'utf8');
    return await import(pathToFileURL(tmp).href + '?v=1');
  }
}

/* ---------- PRNG con semilla fija (mulberry32) ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20240804);
function normal() { // Box-Muller
  let u = 0, v = 0;
  while (u <= 1e-12) u = rnd();
  while (v <= 1e-12) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------- Datos de ejemplo ---------- */
const N = 320;
const educ = [], exper = [], ingreso = [], mujer = [], formal = [], phat = [];
for (let i = 0; i < N; i++) {
  const ed = Math.max(0, Math.min(22, Math.round(11 + 3.4 * normal())));
  const ex = Math.max(0, Math.round(14 + 9 * normal()));
  const mj = rnd() < 0.46 ? 1 : 0;
  // error heterocedástico (crece con la educación)
  const u = normal() * (60 + 9 * ed);
  const y = 210 + 42.3 * ed + 11.6 * ex - 0.2 * ex * ex - 78.5 * mj + u;
  educ.push(ed); exper.push(ex); mujer.push(mj); ingreso.push(Math.max(60, y));
  const xb = -2.1 + 0.187 * ed + 0.02 * ex - 0.254 * mj;
  const p = 1 / (1 + Math.exp(-xb));
  formal.push(rnd() < p ? 1 : 0);
  phat.push(p);
}

// MCO simple ingreso ~ educ para tener ajustados y residuos
function mco(x, y) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}
const fitEd = mco(educ, ingreso);
const yhat = educ.map(e => fitEd.a + fitEd.b * e);
const resid = ingreso.map((y, i) => y - yhat[i]);

// ROC y curva sensibilidad/especificidad calculadas sobre (formal, phat)
function rocDe(y, p) {
  const cortes = [];
  for (let i = 0; i <= 60; i++) cortes.push(i / 60);
  const pos = y.reduce((a, b) => a + b, 0), neg = y.length - pos;
  const pts = [], curva = [];
  for (const c of cortes) {
    let tp = 0, fp = 0;
    for (let i = 0; i < y.length; i++) {
      if (p[i] >= c) { if (y[i] === 1) tp++; else fp++; }
    }
    const tpr = pos ? tp / pos : 0, fpr = neg ? fp / neg : 0;
    pts.push({ cut: c, tpr, fpr });
    curva.push({ cut: c, sens: tpr, spec: 1 - fpr });
  }
  // AUC por trapecios sobre los puntos ordenados
  const o = pts.slice().sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr);
  let auc = 0;
  for (let i = 1; i < o.length; i++) auc += (o[i].fpr - o[i - 1].fpr) * (o[i].tpr + o[i - 1].tpr) / 2;
  return { pts, curva, auc };
}
const roc = rocDe(formal, phat);

// Correlaciones
function corr(a, b) {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let sab = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(sa * sb);
}
const vars = { ingreso, educ, exper, mujer, formal };
const nombres = Object.keys(vars);
const M = nombres.map(a => nombres.map(b => corr(vars[a], vars[b])));

// Grupos para caja y barras
const grupos = [1, 2, 3, 4].map(t => {
  const vals = [];
  for (let i = 0; i < 70; i++) vals.push(520 + 84 * t + 190 * normal() + (rnd() < 0.03 ? 1400 : 0));
  return { label: 'Tamaño ' + t, values: vals };
});
const medias = grupos.map(g => {
  const m = g.values.reduce((a, b) => a + b, 0) / g.values.length;
  let s = 0; for (const v of g.values) s += (v - m) ** 2;
  const sd = Math.sqrt(s / (g.values.length - 1));
  return { label: g.label, mean: m, se: sd / Math.sqrt(g.values.length) };
});

// Serie de tiempo
const anios = [], serieA = [], serieB = [];
for (let t = 0; t < 24; t++) {
  anios.push(2001 + t);
  serieA.push(100 + 4.2 * t + 6 * normal());
  serieB.push(88 + 2.1 * t + 9 * normal());
}

const margenes = [
  { label: 'Educación (años)', est: 41.9, lo: 33.1, hi: 50.7 },
  { label: 'Experiencia', est: 6.4, lo: 1.2, hi: 11.6 },
  { label: 'Mujer', est: -76.2, lo: -118.4, hi: -34.0 },
  { label: 'Urbano', est: 12.5, lo: -9.8, hi: 34.8 },
  { label: 'Casado', est: 3.1, lo: -22.6, hi: 28.8 }
];

/* ---------- Ejecución ---------- */
const G = await cargarModulo();

const casos = [];
function agrega(nombre, svg, seccion) {
  casos.push({ nombre, svg, seccion: seccion || 'Gráficos con datos' });
}

agrega('histogram (Sturges)', G.histogram(ingreso, {
  title: 'Distribución del ingreso', xlabel: 'Ingreso mensual (USD)',
  note: 'Fuente: datos simulados con semilla fija.'
}));
agrega('histogram + normal', G.histogram(ingreso, {
  title: 'Ingreso con campana normal', xlabel: 'Ingreso mensual (USD)', bins: 18, normal: true
}));
agrega('scatter fit lfit', G.scatter(educ, ingreso, {
  title: 'Ingreso según años de educación', xlabel: 'Años de educación',
  ylabel: 'Ingreso (USD)', fit: 'lfit', note: 'La recta es el ajuste por MCO.'
}));
agrega('scatter fit qfit', G.scatter(exper, ingreso, {
  title: 'Ingreso según experiencia', xlabel: 'Años de experiencia',
  ylabel: 'Ingreso (USD)', fit: 'qfit'
}));
agrega('rvfplot', G.rvfplot(yhat, resid, { note: 'Si el ancho crece hacia la derecha, hay heterocedasticidad.' }));
agrega('qnormPlot', G.qnormPlot(resid, {}));
agrega('rocCurve', G.rocCurve(roc.pts, roc.auc, { note: 'Modelo logit de formalidad.' }));
agrega('sensSpecPlot', G.sensSpecPlot(roc.curva, {}));
agrega('boxplot', G.boxplot(grupos, {
  title: 'Ingreso por tamaño de empresa', xlabel: 'Tamaño', ylabel: 'Ingreso (USD)'
}));
agrega('barMeans', G.barMeans(medias, {
  title: 'Ingreso promedio por tamaño', ylabel: 'Ingreso promedio (USD)'
}));
agrega('marginsPlot', G.marginsPlot(margenes, {
  note: 'Efectos marginales promedio (AME) con IC al 95%.'
}));
agrega('corrHeatmap', G.corrHeatmap(nombres, M, { note: 'Correlaciones de Pearson.' }));
agrega('linePlot (2 series)', G.linePlot([
  { label: 'Sector formal', x: anios, y: serieA },
  { label: 'Sector informal', x: anios, y: serieB }
], { title: 'Índice de empleo', xlabel: 'Año', ylabel: 'Índice (2001 = 100)' }));
agrega('densityPlot', G.densityPlot(ingreso, {
  title: 'Densidad del ingreso', xlabel: 'Ingreso mensual (USD)', normal: true
}));
agrega('lorenzCurve', G.lorenzCurve(ingreso, { note: 'Ingreso simulado de 320 personas.' }));

// Casos borde: sin datos o todo nulo
const vaciosCfg = [
  ['histogram', () => G.histogram([], { title: 'Histograma sin datos' })],
  ['scatter', () => G.scatter([null, null], [null, null], { title: 'Dispersión sin datos' })],
  ['rvfplot', () => G.rvfplot([], [], { title: 'rvfplot sin datos' })],
  ['qnormPlot', () => G.qnormPlot([null, null, null], { title: 'qnorm sin datos' })],
  ['rocCurve', () => G.rocCurve([], null, { title: 'ROC sin datos' })],
  ['sensSpecPlot', () => G.sensSpecPlot([], { title: 'lsens sin datos' })],
  ['boxplot', () => G.boxplot([{ label: 'A', values: [null, null] }], { title: 'Caja sin datos' })],
  ['barMeans', () => G.barMeans([], { title: 'Barras sin datos' })],
  ['marginsPlot', () => G.marginsPlot([{ label: 'x', est: null }], { title: 'Margins sin datos' })],
  ['corrHeatmap', () => G.corrHeatmap([], [], { title: 'Correlaciones sin datos' })],
  ['linePlot', () => G.linePlot([{ label: 'a', x: [], y: [] }], { title: 'Líneas sin datos' })],
  ['densityPlot', () => G.densityPlot([null], { title: 'Densidad sin datos' })],
  ['lorenzCurve', () => G.lorenzCurve([0, 0, 0], { title: 'Lorenz sin datos' })]
];
for (const [nombre, fn] of vaciosCfg) agrega(nombre + ' (vacío)', fn(), 'Casos borde: sin datos');

// Tamaño chico (tablet) para comprobar que los ejes siguen legibles
agrega('scatter 380x260', G.scatter(educ, ingreso, {
  width: 380, height: 260, title: 'Chico', xlabel: 'Educación', ylabel: 'Ingreso', fit: 'lfit'
}), 'Escalado');
agrega('histogram 380x260', G.histogram(ingreso, {
  width: 380, height: 260, title: 'Chico', xlabel: 'Ingreso', normal: true
}), 'Escalado');

/* ---------- Verificación ---------- */
const fallos = [];
const esperadas = ['histogram', 'scatter', 'rvfplot', 'qnormPlot', 'rocCurve', 'sensSpecPlot',
  'boxplot', 'barMeans', 'marginsPlot', 'corrHeatmap', 'linePlot', 'densityPlot', 'lorenzCurve'];
for (const f of esperadas) {
  if (typeof G[f] !== 'function') fallos.push('falta la exportación ' + f);
}
for (const c of casos) {
  const s = c.svg;
  if (typeof s !== 'string') { fallos.push(c.nombre + ': no devolvió string'); continue; }
  if (!s.startsWith('<svg')) fallos.push(c.nombre + ': no empieza con <svg');
  if (s.indexOf('viewBox') === -1) fallos.push(c.nombre + ': no contiene viewBox');
  if (s.indexOf('NaN') !== -1) fallos.push(c.nombre + ': contiene NaN');
  if (s.indexOf('undefined') !== -1) fallos.push(c.nombre + ': contiene undefined');
  if (s.indexOf('Infinity') !== -1) fallos.push(c.nombre + ': contiene Infinity');
  if (s.indexOf('width="100%"') === -1) fallos.push(c.nombre + ': sin width="100%"');
  if (s.indexOf('preserveAspectRatio="xMidYMid meet"') === -1) fallos.push(c.nombre + ': sin preserveAspectRatio');
  if (!s.trim().endsWith('</svg>')) fallos.push(c.nombre + ': no cierra </svg>');
  // color fijo prohibido (solo se permiten variables CSS y "none")
  const fijos = s.match(/(fill|stroke)="#[0-9a-fA-F]{3,8}"/g);
  if (fijos) fallos.push(c.nombre + ': color fijo ' + fijos[0]);
}
for (const c of casos) {
  if (c.seccion === 'Casos borde: sin datos' && c.svg.indexOf('No hay datos para graficar') === -1) {
    fallos.push(c.nombre + ': no muestra el mensaje de sin datos');
  }
}

/* ---------- HTML de vista previa ---------- */
const CSS = `
:root{
  --paper:#E6EBF2; --card:#FBFCFE; --card2:#F1F4F9;
  --ink:#0E1626; --ink2:#33405A; --ink3:#6B7793;
  --line:#C9D3E0; --line2:#DDE4EC;
  --sig:#0B6E4F; --nosig:#A63446; --blue:#23408E; --ochre:#9C5F0B;
  --d:'Bricolage Grotesque',system-ui,-apple-system,Segoe UI,sans-serif;
  --b:Newsreader,Georgia,serif;
  --m:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;
}
html.oscuro{
  --paper:#0C111B; --card:#151D2B; --card2:#1C2536;
  --ink:#E9EEF7; --ink2:#B7C2D4; --ink3:#8593A9;
  --line:#2C3648; --line2:#222B3B;
  --sig:#4FD1A5; --nosig:#F2899B; --blue:#8FA9F2; --ochre:#E3B268;
}
*{box-sizing:border-box}
body{margin:0;padding:24px;background:var(--paper);color:var(--ink);font-family:var(--d)}
h1{font-size:22px;margin:0 0 4px}
h2{font-size:15px;margin:32px 0 12px;color:var(--ink3);text-transform:uppercase;letter-spacing:.08em}
p.sub{margin:0 0 18px;color:var(--ink3);font-size:13px}
.rejilla{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px}
.tarjeta{background:var(--card2);border:1px solid var(--line);border-radius:12px;padding:12px}
.tarjeta h3{margin:0 0 8px;font-size:12px;font-family:var(--m);color:var(--ink3);font-weight:500}
button{font-family:var(--d);font-size:13px;padding:7px 14px;border-radius:8px;
  border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
.estado{margin:12px 0 0;font-family:var(--m);font-size:13px}
.ok{color:var(--sig)} .mal{color:var(--nosig)}
`;

const secciones = [];
for (const c of casos) {
  if (!secciones.includes(c.seccion)) secciones.push(c.seccion);
}
let cuerpo = '';
for (const sec of secciones) {
  cuerpo += '<h2>' + sec + '</h2><div class="rejilla">';
  for (const c of casos.filter(x => x.seccion === sec)) {
    cuerpo += '<div class="tarjeta"><h3>' + c.nombre + '</h3>' + c.svg + '</div>';
  }
  cuerpo += '</div>';
}

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>StataProfe · vista previa de graphs.js</title>
<style>${CSS}</style></head>
<body>
<h1>Vista previa de <code>js/core/graphs.js</code></h1>
<p class="sub">Datos simulados con PRNG de semilla fija (mulberry32, semilla 20240804).</p>
<button onclick="document.documentElement.classList.toggle('oscuro')">Cambiar tema claro / oscuro</button>
<p class="estado ${fallos.length ? 'mal' : 'ok'}">${fallos.length ? 'FALLOS: ' + fallos.length : 'Verificación superada: ' + casos.length + ' gráficos sin NaN, con viewBox y width=100%.'}</p>
${cuerpo}
</body></html>`;

fs.writeFileSync(SALIDA, html, 'utf8');

/* ---------- Reporte ---------- */
const tam = casos.reduce((a, c) => a + c.svg.length, 0);
process.stdout.write('graficos generados: ' + casos.length + '\n');
process.stdout.write('bytes de SVG totales: ' + tam + '\n');
process.stdout.write('HTML: ' + SALIDA + '\n');
if (fallos.length) {
  process.stdout.write('FALLOS (' + fallos.length + '):\n - ' + fallos.join('\n - ') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write('OK: todas las funciones devuelven <svg ... viewBox ...> sin NaN.\n');
}

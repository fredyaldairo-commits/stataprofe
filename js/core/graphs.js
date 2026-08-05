/* ============================================================
   graphs.js — Gráficos SVG para StataProfe
   Sección 4 del SPEC. Devuelve strings SVG completos.
   Reglas: sin DOM, sin imports, sin dependencias externas.
   Todo color sale de variables CSS para que sirva en claro y oscuro.
   ============================================================ */

// Opciones por defecto de todos los gráficos
const OPTS = { width: 720, height: 420, title: '', xlabel: '', ylabel: '', note: '' };

// Colores (siempre variables CSS)
const C = {
  ink:   'var(--ink)',
  ink3:  'var(--ink3)',
  line:  'var(--line)',
  card:  'var(--card)',
  blue:  'var(--blue)',
  sig:   'var(--sig)',
  nosig: 'var(--nosig)',
  ochre: 'var(--ochre)'
};

const FD = 'var(--d)'; // tipografía de títulos
const FM = 'var(--m)'; // tipografía de números
const PALETA = [C.blue, C.ochre, C.sig, C.nosig, C.ink3];

/* ------------------------------------------------------------
   1. Utilidades básicas
   ------------------------------------------------------------ */

// Redondea a 2 decimales y NUNCA devuelve NaN (protege los atributos del SVG)
function R(v) {
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

// Convierte a número; faltante (null, '', undefined, booleano) -> NaN
function aNum(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return NaN;
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : NaN;
}

function esNum(v) {
  return Number.isFinite(aNum(v));
}

// Deja solo los valores numéricos finitos
function limpiar(a) {
  if (!Array.isArray(a)) return [];
  const out = [];
  for (let i = 0; i < a.length; i++) {
    if (esNum(a[i])) out.push(aNum(a[i]));
  }
  return out;
}

// Pares (x,y) con ambos valores válidos
function pares(x, y) {
  const px = [], py = [], idx = [];
  if (!Array.isArray(x) || !Array.isArray(y)) return { x: px, y: py, idx };
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (esNum(x[i]) && esNum(y[i])) { px.push(aNum(x[i])); py.push(aNum(y[i])); idx.push(i); }
  }
  return { x: px, y: py, idx };
}

function minMax(a) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  return [lo, hi];
}

function media(a) {
  if (!a.length) return NaN;
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

function desv(a) {
  const n = a.length;
  if (n < 2) return 0;
  const m = media(a);
  let s = 0; for (let i = 0; i < n; i++) s += (a[i] - m) * (a[i] - m);
  return Math.sqrt(s / (n - 1));
}

function ordenar(a) { return a.slice().sort(function (p, q) { return p - q; }); }

// Cuantil por interpolación lineal sobre un vector YA ordenado
function cuantil(orden, p) {
  const n = orden.length;
  if (!n) return NaN;
  if (n === 1) return orden[0];
  const h = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h), hi = Math.ceil(h);
  return orden[lo] + (h - lo) * (orden[hi] - orden[lo]);
}

// Escapa texto para XML
function esc(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Ancho aproximado de un texto (para decidir si las etiquetas se solapan)
function anchoTexto(s, fs) { return String(s == null ? '' : s).length * (fs || 11) * 0.56; }

function recortar(s, max) {
  s = String(s == null ? '' : s);
  return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)) + '…';
}

/* ------------------------------------------------------------
   2. Ejes con ticks "bonitos" (1, 2, 2.5, 5 × 10^k)
   ------------------------------------------------------------ */

function pasoBonito(bruto) {
  if (!(bruto > 0) || !Number.isFinite(bruto)) return 1;
  const e = Math.floor(Math.log10(bruto));
  const f = bruto / Math.pow(10, e);
  let m;
  if (f <= 1.0000001) m = 1;
  else if (f <= 2.0000001) m = 2;
  else if (f <= 2.5000001) m = 2.5;
  else if (f <= 5.0000001) m = 5;
  else m = 10;
  return m * Math.pow(10, e);
}

function decimalesDe(paso) {
  if (!(paso > 0) || !Number.isFinite(paso)) return 2;
  const e = Math.floor(Math.log10(paso) + 1e-12);
  const m = paso / Math.pow(10, e);
  let d = e < 0 ? -e : 0;
  if (Math.abs(m - 2.5) < 1e-9) d = Math.max(d, e <= 0 ? -e + 1 : 0);
  return Math.min(8, Math.max(0, d));
}

function limpioFp(v) {
  if (!Number.isFinite(v)) return 0;
  return parseFloat(v.toPrecision(12));
}

// Devuelve {lo, hi, ticks[], dec, paso}. Máximo 7 ticks.
function ejeBonito(min, max, n, incluirCero) {
  n = Math.max(2, Math.min(7, Math.round(n || 6)));
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : 1;
  if (hi < lo) { const t = lo; lo = hi; hi = t; }
  if (incluirCero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  if (hi - lo <= 1e-12) {
    const d = Math.abs(hi) > 1e-12 ? Math.abs(hi) * 0.5 : 0.5;
    lo -= d; hi += d;
  }
  let paso = pasoBonito((hi - lo) / (n - 1));
  let a = lo, b = hi, k = 1;
  for (let g = 0; g < 12; g++) {
    a = Math.floor(lo / paso + 1e-9) * paso;
    b = Math.ceil(hi / paso - 1e-9) * paso;
    k = Math.round((b - a) / paso);
    if (k + 1 <= 7) break;
    paso = pasoBonito(paso * 1.5);
  }
  const dec = decimalesDe(paso);
  const ticks = [];
  for (let i = 0; i <= k; i++) ticks.push(limpioFp(a + i * paso));
  return { lo: limpioFp(a), hi: limpioFp(b), ticks: ticks, dec: dec, paso: paso };
}

// Formato de número para etiquetas (nunca imprime NaN)
function fmtNum(v, dec) {
  if (!Number.isFinite(v)) return '';
  dec = Math.min(8, Math.max(0, dec == null ? 2 : dec));
  const abs = Math.abs(v);
  let s;
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) {
    s = v.toExponential(1);
  } else {
    s = v.toFixed(dec);
  }
  if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
  return s;
}

/* ------------------------------------------------------------
   3. Primitivas SVG
   ------------------------------------------------------------ */

function texto(x, y, t, op) {
  op = op || {};
  let s = '<text x="' + R(x) + '" y="' + R(y) + '"';
  s += ' font-family="' + (op.ff || FM) + '"';
  s += ' font-size="' + (op.fs || 11) + '"';
  if (op.w) s += ' font-weight="' + op.w + '"';
  if (op.style) s += ' font-style="' + op.style + '"';
  s += ' fill="' + (op.fill || C.ink) + '"';
  s += ' text-anchor="' + (op.anchor || 'start') + '"';
  if (op.baseline) s += ' dominant-baseline="' + op.baseline + '"';
  if (op.rot) s += ' transform="rotate(' + R(op.rot) + ' ' + R(x) + ' ' + R(y) + ')"';
  if (op.op != null) s += ' opacity="' + R(op.op) + '"';
  s += '>' + esc(t) + '</text>';
  return s;
}

function linea(x1, y1, x2, y2, color, w, dash, op) {
  let s = '<line x1="' + R(x1) + '" y1="' + R(y1) + '" x2="' + R(x2) + '" y2="' + R(y2) + '"';
  s += ' stroke="' + (color || C.line) + '" stroke-width="' + (w || 1) + '"';
  if (dash) s += ' stroke-dasharray="' + dash + '"';
  if (op != null) s += ' opacity="' + R(op) + '"';
  s += ' stroke-linecap="round"/>';
  return s;
}

function rect(x, y, w, h, fill, stroke, op, rx) {
  let s = '<rect x="' + R(x) + '" y="' + R(y) + '" width="' + R(Math.max(0, w)) + '" height="' + R(Math.max(0, h)) + '"';
  if (rx) s += ' rx="' + R(rx) + '"';
  s += ' fill="' + (fill || 'none') + '"';
  if (stroke) s += ' stroke="' + stroke + '" stroke-width="1"';
  if (op != null) s += ' opacity="' + R(op) + '"';
  s += '/>';
  return s;
}

function circulo(x, y, r, fill, op, stroke) {
  let s = '<circle cx="' + R(x) + '" cy="' + R(y) + '" r="' + R(r) + '" fill="' + (fill || C.blue) + '"';
  if (stroke) s += ' stroke="' + stroke + '" stroke-width="1"';
  if (op != null) s += ' opacity="' + R(op) + '"';
  s += '/>';
  return s;
}

// Camino a partir de dos vectores ya escalados a píxeles
function camino(px, py, color, w, dash, op) {
  let d = '';
  for (let i = 0; i < px.length; i++) {
    d += (i === 0 ? 'M' : 'L') + R(px[i]) + ' ' + R(py[i]) + ' ';
  }
  if (!d) return '';
  let s = '<path d="' + d.trim() + '" fill="none" stroke="' + (color || C.blue) + '" stroke-width="' + (w || 2) + '"';
  if (dash) s += ' stroke-dasharray="' + dash + '"';
  if (op != null) s += ' opacity="' + R(op) + '"';
  s += ' stroke-linejoin="round" stroke-linecap="round"/>';
  return s;
}

function area(px, py, yBase, fill, op) {
  if (!px.length) return '';
  let d = 'M' + R(px[0]) + ' ' + R(yBase) + ' ';
  for (let i = 0; i < px.length; i++) d += 'L' + R(px[i]) + ' ' + R(py[i]) + ' ';
  d += 'L' + R(px[px.length - 1]) + ' ' + R(yBase) + ' Z';
  return '<path d="' + d + '" fill="' + (fill || C.blue) + '" opacity="' + R(op == null ? 0.15 : op) + '" stroke="none"/>';
}

// Documento SVG completo
function doc(o, cuerpo) {
  const W = o.width, H = o.height;
  const tit = o.title || 'Gráfico';
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + R(W) + ' ' + R(H) + '"';
  s += ' width="100%" height="' + R(H) + '" preserveAspectRatio="xMidYMid meet"';
  s += ' role="img" aria-label="' + esc(tit) + '"';
  s += ' style="display:block;width:100%;height:auto;font-family:' + FD + '">';
  s += '<title>' + esc(tit) + '</title>';
  s += cuerpo;
  s += '</svg>';
  return s;
}

function opciones(op) {
  const o = {};
  for (const k in OPTS) o[k] = OPTS[k];
  if (op) for (const k in op) o[k] = op[k];
  o.width = Math.max(260, Number.isFinite(+o.width) ? +o.width : OPTS.width);
  o.height = Math.max(200, Number.isFinite(+o.height) ? +o.height : OPTS.height);
  o.title = o.title == null ? '' : String(o.title);
  o.xlabel = o.xlabel == null ? '' : String(o.xlabel);
  o.ylabel = o.ylabel == null ? '' : String(o.ylabel);
  o.note = o.note == null ? '' : String(o.note);
  return o;
}

// SVG de reemplazo cuando no hay datos
function vacio(o, msg) {
  const m = msg || 'No hay datos para graficar';
  let s = rect(1, 1, o.width - 2, o.height - 2, C.card, C.line, 1, 10);
  if (o.title) s += texto(o.width / 2, 26, o.title, { fs: 14, w: 600, fill: C.ink, anchor: 'middle', ff: FD });
  s += texto(o.width / 2, o.height / 2, m, { fs: 14, fill: C.ink3, anchor: 'middle', ff: FD });
  s += texto(o.width / 2, o.height / 2 + 22, 'Revisa que la variable tenga valores no faltantes.',
    { fs: 10.5, fill: C.ink3, anchor: 'middle', ff: FD });
  return doc(o, s);
}

/* ------------------------------------------------------------
   4. Escenario: márgenes, escalas, rejilla y rótulos
   ejeX / ejeY = { dom:[lo,hi], cero:bool } o { cat:[etiquetas] }
   ------------------------------------------------------------ */

function escenario(o, ejeX, ejeY, cfg) {
  cfg = cfg || {};
  const W = o.width, H = o.height;
  const mt = (o.title ? 34 : 12) + (cfg.mtExtra || 0);
  let mb = 26 + (o.xlabel ? 18 : 0) + (o.note ? 16 : 0) + (cfg.mbExtra || 0);
  const mr = cfg.mr == null ? 22 : cfg.mr;

  // ---- eje Y ----
  const hProv = Math.max(60, H - mt - mb);
  let yInfo;
  if (ejeY && ejeY.cat) {
    yInfo = { cat: true, etiquetas: ejeY.cat.map(function (s) { return recortar(s, 22); }) };
  } else {
    const nY = Math.max(3, Math.min(7, Math.floor(hProv / 48)));
    yInfo = ejeBonito(ejeY.dom[0], ejeY.dom[1], nY, ejeY.cero);
  }
  const etY = yInfo.cat ? yInfo.etiquetas : yInfo.ticks.map(function (v) { return fmtNum(v, yInfo.dec); });
  let anchoY = 0;
  for (let i = 0; i < etY.length; i++) anchoY = Math.max(anchoY, anchoTexto(etY[i], 11));
  const ml = cfg.ml != null ? cfg.ml
    : Math.min(W * 0.45, 12 + (o.ylabel ? 18 : 0) + anchoY + 10);

  const ix = ml;
  const iw = Math.max(60, W - ml - mr);

  // ---- eje X ----
  let xInfo, rotX = 0;
  if (ejeX && ejeX.cat) {
    xInfo = { cat: true, etiquetas: ejeX.cat.map(function (s) { return recortar(s, 18); }) };
    const slot = iw / Math.max(1, xInfo.etiquetas.length);
    let maxw = 0;
    for (let i = 0; i < xInfo.etiquetas.length; i++) maxw = Math.max(maxw, anchoTexto(xInfo.etiquetas[i], 11));
    if (maxw > slot - 8) { rotX = -32; mb += Math.min(48, Math.round(maxw * 0.55)); }
  } else {
    const nX = Math.max(2, Math.min(7, Math.floor(iw / 82)));
    xInfo = ejeBonito(ejeX.dom[0], ejeX.dom[1], nX, ejeX.cero);
    let maxw = 0;
    for (let i = 0; i < xInfo.ticks.length; i++) maxw = Math.max(maxw, anchoTexto(fmtNum(xInfo.ticks[i], xInfo.dec), 11));
    // si no caben, se muestra uno de cada dos
    let vueltas = 0;
    while (xInfo.ticks.length > 3 && (maxw + 16) * xInfo.ticks.length > iw && vueltas < 4) {
      xInfo.ticks = xInfo.ticks.filter(function (_, i) { return i % 2 === 0; });
      vueltas++;
    }
  }

  const iy = mt;
  const ih = Math.max(60, H - mt - mb);

  const nCatX = xInfo.cat ? Math.max(1, xInfo.etiquetas.length) : 0;
  const nCatY = yInfo.cat ? Math.max(1, yInfo.etiquetas.length) : 0;

  const sx = xInfo.cat
    ? function (i) { return ix + (i + 0.5) * (iw / nCatX); }
    : function (v) {
      const rango = (xInfo.hi - xInfo.lo) || 1;
      const val = Number.isFinite(v) ? v : xInfo.lo;
      return ix + ((val - xInfo.lo) / rango) * iw;
    };
  const sy = yInfo.cat
    ? function (i) { return iy + (i + 0.5) * (ih / nCatY); }
    : function (v) {
      const rango = (yInfo.hi - yInfo.lo) || 1;
      const val = Number.isFinite(v) ? v : yInfo.lo;
      return iy + ih - ((val - yInfo.lo) / rango) * ih;
    };

  const g = {
    o: o, ix: ix, iy: iy, iw: iw, ih: ih,
    x0: ix, x1: ix + iw, y0: iy, y1: iy + ih,
    sx: sx, sy: sy, xInfo: xInfo, yInfo: yInfo,
    slotX: xInfo.cat ? iw / nCatX : 0,
    slotY: yInfo.cat ? ih / nCatY : 0
  };

  // Fondo: rejilla, ejes, ticks, rótulos, título y nota
  g.fondo = function (op) {
    op = op || {};
    let s = '';
    s += rect(g.ix, g.iy, g.iw, g.ih, C.card, null, 0.55, 4);

    // rejilla horizontal
    if (!yInfo.cat && op.rejillaY !== false) {
      for (let i = 0; i < yInfo.ticks.length; i++) {
        const y = sy(yInfo.ticks[i]);
        s += linea(g.ix, y, g.x1, y, C.line, 1, null, 0.55);
      }
    }
    // rejilla vertical
    if (!xInfo.cat && op.rejillaX !== false) {
      for (let i = 0; i < xInfo.ticks.length; i++) {
        const x = sx(xInfo.ticks[i]);
        s += linea(x, g.iy, x, g.y1, C.line, 1, null, 0.35);
      }
    }
    // ejes
    s += linea(g.ix, g.iy, g.ix, g.y1, C.line, 1.2);
    s += linea(g.ix, g.y1, g.x1, g.y1, C.line, 1.2);

    // ticks de Y
    if (yInfo.cat) {
      for (let i = 0; i < yInfo.etiquetas.length; i++) {
        s += texto(g.ix - 8, sy(i) + 4, yInfo.etiquetas[i], { fs: 11, fill: C.ink3, anchor: 'end', ff: FD });
      }
    } else {
      for (let i = 0; i < yInfo.ticks.length; i++) {
        const y = sy(yInfo.ticks[i]);
        s += linea(g.ix - 4, y, g.ix, y, C.line, 1.2);
        s += texto(g.ix - 8, y + 3.8, fmtNum(yInfo.ticks[i], yInfo.dec), { fs: 11, fill: C.ink3, anchor: 'end' });
      }
    }

    // ticks de X
    if (xInfo.cat) {
      for (let i = 0; i < xInfo.etiquetas.length; i++) {
        const x = sx(i);
        s += texto(x, g.y1 + (rotX ? 16 : 16), xInfo.etiquetas[i],
          { fs: 11, fill: C.ink3, anchor: rotX ? 'end' : 'middle', rot: rotX, ff: FD });
      }
    } else {
      for (let i = 0; i < xInfo.ticks.length; i++) {
        const x = sx(xInfo.ticks[i]);
        s += linea(x, g.y1, x, g.y1 + 4, C.line, 1.2);
        s += texto(x, g.y1 + 16, fmtNum(xInfo.ticks[i], xInfo.dec), { fs: 11, fill: C.ink3, anchor: 'middle' });
      }
    }

    // rótulos y título
    if (o.title) s += texto(W / 2, 22, o.title, { fs: 14, w: 600, fill: C.ink, anchor: 'middle', ff: FD });
    if (o.xlabel) {
      const yx = H - (o.note ? 16 : 0) - 7;
      s += texto(g.ix + g.iw / 2, yx, o.xlabel, { fs: 12, fill: C.ink3, anchor: 'middle', ff: FD });
    }
    if (o.ylabel) {
      const cy = g.iy + g.ih / 2;
      s += texto(14, cy, o.ylabel, { fs: 12, fill: C.ink3, anchor: 'middle', ff: FD, rot: -90 });
    }
    if (o.note) s += texto(W / 2, H - 6, o.note, { fs: 10.5, fill: C.ink3, anchor: 'middle', ff: FD, style: 'italic' });
    return s;
  };

  return g;
}

// Leyenda simple (una fila por ítem)
function leyenda(items, x, y, alinear) {
  let s = '';
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const yy = y + i * 16;
    if (alinear === 'end') {
      s += texto(x - 22, yy + 4, it.label, { fs: 11, fill: C.ink3, anchor: 'end', ff: FD });
      if (it.tipo === 'caja') s += rect(x - 18, yy - 4, 14, 9, it.color, null, 0.6, 2);
      else s += linea(x - 18, yy, x - 4, yy, it.color, it.w || 2.4, it.dash);
    } else {
      if (it.tipo === 'caja') s += rect(x, yy - 4, 14, 9, it.color, null, 0.6, 2);
      else s += linea(x, yy, x + 14, yy, it.color, it.w || 2.4, it.dash);
      s += texto(x + 20, yy + 4, it.label, { fs: 11, fill: C.ink3, anchor: 'start', ff: FD });
    }
  }
  return s;
}

/* ------------------------------------------------------------
   5. Estadística interna (nada se importa de fuera)
   ------------------------------------------------------------ */

function pdfNorm(z) { return Math.exp(-0.5 * z * z) / 2.5066282746310002; }

// Inversa normal (Acklam) con un paso de refinamiento
function invNorm(p) {
  if (!(p > 0 && p < 1)) return NaN;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const pl = 0.02425, ph = 1 - pl;
  let q, r, x;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= ph) {
    q = p - 0.5; r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  return x;
}

// MCO simple: y = a + b x
function ajusteLineal(x, y) {
  const n = x.length;
  if (n < 2) return null;
  const mx = media(x), my = media(y);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); }
  if (!(sxx > 0)) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b: b, mx: mx };
}

// MCO cuadrático centrado: y = a + b(x-mx) + c(x-mx)^2
function ajusteCuadratico(x, y) {
  const n = x.length;
  if (n < 4) return null;
  const mx = media(x);
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (let i = 0; i < n; i++) {
    const u = x[i] - mx, u2 = u * u;
    s1 += u; s2 += u2; s3 += u2 * u; s4 += u2 * u2;
    t0 += y[i]; t1 += u * y[i]; t2 += u2 * y[i];
  }
  const A = [[n, s1, s2], [s1, s2, s3], [s2, s3, s4]];
  const sol = resolver3(A, [t0, t1, t2]);
  if (!sol) return null;
  return { a: sol[0], b: sol[1], c: sol[2], mx: mx };
}

// Gauss con pivoteo para 3x3
function resolver3(A, v) {
  const M = [[A[0][0], A[0][1], A[0][2], v[0]],
  [A[1][0], A[1][1], A[1][2], v[1]],
  [A[2][0], A[2][1], A[2][2], v[2]]];
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k < 4; k++) M[r][k] -= f * M[col][k];
    }
  }
  const out = [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  return out.every(function (z) { return Number.isFinite(z); }) ? out : null;
}

// Lowess (tricúbica, regresión lineal local) sobre una malla
function lowess(x, y, span, malla) {
  const n = x.length;
  if (n < 6) return null;
  const idx = x.map(function (_, i) { return i; }).sort(function (p, q) { return x[p] - x[q]; });
  const xs = idx.map(function (i) { return x[i]; });
  const ys = idx.map(function (i) { return y[i]; });
  const q = Math.max(3, Math.min(n, Math.round((span || 0.6) * n)));
  const m = Math.max(10, Math.min(malla || 50, n));
  const ox = [], oy = [];
  for (let j = 0; j < m; j++) {
    const xv = xs[0] + (xs[n - 1] - xs[0]) * (j / (m - 1));
    const dist = new Array(n);
    for (let i = 0; i < n; i++) dist[i] = Math.abs(xs[i] - xv);
    const orden = ordenar(dist);
    const h = orden[q - 1] > 0 ? orden[q - 1] : 1e-9;
    let s0 = 0, s1 = 0, s2 = 0, t0 = 0, t1 = 0;
    for (let i = 0; i < n; i++) {
      const u = dist[i] / h;
      if (u >= 1) continue;
      const w = Math.pow(1 - u * u * u, 3);
      s0 += w; s1 += w * xs[i]; s2 += w * xs[i] * xs[i];
      t0 += w * ys[i]; t1 += w * xs[i] * ys[i];
    }
    const det = s0 * s2 - s1 * s1;
    let yv;
    if (!(Math.abs(det) > 1e-12)) yv = s0 > 0 ? t0 / s0 : ys[0];
    else yv = (s2 * t0 - s1 * t1) / det + ((s0 * t1 - s1 * t0) / det) * xv;
    if (Number.isFinite(yv)) { ox.push(xv); oy.push(yv); }
  }
  return ox.length > 2 ? { x: ox, y: oy } : null;
}

// Ancho de banda de Silverman
function silverman(v) {
  const n = v.length;
  if (n < 2) return 1;
  const o = ordenar(v);
  const s = desv(v);
  const iqr = cuantil(o, 0.75) - cuantil(o, 0.25);
  let a = s;
  if (iqr > 0) a = Math.min(s > 0 ? s : iqr / 1.349, iqr / 1.349);
  if (!(a > 0)) a = Math.abs(media(v)) * 0.1 || 1;
  const h = 0.9 * a * Math.pow(n, -0.2);
  return h > 0 ? h : 1;
}

// Densidad kernel gaussiano
function densidadKernel(v, h, m) {
  const n = v.length;
  const mm = m || 160;
  const ex = minMax(v);
  const lo = ex[0] - 3 * h, hi = ex[1] + 3 * h;
  const xs = [], ys = [];
  for (let j = 0; j < mm; j++) {
    const xv = lo + (hi - lo) * (j / (mm - 1));
    let s = 0;
    for (let i = 0; i < n; i++) s += pdfNorm((xv - v[i]) / h);
    xs.push(xv); ys.push(s / (n * h));
  }
  return { x: xs, y: ys };
}

// Estadísticos de caja
function resumenCaja(v) {
  const o = ordenar(v);
  const q1 = cuantil(o, 0.25), med = cuantil(o, 0.5), q3 = cuantil(o, 0.75);
  const iqr = q3 - q1;
  const limInf = q1 - 1.5 * iqr, limSup = q3 + 1.5 * iqr;
  let bajo = o[0], alto = o[o.length - 1];
  const atipicos = [];
  bajo = Infinity; alto = -Infinity;
  for (let i = 0; i < o.length; i++) {
    if (o[i] < limInf || o[i] > limSup) atipicos.push(o[i]);
    else { if (o[i] < bajo) bajo = o[i]; if (o[i] > alto) alto = o[i]; }
  }
  if (!Number.isFinite(bajo)) { bajo = med; alto = med; }
  return { q1: q1, med: med, q3: q3, bajo: bajo, alto: alto, atipicos: atipicos, n: o.length };
}

/* ============================================================
   6. GRÁFICOS
   ============================================================ */

/* --- Histograma (con campana normal opcional) --- */
export function histogram(values, opts) {
  const o = opciones(opts);
  const v = limpiar(values);
  if (v.length < 2) return vacio(o);

  const ex = minMax(v);
  let lo = ex[0], hi = ex[1];
  if (hi - lo <= 1e-12) { const d = Math.abs(hi) > 1e-12 ? Math.abs(hi) * 0.1 : 0.5; lo -= d; hi += d; }

  // Regla de Sturges por defecto
  let k = (opts && Number.isFinite(+opts.bins) && +opts.bins > 0)
    ? Math.round(+opts.bins)
    : Math.ceil(Math.log2(v.length)) + 1;
  k = Math.max(2, Math.min(60, k));

  const ancho = (hi - lo) / k;
  const conteo = new Array(k).fill(0);
  for (let i = 0; i < v.length; i++) {
    let b = Math.floor((v[i] - lo) / ancho);
    if (b >= k) b = k - 1;
    if (b < 0) b = 0;
    conteo[b]++;
  }
  const frec = !!(opts && opts.freq);
  const alturas = conteo.map(function (c) { return frec ? c : c / (v.length * ancho); });

  const m = media(v), s = desv(v);
  const conNormal = !!(opts && opts.normal) && s > 0 && !frec;

  let yMax = Math.max.apply(null, alturas);
  let curva = null;
  if (conNormal) {
    const cx = [], cy = [];
    const desde = Math.min(lo, m - 4 * s), hasta = Math.max(hi, m + 4 * s);
    for (let j = 0; j < 140; j++) {
      const xv = desde + (hasta - desde) * (j / 139);
      cx.push(xv); cy.push(pdfNorm((xv - m) / s) / s);
    }
    curva = { x: cx, y: cy };
    yMax = Math.max(yMax, Math.max.apply(null, cy));
  }
  if (!(yMax > 0)) yMax = 1;

  o.ylabel = o.ylabel || (frec ? 'Frecuencia' : 'Densidad');
  const g = escenario(o, { dom: [lo, hi] }, { dom: [0, yMax * 1.06], cero: true });
  let s2 = g.fondo();

  // barras
  for (let i = 0; i < k; i++) {
    const x1 = g.sx(lo + i * ancho), x2 = g.sx(lo + (i + 1) * ancho);
    const yb = g.sy(0), yt = g.sy(alturas[i]);
    if (x2 - x1 < 0.6) continue;
    s2 += rect(x1 + 0.5, yt, Math.max(0.6, x2 - x1 - 1), yb - yt, C.blue, null, 0.55, 1.5);
  }

  if (curva) {
    const px = [], py = [];
    for (let j = 0; j < curva.x.length; j++) {
      if (curva.x[j] < lo || curva.x[j] > hi) continue;
      px.push(g.sx(curva.x[j])); py.push(g.sy(curva.y[j]));
    }
    s2 += camino(px, py, C.ochre, 2.2);
    s2 += leyenda([{ color: C.ochre, label: 'Normal ajustada' }], g.x1 - 8, g.iy + 14, 'end');
  }

  return doc(o, s2);
}

/* --- Dispersión con ajuste MCO lineal o cuadrático --- */
export function scatter(x, y, opts) {
  const o = opciones(opts);
  const p = pares(x, y);
  if (p.x.length < 1) return vacio(o);

  const ex = minMax(p.x), ey = minMax(p.y);
  const padX = (ex[1] - ex[0]) * 0.04 || 0.5;
  let yLo = ey[0], yHi = ey[1];

  const fit = opts && opts.fit ? String(opts.fit) : null;
  let ajus = null, tipo = null, etiquetaFit = '';
  if (fit === 'lfit') {
    const lf = ajusteLineal(p.x, p.y);
    if (lf) {
      tipo = 'lfit'; ajus = lf;
      etiquetaFit = 'MCO: y = ' + fmtNum(lf.a, 2) + (lf.b >= 0 ? ' + ' : ' − ') + fmtNum(Math.abs(lf.b), 3) + ' x';
    }
  } else if (fit === 'qfit') {
    const qf = ajusteCuadratico(p.x, p.y);
    if (qf) { tipo = 'qfit'; ajus = qf; etiquetaFit = 'Ajuste cuadrático (MCO)'; }
  }

  // Curva del ajuste evaluada en la malla (para que entre en el eje Y)
  let fx = [], fy = [];
  if (ajus) {
    const nMalla = tipo === 'lfit' ? 2 : 60;
    for (let j = 0; j < nMalla; j++) {
      const xv = ex[0] + (ex[1] - ex[0]) * (nMalla === 2 ? j : j / (nMalla - 1));
      const u = xv - (ajus.mx || 0);
      const yv = tipo === 'lfit' ? ajus.a + ajus.b * xv : ajus.a + ajus.b * u + ajus.c * u * u;
      if (Number.isFinite(yv)) { fx.push(xv); fy.push(yv); }
    }
    if (fy.length) {
      const ef = minMax(fy);
      yLo = Math.min(yLo, ef[0]); yHi = Math.max(yHi, ef[1]);
    }
  }
  const padY = (yHi - yLo) * 0.06 || 0.5;

  const g = escenario(o, { dom: [ex[0] - padX, ex[1] + padX] }, { dom: [yLo - padY, yHi + padY] });
  let s = g.fondo();

  const n = p.x.length;
  const r = opts && Number.isFinite(+opts.r) ? +opts.r : (n > 800 ? 2 : (n > 200 ? 2.6 : 3.2));
  const op = n > 800 ? 0.4 : (n > 200 ? 0.55 : 0.72);
  for (let i = 0; i < n; i++) s += circulo(g.sx(p.x[i]), g.sy(p.y[i]), r, C.blue, op);

  if (fx.length) {
    s += camino(fx.map(g.sx), fy.map(g.sy), C.ochre, 2.4);
    s += leyenda([{ color: C.ochre, label: etiquetaFit }], g.x1 - 8, g.iy + 14, 'end');
  }

  // etiquetas por punto (solo si son pocas)
  if (opts && Array.isArray(opts.labels) && n <= 40) {
    for (let i = 0; i < n; i++) {
      const et = opts.labels[p.idx[i]];
      if (et == null || et === '') continue;
      s += texto(g.sx(p.x[i]) + 5, g.sy(p.y[i]) - 5, recortar(String(et), 14),
        { fs: 9.5, fill: C.ink3, ff: FD });
    }
  }
  return doc(o, s);
}

/* --- Residuos vs. ajustados --- */
export function rvfplot(yhat, resid, opts) {
  const o = opciones(opts);
  o.title = o.title || 'Residuos vs. valores ajustados';
  o.xlabel = o.xlabel || 'Valores ajustados';
  o.ylabel = o.ylabel || 'Residuos';
  const p = pares(yhat, resid);
  if (p.x.length < 2) return vacio(o);

  const ex = minMax(p.x), ey = minMax(p.y);
  const padX = (ex[1] - ex[0]) * 0.04 || 0.5;
  const mAbs = Math.max(Math.abs(ey[0]), Math.abs(ey[1])) || 1;

  const suave = (!opts || opts.lowess !== false) && p.x.length >= 12
    ? lowess(p.x, p.y, (opts && opts.span) || 0.6, 50) : null;

  const g = escenario(o, { dom: [ex[0] - padX, ex[1] + padX] }, { dom: [-mAbs * 1.1, mAbs * 1.1], cero: true });
  let s = g.fondo();

  const n = p.x.length;
  const r = n > 800 ? 2 : (n > 200 ? 2.6 : 3.2);
  const op = n > 800 ? 0.4 : 0.6;
  for (let i = 0; i < n; i++) s += circulo(g.sx(p.x[i]), g.sy(p.y[i]), r, C.blue, op);

  s += linea(g.x0, g.sy(0), g.x1, g.sy(0), C.ink3, 1.6, '5 4', 0.9);
  if (suave) {
    s += camino(suave.x.map(g.sx), suave.y.map(g.sy), C.ochre, 2.2, null, 0.95);
    s += leyenda([{ color: C.ochre, label: 'Suavizado (lowess)' }], g.x1 - 8, g.iy + 14, 'end');
  }
  return doc(o, s);
}

/* --- Gráfico de cuantiles normales --- */
export function qnormPlot(resid, opts) {
  const o = opciones(opts);
  o.title = o.title || 'Cuantiles de los residuos vs. normal';
  o.xlabel = o.xlabel || 'Normal teórica';
  o.ylabel = o.ylabel || 'Residuos observados';
  const v = limpiar(resid);
  if (v.length < 3) return vacio(o);

  const ord = ordenar(v);
  const n = ord.length;
  const m = media(ord), s0 = desv(ord) || 1;
  const tx = [], ty = [];
  for (let i = 0; i < n; i++) {
    const pp = (i + 0.5) / n;             // posición de graficación
    const z = invNorm(pp);
    if (!Number.isFinite(z)) continue;
    tx.push(m + s0 * z); ty.push(ord[i]);
  }
  if (tx.length < 3) return vacio(o);

  const ex = minMax(tx), ey = minMax(ty);
  const lo = Math.min(ex[0], ey[0]), hi = Math.max(ex[1], ey[1]);
  const pad = (hi - lo) * 0.05 || 0.5;

  const g = escenario(o, { dom: [lo - pad, hi + pad] }, { dom: [lo - pad, hi + pad] });
  let s = g.fondo();
  s += linea(g.sx(lo - pad), g.sy(lo - pad), g.sx(hi + pad), g.sy(hi + pad), C.ink3, 1.6, '5 4', 0.9);
  const r = n > 600 ? 2 : 3;
  for (let i = 0; i < tx.length; i++) s += circulo(g.sx(tx[i]), g.sy(ty[i]), r, C.blue, 0.65);
  s += leyenda([{ color: C.ink3, label: 'Si fuera normal, los puntos caen en la línea', dash: '5 4' }],
    g.x1 - 8, g.y1 - 14, 'end');
  return doc(o, s);
}

/* --- Curva ROC --- */
export function rocCurve(points, auc, opts) {
  const o = opciones(opts);
  o.title = o.title || 'Curva ROC';
  o.xlabel = o.xlabel || '1 − especificidad (falsos positivos)';
  o.ylabel = o.ylabel || 'Sensibilidad';

  // Tolerante: acepta {points, auc} o el arreglo suelto
  let pts = points, a = auc;
  if (points && !Array.isArray(points) && Array.isArray(points.points)) {
    pts = points.points;
    if (a == null) a = points.auc;
  }
  if (!Array.isArray(pts) || !pts.length) return vacio(o);

  const lim = [];
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i] || {};
    const fpr = aNum(q.fpr), tpr = aNum(q.tpr);
    if (Number.isFinite(fpr) && Number.isFinite(tpr)) lim.push({ f: Math.min(1, Math.max(0, fpr)), t: Math.min(1, Math.max(0, tpr)) });
  }
  if (lim.length < 2) return vacio(o);
  lim.sort(function (p, q) { return p.f - q.f || p.t - q.t; });
  if (lim[0].f > 0 || lim[0].t > 0) lim.unshift({ f: 0, t: 0 });
  const ult = lim[lim.length - 1];
  if (ult.f < 1 || ult.t < 1) lim.push({ f: 1, t: 1 });

  const g = escenario(o, { dom: [0, 1] }, { dom: [0, 1] });
  let s = g.fondo();
  const px = lim.map(function (q) { return g.sx(q.f); });
  const py = lim.map(function (q) { return g.sy(q.t); });

  s += area(px, py, g.y1, C.blue, 0.14);
  s += linea(g.sx(0), g.sy(0), g.sx(1), g.sy(1), C.ink3, 1.5, '5 4', 0.9);
  s += camino(px, py, C.blue, 2.6);

  const aOk = Number.isFinite(aNum(a));
  const txtAuc = aOk ? 'AUC = ' + fmtNum(aNum(a), 4) : 'AUC no disponible';
  s += rect(g.x1 - 132, g.y1 - 34, 124, 24, C.card, C.line, 0.95, 5);
  s += texto(g.x1 - 70, g.y1 - 18, txtAuc, { fs: 12, w: 600, fill: C.ink, anchor: 'middle' });
  s += leyenda([{ color: C.ink3, label: 'Diagonal = adivinar al azar', dash: '5 4' }], g.x0 + 10, g.iy + 14, 'start');
  return doc(o, s);
}

/* --- Sensibilidad y especificidad vs. punto de corte --- */
export function sensSpecPlot(curve, opts) {
  const o = opciones(opts);
  o.title = o.title || 'Sensibilidad y especificidad según el corte';
  o.xlabel = o.xlabel || 'Punto de corte de la probabilidad';
  o.ylabel = o.ylabel || 'Proporción';
  if (!Array.isArray(curve) || !curve.length) return vacio(o);

  const filas = [];
  for (let i = 0; i < curve.length; i++) {
    const q = curve[i] || {};
    const c = aNum(q.cut), se = aNum(q.sens), sp = aNum(q.spec);
    if (Number.isFinite(c) && Number.isFinite(se) && Number.isFinite(sp)) filas.push({ c: c, se: se, sp: sp });
  }
  if (filas.length < 2) return vacio(o);
  filas.sort(function (p, q) { return p.c - q.c; });

  const xs = filas.map(function (f) { return f.c; });
  const ex = minMax(xs);
  const g = escenario(o, { dom: [ex[0], ex[1]] }, { dom: [0, 1] });
  let s = g.fondo();

  s += camino(xs.map(g.sx), filas.map(function (f) { return g.sy(f.se); }), C.blue, 2.4);
  s += camino(xs.map(g.sx), filas.map(function (f) { return g.sy(f.sp); }), C.ochre, 2.4);

  // corte donde se cruzan (equilibrio entre los dos errores)
  let mejor = 0, dif = Infinity;
  for (let i = 0; i < filas.length; i++) {
    const d = Math.abs(filas[i].se - filas[i].sp);
    if (d < dif) { dif = d; mejor = i; }
  }
  const xc = g.sx(filas[mejor].c);
  s += linea(xc, g.iy, xc, g.y1, C.ink3, 1.3, '4 4', 0.8);
  s += texto(xc, g.iy + 12, 'corte ≈ ' + fmtNum(filas[mejor].c, 2), { fs: 10.5, fill: C.ink3, anchor: 'middle' });

  s += leyenda([
    { color: C.blue, label: 'Sensibilidad' },
    { color: C.ochre, label: 'Especificidad' }
  ], g.x1 - 8, g.y1 - 30, 'end');
  return doc(o, s);
}

/* --- Diagrama de caja --- */
export function boxplot(groups, opts) {
  const o = opciones(opts);
  let gr = groups;
  if (Array.isArray(gr) && gr.length && esNum(gr[0])) gr = [{ label: 'Total', values: gr }];
  if (!Array.isArray(gr) || !gr.length) return vacio(o);

  const datos = [];
  for (let i = 0; i < gr.length; i++) {
    const it = gr[i] || {};
    const v = limpiar(it.values);
    if (v.length) datos.push({ label: String(it.label == null ? (i + 1) : it.label), res: resumenCaja(v) });
  }
  if (!datos.length) return vacio(o);

  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < datos.length; i++) {
    const r = datos[i].res;
    lo = Math.min(lo, r.bajo, r.atipicos.length ? Math.min.apply(null, r.atipicos) : r.bajo);
    hi = Math.max(hi, r.alto, r.atipicos.length ? Math.max.apply(null, r.atipicos) : r.alto);
  }
  const pad = (hi - lo) * 0.06 || 0.5;

  const g = escenario(o, { cat: datos.map(function (d) { return d.label; }) }, { dom: [lo - pad, hi + pad] });
  let s = g.fondo({ rejillaX: false });

  const ancho = Math.min(64, Math.max(14, g.slotX * 0.5));
  for (let i = 0; i < datos.length; i++) {
    const r = datos[i].res;
    const cx = g.sx(i);
    const x1 = cx - ancho / 2, x2 = cx + ancho / 2;
    const yQ1 = g.sy(r.q1), yQ3 = g.sy(r.q3), yMed = g.sy(r.med);
    // bigotes
    s += linea(cx, g.sy(r.bajo), cx, yQ1, C.ink3, 1.3);
    s += linea(cx, yQ3, cx, g.sy(r.alto), C.ink3, 1.3);
    s += linea(cx - ancho / 4, g.sy(r.bajo), cx + ancho / 4, g.sy(r.bajo), C.ink3, 1.3);
    s += linea(cx - ancho / 4, g.sy(r.alto), cx + ancho / 4, g.sy(r.alto), C.ink3, 1.3);
    // caja
    s += rect(x1, yQ3, ancho, Math.max(1, yQ1 - yQ3), C.blue, null, 0.22, 3);
    s += '<rect x="' + R(x1) + '" y="' + R(yQ3) + '" width="' + R(ancho) + '" height="' + R(Math.max(1, yQ1 - yQ3)) +
      '" rx="3" fill="none" stroke="' + C.blue + '" stroke-width="1.4"/>';
    // mediana
    s += linea(x1, yMed, x2, yMed, C.ink, 2.2);
    // atípicos
    for (let j = 0; j < r.atipicos.length; j++) {
      s += circulo(cx, g.sy(r.atipicos[j]), 2.6, C.nosig, 0.75);
    }
  }
  s += leyenda([
    { color: C.ink, label: 'Mediana', w: 2.2 },
    { color: C.nosig, label: 'Atípicos (fuera de 1,5×RIC)', tipo: 'caja' }
  ], g.x1 - 8, g.iy + 12, 'end');
  return doc(o, s);
}

/* --- Barras de medias con barras de error --- */
export function barMeans(groups, opts) {
  const o = opciones(opts);
  if (!Array.isArray(groups) || !groups.length) return vacio(o);
  const z = opts && Number.isFinite(+opts.z) ? +opts.z : 1.96;

  const datos = [];
  for (let i = 0; i < groups.length; i++) {
    const it = groups[i] || {};
    const m = aNum(it.mean);
    if (!Number.isFinite(m)) continue;
    const se = Number.isFinite(aNum(it.se)) ? Math.abs(aNum(it.se)) : 0;
    datos.push({ label: String(it.label == null ? (i + 1) : it.label), m: m, se: se });
  }
  if (!datos.length) return vacio(o);

  let lo = 0, hi = 0;
  for (let i = 0; i < datos.length; i++) {
    lo = Math.min(lo, datos[i].m - z * datos[i].se);
    hi = Math.max(hi, datos[i].m + z * datos[i].se);
  }
  const pad = (hi - lo) * 0.08 || 0.5;

  const g = escenario(o, { cat: datos.map(function (d) { return d.label; }) },
    { dom: [lo - (lo < 0 ? pad : 0), hi + pad], cero: true });
  let s = g.fondo({ rejillaX: false });

  const ancho = Math.min(72, Math.max(12, g.slotX * 0.56));
  const y0 = g.sy(0);
  for (let i = 0; i < datos.length; i++) {
    const cx = g.sx(i), ym = g.sy(datos[i].m);
    s += rect(cx - ancho / 2, Math.min(ym, y0), ancho, Math.abs(y0 - ym), C.blue, null, 0.55, 3);
    if (datos[i].se > 0) {
      const yLo = g.sy(datos[i].m - z * datos[i].se), yHi = g.sy(datos[i].m + z * datos[i].se);
      s += linea(cx, yLo, cx, yHi, C.ink, 1.4);
      s += linea(cx - 6, yLo, cx + 6, yLo, C.ink, 1.4);
      s += linea(cx - 6, yHi, cx + 6, yHi, C.ink, 1.4);
    }
    s += texto(cx, ym - (datos[i].se > 0 ? 16 : 6) - (datos[i].m < 0 ? -26 : 0), fmtNum(datos[i].m, 2),
      { fs: 10.5, fill: C.ink3, anchor: 'middle' });
  }
  if (lo < 0) s += linea(g.x0, y0, g.x1, y0, C.ink3, 1.2);
  s += leyenda([{ color: C.ink, label: 'Intervalo de confianza al 95%', w: 1.6 }], g.x1 - 8, g.iy + 12, 'end');
  return doc(o, s);
}

/* --- Gráfico de puntos con intervalos (margins) --- */
export function marginsPlot(items, opts) {
  const o = opciones(opts);
  o.title = o.title || 'Efectos marginales con intervalo de confianza';
  o.xlabel = o.xlabel || 'Efecto estimado';
  if (!Array.isArray(items) || !items.length) return vacio(o);

  const datos = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const e = aNum(it.est);
    if (!Number.isFinite(e)) continue;
    let lo = aNum(it.lo), hi = aNum(it.hi);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = e; hi = e; }
    if (hi < lo) { const t = lo; lo = hi; hi = t; }
    datos.push({ label: String(it.label == null ? (i + 1) : it.label), e: e, lo: lo, hi: hi });
  }
  if (!datos.length) return vacio(o);

  let xlo = Infinity, xhi = -Infinity;
  for (let i = 0; i < datos.length; i++) { xlo = Math.min(xlo, datos[i].lo); xhi = Math.max(xhi, datos[i].hi); }
  xlo = Math.min(0, xlo); xhi = Math.max(0, xhi);
  const pad = (xhi - xlo) * 0.10 || 0.5;

  // alto mínimo para que no se aplasten las filas
  o.height = Math.max(o.height, 90 + datos.length * 34);

  const g = escenario(o, { dom: [xlo - pad, xhi + pad], cero: true },
    { cat: datos.map(function (d) { return d.label; }) }, { mr: 26 });
  let s = g.fondo({ rejillaY: false });

  const x0 = g.sx(0);
  s += linea(x0, g.iy, x0, g.y1, C.ink3, 1.5, '5 4', 0.95);

  for (let i = 0; i < datos.length; i++) {
    const y = g.sy(i);
    const sig = (datos[i].lo > 0 || datos[i].hi < 0);
    const col = sig ? C.sig : C.nosig;
    s += linea(g.sx(datos[i].lo), y, g.sx(datos[i].hi), y, col, 2.2, null, 0.85);
    s += linea(g.sx(datos[i].lo), y - 5, g.sx(datos[i].lo), y + 5, col, 1.6);
    s += linea(g.sx(datos[i].hi), y - 5, g.sx(datos[i].hi), y + 5, col, 1.6);
    s += circulo(g.sx(datos[i].e), y, 4.2, col, 1, C.card);
    s += texto(g.sx(datos[i].hi) + 8, y + 4, fmtNum(datos[i].e, 3), { fs: 10.5, fill: C.ink3 });
  }
  s += leyenda([
    { color: C.sig, label: 'El intervalo no cruza 0 (significativo)', tipo: 'caja' },
    { color: C.nosig, label: 'El intervalo cruza 0 (no significativo)', tipo: 'caja' }
  ], g.x1 + 18, g.y1 + 26, 'end');
  return doc(o, s);
}

/* --- Mapa de calor de correlaciones --- */
export function corrHeatmap(names, M, opts) {
  const o = opciones(opts);
  o.title = o.title || 'Matriz de correlaciones';
  if (!Array.isArray(names) || !names.length || !Array.isArray(M) || !M.length) return vacio(o);

  const k = Math.min(names.length, M.length);
  const nom = [];
  for (let i = 0; i < k; i++) nom.push(recortar(String(names[i] == null ? i + 1 : names[i]), 14));

  const W = o.width, H = o.height;
  const mt = (o.title ? 34 : 12);
  const mbBase = 12 + (o.note ? 16 : 0) + (o.xlabel ? 16 : 0);
  let anchoNom = 0;
  for (let i = 0; i < k; i++) anchoNom = Math.max(anchoNom, anchoTexto(nom[i], 11));
  const ml = Math.min(W * 0.34, anchoNom + 16);
  const mbEtiq = Math.min(70, anchoNom * 0.72 + 16); // etiquetas inferiores giradas
  const dispW = Math.max(40, W - ml - 60);
  const dispH = Math.max(40, H - mt - mbBase - mbEtiq);
  const celda = Math.max(16, Math.min(dispW / k, dispH / k));
  const x0 = ml, y0 = mt + Math.max(0, (dispH - celda * k) / 2);

  let s = '';
  if (o.title) s += texto(W / 2, 22, o.title, { fs: 14, w: 600, fill: C.ink, anchor: 'middle', ff: FD });

  const fs = Math.max(7.5, Math.min(12, celda * 0.32));
  for (let i = 0; i < k; i++) {
    const fila = Array.isArray(M[i]) ? M[i] : [];
    for (let j = 0; j < k; j++) {
      const r = aNum(fila[j]);
      const x = x0 + j * celda, y = y0 + i * celda;
      const val = Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : null;
      // escala divergente: negativo = --nosig, positivo = --blue
      const col = val == null ? C.card : (val < 0 ? C.nosig : C.blue);
      const op = val == null ? 0.25 : (0.10 + 0.80 * Math.abs(val));
      s += rect(x, y, celda - 1.5, celda - 1.5, col, null, op, 3);
      s += '<rect x="' + R(x) + '" y="' + R(y) + '" width="' + R(celda - 1.5) + '" height="' + R(celda - 1.5) +
        '" rx="3" fill="none" stroke="' + C.line + '" stroke-width="0.6" opacity="0.6"/>';
      s += texto(x + (celda - 1.5) / 2, y + (celda - 1.5) / 2 + fs * 0.36,
        val == null ? '.' : fmtNum(val, 2), { fs: fs, fill: C.ink, anchor: 'middle', w: 600 });
    }
    // nombre de la fila
    s += texto(x0 - 8, y0 + i * celda + celda / 2 + 3.5, nom[i], { fs: 11, fill: C.ink3, anchor: 'end', ff: FD });
    // nombre de la columna (girado)
    const xc = x0 + i * celda + celda / 2;
    s += texto(xc, y0 + k * celda + 14, nom[i], { fs: 11, fill: C.ink3, anchor: 'end', ff: FD, rot: -40 });
  }

  // escala de referencia
  const lx = x0 + k * celda + 18, ly = y0;
  const alto = Math.min(k * celda, 140);
  const pasos = 16;
  for (let t = 0; t < pasos; t++) {
    const v = 1 - 2 * (t / (pasos - 1));
    const col = v < 0 ? C.nosig : C.blue;
    s += rect(lx, ly + t * (alto / pasos), 12, alto / pasos + 0.6, col, null, 0.10 + 0.80 * Math.abs(v), 0);
  }
  if (lx + 34 < W) {
    s += texto(lx + 16, ly + 8, '+1', { fs: 10, fill: C.ink3 });
    s += texto(lx + 16, ly + alto / 2 + 3, '0', { fs: 10, fill: C.ink3 });
    s += texto(lx + 16, ly + alto, '−1', { fs: 10, fill: C.ink3 });
  }

  if (o.note) s += texto(W / 2, H - 6, o.note, { fs: 10.5, fill: C.ink3, anchor: 'middle', ff: FD, style: 'italic' });
  return doc(o, s);
}

/* --- Líneas (una o varias series) --- */
export function linePlot(series, opts) {
  const o = opciones(opts);
  let ss = series;
  if (ss && !Array.isArray(ss)) ss = [ss];
  if (!Array.isArray(ss) || !ss.length) return vacio(o);

  const limpias = [];
  for (let i = 0; i < ss.length; i++) {
    const it = ss[i] || {};
    const yv = Array.isArray(it.y) ? it.y : [];
    const xv = Array.isArray(it.x) && it.x.length ? it.x : yv.map(function (_, j) { return j + 1; });
    const p = pares(xv, yv);
    if (p.x.length) limpias.push({ label: String(it.label == null ? 'serie ' + (i + 1) : it.label), x: p.x, y: p.y });
  }
  if (!limpias.length) return vacio(o);

  let xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity;
  for (let i = 0; i < limpias.length; i++) {
    const ex = minMax(limpias[i].x), ey = minMax(limpias[i].y);
    xlo = Math.min(xlo, ex[0]); xhi = Math.max(xhi, ex[1]);
    ylo = Math.min(ylo, ey[0]); yhi = Math.max(yhi, ey[1]);
  }
  const padY = (yhi - ylo) * 0.07 || 0.5;
  const conLeyenda = limpias.length > 1;

  const g = escenario(o, { dom: [xlo, xhi] }, { dom: [ylo - padY, yhi + padY] },
    { mtExtra: conLeyenda ? 14 : 0 });
  let s = g.fondo();

  for (let i = 0; i < limpias.length; i++) {
    const col = PALETA[i % PALETA.length];
    // ordenar por x para que la línea no se cruce sola
    const ord = limpias[i].x.map(function (_, j) { return j; })
      .sort(function (p, q) { return limpias[i].x[p] - limpias[i].x[q]; });
    const px = ord.map(function (j) { return g.sx(limpias[i].x[j]); });
    const py = ord.map(function (j) { return g.sy(limpias[i].y[j]); });
    s += camino(px, py, col, 2.2);
    if (px.length <= 30) for (let j = 0; j < px.length; j++) s += circulo(px[j], py[j], 2.6, col, 0.9);
  }
  if (conLeyenda) {
    const items = limpias.map(function (l, i) { return { color: PALETA[i % PALETA.length], label: l.label }; });
    s += leyenda(items, g.x1 - 8, g.iy + 12, 'end');
  }
  return doc(o, s);
}

/* --- Densidad kernel (gaussiano, Silverman) --- */
export function densityPlot(values, opts) {
  const o = opciones(opts);
  const v = limpiar(values);
  if (v.length < 3) return vacio(o);
  o.ylabel = o.ylabel || 'Densidad';

  const h = (opts && Number.isFinite(+opts.bw) && +opts.bw > 0) ? +opts.bw : silverman(v);
  const d = densidadKernel(v, h, 200);
  const ex = minMax(d.x), ey = minMax(d.y);
  const conNormal = !!(opts && opts.normal);

  let curvaN = null, yMax = ey[1];
  if (conNormal) {
    const m = media(v), s0 = desv(v);
    if (s0 > 0) {
      const cy = d.x.map(function (xv) { return pdfNorm((xv - m) / s0) / s0; });
      curvaN = cy;
      yMax = Math.max(yMax, Math.max.apply(null, cy));
    }
  }

  const g = escenario(o, { dom: [ex[0], ex[1]] }, { dom: [0, yMax * 1.08], cero: true });
  let s = g.fondo();

  const px = d.x.map(g.sx), py = d.y.map(g.sy);
  s += area(px, py, g.y1, C.blue, 0.16);
  s += camino(px, py, C.blue, 2.4);
  if (curvaN) s += camino(px, curvaN.map(g.sy), C.ochre, 2, '6 4');

  // alfombra de observaciones cuando son pocas
  if (v.length <= 200) {
    for (let i = 0; i < v.length; i++) s += linea(g.sx(v[i]), g.y1, g.sx(v[i]), g.y1 - 6, C.ink3, 1, null, 0.45);
  }
  const items = [{ color: C.blue, label: 'Densidad estimada (h = ' + fmtNum(h, 3) + ')' }];
  if (curvaN) items.push({ color: C.ochre, label: 'Normal ajustada', dash: '6 4' });
  s += leyenda(items, g.x1 - 8, g.iy + 12, 'end');
  return doc(o, s);
}

/* --- Curva de Lorenz + Gini --- */
export function lorenzCurve(values, opts) {
  const o = opciones(opts);
  o.title = o.title || 'Curva de Lorenz';
  o.xlabel = o.xlabel || '% acumulado de la población';
  o.ylabel = o.ylabel || '% acumulado del ingreso';

  let v = limpiar(values).map(function (z) { return z < 0 ? 0 : z; });
  if (v.length < 2) return vacio(o);
  v = ordenar(v);
  let total = 0;
  for (let i = 0; i < v.length; i++) total += v[i];
  if (!(total > 0)) return vacio(o, 'No hay datos para graficar');

  const n = v.length;
  const P = [0], L = [0];
  let acum = 0;
  for (let i = 0; i < n; i++) {
    acum += v[i];
    P.push((i + 1) / n);
    L.push(acum / total);
  }
  // Gini por trapecios
  let gini = 1;
  for (let i = 1; i < P.length; i++) gini -= (P[i] - P[i - 1]) * (L[i] + L[i - 1]);
  if (!Number.isFinite(gini)) gini = 0;

  const g = escenario(o, { dom: [0, 1] }, { dom: [0, 1] });
  let s = g.fondo();

  const px = P.map(g.sx), py = L.map(g.sy);
  // zona de desigualdad entre la diagonal y la curva
  let d = 'M' + R(g.sx(0)) + ' ' + R(g.sy(0)) + ' ';
  for (let i = 0; i < px.length; i++) d += 'L' + R(px[i]) + ' ' + R(py[i]) + ' ';
  d += 'L' + R(g.sx(1)) + ' ' + R(g.sy(1)) + ' Z';
  s += '<path d="' + d + '" fill="' + C.ochre + '" opacity="0.18" stroke="none"/>';

  s += linea(g.sx(0), g.sy(0), g.sx(1), g.sy(1), C.ink3, 1.5, '5 4', 0.9);
  s += camino(px, py, C.blue, 2.6);

  s += rect(g.x0 + 10, g.iy + 10, 132, 24, C.card, C.line, 0.95, 5);
  s += texto(g.x0 + 76, g.iy + 26, 'Gini = ' + fmtNum(gini, 4), { fs: 12, w: 600, fill: C.ink, anchor: 'middle' });
  s += leyenda([{ color: C.ink3, label: 'Igualdad perfecta', dash: '5 4' }], g.x1 - 8, g.y1 - 14, 'end');
  return doc(o, s);
}

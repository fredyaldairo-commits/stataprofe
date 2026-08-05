// Utilidades compartidas: formato de números al estilo Stata, distancias de texto,
// generador pseudoaleatorio con semilla y ayudas varias.

// Valor que Stata usa internamente para el faltante ".". Solo se usa al comparar.
export const MISSNUM = 8.98846567431158e307;

export function esNulo(v) {
  return v === null || v === undefined || (typeof v === 'number' && !isFinite(v) && isNaN(v));
}

/** Formato %9.0g de Stata: notación compacta con ~ 6 dígitos significativos. */
export function fmtG(v, sig = 7) {
  if (esNulo(v)) return '.';
  if (!isFinite(v)) return v > 0 ? '.' : '.';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e11 || a < 1e-4) {
    return v.toExponential(4).replace('e+', 'e+').replace('e-', 'e-');
  }
  let s = v.toPrecision(sig);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

/** Formato fijo con d decimales. */
export function fmtF(v, d = 3) {
  if (esNulo(v) || !isFinite(v)) return '.';
  return v.toFixed(d);
}

/** Valor p al estilo Stata: 3 decimales, y 0.000 cuando es muy chico. */
export function fmtP(p) {
  if (esNulo(p) || isNaN(p)) return '.';
  if (p < 0.0005) return '0.000';
  return p.toFixed(3);
}

/** Rellena a la derecha hasta n caracteres. */
export function padD(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

/** Rellena a la izquierda hasta n caracteres. */
export function padI(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(s.length - n) : ' '.repeat(n - s.length) + s;
}

/** Recorta un nombre largo al estilo Stata (12 caracteres con ~). */
export function corta(s, n = 12) {
  s = String(s);
  if (s.length <= n) return s;
  return '~' + s.slice(s.length - (n - 1));
}

/** Distancia de edición, para sugerir "¿quisiste decir...?". */
export function distancia(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** Devuelve el candidato más parecido si está lo bastante cerca. */
export function masParecido(palabra, candidatos, maxDist = null) {
  if (!palabra) return null;
  const lim = maxDist === null ? (palabra.length <= 4 ? 1 : palabra.length <= 7 ? 2 : 3) : maxDist;
  let mejor = null, mejorD = Infinity;
  for (const c of candidatos) {
    const d = distancia(palabra, c);
    if (d < mejorD) { mejorD = d; mejor = c; }
  }
  return mejorD <= lim ? mejor : null;
}

/** Varios candidatos parecidos, ordenados. */
export function parecidos(palabra, candidatos, cuantos = 3) {
  return candidatos
    .map((c) => ({ c, d: distancia(palabra, c) }))
    .sort((a, b) => a.d - b.d)
    .filter((x) => x.d <= Math.max(2, Math.floor(palabra.length / 2)))
    .slice(0, cuantos)
    .map((x) => x.c);
}

/** PRNG con semilla (mulberry32). */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal estándar por Box-Muller usando un PRNG dado. */
export function normalDe(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Estadísticos básicos ignorando faltantes. */
export function resumen(vals) {
  const x = vals.filter((v) => !esNulo(v));
  const n = x.length;
  if (!n) return { n: 0, media: null, sd: null, min: null, max: null, suma: 0 };
  let s = 0;
  for (const v of x) s += v;
  const media = s / n;
  let s2 = 0;
  for (const v of x) s2 += (v - media) * (v - media);
  const varianza = n > 1 ? s2 / (n - 1) : 0;
  return {
    n, media, varianza, sd: Math.sqrt(varianza),
    min: Math.min(...x), max: Math.max(...x), suma: s,
  };
}

/** Percentil por el método de Stata (interpolación tipo "altdef" desactivada: usa el simple). */
export function percentil(valsOrdenados, p) {
  const x = valsOrdenados;
  const n = x.length;
  if (!n) return null;
  const pos = (n * p) / 100;
  const i = Math.floor(pos);
  if (Math.abs(pos - i) < 1e-9) {
    if (i <= 0) return x[0];
    if (i >= n) return x[n - 1];
    return (x[i - 1] + x[i]) / 2;
  }
  const j = Math.min(n - 1, i);
  return x[j];
}

/** Asimetría y curtosis muestrales (como las reporta summarize, detail). */
export function formaDist(vals) {
  const x = vals.filter((v) => !esNulo(v));
  const n = x.length;
  if (n < 3) return { skew: null, kurt: null };
  const m = x.reduce((a, b) => a + b, 0) / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const v of x) {
    const d = v - m;
    m2 += d * d; m3 += d * d * d; m4 += d * d * d * d;
  }
  m2 /= n; m3 /= n; m4 /= n;
  return { skew: m3 / Math.pow(m2, 1.5), kurt: m4 / (m2 * m2) };
}

/** Ordena una copia numérica ascendente. */
export function ordenados(vals) {
  return vals.filter((v) => !esNulo(v)).slice().sort((a, b) => a - b);
}

/** Convierte cualquier cosa a número o null. */
export function aNumero(v) {
  if (esNulo(v)) return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s === '' || s === '.') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/** Escapa HTML. */
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Número con separador de miles al estilo local (para textos del profesor). */
export function miles(v, dec = 0) {
  if (esNulo(v)) return '.';
  return v.toLocaleString('es-EC', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

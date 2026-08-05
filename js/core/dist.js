// dist.js — funciones especiales y distribuciones para StataProfe.
// Precisión objetivo: normalCdf >= 1e-12, normalInv >= 1e-9.
// Sin dependencias, sin DOM.

const SQRT2 = Math.SQRT2;
const SQRT2PI = Math.sqrt(2 * Math.PI);
const INV_SQRT2PI = 1 / SQRT2PI;
const EPS = 2.220446049250313e-16;
const FPMIN = 1e-300;
const ITMAX = 5000;

// ---------------------------------------------------------------------------
// Log-gamma (Lanczos, g = 671/128, 14 coeficientes; error relativo ~1e-15)
// ---------------------------------------------------------------------------

const LANCZOS = [
  57.1562356658629235, -59.5979603554754912, 14.1360979747417471,
  -0.491913816097620199, 0.339946499848118887e-4, 0.465236289270485756e-4,
  -0.983744753048795646e-4, 0.158088703224912494e-3, -0.210264441724104883e-3,
  0.217439618115212643e-3, -0.164318106536763890e-3, 0.844182239838527433e-4,
  -0.261908384015814087e-4, 0.368991826595316234e-5,
];

export function lnGamma(x) {
  if (Number.isNaN(x)) return NaN;
  if (x <= 0) {
    // Reflexión: Γ(x)Γ(1-x) = π / sen(πx). Polos en los enteros <= 0.
    if (Number.isInteger(x)) return Infinity;
    const sen = Math.abs(Math.sin(Math.PI * x));
    return Math.log(Math.PI / sen) - lnGamma(1 - x);
  }
  let y = x;
  let tmp = x + 5.24218750000000000; // 671/128
  tmp = (x + 0.5) * Math.log(tmp) - tmp;
  let ser = 0.999999999999997092;
  for (let j = 0; j < 14; j++) { y += 1; ser += LANCZOS[j] / y; }
  return tmp + Math.log((2.5066282746310005 * ser) / x);
}

// ---------------------------------------------------------------------------
// Gamma incompleta regularizada
// ---------------------------------------------------------------------------

// Serie para P(a,x), buena cuando x < a+1.
function gammaSerie(a, x) {
  let ap = a;
  let del = 1 / a;
  let sum = del;
  for (let n = 0; n < ITMAX; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

// Fracción continua (Lentz) para Q(a,x), buena cuando x >= a+1.
function gammaFraccion(a, x) {
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) <= EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

// P(a,x) regularizada.
export function incompleteGammaP(a, x) {
  if (!(a > 0) || Number.isNaN(x)) return NaN;
  if (x < 0) return NaN;
  if (x === 0) return 0;
  if (!Number.isFinite(x)) return 1;
  if (x < a + 1) return gammaSerie(a, x);
  return 1 - gammaFraccion(a, x);
}

// Q(a,x) = 1 - P(a,x), calculada por la rama que conserva precisión.
export function incompleteGammaQ(a, x) {
  if (!(a > 0) || Number.isNaN(x)) return NaN;
  if (x < 0) return NaN;
  if (x === 0) return 1;
  if (!Number.isFinite(x)) return 0;
  if (x < a + 1) return 1 - gammaSerie(a, x);
  return gammaFraccion(a, x);
}

// Inversa de P(a,x) (uso interno: chi2Inv).
function invGammaP(p, a) {
  if (!(a > 0)) return NaN;
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  const gln = lnGamma(a);
  const a1 = a - 1;
  let x;
  let lna1 = 0;
  let afac = 0;
  if (a > 1) {
    lna1 = Math.log(a1);
    afac = Math.exp(a1 * (lna1 - 1) - gln);
    const pp = p < 0.5 ? p : 1 - p;
    const t = Math.sqrt(-2 * Math.log(pp));
    let z = (2.30753 + t * 0.27061) / (1 + t * (0.99229 + t * 0.04481)) - t;
    if (p < 0.5) z = -z;
    x = Math.max(1e-3, a * Math.pow(1 - 1 / (9 * a) - z / (3 * Math.sqrt(a)), 3));
  } else {
    const t = 1 - a * (0.253 + a * 0.12);
    if (p < t) x = Math.pow(p / t, 1 / a);
    else x = 1 - Math.log(1 - (p - t) / (1 - t));
  }
  for (let j = 0; j < 60; j++) {
    if (x <= 0) return 0;
    const err = incompleteGammaP(a, x) - p;
    let t;
    if (a > 1) t = afac * Math.exp(-(x - a1) + a1 * (Math.log(x) - lna1));
    else t = Math.exp(-x + a1 * Math.log(x) - gln);
    if (!(t > 0)) break;
    const u = err / t;
    let paso = u / (1 - 0.5 * Math.min(1, u * (a1 / x - 1)));
    x -= paso;
    if (x <= 0) x = 0.5 * (x + paso);
    if (Math.abs(paso) < 1e-14 * Math.abs(x)) break;
  }
  return x;
}

// ---------------------------------------------------------------------------
// Beta incompleta regularizada
// ---------------------------------------------------------------------------

// Fracción continua de Lentz para I_x(a,b).
function betaFraccion(a, b, x) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= ITMAX; m++) {
    const m2 = 2 * m;
    // Paso par.
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    // Paso impar.
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) <= EPS) break;
  }
  return h;
}

// I_x(a,b) regularizada.
export function incompleteBeta(a, b, x) {
  if (!(a > 0) || !(b > 0) || Number.isNaN(x)) return NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log1p(-x)
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betaFraccion(a, b, x)) / a;
  return 1 - (bt * betaFraccion(b, a, 1 - x)) / b;
}

// Inversa de I_x(a,b) (uso interno: tInv, fInv).
function invIncompleteBeta(p, a, b) {
  if (!(a > 0) || !(b > 0)) return NaN;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const a1 = a - 1;
  const b1 = b - 1;
  let x;
  if (a >= 1 && b >= 1) {
    const pp = p < 0.5 ? p : 1 - p;
    const t = Math.sqrt(-2 * Math.log(pp));
    let z = (2.30753 + t * 0.27061) / (1 + t * (0.99229 + t * 0.04481)) - t;
    if (p < 0.5) z = -z;
    const al = (z * z - 3) / 6;
    const h = 2 / (1 / (2 * a - 1) + 1 / (2 * b - 1));
    const w =
      (z * Math.sqrt(al + h)) / h -
      (1 / (2 * b - 1) - 1 / (2 * a - 1)) * (al + 5 / 6 - 2 / (3 * h));
    x = a / (a + b * Math.exp(2 * w));
  } else {
    const lna = Math.log(a / (a + b));
    const lnb = Math.log(b / (a + b));
    const t = Math.exp(a * lna) / a;
    const u = Math.exp(b * lnb) / b;
    const w = t + u;
    if (p < t / w) x = Math.pow(a * w * p, 1 / a);
    else x = 1 - Math.pow(b * w * (1 - p), 1 / b);
  }
  const afac = -lnGamma(a) - lnGamma(b) + lnGamma(a + b);
  for (let j = 0; j < 40; j++) {
    if (x === 0 || x === 1) return x;
    const err = incompleteBeta(a, b, x) - p;
    const t = Math.exp(a1 * Math.log(x) + b1 * Math.log1p(-x) + afac);
    if (!(t > 0)) break;
    const u = err / t;
    let paso = u / (1 - 0.5 * Math.min(1, u * (a1 / x - b1 / (1 - x))));
    x -= paso;
    if (x <= 0) x = 0.5 * (x + paso);
    if (x >= 1) x = 0.5 * (x + paso + 1);
    if (Math.abs(paso) < 1e-15 * x && j > 0) break;
  }
  return x;
}

// ---------------------------------------------------------------------------
// Normal
// ---------------------------------------------------------------------------

// Coeficientes racionales de W. J. Cody para erf/erfc (precisión ~1e-16).
const C_A = [3.16112374387056560e0, 1.13864154151050156e2, 3.77485237685302021e2,
  3.20937758913846947e3, 1.85777706184603153e-1];
const C_B = [2.36012909523441209e1, 2.44024637934444173e2, 1.28261652607737228e3,
  2.84423683343917062e3];
const C_C = [5.64188496988670089e-1, 8.88314979438837594e0, 6.61191906371416295e1,
  2.98635138197400131e2, 8.81952221241769090e2, 1.71204761263407058e3,
  2.05107837782607147e3, 1.23033935479799725e3, 2.15311535474403846e-8];
const C_D = [1.57449261107098347e1, 1.17693950891312499e2, 5.37181101862009858e2,
  1.62138957456669019e3, 3.29079923573345963e3, 4.36261909014324716e3,
  3.43936767414372164e3, 1.23033935480374942e3];
const C_P = [3.05326634961232344e-1, 3.60344899949804439e-1, 1.25781726111229246e-1,
  1.60837851487422766e-2, 6.58749161529837803e-4, 1.63153871373020978e-2];
const C_Q = [2.56852019228982242e0, 1.87295284992346047e0, 5.27905102951428412e-1,
  6.05183413124413191e-2, 2.33520497626869185e-3];
const SQRPI = 5.6418958354775628695e-1; // 1/sqrt(pi)

// erfc(x) por el método de Cody.
function erfc(x) {
  if (Number.isNaN(x)) return NaN;
  const y = Math.abs(x);
  let res;

  if (y <= 0.46875) {
    const ysq = y > 1.11e-16 ? y * y : 0;
    let xnum = C_A[4] * ysq;
    let xden = ysq;
    for (let i = 0; i < 3; i++) {
      xnum = (xnum + C_A[i]) * ysq;
      xden = (xden + C_B[i]) * ysq;
    }
    const er = (x * (xnum + C_A[3])) / (xden + C_B[3]);
    return 1 - er;
  }

  if (y <= 4.0) {
    let xnum = C_C[8] * y;
    let xden = y;
    for (let i = 0; i < 7; i++) {
      xnum = (xnum + C_C[i]) * y;
      xden = (xden + C_D[i]) * y;
    }
    res = (xnum + C_C[7]) / (xden + C_D[7]);
  } else if (y >= 26.6) {
    res = 0; // exp(-y^2) ya es cero en doble precisión
  } else {
    const ysq = 1 / (y * y);
    let xnum = C_P[5] * ysq;
    let xden = ysq;
    for (let i = 0; i < 4; i++) {
      xnum = (xnum + C_P[i]) * ysq;
      xden = (xden + C_Q[i]) * ysq;
    }
    res = (ysq * (xnum + C_P[4])) / (xden + C_Q[4]);
    res = (SQRPI - res) / y;
  }

  if (res !== 0) {
    // Factoriza exp(-y^2) truncando y para no perder dígitos.
    const yt = Math.floor(y * 16) / 16;
    const del = (y - yt) * (y + yt);
    res = Math.exp(-yt * yt) * Math.exp(-del) * res;
  }
  return x < 0 ? 2 - res : res;
}

// Densidad normal estándar.
export function normalPdf(z) {
  if (Number.isNaN(z)) return NaN;
  return INV_SQRT2PI * Math.exp(-0.5 * z * z);
}

// Acumulada normal estándar (vía erfc de Cody).
export function normalCdf(z) {
  if (Number.isNaN(z)) return NaN;
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  return 0.5 * erfc(-z / SQRT2);
}

// Coeficientes de Acklam para la inversa normal.
const AK_A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
  1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
const AK_B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
  6.680131188771972e1, -1.328068155288572e1];
const AK_C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
  -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
const AK_D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
  3.754408661907416e0];

// Cuantil normal estándar: Acklam + un paso de refinamiento de Halley.
export function normalInv(p) {
  if (Number.isNaN(p) || p <= 0 || p >= 1) return NaN;
  const PLOW = 0.02425;
  const PHIGH = 1 - PLOW;
  let x;

  if (p < PLOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((AK_C[0] * q + AK_C[1]) * q + AK_C[2]) * q + AK_C[3]) * q + AK_C[4]) * q + AK_C[5]) /
        ((((AK_D[0] * q + AK_D[1]) * q + AK_D[2]) * q + AK_D[3]) * q + 1);
  } else if (p > PHIGH) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((AK_C[0] * q + AK_C[1]) * q + AK_C[2]) * q + AK_C[3]) * q + AK_C[4]) * q + AK_C[5]) /
         ((((AK_D[0] * q + AK_D[1]) * q + AK_D[2]) * q + AK_D[3]) * q + 1);
  } else {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((AK_A[0] * r + AK_A[1]) * r + AK_A[2]) * r + AK_A[3]) * r + AK_A[4]) * r + AK_A[5]) * q) /
        (((((AK_B[0] * r + AK_B[1]) * r + AK_B[2]) * r + AK_B[3]) * r + AK_B[4]) * r + 1);
  }

  // Refinamiento de Halley (dos pasadas: baja el error a nivel de máquina).
  for (let it = 0; it < 2; it++) {
    const e = 0.5 * erfc(-x / SQRT2) - p;
    const u = e * SQRT2PI * Math.exp(0.5 * x * x);
    if (!Number.isFinite(u)) break;
    x = x - u / (1 + (x * u) / 2);
  }
  return x;
}

// p de dos colas de la normal.
export function pZ(z) {
  if (Number.isNaN(z)) return NaN;
  return erfc(Math.abs(z) / SQRT2);
}

// ---------------------------------------------------------------------------
// t de Student
// ---------------------------------------------------------------------------

// Acumulada de la t (df puede ser no entero).
export function tCdf(t, df) {
  if (Number.isNaN(t) || Number.isNaN(df) || !(df > 0)) return NaN;
  if (t === Infinity) return 1;
  if (t === -Infinity) return 0;
  const x = df / (df + t * t);
  const mitad = 0.5 * incompleteBeta(df / 2, 0.5, x); // = P(T > |t|)
  return t > 0 ? 1 - mitad : mitad;
}

// Densidad de la t (interna, para pulir el cuantil por Newton).
function tPdf(t, df) {
  return Math.exp(
    lnGamma((df + 1) / 2) - lnGamma(df / 2) - 0.5 * Math.log(df * Math.PI) -
    ((df + 1) / 2) * Math.log1p((t * t) / df)
  );
}

// Cuantil de la t (una cola izquierda).
export function tInv(p, df) {
  if (Number.isNaN(p) || p <= 0 || p >= 1 || !(df > 0)) return NaN;
  if (p === 0.5) return 0;
  const cola = p < 0.5 ? 2 * p : 2 * (1 - p);
  const x = invIncompleteBeta(cola, df / 2, 0.5);
  if (!(x > 0)) return p < 0.5 ? -Infinity : Infinity;
  // Se trabaja siempre en la cola izquierda (ahí la acumulada es exacta).
  let t = -Math.sqrt((df * (1 - x)) / x);
  const pl = cola / 2;
  for (let it = 0; it < 2; it++) {
    const d = tPdf(t, df);
    if (!(d > 0)) break;
    const paso = (tCdf(t, df) - pl) / d;
    if (!Number.isFinite(paso)) break;
    t -= paso;
  }
  return p < 0.5 ? t : -t;
}

// p de dos colas de la t.
export function pT(t, df) {
  if (Number.isNaN(t) || !(df > 0)) return NaN;
  if (!Number.isFinite(t)) return 0;
  // Equivale a 2*(1 - tCdf(|t|,df)) pero sin pérdida de precisión en la cola.
  return incompleteBeta(df / 2, 0.5, df / (df + t * t));
}

// ---------------------------------------------------------------------------
// Chi-cuadrado
// ---------------------------------------------------------------------------

export function chi2Cdf(x, df) {
  if (Number.isNaN(x) || !(df > 0)) return NaN;
  if (x <= 0) return 0;
  return incompleteGammaP(df / 2, x / 2);
}

export function chi2Inv(p, df) {
  if (Number.isNaN(p) || p <= 0 || p >= 1 || !(df > 0)) return NaN;
  return 2 * invGammaP(p, df / 2);
}

// Cola superior de la chi-cuadrado.
export function pChi2(x, df) {
  if (Number.isNaN(x) || !(df > 0)) return NaN;
  if (x <= 0) return 1;
  return incompleteGammaQ(df / 2, x / 2);
}

// ---------------------------------------------------------------------------
// F de Snedecor
// ---------------------------------------------------------------------------

export function fCdf(f, d1, d2) {
  if (Number.isNaN(f) || !(d1 > 0) || !(d2 > 0)) return NaN;
  if (f <= 0) return 0;
  if (!Number.isFinite(f)) return 1;
  const x = (d1 * f) / (d1 * f + d2);
  return incompleteBeta(d1 / 2, d2 / 2, x);
}

// Densidad de la F (interna, para pulir el cuantil por Newton).
function fPdf(f, d1, d2) {
  return Math.exp(
    (d1 / 2) * Math.log(d1 / d2) + (d1 / 2 - 1) * Math.log(f) -
    ((d1 + d2) / 2) * Math.log1p((d1 * f) / d2) -
    (lnGamma(d1 / 2) + lnGamma(d2 / 2) - lnGamma((d1 + d2) / 2))
  );
}

export function fInv(p, d1, d2) {
  if (Number.isNaN(p) || p <= 0 || p >= 1 || !(d1 > 0) || !(d2 > 0)) return NaN;
  const x = invIncompleteBeta(p, d1 / 2, d2 / 2);
  if (x >= 1) return Infinity;
  let f = (d2 * x) / (d1 * (1 - x));
  // Pulido: en la cola derecha se usa pF para no perder dígitos.
  for (let it = 0; it < 2; it++) {
    if (!(f > 0)) break;
    const d = fPdf(f, d1, d2);
    if (!(d > 0) || !Number.isFinite(d)) break;
    const err = p <= 0.5 ? fCdf(f, d1, d2) - p : (1 - p) - pF(f, d1, d2);
    const paso = err / d;
    if (!Number.isFinite(paso)) break;
    f -= paso;
    if (f <= 0) { f += paso; break; }
  }
  return f;
}

// Cola superior de la F (p-valor del test global).
export function pF(f, d1, d2) {
  if (Number.isNaN(f) || !(d1 > 0) || !(d2 > 0)) return NaN;
  if (f <= 0) return 1;
  if (!Number.isFinite(f)) return 0;
  // I_{d2/(d2+d1 f)}(d2/2, d1/2) conserva precisión en la cola derecha.
  const x = d2 / (d2 + d1 * f);
  return incompleteBeta(d2 / 2, d1 / 2, x);
}

// ---------------------------------------------------------------------------
// Cuadratura de Gauss-Hermite (versión "físicos": peso e^{-x^2})
// ---------------------------------------------------------------------------

// Nodos y pesos para ∫ f(x) e^{-x^2} dx. Nodos por Newton sobre la recurrencia
// de los polinomios de Hermite normalizados. n hasta 40 (y bastante más).
export function gaussHermite(n) {
  if (!Number.isInteger(n) || n < 1) throw new Error('gaussHermite: n debe ser un entero >= 1');
  const PIM4 = 0.7511255444649425; // pi^(-1/4)
  const MAXIT = 100;
  const TOL = 1e-15;
  const nodes = new Array(n).fill(0);
  const weights = new Array(n).fill(0);
  const m = (n + 1) >> 1;
  let z = 0;
  let pp = 0;

  for (let i = 0; i < m; i++) {
    // Semillas clásicas para las raíces (de mayor a menor).
    if (i === 0) z = Math.sqrt(2 * n + 1) - 1.85575 * Math.pow(2 * n + 1, -0.16667);
    else if (i === 1) z -= (1.14 * Math.pow(n, 0.426)) / z;
    else if (i === 2) z = 1.86 * z - 0.86 * nodes[0];
    else if (i === 3) z = 1.91 * z - 0.91 * nodes[1];
    else z = 2 * z - nodes[i - 2];

    for (let it = 0; it < MAXIT; it++) {
      let p1 = PIM4;
      let p2 = 0;
      let p3;
      for (let j = 0; j < n; j++) {
        p3 = p2;
        p2 = p1;
        p1 = z * Math.sqrt(2 / (j + 1)) * p2 - Math.sqrt(j / (j + 1)) * p3;
      }
      pp = Math.sqrt(2 * n) * p2;
      const z1 = z;
      z = z1 - p1 / pp;
      if (Math.abs(z - z1) <= TOL) break;
    }
    nodes[i] = z;
    nodes[n - 1 - i] = -z;
    weights[i] = 2 / (pp * pp);
    weights[n - 1 - i] = weights[i];
  }

  // Devuelve los nodos en orden ascendente.
  const orden = nodes.map((v, i) => i).sort((a, b) => nodes[a] - nodes[b]);
  return {
    nodes: orden.map((i) => nodes[i]),
    weights: orden.map((i) => weights[i]),
  };
}

// Estimadores y pruebas de diagnóstico. Todo se calcula de verdad sobre los datos.

import {
  transpose, matmul, matvec, inverse, invSPD, crossprod, crossprodXY,
  qrLeastSquares, identity, zeros,
} from './matrix.js';
import {
  normalCdf, normalPdf, normalInv, pT, pZ, pChi2, pF, tInv, gaussHermite, lnGamma,
} from './dist.js';

const TOL = 1e-10;
const MAXIT = 60;

// ------------------------------------------------------------------ utilidades

function colsDe(X, keep) {
  return X.map((f) => keep.map((j) => f[j]));
}

/** Inserta ceros en las posiciones descartadas para volver al largo original. */
function reexpandir(vec, keep, k) {
  const out = new Array(k).fill(0);
  keep.forEach((j, i) => { out[j] = vec[i]; });
  return out;
}

function reexpandirMatriz(V, keep, k) {
  const out = zeros(k, k);
  keep.forEach((a, i) => keep.forEach((b, j) => { out[a][b] = V[i][j]; }));
  return out;
}

/** Wald: b_R' (R V R')^-1 b_R sobre los índices dados. */
export function wald(b, V, idx) {
  if (!idx.length) return { chi2: NaN, df: 0 };
  const sub = idx.map((i) => idx.map((j) => V[i][j]));
  let inv;
  try { inv = inverse(sub); } catch { return { chi2: NaN, df: idx.length }; }
  const br = idx.map((i) => b[i]);
  let s = 0;
  for (let i = 0; i < br.length; i++) for (let j = 0; j < br.length; j++) s += br[i] * inv[i][j] * br[j];
  return { chi2: s, df: idx.length };
}

function armaResultado(base) {
  return Object.assign({
    cmd: 'regress', depvar: '', N: 0, names: [], b: [], se: [], stat: [], statName: 't',
    p: [], ci: [], level: 95, df_r: null, omitted: [], vce: 'ols', converged: true,
    warnings: [], link: 'identity',
  }, base);
}

function intervalos(b, se, statName, df, level) {
  const a = (1 - level / 100) / 2;
  const crit = statName === 't' ? -tInv(a, df) : -normalInv(a);
  return b.map((bi, i) => [bi - crit * se[i], bi + crit * se[i]]);
}

function estadisticos(b, V, statName, df, level, omitidos) {
  const se = V.map((f, i) => Math.sqrt(Math.max(0, f[i])));
  const stat = b.map((bi, i) => (se[i] > 0 ? bi / se[i] : NaN));
  const p = stat.map((s) => (isNaN(s) ? NaN : (statName === 't' ? pT(s, df) : pZ(s))));
  const ci = intervalos(b, se, statName, df, level);
  if (omitidos) {
    omitidos.forEach((j) => { se[j] = 0; stat[j] = NaN; p[j] = NaN; ci[j] = [NaN, NaN]; });
  }
  return { se, stat, p, ci };
}

// ------------------------------------------------------------------ MCO

export function ols(X, y, opts = {}) {
  const {
    names = null, vce = 'ols', cluster = null, level = 95, depvar = 'y',
    noconstant = false, weights = null,
  } = opts;
  const N = X.length;
  if (!N) throw new Error('sin observaciones');
  const kTot = X[0].length;
  const nombres = names || X[0].map((_, j) => `x${j + 1}`);

  let Xw = X, yw = y;
  if (weights) {
    const sw = weights.map((w) => Math.sqrt(w));
    Xw = X.map((f, i) => f.map((v) => v * sw[i]));
    yw = y.map((v, i) => v * sw[i]);
  }

  const qr = qrLeastSquares(Xw, yw);
  const dropped = qr.dropped || [];
  const keep = [];
  for (let j = 0; j < kTot; j++) if (!dropped.includes(j)) keep.push(j);
  const k = keep.length;
  const Xk = colsDe(Xw, keep);
  const bk = keep.map((j) => qr.beta[j]);

  const yhat = matvec(colsDe(X, keep), bk);
  const resid = y.map((v, i) => v - yhat[i]);

  const df_r = N - k;
  let rss = 0;
  for (let i = 0; i < N; i++) rss += resid[i] * resid[i] * (weights ? weights[i] : 1);
  const ybar = (weights
    ? y.reduce((a, v, i) => a + v * weights[i], 0) / weights.reduce((a, w) => a + w, 0)
    : y.reduce((a, v) => a + v, 0) / N);
  let tss = 0;
  for (let i = 0; i < N; i++) tss += (y[i] - ybar) * (y[i] - ybar) * (weights ? weights[i] : 1);
  if (noconstant) { tss = 0; for (let i = 0; i < N; i++) tss += y[i] * y[i]; }
  const mss = tss - rss;
  const s2 = rss / df_r;

  const XtX = crossprod(Xk);
  let XtXinv;
  try { XtXinv = invSPD(XtX); } catch { XtXinv = inverse(XtX); }

  let Vk;
  let nClusters = null;
  if (vce === 'robust') {
    // HC1
    const meat = zeros(k, k);
    for (let i = 0; i < N; i++) {
      const u2 = resid[i] * resid[i] * (weights ? weights[i] : 1);
      const xi = Xk[i];
      for (let a = 0; a < k; a++) for (let b2 = 0; b2 < k; b2++) meat[a][b2] += u2 * xi[a] * xi[b2];
    }
    Vk = matmul(matmul(XtXinv, meat), XtXinv);
    const c = N / (N - k);
    for (let a = 0; a < k; a++) for (let b2 = 0; b2 < k; b2++) Vk[a][b2] *= c;
  } else if (vce === 'cluster' && cluster) {
    const grupos = new Map();
    for (let i = 0; i < N; i++) {
      const g = String(cluster[i]);
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(i);
    }
    nClusters = grupos.size;
    const meat = zeros(k, k);
    for (const filas of grupos.values()) {
      const sg = new Array(k).fill(0);
      for (const i of filas) for (let a = 0; a < k; a++) sg[a] += Xk[i][a] * resid[i];
      for (let a = 0; a < k; a++) for (let b2 = 0; b2 < k; b2++) meat[a][b2] += sg[a] * sg[b2];
    }
    Vk = matmul(matmul(XtXinv, meat), XtXinv);
    const c = (nClusters / (nClusters - 1)) * ((N - 1) / (N - k));
    for (let a = 0; a < k; a++) for (let b2 = 0; b2 < k; b2++) Vk[a][b2] *= c;
  } else {
    Vk = XtXinv.map((f) => f.map((v) => v * s2));
  }

  const b = reexpandir(bk, keep, kTot);
  const V = reexpandirMatriz(Vk, keep, kTot);
  const omitidos = dropped;
  const statName = 't';
  const dfUsar = vce === 'cluster' ? nClusters - 1 : df_r;
  const { se, stat, p, ci } = estadisticos(b, V, statName, dfUsar, level, omitidos);

  // F global: todos los coeficientes menos la constante
  const idxConst = nombres.indexOf('_cons');
  const idxF = [];
  for (let j = 0; j < kTot; j++) if (j !== idxConst && !dropped.includes(j)) idxF.push(j);
  const df_m = idxF.length;
  let F = NaN, p_F = NaN;
  if (df_m > 0) {
    if (vce === 'ols') {
      F = (mss / df_m) / (rss / df_r);
      p_F = pF(F, df_m, df_r);
    } else {
      const w = wald(b, V, idxF);
      F = w.chi2 / df_m;
      p_F = pF(F, df_m, dfUsar);
    }
  }

  return armaResultado({
    cmd: 'regress', depvar, N, names: nombres, b, se, stat, statName, p, ci, level,
    df_r: dfUsar, omitted: omitidos.map((j) => nombres[j]), vce, nClusters,
    r2: tss > 0 ? 1 - rss / tss : NaN,
    r2_a: tss > 0 ? 1 - (rss / df_r) / (tss / (N - (noconstant ? 0 : 1))) : NaN,
    rmse: Math.sqrt(s2), F, df_m, p_F, mss, rss, tss,
    X, y, V, xnames: nombres, yhat, resid, link: 'identity', keep,
  });
}

// ------------------------------------------------------------------ Newton genérico

/**
 * Maximiza una log-verosimilitud con Newton-Raphson y reducción de paso.
 * fn(b) -> {ll, g:number[], H:number[][]}  (H es el hessiano, negativo definido)
 */
function newton(fn, b0, { maxit = MAXIT, tol = TOL } = {}) {
  let b = b0.slice();
  let r = fn(b);
  let it = 0, conv = false;
  for (it = 1; it <= maxit; it++) {
    let paso;
    try {
      const negH = r.H.map((f) => f.map((v) => -v));
      paso = matvec(inverse(negH), r.g);
    } catch {
      break;
    }
    let alfa = 1, mejor = null;
    for (let t = 0; t < 25; t++) {
      const bn = b.map((v, i) => v + alfa * paso[i]);
      let rn;
      try { rn = fn(bn); } catch { alfa /= 2; continue; }
      if (isFinite(rn.ll) && rn.ll >= r.ll - 1e-12) { mejor = { bn, rn }; break; }
      alfa /= 2;
    }
    if (!mejor) break;
    const dif = Math.abs(mejor.rn.ll - r.ll);
    const escala = Math.abs(r.ll) + 1;
    b = mejor.bn; r = mejor.rn;
    if (dif / escala < tol) { conv = true; break; }
  }
  return { b, ll: r.ll, H: r.H, g: r.g, iteraciones: it, converged: conv };
}

/** Optimizador BHHH (usa el producto externo de los scores como hessiano). */
function bhhh(fnLL, fnScores, b0, { maxit = 80, tol = 1e-9 } = {}) {
  let b = b0.slice();
  let ll = fnLL(b);
  let it = 0, conv = false, ultimoOP = null;
  for (it = 1; it <= maxit; it++) {
    const S = fnScores(b);                     // N x k
    const k = b.length;
    const g = new Array(k).fill(0);
    const OP = zeros(k, k);
    for (const s of S) {
      for (let a = 0; a < k; a++) {
        g[a] += s[a];
        for (let c = 0; c < k; c++) OP[a][c] += s[a] * s[c];
      }
    }
    ultimoOP = OP;
    let paso;
    try { paso = matvec(inverse(OP), g); } catch { break; }
    let alfa = 1, ok = false;
    for (let t = 0; t < 25; t++) {
      const bn = b.map((v, i) => v + alfa * paso[i]);
      const lln = fnLL(bn);
      if (isFinite(lln) && lln >= ll - 1e-12) {
        const dif = Math.abs(lln - ll);
        b = bn; ll = lln; ok = true;
        if (dif / (Math.abs(ll) + 1) < tol) conv = true;
        break;
      }
      alfa /= 2;
    }
    if (!ok || conv) break;
  }
  return { b, ll, OP: ultimoOP, iteraciones: it, converged: conv };
}

// ------------------------------------------------------------------ binarios

function verificaBinaria(y) {
  for (const v of y) if (v !== 0 && v !== 1) {
    const err = new Error('la variable dependiente debe valer solo 0 o 1');
    err.noBinaria = true;
    throw err;
  }
}

function nucleoBinario(X, y, link) {
  const N = X.length, k = X[0].length;
  const F = link === 'logit' ? (z) => 1 / (1 + Math.exp(-z)) : normalCdf;
  return function (b) {
    let ll = 0;
    const g = new Array(k).fill(0);
    const H = zeros(k, k);
    for (let i = 0; i < N; i++) {
      const xi = X[i];
      let xb = 0;
      for (let j = 0; j < k; j++) xb += xi[j] * b[j];
      if (link === 'logit') {
        const p = F(xb);
        const pc = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
        ll += y[i] ? Math.log(pc) : Math.log(1 - pc);
        const u = y[i] - pc;
        const w = pc * (1 - pc);
        for (let a = 0; a < k; a++) {
          g[a] += u * xi[a];
          for (let c = a; c < k; c++) H[a][c] -= w * xi[a] * xi[c];
        }
      } else {
        const q = y[i] ? 1 : -1;
        const z = q * xb;
        const Fz = Math.min(Math.max(normalCdf(z), 1e-12), 1 - 1e-12);
        ll += Math.log(Fz);
        const lam = q * normalPdf(z) / Fz;
        const w = lam * (lam + xb);
        for (let a = 0; a < k; a++) {
          g[a] += lam * xi[a];
          for (let c = a; c < k; c++) H[a][c] -= w * xi[a] * xi[c];
        }
      }
    }
    for (let a = 0; a < k; a++) for (let c = 0; c < a; c++) H[a][c] = H[c][a];
    return { ll, g, H };
  };
}

function fitBinario(X, y, opts, link, cmd) {
  verificaBinaria(y);
  const { names = null, level = 95, depvar = 'y' } = opts;
  const N = X.length, kTot = X[0].length;
  const nombres = names || X[0].map((_, j) => `x${j + 1}`);

  // descarta columnas colineales usando el mismo criterio que MCO
  const qr = qrLeastSquares(X, y);
  const dropped = qr.dropped || [];
  const keep = [];
  for (let j = 0; j < kTot; j++) if (!dropped.includes(j)) keep.push(j);
  const Xk = colsDe(X, keep);
  const k = keep.length;

  const fn = nucleoBinario(Xk, y, link);
  const ybar = y.reduce((a, v) => a + v, 0) / N;
  const b0 = new Array(k).fill(0);
  const idxConstK = keep.indexOf(nombres.indexOf('_cons'));
  if (idxConstK >= 0) {
    b0[idxConstK] = link === 'logit'
      ? Math.log(ybar / (1 - ybar))
      : normalInv(Math.min(Math.max(ybar, 0.001), 0.999));
  }
  const r = newton(fn, b0);

  const negH = r.H.map((f) => f.map((v) => -v));
  let Vk;
  try { Vk = inverse(negH); } catch { Vk = identity(k); }

  const b = reexpandir(r.b, keep, kTot);
  const V = reexpandirMatriz(Vk, keep, kTot);
  const { se, stat, p, ci } = estadisticos(b, V, 'z', null, level, dropped);

  const ll0 = N * (ybar * Math.log(ybar) + (1 - ybar) * Math.log(1 - ybar));
  const idxConst = nombres.indexOf('_cons');
  const df_chi2 = keep.filter((j) => j !== idxConst).length;
  const chi2 = 2 * (r.ll - ll0);

  const warnings = [];
  for (let j = 0; j < kTot; j++) {
    if (dropped.includes(j)) continue;
    if (Math.abs(b[j]) > 15 && se[j] > 100) warnings.push('separacion');
  }
  if (!r.converged) warnings.push('sinconvergencia');

  const xb = matvec(colsDe(X, keep), r.b);
  const pred = xb.map((z) => (link === 'logit' ? 1 / (1 + Math.exp(-z)) : normalCdf(z)));

  return armaResultado({
    cmd, depvar, N, names: nombres, b, se, stat, statName: 'z', p, ci, level,
    df_r: null, omitted: dropped.map((j) => nombres[j]), vce: 'oim',
    converged: r.converged, iterations: r.iteraciones,
    ll: r.ll, ll0, chi2, df_chi2, p_chi2: pChi2(chi2, df_chi2),
    r2_p: 1 - r.ll / ll0,
    X, y, V, xnames: nombres, link, keep, xb, pred,
    warnings: [...new Set(warnings)],
  });
}

export function logitFit(X, y, opts = {}) { return fitBinario(X, y, opts, 'logit', 'logit'); }
export function probitFit(X, y, opts = {}) { return fitBinario(X, y, opts, 'probit', 'probit'); }

export function poissonFit(X, y, opts = {}) {
  const { names = null, level = 95, depvar = 'y' } = opts;
  const N = X.length, kTot = X[0].length;
  const nombres = names || X[0].map((_, j) => `x${j + 1}`);
  const qr = qrLeastSquares(X, y);
  const dropped = qr.dropped || [];
  const keep = [];
  for (let j = 0; j < kTot; j++) if (!dropped.includes(j)) keep.push(j);
  const Xk = colsDe(X, keep);
  const k = keep.length;

  const fn = (b) => {
    let ll = 0;
    const g = new Array(k).fill(0);
    const H = zeros(k, k);
    for (let i = 0; i < N; i++) {
      const xi = Xk[i];
      let xb = 0;
      for (let j = 0; j < k; j++) xb += xi[j] * b[j];
      xb = Math.min(xb, 300);
      const mu = Math.exp(xb);
      ll += y[i] * xb - mu - lnGamma(y[i] + 1);
      const u = y[i] - mu;
      for (let a = 0; a < k; a++) {
        g[a] += u * xi[a];
        for (let c = a; c < k; c++) H[a][c] -= mu * xi[a] * xi[c];
      }
    }
    for (let a = 0; a < k; a++) for (let c = 0; c < a; c++) H[a][c] = H[c][a];
    return { ll, g, H };
  };

  const ybar = y.reduce((a, v) => a + v, 0) / N;
  const b0 = new Array(k).fill(0);
  const ic = keep.indexOf(nombres.indexOf('_cons'));
  if (ic >= 0) b0[ic] = Math.log(Math.max(ybar, 1e-6));
  const r = newton(fn, b0);
  const negH = r.H.map((f) => f.map((v) => -v));
  let Vk; try { Vk = inverse(negH); } catch { Vk = identity(k); }
  const b = reexpandir(r.b, keep, kTot);
  const V = reexpandirMatriz(Vk, keep, kTot);
  const { se, stat, p, ci } = estadisticos(b, V, 'z', null, level, dropped);
  let ll0 = 0;
  for (let i = 0; i < N; i++) ll0 += y[i] * Math.log(Math.max(ybar, 1e-12)) - ybar - lnGamma(y[i] + 1);
  const idxConst = nombres.indexOf('_cons');
  const df_chi2 = keep.filter((j) => j !== idxConst).length;
  const chi2 = 2 * (r.ll - ll0);
  return armaResultado({
    cmd: 'poisson', depvar, N, names: nombres, b, se, stat, statName: 'z', p, ci, level,
    omitted: dropped.map((j) => nombres[j]), converged: r.converged, iterations: r.iteraciones,
    ll: r.ll, ll0, chi2, df_chi2, p_chi2: pChi2(chi2, df_chi2), r2_p: 1 - r.ll / ll0,
    X, y, V, xnames: nombres, link: 'log', keep,
  });
}

// ------------------------------------------------------------------ ordenados

function fitOrdenado(X, y, opts, link, cmd) {
  const { names = null, level = 95, depvar = 'y' } = opts;
  const N = X.length;
  // X NO debe traer constante: en los modelos ordenados la constante la absorben los cortes
  const idxConst = (names || []).indexOf('_cons');
  const cols = [];
  for (let j = 0; j < X[0].length; j++) if (j !== idxConst) cols.push(j);
  const Xk0 = colsDe(X, cols);
  const nombresK = cols.map((j) => (names ? names[j] : `x${j + 1}`));

  const qr = qrLeastSquares(Xk0, y);
  const dropped0 = qr.dropped || [];
  const keepLocal = [];
  for (let j = 0; j < Xk0[0].length; j++) if (!dropped0.includes(j)) keepLocal.push(j);
  const Xk = colsDe(Xk0, keepLocal);
  const nombres = keepLocal.map((j) => nombresK[j]);
  const k = Xk[0].length;

  const niveles = [...new Set(y)].sort((a, b) => a - b);
  const J = niveles.length;
  if (J < 3) throw new Error('la variable dependiente necesita al menos 3 categorías ordenadas');
  const yidx = y.map((v) => niveles.indexOf(v));      // 0..J-1

  const F = link === 'logit' ? (z) => 1 / (1 + Math.exp(-z)) : normalCdf;
  const f = link === 'logit' ? (z) => { const e = F(z); return e * (1 - e); } : normalPdf;

  // punto de partida: cortes desde las proporciones acumuladas
  const props = new Array(J).fill(0);
  for (const j of yidx) props[j]++;
  let acum = 0;
  const cut0 = [];
  for (let j = 0; j < J - 1; j++) {
    acum += props[j] / N;
    const q = Math.min(Math.max(acum, 0.001), 0.999);
    cut0.push(link === 'logit' ? Math.log(q / (1 - q)) : normalInv(q));
  }
  const theta0 = [...new Array(k).fill(0), ...cut0];

  const fn = (th) => {
    const b = th.slice(0, k);
    const c = th.slice(k);
    for (let j = 1; j < c.length; j++) if (c[j] <= c[j - 1]) return { ll: -Infinity, g: new Array(th.length).fill(0), H: identity(th.length) };
    let ll = 0;
    const g = new Array(th.length).fill(0);
    for (let i = 0; i < N; i++) {
      const xi = Xk[i];
      let xb = 0;
      for (let j = 0; j < k; j++) xb += xi[j] * b[j];
      const j = yidx[i];
      const zHi = j < J - 1 ? c[j] - xb : Infinity;
      const zLo = j > 0 ? c[j - 1] - xb : -Infinity;
      const Fhi = j < J - 1 ? F(zHi) : 1;
      const Flo = j > 0 ? F(zLo) : 0;
      const P = Math.max(Fhi - Flo, 1e-12);
      ll += Math.log(P);
      const fhi = j < J - 1 ? f(zHi) : 0;
      const flo = j > 0 ? f(zLo) : 0;
      const dB = -(fhi - flo) / P;
      for (let a = 0; a < k; a++) g[a] += dB * xi[a];
      if (j < J - 1) g[k + j] += fhi / P;
      if (j > 0) g[k + j - 1] += -flo / P;
    }
    return { ll, g, H: null, _soloG: true };
  };

  // hessiano por diferencias centrales del gradiente analítico
  const conHessiano = (th) => {
    const base = fn(th);
    if (!isFinite(base.ll)) return { ll: -Infinity, g: base.g, H: identity(th.length).map((f2) => f2.map((v) => -v)) };
    const m = th.length;
    const H = zeros(m, m);
    for (let j = 0; j < m; j++) {
      const h = 1e-5 * Math.max(1, Math.abs(th[j]));
      const tp = th.slice(); tp[j] += h;
      const tm = th.slice(); tm[j] -= h;
      const gp = fn(tp).g, gm = fn(tm).g;
      for (let a = 0; a < m; a++) H[a][j] = (gp[a] - gm[a]) / (2 * h);
    }
    for (let a = 0; a < m; a++) for (let c = 0; c < a; c++) {
      const prom = (H[a][c] + H[c][a]) / 2; H[a][c] = prom; H[c][a] = prom;
    }
    return { ll: base.ll, g: base.g, H };
  };

  const r = newton(conHessiano, theta0, { maxit: 40 });
  const m = r.b.length;
  const negH = r.H.map((f2) => f2.map((v) => -v));
  let V; try { V = inverse(negH); } catch { V = identity(m); }

  const bAll = r.b.slice(0, k);
  const cuts = r.b.slice(k);
  const seAll = V.map((f2, i) => Math.sqrt(Math.max(0, f2[i])));

  const Vb = bAll.map((_, i) => bAll.map((__, j) => V[i][j]));
  const { se, stat, p, ci } = estadisticos(bAll, Vb, 'z', null, level, []);

  // verosimilitud del modelo solo con cortes
  let ll0 = 0;
  for (let j = 0; j < J; j++) if (props[j]) ll0 += props[j] * Math.log(props[j] / N);
  const chi2 = 2 * (r.ll - ll0);

  return armaResultado({
    cmd, depvar, N, names: nombres, b: bAll, se, stat, statName: 'z', p, ci, level,
    omitted: dropped0.map((j) => nombresK[j]),
    converged: r.converged, iterations: r.iteraciones,
    ll: r.ll, ll0, chi2, df_chi2: k, p_chi2: pChi2(chi2, k), r2_p: 1 - r.ll / ll0,
    cuts: cuts.map((c, i) => ({ name: `/cut${i + 1}`, b: c, se: seAll[k + i] })),
    niveles, X: Xk, y, V: Vb, Vfull: V, xnames: nombres, link, k,
  });
}

export function ologitFit(X, y, opts = {}) { return fitOrdenado(X, y, opts, 'logit', 'ologit'); }
export function oprobitFit(X, y, opts = {}) { return fitOrdenado(X, y, opts, 'probit', 'oprobit'); }

// ------------------------------------------------------------------ multinomial logit

export function mlogitFit(X, y, opts = {}) {
  const { names = null, level = 95, depvar = 'y' } = opts;
  const N = X.length;
  const nombresTot = names || X[0].map((_, j) => `x${j + 1}`);
  const qr = qrLeastSquares(X, y);
  const dropped = qr.dropped || [];
  const keep = [];
  for (let j = 0; j < X[0].length; j++) if (!dropped.includes(j)) keep.push(j);
  const Xk = colsDe(X, keep);
  const nombres = keep.map((j) => nombresTot[j]);
  const k = Xk[0].length;

  const niveles = [...new Set(y)].sort((a, b) => a - b);
  const J = niveles.length;
  if (J < 3) throw new Error('mlogit necesita al menos 3 categorías');
  // base: la más frecuente, igual que Stata
  const conteo = niveles.map((v) => y.filter((x) => x === v).length);
  let base = opts.base !== undefined && opts.base !== null ? Number(opts.base) : niveles[conteo.indexOf(Math.max(...conteo))];
  if (!niveles.includes(base)) base = niveles[conteo.indexOf(Math.max(...conteo))];
  const otros = niveles.filter((v) => v !== base);
  const M = otros.length;
  const yidx = y.map((v) => otros.indexOf(v));    // -1 si es la base

  const fn = (th) => {
    let ll = 0;
    const g = new Array(M * k).fill(0);
    const H = zeros(M * k, M * k);
    for (let i = 0; i < N; i++) {
      const xi = Xk[i];
      const eta = new Array(M);
      let maxE = 0;
      for (let m2 = 0; m2 < M; m2++) {
        let s = 0;
        for (let j = 0; j < k; j++) s += xi[j] * th[m2 * k + j];
        eta[m2] = s;
        if (s > maxE) maxE = s;
      }
      const off = Math.max(0, maxE);
      let den = Math.exp(-off);
      const num = new Array(M);
      for (let m2 = 0; m2 < M; m2++) { num[m2] = Math.exp(eta[m2] - off); den += num[m2]; }
      const P = num.map((v) => v / den);
      const yi = yidx[i];
      ll += yi >= 0 ? Math.log(Math.max(P[yi], 1e-300)) : Math.log(Math.max(Math.exp(-off) / den, 1e-300));
      for (let m2 = 0; m2 < M; m2++) {
        const u = (yi === m2 ? 1 : 0) - P[m2];
        for (let a = 0; a < k; a++) g[m2 * k + a] += u * xi[a];
      }
      for (let m2 = 0; m2 < M; m2++) {
        for (let l = 0; l < M; l++) {
          const w = -P[m2] * ((m2 === l ? 1 : 0) - P[l]);
          for (let a = 0; a < k; a++) for (let c = 0; c < k; c++) {
            H[m2 * k + a][l * k + c] += w * xi[a] * xi[c];
          }
        }
      }
    }
    return { ll, g, H };
  };

  const th0 = new Array(M * k).fill(0);
  const r = newton(fn, th0, { maxit: 50 });
  const negH = r.H.map((f) => f.map((v) => -v));
  let V; try { V = inverse(negH); } catch { V = identity(M * k); }

  const eqs = otros.map((niv, m2) => {
    const b = th0.map((_, i) => 0).slice(0, k).map((_, a) => r.b[m2 * k + a]);
    const Vb = b.map((_, a) => b.map((__, c) => V[m2 * k + a][m2 * k + c]));
    const st = estadisticos(b, Vb, 'z', null, level, []);
    return { nivel: niv, name: String(niv), names: nombres, b, se: st.se, stat: st.stat, p: st.p, ci: st.ci };
  });

  // verosimilitud nula
  let ll0 = 0;
  for (const v of niveles) {
    const c = y.filter((x) => x === v).length;
    if (c) ll0 += c * Math.log(c / N);
  }
  const idxConst = nombres.indexOf('_cons');
  const kSinConst = nombres.filter((n, j) => j !== idxConst).length;
  const df_chi2 = M * kSinConst;
  const chi2 = 2 * (r.ll - ll0);

  const planoB = [], planoNombres = [], planoSe = [], planoStat = [], planoP = [], planoCi = [];
  for (const eq of eqs) {
    eq.names.forEach((nm, i) => {
      planoNombres.push(`${eq.name}:${nm}`);
      planoB.push(eq.b[i]); planoSe.push(eq.se[i]); planoStat.push(eq.stat[i]);
      planoP.push(eq.p[i]); planoCi.push(eq.ci[i]);
    });
  }

  return armaResultado({
    cmd: 'mlogit', depvar, N, names: planoNombres, b: planoB, se: planoSe,
    stat: planoStat, statName: 'z', p: planoP, ci: planoCi, level,
    omitted: dropped.map((j) => nombresTot[j]),
    converged: r.converged, iterations: r.iteraciones,
    ll: r.ll, ll0, chi2, df_chi2, p_chi2: pChi2(chi2, df_chi2), r2_p: 1 - r.ll / ll0,
    eqs, base, niveles, X: Xk, y, V, xnames: nombres, link: 'mlogit', k, keep,
  });
}

// ------------------------------------------------------------------ probit multinomial

export function mprobitFit(X, y, opts = {}) {
  const { names = null, level = 95, depvar = 'y', nodos = 24 } = opts;
  const N = X.length;
  const nombresTot = names || X[0].map((_, j) => `x${j + 1}`);
  const qr = qrLeastSquares(X, y);
  const dropped = qr.dropped || [];
  const keep = [];
  for (let j = 0; j < X[0].length; j++) if (!dropped.includes(j)) keep.push(j);
  const Xk = colsDe(X, keep);
  const nombres = keep.map((j) => nombresTot[j]);
  const k = Xk[0].length;

  const niveles = [...new Set(y)].sort((a, b) => a - b);
  const J = niveles.length;
  const conteo = niveles.map((v) => y.filter((x) => x === v).length);
  let base = opts.base !== undefined && opts.base !== null ? Number(opts.base) : niveles[conteo.indexOf(Math.max(...conteo))];
  if (!niveles.includes(base)) base = niveles[conteo.indexOf(Math.max(...conteo))];
  const orden = [base, ...niveles.filter((v) => v !== base)];   // 0 = base
  const yidx = y.map((v) => orden.indexOf(v));
  const M = J - 1;

  const gh = gaussHermite(nodos);
  const raiz2 = Math.SQRT2;
  const invRaizPi = 1 / Math.sqrt(Math.PI);

  // V[0]=0 siempre; V[m] = x'beta_m para m=1..M
  function utilidades(th, xi) {
    const V = new Array(J).fill(0);
    for (let m2 = 1; m2 < J; m2++) {
      let s = 0;
      for (let j = 0; j < k; j++) s += xi[j] * th[(m2 - 1) * k + j];
      V[m2] = s;
    }
    return V;
  }

  function probYScore(th, i) {
    const xi = Xk[i];
    const V = utilidades(th, xi);
    const j = yidx[i];
    let P = 0;
    const dV = new Array(J).fill(0);
    for (let q = 0; q < gh.nodes.length; q++) {
      const u = raiz2 * gh.nodes[q];
      const w = gh.weights[q] * invRaizPi;
      // producto de Phi(u + V_j - V_l) para l != j
      const args = [], Phi = [];
      let prod = 1;
      for (let l = 0; l < J; l++) {
        if (l === j) continue;
        const a = u + V[j] - V[l];
        const F = Math.min(Math.max(normalCdf(a), 1e-300), 1);
        args.push({ l, a, F });
        Phi.push(F);
        prod *= F;
      }
      P += w * prod;
      // derivadas
      for (let t = 0; t < args.length; t++) {
        const { l, a, F } = args[t];
        const resto = F > 1e-300 ? prod / F : args.reduce((acc, o, idx2) => (idx2 === t ? acc : acc * o.F), 1);
        const d = w * normalPdf(a) * resto;
        dV[j] += d;
        dV[l] -= d;
      }
    }
    return { P: Math.max(P, 1e-300), dV };
  }

  const fnLL = (th) => {
    let ll = 0;
    for (let i = 0; i < N; i++) ll += Math.log(probYScore(th, i).P);
    return ll;
  };
  const fnScores = (th) => {
    const S = [];
    for (let i = 0; i < N; i++) {
      const { P, dV } = probYScore(th, i);
      const xi = Xk[i];
      const s = new Array(M * k).fill(0);
      for (let m2 = 1; m2 < J; m2++) {
        const c = dV[m2] / P;
        for (let a = 0; a < k; a++) s[(m2 - 1) * k + a] = c * xi[a];
      }
      S.push(s);
    }
    return S;
  };

  // arranca desde el mlogit escalado (buen punto de partida)
  let th0 = new Array(M * k).fill(0);
  try {
    const ml = mlogitFit(X, y, { names, base, level });
    const mapa = new Map(ml.eqs.map((e) => [e.nivel, e.b]));
    for (let m2 = 1; m2 < J; m2++) {
      const b = mapa.get(orden[m2]);
      if (b) for (let a = 0; a < k; a++) th0[(m2 - 1) * k + a] = b[a] * 0.6;
    }
  } catch { /* arranca en ceros */ }

  const r = bhhh(fnLL, fnScores, th0, { maxit: 60 });
  let V; try { V = inverse(r.OP); } catch { V = identity(M * k); }

  const eqs = [];
  for (let m2 = 1; m2 < J; m2++) {
    const b = [];
    for (let a = 0; a < k; a++) b.push(r.b[(m2 - 1) * k + a]);
    const Vb = b.map((_, a) => b.map((__, c) => V[(m2 - 1) * k + a][(m2 - 1) * k + c]));
    const st = estadisticos(b, Vb, 'z', null, level, []);
    eqs.push({ nivel: orden[m2], name: String(orden[m2]), names: nombres, b, se: st.se, stat: st.stat, p: st.p, ci: st.ci });
  }

  let ll0 = 0;
  for (const v of niveles) {
    const c = y.filter((x) => x === v).length;
    if (c) ll0 += c * Math.log(c / N);
  }
  const idxConst = nombres.indexOf('_cons');
  const df_chi2 = M * nombres.filter((n, j) => j !== idxConst).length;
  const chi2 = 2 * (r.ll - ll0);

  const planoB = [], planoNombres = [], planoSe = [], planoStat = [], planoP = [], planoCi = [];
  for (const eq of eqs) {
    eq.names.forEach((nm, i) => {
      planoNombres.push(`${eq.name}:${nm}`);
      planoB.push(eq.b[i]); planoSe.push(eq.se[i]); planoStat.push(eq.stat[i]);
      planoP.push(eq.p[i]); planoCi.push(eq.ci[i]);
    });
  }

  return armaResultado({
    cmd: 'mprobit', depvar, N, names: planoNombres, b: planoB, se: planoSe,
    stat: planoStat, statName: 'z', p: planoP, ci: planoCi, level,
    omitted: dropped.map((j) => nombresTot[j]),
    converged: r.converged, iterations: r.iteraciones,
    ll: r.ll, ll0, chi2, df_chi2, p_chi2: pChi2(chi2, df_chi2), r2_p: 1 - r.ll / ll0,
    eqs, base, niveles, X: Xk, y, V, xnames: nombres, link: 'mprobit', k,
  });
}

// ------------------------------------------------------------------ ANOVA

export function anovaFit(y, terms, opts = {}) {
  const N = y.length;
  // construye las columnas de cada término
  const bloques = terms.map((t) => {
    if (t.type === 'continuous') return { name: t.name, cols: [t.x] };
    const niv = [...new Set(t.levels.filter((v) => v !== null))].sort((a, b) => a - b);
    const cols = niv.slice(1).map((nv) => t.levels.map((v) => (v === nv ? 1 : 0)));
    return { name: t.name, cols, niveles: niv };
  });

  const columnas = [y.map(() => 1)];
  const mapa = [];      // qué columnas pertenecen a cada término
  for (const b of bloques) {
    const idx = [];
    for (const c of b.cols) { columnas.push(c); idx.push(columnas.length - 1); }
    mapa.push({ name: b.name, idx, df: b.cols.length });
  }
  const X = [];
  for (let i = 0; i < N; i++) X.push(columnas.map((c) => c[i]));

  const full = ols(X, y, { names: ['_cons', ...mapa.flatMap((m) => m.idx.map((_, i) => `${m.name}_${i + 1}`))] });
  const rssFull = full.rss;
  const dfFull = full.df_r;

  const filas = mapa.map((m) => {
    const keep = columnas.map((_, j) => j).filter((j) => !m.idx.includes(j));
    const Xr = X.map((f) => keep.map((j) => f[j]));
    const red = ols(Xr, y, { names: keep.map((j) => `c${j}`) });
    const ss = red.rss - rssFull;
    const df = m.df;
    const ms = ss / df;
    const F = ms / (rssFull / dfFull);
    return { name: m.name, ss, df, ms, F, p: pF(F, df, dfFull) };
  });

  const mss = full.mss, dfm = full.df_m;
  return {
    N, r2: full.r2, r2_a: full.r2_a, rmse: full.rmse,
    model: { ss: mss, df: dfm, ms: mss / dfm, F: full.F, p: full.p_F },
    residual: { ss: rssFull, df: dfFull, ms: rssFull / dfFull },
    total: { ss: full.tss, df: N - 1, ms: full.tss / (N - 1) },
    rows: filas, fit: full,
  };
}

// ------------------------------------------------------------------ diagnósticos

export function vif(X, names) {
  const k = X[0].length;
  const idxConst = names.indexOf('_cons');
  const out = [];
  for (let j = 0; j < k; j++) {
    if (j === idxConst) continue;
    const otras = [];
    for (let l = 0; l < k; l++) if (l !== j) otras.push(l);
    const Xr = X.map((f) => otras.map((l) => f[l]));
    const yj = X.map((f) => f[j]);
    let r2;
    try {
      const fit = ols(Xr, yj, { names: otras.map((l) => names[l]) });
      r2 = fit.r2;
    } catch { r2 = NaN; }
    const v = isNaN(r2) ? NaN : 1 / Math.max(1e-12, 1 - r2);
    out.push({ name: names[j], vif: v, tolerance: 1 / v });
  }
  return out;
}

export function breuschPagan(fit, opts = {}) {
  const { rhs = false } = opts;
  const N = fit.N;
  const u2 = fit.resid.map((e) => e * e);
  const sigma2 = fit.rss / N;
  const g = u2.map((v) => v / sigma2);
  let Z;
  if (rhs) {
    Z = fit.X;
  } else {
    Z = fit.yhat.map((v) => [1, v]);
  }
  const aux = ols(Z, g, { names: Z[0].map((_, j) => (j === 0 ? '_cons' : `z${j}`)) });
  const lm = aux.mss / 2;
  const df = rhs ? aux.df_m : 1;
  return { chi2: lm, df, p: pChi2(lm, df), variant: rhs ? 'BP-rhs' : 'BP' };
}

export function whiteTest(fit) {
  const N = fit.N;
  const idxConst = fit.xnames.indexOf('_cons');
  const cols = [];
  for (let j = 0; j < fit.X[0].length; j++) if (j !== idxConst) cols.push(j);
  const base = fit.X.map((f) => cols.map((j) => f[j]));
  const kk = cols.length;
  const Z = base.map((f) => {
    const fila = [1, ...f];
    for (let a = 0; a < kk; a++) for (let b = a; b < kk; b++) fila.push(f[a] * f[b]);
    return fila;
  });
  const u2 = fit.resid.map((e) => e * e);
  const aux = ols(Z, u2, { names: Z[0].map((_, j) => (j === 0 ? '_cons' : `z${j}`)) });
  const chi2 = N * aux.r2;
  const df = aux.df_m;
  return { chi2, df, p: pChi2(chi2, df) };
}

export function resetTest(fit) {
  const yhat = fit.yhat;
  const Z = fit.X.map((f, i) => [...f, yhat[i] ** 2, yhat[i] ** 3, yhat[i] ** 4]);
  const nombres = [...fit.xnames, '_yhat2', '_yhat3', '_yhat4'];
  const aux = ols(Z, fit.y, { names: nombres });
  const dfNum = 3;
  const F = ((fit.rss - aux.rss) / dfNum) / (aux.rss / aux.df_r);
  return { F, df1: dfNum, df2: aux.df_r, p: pF(F, dfNum, aux.df_r) };
}

export function linktest(fit) {
  const xb = fit.link === 'identity' ? fit.yhat : fit.xb;
  const Z = xb.map((v) => [1, v, v * v]);
  const nombres = ['_cons', '_hat', '_hatsq'];
  let aux;
  if (fit.link === 'identity') {
    aux = ols(Z, fit.y, { names: nombres, depvar: fit.depvar });
  } else if (fit.link === 'logit') {
    aux = logitFit(Z, fit.y, { names: nombres, depvar: fit.depvar });
  } else if (fit.link === 'probit') {
    aux = probitFit(Z, fit.y, { names: nombres, depvar: fit.depvar });
  } else {
    aux = ols(Z, fit.y, { names: nombres, depvar: fit.depvar });
  }
  const i1 = aux.names.indexOf('_hat'), i2 = aux.names.indexOf('_hatsq');
  return {
    fit: aux,
    b_hat: aux.b[i1], p_hat: aux.p[i1],
    b_hatsq: aux.b[i2], p_hatsq: aux.p[i2],
    ok: aux.p[i2] >= 0.05,
  };
}

export function sktest(x) {
  const v = x.filter((z) => z !== null && z !== undefined && isFinite(z));
  const n = v.length;
  if (n < 8) return { N: n, error: 'hacen falta al menos 8 observaciones' };
  const m = v.reduce((a, b) => a + b, 0) / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const z of v) { const d = z - m; m2 += d * d; m3 += d ** 3; m4 += d ** 4; }
  m2 /= n; m3 /= n; m4 /= n;
  const b1 = m3 / Math.pow(m2, 1.5);
  const b2 = m4 / (m2 * m2);

  // asimetría (D'Agostino 1970)
  const Y = b1 * Math.sqrt(((n + 1) * (n + 3)) / (6 * (n - 2)));
  const beta2 = (3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3)) / ((n - 2) * (n + 5) * (n + 7) * (n + 9));
  const W2 = -1 + Math.sqrt(2 * (beta2 - 1));
  const delta = 1 / Math.sqrt(Math.log(Math.sqrt(W2)));
  const alfa = Math.sqrt(2 / (W2 - 1));
  const Z1 = delta * Math.log(Y / alfa + Math.sqrt((Y / alfa) ** 2 + 1));

  // curtosis (Anscombe-Glynn 1983)
  const E = (3 * (n - 1)) / (n + 1);
  const varb2 = (24 * n * (n - 2) * (n - 3)) / ((n + 1) ** 2 * (n + 3) * (n + 5));
  const xx = (b2 - E) / Math.sqrt(varb2);
  const sqrtb1 = ((6 * (n * n - 5 * n + 2)) / ((n + 7) * (n + 9))) *
    Math.sqrt((6 * (n + 3) * (n + 5)) / (n * (n - 2) * (n - 3)));
  const A = 6 + (8 / sqrtb1) * (2 / sqrtb1 + Math.sqrt(1 + 4 / (sqrtb1 * sqrtb1)));
  const term = Math.cbrt((1 - 2 / A) / (1 + xx * Math.sqrt(2 / (A - 4))));
  const Z2 = ((1 - 2 / (9 * A)) - term) / Math.sqrt(2 / (9 * A));

  const K2 = Z1 * Z1 + Z2 * Z2;
  return {
    N: n, skew: b1, kurt: b2,
    zSkew: Z1, pSkew: pZ(Z1),
    zKurt: Z2, pKurt: pZ(Z2),
    chi2: K2, df: 2, p: pChi2(K2, 2),
  };
}

export function jarqueBera(x) {
  const v = x.filter((z) => z !== null && isFinite(z));
  const n = v.length;
  const m = v.reduce((a, b) => a + b, 0) / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const z of v) { const d = z - m; m2 += d * d; m3 += d ** 3; m4 += d ** 4; }
  m2 /= n; m3 /= n; m4 /= n;
  const S = m3 / Math.pow(m2, 1.5);
  const K = m4 / (m2 * m2);
  const jb = (n / 6) * (S * S + ((K - 3) ** 2) / 4);
  return { chi2: jb, df: 2, p: pChi2(jb, 2), skew: S, kurt: K, N: n };
}

export function shapiroWilk(x) {
  const v = x.filter((z) => z !== null && isFinite(z)).slice().sort((a, b) => a - b);
  const n = v.length;
  if (n < 4) return { error: 'hacen falta al menos 4 observaciones', N: n };
  const nUsar = Math.min(n, 5000);
  const m = [];
  for (let i = 1; i <= n; i++) m.push(normalInv((i - 0.375) / (n + 0.25)));
  const ssm = m.reduce((a, b) => a + b * b, 0);
  const rsm = Math.sqrt(ssm);
  const c = m.map((z) => z / rsm);
  const u = 1 / Math.sqrt(n);
  const a = new Array(n).fill(0);
  const an = -2.706056 * u ** 5 + 4.434685 * u ** 4 - 2.071190 * u ** 3 - 0.147981 * u ** 2 + 0.221157 * u + c[n - 1];
  a[n - 1] = an; a[0] = -an;
  let phi;
  if (n > 5) {
    const an1 = -3.582633 * u ** 5 + 5.682633 * u ** 4 - 1.752461 * u ** 3 - 0.293762 * u ** 2 + 0.042981 * u + c[n - 2];
    a[n - 2] = an1; a[1] = -an1;
    phi = (ssm - 2 * m[n - 1] ** 2 - 2 * m[n - 2] ** 2) / (1 - 2 * an * an - 2 * an1 * an1);
    for (let i = 2; i < n - 2; i++) a[i] = m[i] / Math.sqrt(phi);
  } else {
    phi = (ssm - 2 * m[n - 1] ** 2) / (1 - 2 * an * an);
    for (let i = 1; i < n - 1; i++) a[i] = m[i] / Math.sqrt(phi);
  }
  const media = v.reduce((s, z) => s + z, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += a[i] * v[i]; den += (v[i] - media) ** 2; }
  const W = (num * num) / den;

  let z, p;
  if (n <= 11) {
    const gamma = 0.459 * n - 2.273;
    const mu = -0.0006714 * n ** 3 + 0.025054 * n ** 2 - 0.39978 * n + 0.5440;
    const sigma = Math.exp(-0.0020322 * n ** 3 + 0.062767 * n ** 2 - 0.77857 * n + 1.3822);
    z = (-Math.log(gamma - Math.log(1 - W)) - mu) / sigma;
  } else {
    const g = Math.log(nUsar);
    const mu = 0.0038915 * g ** 3 - 0.083751 * g ** 2 - 0.31082 * g - 1.5861;
    const sigma = Math.exp(0.0030302 * g ** 2 - 0.082676 * g - 0.4803);
    z = (Math.log(1 - W) - mu) / sigma;
  }
  p = 1 - normalCdf(z);
  return { W, z, p, N: n, truncado: n > 5000 };
}

export function durbinWatson(res) {
  let num = 0, den = 0;
  for (let i = 1; i < res.length; i++) num += (res[i] - res[i - 1]) ** 2;
  for (let i = 0; i < res.length; i++) den += res[i] * res[i];
  return { dw: num / den, N: res.length };
}

// ------------------------------------------------------------------ efectos marginales

function derivadaEnlace(link, xb) {
  if (link === 'logit') { const p = 1 / (1 + Math.exp(-xb)); return p * (1 - p); }
  if (link === 'probit') return normalPdf(xb);
  if (link === 'log') return Math.exp(xb);
  return 1;
}
function prediccionEnlace(link, xb) {
  if (link === 'logit') return 1 / (1 + Math.exp(-xb));
  if (link === 'probit') return normalCdf(xb);
  if (link === 'log') return Math.exp(xb);
  return xb;
}

/** Efectos marginales promedio con errores estándar por método delta. */
export function marginsDydx(fit, opts = {}) {
  const { atMeans = false, factorCols = [], level = 95 } = opts;
  const X = fit.X, link = fit.link;
  const keep = fit.keep || fit.names.map((_, j) => j);
  const nombresK = keep.map((j) => fit.names[j]);
  const idxConstK = nombresK.indexOf('_cons');
  const N = X.length;
  const Xk = keep.length === fit.names.length ? X : X.map((f) => keep.map((j) => f[j]));
  const k = Xk[0].length;

  const mediasCol = new Array(k).fill(0);
  for (const f of Xk) for (let j = 0; j < k; j++) mediasCol[j] += f[j] / N;

  const esFactor = new Set(factorCols.map((j) => keep.indexOf(j)).filter((j) => j >= 0));

  function ame(bk) {
    const out = new Array(k).fill(0);
    const filas = atMeans ? [mediasCol] : Xk;
    for (const f of filas) {
      let xb = 0;
      for (let j = 0; j < k; j++) xb += f[j] * bk[j];
      for (let j = 0; j < k; j++) {
        if (j === idxConstK) continue;
        if (esFactor.has(j)) {
          const f1 = f.slice(); f1[j] = 1;
          const f0 = f.slice(); f0[j] = 0;
          let xb1 = 0, xb0 = 0;
          for (let l = 0; l < k; l++) { xb1 += f1[l] * bk[l]; xb0 += f0[l] * bk[l]; }
          out[j] += prediccionEnlace(link, xb1) - prediccionEnlace(link, xb0);
        } else {
          out[j] += derivadaEnlace(link, xb) * bk[j];
        }
      }
    }
    const d = filas.length;
    return out.map((v) => v / d);
  }

  const bk = keep.map((j) => fit.b[j]);
  const est = ame(bk);
  // jacobiano numérico
  const Jm = zeros(k, k);
  for (let j = 0; j < k; j++) {
    const h = 1e-5 * Math.max(1, Math.abs(bk[j]));
    const bp = bk.slice(); bp[j] += h;
    const bm = bk.slice(); bm[j] -= h;
    const ap = ame(bp), am = ame(bm);
    for (let a = 0; a < k; a++) Jm[a][j] = (ap[a] - am[a]) / (2 * h);
  }
  const Vk = keep.map((a) => keep.map((b2) => fit.V[a][b2]));
  const JV = matmul(Jm, Vk);
  const VV = matmul(JV, transpose(Jm));

  const names = [], dydx = [], se = [], stat = [], p = [], ci = [];
  const crit = -normalInv((1 - level / 100) / 2);
  for (let j = 0; j < k; j++) {
    if (j === idxConstK) continue;
    names.push(nombresK[j]);
    const e = est[j];
    const s = Math.sqrt(Math.max(0, VV[j][j]));
    dydx.push(e); se.push(s);
    const z = s > 0 ? e / s : NaN;
    stat.push(z); p.push(isNaN(z) ? NaN : pZ(z));
    ci.push([e - crit * s, e + crit * s]);
  }
  return { names, dydx, se, stat, p, ci, statName: 'z', level, atMeans, N };
}

export function predictProb(fit, X) {
  const XX = X || fit.X;
  const keep = fit.keep || fit.names.map((_, j) => j);
  const bk = keep.map((j) => fit.b[j]);
  const Xk = keep.length === fit.names.length ? XX : XX.map((f) => keep.map((j) => f[j]));
  return Xk.map((f) => {
    let xb = 0;
    for (let j = 0; j < f.length; j++) xb += f[j] * bk[j];
    return prediccionEnlace(fit.link, xb);
  });
}

// ------------------------------------------------------------------ ROC y clasificación

export function rocPoints(y, p) {
  const pares = y.map((v, i) => ({ y: v, p: p[i] })).sort((a, b) => b.p - a.p);
  const n1 = y.filter((v) => v === 1).length;
  const n0 = y.length - n1;
  const puntos = [{ cut: Infinity, tpr: 0, fpr: 0 }];
  let tp = 0, fp = 0, i = 0;
  while (i < pares.length) {
    const c = pares[i].p;
    while (i < pares.length && pares[i].p === c) { if (pares[i].y === 1) tp++; else fp++; i++; }
    puntos.push({ cut: c, tpr: n1 ? tp / n1 : 0, fpr: n0 ? fp / n0 : 0 });
  }
  // AUC por Mann-Whitney con rangos promedio
  const orden = y.map((v, idx) => ({ v, p: p[idx] })).sort((a, b) => a.p - b.p);
  const rangos = new Array(orden.length);
  let j = 0;
  while (j < orden.length) {
    let k2 = j;
    while (k2 + 1 < orden.length && orden[k2 + 1].p === orden[j].p) k2++;
    const r = (j + k2) / 2 + 1;
    for (let t = j; t <= k2; t++) rangos[t] = r;
    j = k2 + 1;
  }
  let sumaR1 = 0;
  orden.forEach((o, idx) => { if (o.v === 1) sumaR1 += rangos[idx]; });
  const auc = n1 && n0 ? (sumaR1 - (n1 * (n1 + 1)) / 2) / (n1 * n0) : NaN;
  // error estándar de Hanley-McNeil
  const q1 = auc / (2 - auc), q2 = (2 * auc * auc) / (1 + auc);
  const seAuc = Math.sqrt(
    (auc * (1 - auc) + (n1 - 1) * (q1 - auc * auc) + (n0 - 1) * (q2 - auc * auc)) / (n1 * n0)
  );
  return { points: puntos, auc, seAuc, n1, n0 };
}

export function classificationTable(y, p, cut = 0.5) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < y.length; i++) {
    const pred = p[i] >= cut ? 1 : 0;
    if (y[i] === 1 && pred === 1) tp++;
    else if (y[i] === 0 && pred === 1) fp++;
    else if (y[i] === 0 && pred === 0) tn++;
    else fn++;
  }
  const n = y.length;
  return {
    tp, fp, tn, fn, cut, N: n,
    sensitivity: tp + fn ? tp / (tp + fn) : NaN,
    specificity: tn + fp ? tn / (tn + fp) : NaN,
    ppv: tp + fp ? tp / (tp + fp) : NaN,
    npv: tn + fn ? tn / (tn + fn) : NaN,
    correct: (tp + tn) / n,
  };
}

export function sensSpecCurve(y, p) {
  const cortes = [];
  for (let c = 0; c <= 1.0001; c += 0.01) cortes.push(Math.min(1, c));
  return cortes.map((c) => {
    const t = classificationTable(y, p, c);
    return { cut: c, sens: t.sensitivity, spec: t.specificity, correct: t.correct };
  });
}

export function hosmerLemeshow(y, p, g = 10) {
  const pares = y.map((v, i) => ({ y: v, p: p[i] })).sort((a, b) => a.p - b.p);
  const n = pares.length;
  const tam = Math.floor(n / g);
  const grupos = [];
  let i = 0;
  for (let k = 0; k < g; k++) {
    const fin = k === g - 1 ? n : i + tam;
    const trozo = pares.slice(i, fin);
    i = fin;
    if (!trozo.length) continue;
    const obs1 = trozo.filter((t) => t.y === 1).length;
    const exp1 = trozo.reduce((a, t) => a + t.p, 0);
    grupos.push({ n: trozo.length, obs1, exp1, obs0: trozo.length - obs1, exp0: trozo.length - exp1 });
  }
  let chi2 = 0;
  for (const gr of grupos) {
    if (gr.exp1 > 0) chi2 += ((gr.obs1 - gr.exp1) ** 2) / gr.exp1;
    if (gr.exp0 > 0) chi2 += ((gr.obs0 - gr.exp0) ** 2) / gr.exp0;
  }
  const df = Math.max(1, grupos.length - 2);
  return { chi2, df, p: pChi2(chi2, df), groups: grupos };
}

/** Prueba de Levene / Brown-Forsythe de igualdad de varianzas entre grupos. */
export function levene(valores, grupos, { centro = 'media' } = {}) {
  const niveles = [...new Set(grupos)].sort((a, b) => a - b);
  const porGrupo = niveles.map((nv) => valores.filter((_, i) => grupos[i] === nv));
  const centros = porGrupo.map((v) => {
    if (centro === 'mediana') {
      const o = v.slice().sort((a, b) => a - b);
      const m = Math.floor(o.length / 2);
      return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
    }
    return v.reduce((a, b) => a + b, 0) / v.length;
  });
  // z_ij = |x_ij - centro_i|, después ANOVA sobre z
  const z = [], g = [];
  porGrupo.forEach((v, i) => v.forEach((x) => { z.push(Math.abs(x - centros[i])); g.push(i); }));
  const N = z.length, k = niveles.length;
  const zBar = z.reduce((a, b) => a + b, 0) / N;
  const zGrupo = niveles.map((_, i) => {
    const s = z.filter((_, j) => g[j] === i);
    return { n: s.length, media: s.reduce((a, b) => a + b, 0) / s.length };
  });
  let ssB = 0, ssW = 0;
  zGrupo.forEach((gr, i) => { ssB += gr.n * (gr.media - zBar) ** 2; });
  z.forEach((v, j) => { ssW += (v - zGrupo[g[j]].media) ** 2; });
  const W = (ssB / (k - 1)) / (ssW / (N - k));
  return {
    W, df1: k - 1, df2: N - k, p: pF(W, k - 1, N - k), centro,
    grupos: niveles.map((nv, i) => ({
      nivel: nv, n: porGrupo[i].length,
      media: porGrupo[i].reduce((a, b) => a + b, 0) / porGrupo[i].length,
      sd: Math.sqrt(porGrupo[i].reduce((a, b, _, arr) =>
        a + (b - arr.reduce((x, y) => x + y, 0) / arr.length) ** 2, 0) / (porGrupo[i].length - 1)),
    })),
  };
}

/** Comparaciones por pares entre niveles de un factor, con corrección de Bonferroni. */
export function comparacionesPares(fit, indices, nombres) {
  const pares = [];
  const m = indices.length;
  // se compara cada nivel contra cada otro (incluida la base, que es el coeficiente solo)
  const conBase = [{ idx: null, nombre: nombres.base }].concat(indices.map((j, k) => ({ idx: j, nombre: nombres.niveles[k] })));
  for (let a = 0; a < conBase.length; a++) {
    for (let b = a + 1; b < conBase.length; b++) {
      const R = new Array(fit.b.length).fill(0);
      if (conBase[b].idx !== null) R[conBase[b].idx] = 1;
      if (conBase[a].idx !== null) R[conBase[a].idx] = -1;
      const est = R.reduce((s, v, j) => s + v * fit.b[j], 0);
      let varz = 0;
      for (let i = 0; i < R.length; i++) for (let j = 0; j < R.length; j++) varz += R[i] * fit.V[i][j] * R[j];
      const se = Math.sqrt(Math.max(0, varz));
      const t = est / se;
      const pCrudo = fit.statName === 't' ? pT(t, fit.df_r) : pZ(t);
      pares.push({ a: conBase[a].nombre, b: conBase[b].nombre, dif: est, se, t, pCrudo });
    }
  }
  const nComp = pares.length;
  for (const p of pares) p.p = Math.min(1, p.pCrudo * nComp);   // Bonferroni
  void m;
  return { pares, nComparaciones: nComp, correccion: 'bonferroni' };
}

/**
 * Prueba de Hausman-McFadden del supuesto IIA para mlogit.
 * Se reestima el modelo quitando una categoría y se comparan los coeficientes
 * que quedan: si IIA se cumple, no deberían cambiar de forma sistemática.
 */
export function hausmanIIA(X, y, opts = {}) {
  const { names, base } = opts;
  const completo = mlogitFit(X, y, { names, base });
  const niveles = completo.niveles;
  const resultados = [];

  for (const omitida of niveles) {
    if (omitida === completo.base) continue;
    const filas = [];
    for (let i = 0; i < y.length; i++) if (y[i] !== omitida) filas.push(i);
    const Xr = filas.map((i) => X[i]);
    const yr = filas.map((i) => y[i]);
    let restringido;
    try {
      restringido = mlogitFit(Xr, yr, { names, base: completo.base });
    } catch { continue; }

    // se comparan las ecuaciones que sobreviven en los dos modelos
    const idxC = [], idxR = [];
    completo.eqs.forEach((eq, e) => {
      if (eq.nivel === omitida) return;
      const eqR = restringido.eqs.find((x) => x.nivel === eq.nivel);
      if (!eqR) return;
      eq.names.forEach((nm, j) => {
        idxC.push(e * eq.names.length + j);
        const eR = restringido.eqs.indexOf(eqR);
        idxR.push(eR * eqR.names.length + j);
      });
    });
    if (!idxC.length) continue;

    const bC = idxC.map((j) => completo.b[j]);
    const bR = idxR.map((j) => restringido.b[j]);
    const dif = bR.map((v, i) => v - bC[i]);
    const Vd = idxR.map((a, i) => idxR.map((b2, j) =>
      restringido.V[a][b2] - completo.V[idxC[i]][idxC[j]]));
    let inv;
    try { inv = inverse(Vd); } catch { continue; }
    let chi2 = 0;
    for (let i = 0; i < dif.length; i++) for (let j = 0; j < dif.length; j++) chi2 += dif[i] * inv[i][j] * dif[j];
    const df = dif.length;
    resultados.push({
      omitida, chi2, df,
      p: chi2 > 0 ? pChi2(chi2, df) : 1,
      negativo: chi2 < 0,
    });
  }
  return { filas: resultados, base: completo.base, niveles };
}

/**
 * Prueba de si dos categorías de un mlogit se pueden fusionar
 * (todos los coeficientes de esa ecuación, salvo la constante, iguales a cero).
 */
export function combinarCategorias(fit) {
  const salida = [];
  const k = fit.eqs[0] ? fit.eqs[0].names.length : 0;
  const idxConst = fit.eqs[0] ? fit.eqs[0].names.indexOf('_cons') : -1;
  fit.eqs.forEach((eq, e) => {
    const R = [];
    eq.names.forEach((nm, j) => {
      if (j === idxConst) return;
      const fila = new Array(fit.b.length).fill(0);
      fila[e * k + j] = 1;
      R.push(fila);
    });
    if (!R.length) return;
    const r = testLineal(fit, R, R.map(() => 0));
    salida.push({ a: eq.nivel, b: fit.base, chi2: r.chi2 !== undefined ? r.chi2 : r.F * r.df1, df: r.df || r.df1, p: r.p });
  });
  return salida;
}

/** Efectos marginales de un mlogit sobre UNA categoría concreta. */
export function marginsMlogit(fit, categoria, opts = {}) {
  const { level = 95 } = opts;
  const X = fit.X, k = fit.k;
  const N = X.length;
  const otros = fit.eqs.map((e) => e.nivel);
  const orden = [fit.base, ...otros];
  const jCat = orden.indexOf(categoria);
  if (jCat < 0) throw new Error(`la categoría ${categoria} no existe en el modelo`);

  const nombres = fit.xnames;
  const idxConst = nombres.indexOf('_cons');

  function probs(theta, fila) {
    const eta = [0];
    for (let m = 0; m < otros.length; m++) {
      let s = 0;
      for (let j = 0; j < k; j++) s += fila[j] * theta[m * k + j];
      eta.push(s);
    }
    const mx = Math.max(...eta);
    const ex = eta.map((v) => Math.exp(v - mx));
    const den = ex.reduce((a, b) => a + b, 0);
    return ex.map((v) => v / den);
  }

  function ame(theta) {
    const out = new Array(k).fill(0);
    for (const fila of X) {
      const P = probs(theta, fila);
      for (let j = 0; j < k; j++) {
        if (j === idxConst) continue;
        // dP_c/dx_j = P_c * (beta_cj - sum_m P_m beta_mj)
        let prom = 0;
        for (let m = 0; m < orden.length; m++) {
          const bmj = m === 0 ? 0 : theta[(m - 1) * k + j];
          prom += P[m] * bmj;
        }
        const bcj = jCat === 0 ? 0 : theta[(jCat - 1) * k + j];
        out[j] += P[jCat] * (bcj - prom);
      }
    }
    return out.map((v) => v / N);
  }

  const theta = fit.b.slice();
  const est = ame(theta);
  const J = zeros(k, theta.length);
  for (let j = 0; j < theta.length; j++) {
    const h = 1e-5 * Math.max(1, Math.abs(theta[j]));
    const tp = theta.slice(); tp[j] += h;
    const tm = theta.slice(); tm[j] -= h;
    const ap = ame(tp), am = ame(tm);
    for (let a = 0; a < k; a++) J[a][j] = (ap[a] - am[a]) / (2 * h);
  }
  const JV = matmul(J, fit.V);
  const VV = matmul(JV, transpose(J));

  const salidaN = [], dydx = [], se = [], stat = [], p = [], ci = [];
  const crit = -normalInv((1 - level / 100) / 2);
  for (let j = 0; j < k; j++) {
    if (j === idxConst) continue;
    salidaN.push(nombres[j]);
    const e = est[j], s = Math.sqrt(Math.max(0, VV[j][j]));
    dydx.push(e); se.push(s);
    const z = s > 0 ? e / s : NaN;
    stat.push(z); p.push(isNaN(z) ? NaN : pZ(z));
    ci.push([e - crit * s, e + crit * s]);
  }
  return { names: salidaN, dydx, se, stat, p, ci, statName: 'z', level, N, categoria };
}

/** Probabilidades / efectos predichos en valores concretos de una variable. */
export function marginsEn(fit, variable, valores, opts = {}) {
  const { level = 95, derivada = false } = opts;
  const nombres = fit.xnames || fit.names;
  const keep = fit.keep || nombres.map((_, j) => j);
  const nombresK = keep.map((j) => nombres[j]);
  const jVar = nombresK.indexOf(variable);
  if (jVar < 0) throw new Error(`${variable} no está en el modelo`);
  const Xk = fit.X[0].length === keep.length ? fit.X : fit.X.map((f) => keep.map((j) => f[j]));
  const bk = keep.map((j) => fit.b[j]);
  const N = Xk.length;

  function calcular(b, valor) {
    let s = 0;
    for (const fila of Xk) {
      const f = fila.slice();
      f[jVar] = valor;
      let xb = 0;
      for (let j = 0; j < f.length; j++) xb += f[j] * b[j];
      s += derivada ? derivadaEnlace(fit.link, xb) * b[jVar] : prediccionEnlace(fit.link, xb);
    }
    return s / N;
  }

  const crit = -normalInv((1 - level / 100) / 2);
  const Vk = keep.map((a) => keep.map((b2) => fit.V[a][b2]));
  return valores.map((v) => {
    const est = calcular(bk, v);
    const grad = bk.map((_, j) => {
      const h = 1e-5 * Math.max(1, Math.abs(bk[j]));
      const bp = bk.slice(); bp[j] += h;
      const bm = bk.slice(); bm[j] -= h;
      return (calcular(bp, v) - calcular(bm, v)) / (2 * h);
    });
    let varz = 0;
    for (let i = 0; i < grad.length; i++) for (let j = 0; j < grad.length; j++) varz += grad[i] * Vk[i][j] * grad[j];
    const se = Math.sqrt(Math.max(0, varz));
    return { valor: v, est, se, z: se > 0 ? est / se : NaN, p: se > 0 ? pZ(est / se) : NaN, ci: [est - crit * se, est + crit * se] };
  });
}

/** Medias ajustadas por nivel de un factor (margins nombreFactor). */
export function mediasAjustadas(fit, columnasFactor, etiquetas, opts = {}) {
  const { level = 95 } = opts;
  const keep = fit.keep || fit.names.map((_, j) => j);
  const nombresK = keep.map((j) => fit.names[j]);
  const Xk = fit.X[0].length === keep.length ? fit.X : fit.X.map((f) => keep.map((j) => f[j]));
  const bk = keep.map((j) => fit.b[j]);
  const Vk = keep.map((a) => keep.map((b2) => fit.V[a][b2]));
  const N = Xk.length;
  const cols = columnasFactor.map((j) => keep.indexOf(j)).filter((j) => j >= 0);
  const crit = -normalInv((1 - level / 100) / 2);

  // un escenario por nivel: base (todas las indicadoras en 0) y luego cada una en 1
  const escenarios = [{ etiqueta: etiquetas[0], poner: -1 }]
    .concat(cols.map((c, k) => ({ etiqueta: etiquetas[k + 1], poner: c })));

  return escenarios.map((esc) => {
    const calc = (b) => {
      let s = 0;
      for (const fila of Xk) {
        const f = fila.slice();
        for (const c of cols) f[c] = 0;
        if (esc.poner >= 0) f[esc.poner] = 1;
        let xb = 0;
        for (let j = 0; j < f.length; j++) xb += f[j] * b[j];
        s += prediccionEnlace(fit.link, xb);
      }
      return s / N;
    };
    const est = calc(bk);
    const grad = bk.map((_, j) => {
      const h = 1e-5 * Math.max(1, Math.abs(bk[j]));
      const bp = bk.slice(); bp[j] += h;
      const bm = bk.slice(); bm[j] -= h;
      return (calc(bp) - calc(bm)) / (2 * h);
    });
    let varz = 0;
    for (let i = 0; i < grad.length; i++) for (let j = 0; j < grad.length; j++) varz += grad[i] * Vk[i][j] * grad[j];
    const se = Math.sqrt(Math.max(0, varz));
    return { etiqueta: esc.etiqueta, est, se, ci: [est - crit * se, est + crit * se] };
  });
}

/** Combinación NO lineal de coeficientes por método delta (nlcom). */
export function nlcom(fit, fn, { level = 95 } = {}) {
  const b = fit.b.slice();
  const est = fn(b);
  if (!isFinite(est)) throw new Error('la expresión no se puede calcular con estos coeficientes');
  const grad = b.map((_, j) => {
    const h = 1e-6 * Math.max(1, Math.abs(b[j]));
    const bp = b.slice(); bp[j] += h;
    const bm = b.slice(); bm[j] -= h;
    return (fn(bp) - fn(bm)) / (2 * h);
  });
  let varz = 0;
  for (let i = 0; i < grad.length; i++) for (let j = 0; j < grad.length; j++) varz += grad[i] * fit.V[i][j] * grad[j];
  const se = Math.sqrt(Math.max(0, varz));
  const crit = fit.statName === 't' ? -tInv((1 - level / 100) / 2, fit.df_r) : -normalInv((1 - level / 100) / 2);
  const stat = se > 0 ? est / se : NaN;
  return {
    est, se, stat, statName: fit.statName,
    p: se > 0 ? (fit.statName === 't' ? pT(stat, fit.df_r) : pZ(stat)) : NaN,
    ci: [est - crit * se, est + crit * se], level,
  };
}

/** Prueba de Wald sobre restricciones lineales R b = q. */
export function testLineal(fit, R, q) {
  const k = fit.b.length;
  const filas = R.length;
  const Rb = R.map((r) => r.reduce((a, v, j) => a + v * fit.b[j], 0));
  const dif = Rb.map((v, i) => v - (q[i] || 0));
  const RV = R.map((r) => {
    const out = new Array(k).fill(0);
    for (let a = 0; a < k; a++) for (let j = 0; j < k; j++) out[a] += r[j] * fit.V[j][a];
    return out;
  });
  const RVR = RV.map((row) => R.map((r2) => row.reduce((a, v, j) => a + v * r2[j], 0)));
  let inv;
  try { inv = inverse(RVR); } catch { return { error: 'restricciones redundantes' }; }
  let w = 0;
  for (let a = 0; a < filas; a++) for (let b2 = 0; b2 < filas; b2++) w += dif[a] * inv[a][b2] * dif[b2];
  if (fit.statName === 't') {
    const F = w / filas;
    return { F, df1: filas, df2: fit.df_r, p: pF(F, filas, fit.df_r), tipo: 'F', valor: Rb };
  }
  return { chi2: w, df: filas, p: pChi2(w, filas), tipo: 'chi2', valor: Rb };
}

// Da forma a la salida para que se vea igual que la consola de Stata.

import { padD, padI, corta, fmtG, fmtP, esNulo } from './util.js';

export const ANCHO = 79;

export function raya(c = '-', n = ANCHO) { return c.repeat(n); }

/** Número con 7 caracteres significativos al estilo de las tablas de Stata. */
export function num(v, ancho = 10, dec = null) {
  if (esNulo(v) || (typeof v === 'number' && isNaN(v))) return padI('.', ancho);
  let s;
  if (dec !== null) s = v.toFixed(dec);
  else {
    const a = Math.abs(v);
    if (a === 0) s = '0';
    else if (a >= 1e7 || a < 1e-4) s = v.toExponential(4);
    else {
      const enteros = Math.max(1, Math.floor(Math.log10(a)) + 1);
      const dd = Math.max(0, Math.min(7, ancho - enteros - 2));
      s = v.toFixed(dd);
    }
  }
  return padI(s, ancho);
}

/**
 * Tabla de coeficientes igual que Stata:
 *
 * ------------------------------------------------------------------------------
 *      ingreso | Coefficient  Std. err.      t    P>|t|     [95% conf. interval]
 * -------------+----------------------------------------------------------------
 *         educ |   42.31245   3.842011    11.01   0.000     34.77918    49.84572
 */
export function tablaCoef(fit, { titulo = null, etiquetaCoef = 'Coef.' } = {}) {
  const L = [];
  const est = fit.statName === 't' ? 't' : 'z';
  const pTit = fit.statName === 't' ? 'P>|t|' : 'P>|z|';
  const nivel = fit.level || 95;
  const cab = `${padI(corta(titulo || fit.depvar, 12), 12)} | ${padI(etiquetaCoef, 11)} ${padI('Err. est.', 10)} ${padI(est, 8)} ${padI(pTit, 7)}   ${padI(`[${nivel}% int. conf.]`, 21)}`;
  L.push(raya('-'));
  L.push(cab);
  L.push('-'.repeat(13) + '+' + '-'.repeat(ANCHO - 14));
  for (let i = 0; i < fit.names.length; i++) {
    const nm = fit.names[i];
    if (fit.omitted && fit.omitted.includes(nm)) {
      L.push(`${padI(corta(nm, 12), 12)} | ${padI('0 (omitida)', 11)}`);
      continue;
    }
    const ci = fit.ci && fit.ci[i] ? fit.ci[i] : [null, null];
    L.push(
      `${padI(corta(nm, 12), 12)} |${num(fit.b[i], 11)} ${num(fit.se[i], 10)} ${num(fit.stat[i], 8, 2)} ${padI(fmtP(fit.p[i]), 7)}   ${num(ci[0], 10)} ${num(ci[1], 10)}`
    );
  }
  if (fit.cuts && fit.cuts.length) {
    L.push('-'.repeat(13) + '+' + '-'.repeat(ANCHO - 14));
    for (const c of fit.cuts) {
      L.push(`${padI(c.name, 12)} |${num(c.b, 11)} ${num(c.se, 10)}`);
    }
  }
  L.push(raya('-'));
  return L.join('\n');
}

/** Encabezado de regresión MCO. */
export function encabezadoOLS(fit) {
  const L = [];
  const izq = [
    ['Fuente', 'SC', 'gl', 'CM'],
  ];
  void izq;
  const nfmt = (v, d = 4) => (esNulo(v) ? '.' : Number(v).toFixed(d));
  L.push(`      Fuente |       SC            gl       CM      ` + padI(`Número de obs   = ${padI(fit.N, 9)}`, 34));
  L.push(`-------------+----------------------------------   ` + padI(`F(${fit.df_m}, ${fit.df_r})${' '.repeat(Math.max(0, 8 - String(fit.df_m + '' + fit.df_r).length))} = ${padI(fit.F === null || isNaN(fit.F) ? '.' : fit.F.toFixed(2), 9)}`, 34));
  L.push(`       Modelo |${num(fit.mss, 13)}  ${padI(fit.df_m, 6)}  ${num(fit.mss / fit.df_m, 11)}   ` + padI(`Prob > F        = ${padI(nfmt(fit.p_F), 9)}`, 34));
  L.push(`     Residual |${num(fit.rss, 13)}  ${padI(fit.df_r, 6)}  ${num(fit.rss / fit.df_r, 11)}   ` + padI(`R-cuadrado      = ${padI(nfmt(fit.r2), 9)}`, 34));
  L.push(`-------------+----------------------------------   ` + padI(`R-cuad. ajust.  = ${padI(nfmt(fit.r2_a), 9)}`, 34));
  L.push(`       Total |${num(fit.tss, 13)}  ${padI(fit.N - 1, 6)}  ${num(fit.tss / (fit.N - 1), 11)}   ` + padI(`Raíz CM error   = ${padI(fmtG(fit.rmse, 6), 9)}`, 34));
  return L.join('\n');
}

/** Encabezado corto para regresión robusta (Stata no muestra la tabla ANOVA). */
export function encabezadoOLSRobusto(fit) {
  const L = [];
  const nfmt = (v, d = 4) => (esNulo(v) ? '.' : Number(v).toFixed(d));
  const etq = fit.vce === 'cluster' ? `(Err. est. ajustados por ${fit.nClusters} conglomerados)` : 'Errores estándar robustos';
  L.push(`Regresión lineal` + ' '.repeat(24) + `Número de obs   = ${padI(fit.N, 9)}`);
  L.push(' '.repeat(40) + `F(${fit.df_m}, ${fit.df_r})   ${' '.repeat(Math.max(0, 6 - String(fit.df_m + '' + fit.df_r).length))}= ${padI(fit.F === null || isNaN(fit.F) ? '.' : fit.F.toFixed(2), 9)}`);
  L.push(' '.repeat(40) + `Prob > F        = ${padI(nfmt(fit.p_F), 9)}`);
  L.push(' '.repeat(40) + `R-cuadrado      = ${padI(nfmt(fit.r2), 9)}`);
  L.push(' '.repeat(40) + `Raíz CM error   = ${padI(fmtG(fit.rmse, 6), 9)}`);
  L.push('');
  L.push(etq);
  return L.join('\n');
}

/** Encabezado de los modelos de máxima verosimilitud. */
export function encabezadoMV(fit, nombreModelo) {
  const L = [];
  const nfmt = (v, d = 4) => (esNulo(v) ? '.' : Number(v).toFixed(d));
  L.push(`${nombreModelo}` + ' '.repeat(Math.max(1, 40 - nombreModelo.length)) + `Número de obs   = ${padI(fit.N, 9)}`);
  L.push(' '.repeat(40) + `LR chi2(${fit.df_chi2})     = ${padI(fit.chi2 === null ? '.' : fit.chi2.toFixed(2), 9)}`);
  L.push(' '.repeat(40) + `Prob > chi2     = ${padI(nfmt(fit.p_chi2), 9)}`);
  L.push(' '.repeat(40) + `Pseudo R2       = ${padI(nfmt(fit.r2_p), 9)}`);
  L.push('');
  L.push(`Log verosimilitud = ${fit.ll === null ? '.' : fit.ll.toFixed(5)}`);
  return L.join('\n');
}

/** Tabla de summarize. */
export function tablaSummarize(filas) {
  const L = [];
  L.push('    Variable |        Obs        Media    Desv. est.       Mín        Máx');
  L.push('-------------+---------------------------------------------------------');
  for (const f of filas) {
    if (f.error) {
      L.push(`${padI(corta(f.nombre, 12), 12)} |  ${f.error}`);
      continue;
    }
    L.push(`${padI(corta(f.nombre, 12), 12)} |${padI(f.n, 11)}${num(f.media, 13)}${num(f.sd, 13)}${num(f.min, 11)}${num(f.max, 11)}`);
  }
  return L.join('\n');
}

/** Tabla de frecuencias de una vía. */
export function tablaFrecuencia(titulo, filas, total, { etiquetaCol = 'Frec.' } = {}) {
  const anchoNom = Math.max(12, ...filas.map((f) => String(f.etiqueta).length), titulo.length);
  const L = [];
  L.push(`${padD(titulo, anchoNom)} |${padI(etiquetaCol, 10)}${padI('Porcentaje', 12)}${padI('Acumulado', 12)}`);
  L.push('-'.repeat(anchoNom + 1) + '+' + '-'.repeat(34));
  let acum = 0;
  for (const f of filas) {
    acum += (f.n / total) * 100;
    L.push(`${padD(f.etiqueta, anchoNom)} |${padI(f.n, 10)}${padI(((f.n / total) * 100).toFixed(2), 12)}${padI(acum.toFixed(2), 12)}`);
  }
  L.push('-'.repeat(anchoNom + 1) + '+' + '-'.repeat(34));
  L.push(`${padD('Total', anchoNom)} |${padI(total, 10)}${padI('100.00', 12)}`);
  return L.join('\n');
}

/** Tabla cruzada de dos vías. */
export function tablaCruzada(nomFila, nomCol, etqFilas, etqCols, celdas, { fila = false, col = false } = {}) {
  const anchoNom = Math.max(10, nomFila.length, ...etqFilas.map((e) => String(e).length));
  const anchoCel = Math.max(9, ...etqCols.map((e) => String(e).length + 1));
  const L = [];
  L.push(`${padD(nomFila, anchoNom)} | ${etqCols.map((e) => padI(e, anchoCel)).join(' ')} | ${padI('Total', anchoCel)}`);
  L.push('-'.repeat(anchoNom + 1) + '+' + '-'.repeat((anchoCel + 1) * etqCols.length + 1) + '+' + '-'.repeat(anchoCel + 1));
  const totCol = new Array(etqCols.length).fill(0);
  let gran = 0;
  for (let i = 0; i < etqFilas.length; i++) {
    let tf = 0;
    for (let j = 0; j < etqCols.length; j++) { tf += celdas[i][j]; totCol[j] += celdas[i][j]; }
    gran += tf;
    L.push(`${padD(etqFilas[i], anchoNom)} | ${celdas[i].map((c) => padI(c, anchoCel)).join(' ')} | ${padI(tf, anchoCel)}`);
    if (fila) L.push(`${padD('', anchoNom)} | ${celdas[i].map((c) => padI(tf ? ((c / tf) * 100).toFixed(2) : '.', anchoCel)).join(' ')} | ${padI('100.00', anchoCel)}`);
    if (col) L.push(`${padD('', anchoNom)} | ${celdas[i].map((c, j) => padI(totCol[j] ? '' : '', anchoCel)).join(' ')} |`);
  }
  L.push('-'.repeat(anchoNom + 1) + '+' + '-'.repeat((anchoCel + 1) * etqCols.length + 1) + '+' + '-'.repeat(anchoCel + 1));
  L.push(`${padD('Total', anchoNom)} | ${totCol.map((c) => padI(c, anchoCel)).join(' ')} | ${padI(gran, anchoCel)}`);
  return L.join('\n');
}

/** Tabla genérica alineada. */
export function tablaSimple(cabeceras, filas, alineaciones = null) {
  const cols = cabeceras.length;
  const al = alineaciones || cabeceras.map((_, i) => (i === 0 ? 'i' : 'd'));
  const anchos = cabeceras.map((c, i) =>
    Math.max(String(c).length, ...filas.map((f) => String(f[i] === undefined ? '' : f[i]).length))
  );
  const linea = (f) => f.map((v, i) => (al[i] === 'i' ? padD(v === undefined ? '' : v, anchos[i]) : padI(v === undefined ? '' : v, anchos[i]))).join('  ');
  const L = [linea(cabeceras)];
  L.push(anchos.map((a) => '-'.repeat(a)).join('  '));
  for (const f of filas) L.push(linea(f));
  return L.join('\n');
}

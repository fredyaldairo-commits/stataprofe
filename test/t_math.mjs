// t_math.mjs — verificación de js/core/matrix.js y js/core/dist.js
// Correr:  node --experimental-default-type=module test/t_math.mjs
// (o simplemente `node test/t_math.mjs` si el package.json con "type":"module" existe)

import {
  zeros, identity, transpose, matmul, matvec, vecmat, add, sub, scale, diag,
  inverse, solve, crossprod, crossprodXY, cholesky, invSPD, dot, colMeans,
  detectCollinear, qrLeastSquares,
} from '../js/core/matrix.js';

import {
  lnGamma, incompleteGammaP, incompleteGammaQ, incompleteBeta,
  normalPdf, normalCdf, normalInv, tCdf, tInv, chi2Cdf, chi2Inv,
  fCdf, fInv, pT, pZ, pChi2, pF, gaussHermite,
} from '../js/core/dist.js';

let ok = 0;
let mal = 0;
const fallos = [];

function chk(nombre, valor, esperado, tol) {
  const err = Math.abs(valor - esperado);
  const bien = Number.isFinite(err) && err <= tol;
  if (bien) ok++; else { mal++; fallos.push(nombre); }
  console.log(
    `${bien ? 'OK  ' : 'FALLA'} ${nombre.padEnd(46)} valor=${String(valor)
      .padEnd(24)} esperado=${String(esperado).padEnd(24)} err=${err.toExponential(3)} tol=${tol}`
  );
}

function chkBool(nombre, cond, detalle = '') {
  if (cond) ok++; else { mal++; fallos.push(nombre); }
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? '  ' + detalle : ''}`);
}

// PRNG reproducible (mulberry32, igual que el del SPEC).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simpson compuesto: referencia independiente para las acumuladas.
function simpson(f, a, b, n) {
  if (n % 2) n++;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}

console.log('=== dist.js ===');

// --- Normal ---------------------------------------------------------------
chk('normalCdf(1.959963985)', normalCdf(1.959963985), 0.975, 1e-9);
chk('normalInv(0.975)', normalInv(0.975), 1.959963985, 1e-9);
chk('normalCdf(0)', normalCdf(0), 0.5, 1e-15);
chk('normalCdf(-1)', normalCdf(-1), 0.15865525393145705, 1e-15);
chk('normalCdf(-8) cola lejana', normalCdf(-8), 6.220960574271782e-16, 1e-29);
chk('normalPdf(0)', normalPdf(0), 0.3989422804014327, 1e-16);
chk('pZ(1.959963985)', pZ(1.959963985), 0.05, 1e-10);
chk('normalCdf vs Simpson en 1.3', normalCdf(1.3),
  0.5 + simpson(normalPdf, 0, 1.3, 20000), 1e-13);
// Ida y vuelta normalInv/normalCdf en todo el rango.
{
  let peor = 0;
  for (const p of [1e-12, 1e-8, 1e-4, 0.01, 0.02425, 0.1, 0.3, 0.5, 0.7, 0.9, 0.975,
    0.99, 0.9999, 1 - 1e-8]) {
    peor = Math.max(peor, Math.abs(normalCdf(normalInv(p)) - p) / p);
  }
  chk('normalInv->normalCdf error relativo máx', peor, 0, 1e-13);
}
chkBool('normalInv(0) es NaN', Number.isNaN(normalInv(0)));
chkBool('normalInv(1.2) es NaN', Number.isNaN(normalInv(1.2)));

// --- t --------------------------------------------------------------------
chk('tCdf(2.0, 10)', tCdf(2.0, 10), 0.963306, 1e-6);
// 2.228 es el valor de tabla redondeado (el exacto es 2.2281388519649); por eso
// el p sale 0.050012 y no 0.050000. La igualdad exacta se prueba con tInv.
chk('pT(2.228, 10) ~ 0.05', pT(2.228, 10), 0.05, 2e-5);
chk('pT(tInv(0.975,10), 10) = 0.05 exacto', pT(tInv(0.975, 10), 10), 0.05, 1e-14);
chk('tCdf(0, 7)', tCdf(0, 7), 0.5, 1e-15);
chk('tCdf(-2, 10) simetría', tCdf(-2, 10), 1 - tCdf(2, 10), 1e-15);
chk('pT == 2*(1-tCdf(|t|))', pT(2.0, 10), 2 * (1 - tCdf(2.0, 10)), 1e-14);
chk('tInv(0.975, 10)', tInv(0.975, 10), 2.228138851986273, 1e-12);
chk('tInv(0.025, 10)', tInv(0.025, 10), -2.228138851986273, 1e-12);
chk('tInv(0.95, 3.5) df no entero', tCdf(tInv(0.95, 3.5), 3.5), 0.95, 1e-15);
chk('tCdf(tInv(0.001, 40), 40)', tCdf(tInv(0.001, 40), 40), 0.001, 1e-17);
chk('tCdf(1.5, 1000) ~ normal', tCdf(1.5, 1000), 0.9331, 5e-4);

// --- chi2 -----------------------------------------------------------------
chk('chi2Cdf(3.841459, 1)', chi2Cdf(3.841459, 1), 0.95, 1e-7);
chk('chi2Cdf(-1, 3) = 0', chi2Cdf(-1, 3), 0, 0);
chk('pChi2(3.841459, 1)', pChi2(3.841459, 1), 0.05, 1e-7);
chk('chi2Inv(0.95, 1)', chi2Inv(0.95, 1), 3.8414588206941236, 1e-9);
chk('chi2Inv(0.99, 7)', chi2Inv(0.99, 7), 18.475306906582357, 1e-9);
chk('chi2Cdf(chi2Inv(0.3, 2.5), 2.5)', chi2Cdf(chi2Inv(0.3, 2.5), 2.5), 0.3, 1e-12);
// Simpson con el cambio x = u² (quita la raíz en 0 y converge bien).
chk('chi2Cdf(6.25, 3) vs Simpson', chi2Cdf(6.25, 3),
  simpson((u) => 2 * u * u * Math.exp(-u * u / 2) / Math.sqrt(2 * Math.PI), 0, Math.sqrt(6.25), 20000),
  1e-13);
// Forma cerrada para df=3: erf(sqrt(x/2)) - sqrt(2x/pi) e^{-x/2}
chk('chi2Cdf(6.25, 3) vs forma cerrada', chi2Cdf(6.25, 3),
  (2 * normalCdf(Math.sqrt(6.25)) - 1) - Math.sqrt((2 * 6.25) / Math.PI) * Math.exp(-6.25 / 2), 1e-14);

// --- F --------------------------------------------------------------------
chk('fCdf(4.0, 3, 20)', fCdf(4.0, 3, 20), 0.978, 2e-3);
{
  // Referencia independiente por integración numérica de la densidad F(3,20).
  const d1 = 3, d2 = 20;
  const lnB = lnGamma(d1 / 2) + lnGamma(d2 / 2) - lnGamma((d1 + d2) / 2);
  const dens = (x) => Math.exp(
    (d1 / 2) * Math.log(d1 / d2) + (d1 / 2 - 1) * Math.log(x) -
    ((d1 + d2) / 2) * Math.log1p((d1 * x) / d2) - lnB
  );
  const ref = simpson(dens, 1e-13, 4.0, 400000);
  chk('fCdf(4,3,20) vs Simpson', fCdf(4.0, 3, 20), ref, 1e-8);
  console.log(`     (fCdf(4,3,20) = ${fCdf(4.0, 3, 20)} ; Simpson = ${ref})`);
}
chk('pF(161.4476, 1, 1)', pF(161.4476, 1, 1), 0.05, 1e-7);
chk('pF(4.0, 3, 20) = 1 - fCdf', pF(4.0, 3, 20), 1 - fCdf(4.0, 3, 20), 1e-12);
chk('fInv(0.95, 3, 20)', fInv(0.95, 3, 20), 3.0983912121407764, 1e-11);
chk('fCdf(fInv(0.95,3,20),3,20)', fCdf(fInv(0.95, 3, 20), 3, 20), 0.95, 1e-15);
chk('fInv(0.95, 1, 1)', fInv(0.95, 1, 1), 161.4476387975881, 1e-9);
chk('fCdf(fInv(0.95,1,1),1,1)', fCdf(fInv(0.95, 1, 1), 1, 1), 0.95, 1e-15);
chk('fCdf(fInv(0.9, 5.5, 12.3),5.5,12.3)', fCdf(fInv(0.9, 5.5, 12.3), 5.5, 12.3), 0.9, 1e-12);
chk('F(1,df) vs t: fCdf(4,1,10)=pT..', pF(4, 1, 10), pT(2, 10), 1e-13);

// --- funciones especiales --------------------------------------------------
chk('lnGamma(0.5)', lnGamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-14);
chk('lnGamma(10) = log(9!)', lnGamma(10), Math.log(362880), 1e-12);
chk('lnGamma(100)', lnGamma(100), 359.1342053695754, 1e-11);
// Para a entero: P(3,x) = 1 - e^{-x}(1 + x + x²/2).
chk('incompleteGammaP(3, 2.5) vs forma cerrada', incompleteGammaP(3, 2.5),
  1 - Math.exp(-2.5) * (1 + 2.5 + 2.5 * 2.5 / 2), 1e-15);
chk('P + Q = 1', incompleteGammaP(4.2, 7.7) + incompleteGammaQ(4.2, 7.7), 1, 1e-15);
chk('incompleteBeta(2,3,0.4)', incompleteBeta(2, 3, 0.4), 0.5248, 1e-13);
chk('simetría I_x(a,b) = 1-I_{1-x}(b,a)', incompleteBeta(2.7, 5.1, 0.33),
  1 - incompleteBeta(5.1, 2.7, 0.67), 1e-14);

// --- Gauss-Hermite --------------------------------------------------------
{
  const gh20 = gaussHermite(20);
  const suma = gh20.weights.reduce((a, b) => a + b, 0);
  chk('sum(gaussHermite(20).weights)', suma, Math.sqrt(Math.PI), 1e-13);
  const m2 = gh20.nodes.reduce((s, x, i) => s + gh20.weights[i] * x * x, 0);
  chk('∫x²e^{-x²} = sqrt(pi)/2 (n=20)', m2, Math.sqrt(Math.PI) / 2, 1e-13);
  const m6 = gh20.nodes.reduce((s, x, i) => s + gh20.weights[i] * Math.pow(x, 6), 0);
  chk('∫x⁶e^{-x²} = 15sqrt(pi)/8 (n=20)', m6, (15 * Math.sqrt(Math.PI)) / 8, 1e-12);
  chkBool('nodos ascendentes y simétricos (n=20)',
    gh20.nodes.every((v, i) => i === 0 || v > gh20.nodes[i - 1]) &&
    Math.abs(gh20.nodes[0] + gh20.nodes[19]) < 1e-14);
  // Cuadratura usada por mprobit: E[Φ(a + b·√2 x)] contra normalCdf.
  const gh24 = gaussHermite(24);
  const aprox = gh24.nodes.reduce(
    (s, x, i) => s + gh24.weights[i] * normalCdf(0.7 + Math.SQRT2 * x), 0
  ) / Math.sqrt(Math.PI);
  chk('E[Φ(0.7+√2 X)] = Φ(0.7/√2)', aprox, normalCdf(0.7 / Math.SQRT2), 1e-9);
  for (const n of [1, 2, 3, 5, 7, 12, 24, 31, 40]) {
    const g = gaussHermite(n);
    const s = g.weights.reduce((a, b) => a + b, 0);
    chk(`sum(weights) n=${n}`, s, Math.sqrt(Math.PI), 1e-12);
  }
}

console.log('\n=== matrix.js ===');

// --- básicas ---------------------------------------------------------------
{
  const A = [[1, 2], [3, 4], [5, 6]];
  const B = [[1, 0, 2], [0, 1, 3]];
  chkBool('zeros(2,3)', JSON.stringify(zeros(2, 3)) === '[[0,0,0],[0,0,0]]');
  chkBool('identity(3)', JSON.stringify(identity(3)) === '[[1,0,0],[0,1,0],[0,0,1]]');
  chkBool('transpose', JSON.stringify(transpose(A)) === '[[1,3,5],[2,4,6]]');
  chkBool('matmul', JSON.stringify(matmul(A, B)) === '[[1,2,8],[3,4,18],[5,6,28]]');
  chkBool('matvec', JSON.stringify(matvec(A, [1, -1])) === '[-1,-1,-1]');
  chkBool('vecmat', JSON.stringify(vecmat([1, 1, 1], A)) === '[9,12]');
  chkBool('add/sub/scale', JSON.stringify(sub(add(A, A), scale(A, 1))) === JSON.stringify(A));
  chkBool('diag', JSON.stringify(diag([[1, 9], [9, 4], [9, 9]])) === '[1,4]');
  chk('dot', dot([1, 2, 3], [4, 5, 6]), 32, 0);
  chkBool('colMeans', JSON.stringify(colMeans(A)) === '[3,4]');
  chkBool('crossprod = X\'X', JSON.stringify(crossprod(A)) === JSON.stringify(matmul(transpose(A), A)));
  chkBool('crossprodXY = X\'y',
    JSON.stringify(crossprodXY(A, [1, 2, 3])) === JSON.stringify(matvec(transpose(A), [1, 2, 3])));
}

// --- inverse / solve sobre una 6x6 aleatoria con semilla fija ---------------
const rnd = mulberry32(20240804);
const A6 = zeros(6, 6);
for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) A6[i][j] = rnd() * 10 - 5;

{
  const Ai = inverse(A6);
  const P = matmul(A6, Ai);              // ~ identidad
  const PP = inverse(P);                 // inverse(matmul(A, inverse(A))) ~ I
  let e1 = 0, e2 = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    const esp = i === j ? 1 : 0;
    e1 = Math.max(e1, Math.abs(P[i][j] - esp));
    e2 = Math.max(e2, Math.abs(PP[i][j] - esp));
  }
  chk('matmul(A, inverse(A)) ~ I (6x6)', e1, 0, 1e-12);
  chk('inverse(matmul(A, inverse(A))) ~ I', e2, 0, 1e-12);

  const b6 = [1, -2, 3, 0.5, -0.25, 4];
  const x6 = solve(A6, b6);
  const r6 = sub([matvec(A6, x6)], [b6])[0];
  chk('solve: max|Ax-b|', Math.max(...r6.map(Math.abs)), 0, 1e-12);

  let esing = false;
  try { inverse([[1, 2], [2, 4]]); } catch (e) { esing = e.message === 'singular'; }
  chkBool("inverse singular lanza Error('singular')", esing);
}

// --- cholesky / invSPD -----------------------------------------------------
{
  const S = crossprod(A6);               // simétrica definida positiva
  const L = cholesky(S);
  const rec = matmul(L, transpose(L));
  let e = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) e = Math.max(e, Math.abs(rec[i][j] - S[i][j]));
  chk('cholesky: max|LL\' - S|', e, 0, 1e-9);
  const Si = invSPD(S);
  const P = matmul(S, Si);
  let e2 = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    e2 = Math.max(e2, Math.abs(P[i][j] - (i === j ? 1 : 0)));
  }
  chk('invSPD: max|S S^-1 - I|', e2, 0, 1e-10);
  chkBool('cholesky de no definida positiva -> null', cholesky([[1, 2], [2, 1]]) === null);
  chkBool('invSPD cae en inverse() si no es SPD',
    Math.abs(invSPD([[0, 1], [1, 0]])[0][1] - 1) < 1e-12);
}

// --- qrLeastSquares: solución exacta conocida ------------------------------
{
  const r2 = mulberry32(7);
  const N = 200, K = 5;
  const X = zeros(N, K + 1);
  for (let i = 0; i < N; i++) {
    X[i][0] = 1;                                  // constante
    X[i][1] = 3 + 12 * r2();                      // educ
    X[i][2] = 1 + 40 * r2();                      // exper
    X[i][3] = X[i][2] * X[i][2];                  // exper2
    X[i][4] = r2() < 0.48 ? 1 : 0;                // mujer
    X[i][5] = 10 + 50 * r2();                     // horas
  }
  const betaVerd = [61.2, 42.3, 11.6, -0.2, -78.5, 2.87];
  const y = X.map((f) => f.reduce((s, v, j) => s + v * betaVerd[j], 0));
  const res = qrLeastSquares(X, y);
  let peor = 0;
  for (let j = 0; j <= K; j++) peor = Math.max(peor, Math.abs(res.beta[j] - betaVerd[j]));
  chk('qrLeastSquares: max|beta - beta_verdadero|', peor, 0, 1e-9);
  chk('rango = 6', res.rank, 6, 0);
  chkBool('dropped vacío', res.dropped.length === 0);
  console.log('     beta =', res.beta.map((v) => v.toFixed(10)).join(', '));

  // Con ruido: comparar contra las ecuaciones normales (misma solución).
  const yr = y.map((v, i) => v + (r2() - 0.5) * 200);
  const q = qrLeastSquares(X, yr);
  const bn = solve(crossprod(X), crossprodXY(X, yr));
  let d = 0;
  for (let j = 0; j <= K; j++) d = Math.max(d, Math.abs(q.beta[j] - bn[j]) / Math.max(1, Math.abs(bn[j])));
  chk('QR vs ecuaciones normales (con ruido)', d, 0, 1e-8);

  // --- columna duplicada -> debe descartarse ---
  const Xd = X.map((f) => [...f, f[1]]);          // duplica educ al final
  const rd = qrLeastSquares(Xd, y);
  chkBool('columna duplicada reportada en dropped', JSON.stringify(rd.dropped) === '[6]',
    'dropped=' + JSON.stringify(rd.dropped));
  chk('rango con duplicada = 6', rd.rank, 6, 0);
  chk('beta de la columna descartada = 0', rd.beta[6], 0, 0);
  let peor2 = 0;
  for (let j = 0; j <= K; j++) peor2 = Math.max(peor2, Math.abs(rd.beta[j] - betaVerd[j]));
  chk('beta sigue siendo el verdadero con duplicada', peor2, 0, 1e-9);

  // --- combinación lineal (trampa de las dummies) ---
  const Xc = X.map((f) => [...f, 1 - f[4]]);      // hombre = 1 - mujer
  const rc = detectCollinear(Xc);
  chkBool('detectCollinear detecta la dummy redundante',
    JSON.stringify(rc.dropped) === '[6]' && rc.keep.length === 6,
    'dropped=' + JSON.stringify(rc.dropped));

  // --- la constante nunca se descarta aunque vaya al final (estilo Stata) ---
  const Xs = X.map((f) => [f[4], 1 - f[4], 1]);   // mujer, hombre, _cons
  const rs = detectCollinear(Xs);
  chkBool('la constante se conserva (dropped = [1])',
    JSON.stringify(rs.dropped) === '[1]' && JSON.stringify(rs.keep) === '[0,2]',
    'dropped=' + JSON.stringify(rs.dropped) + ' keep=' + JSON.stringify(rs.keep));

  // --- columna de ceros ---
  const Xz = X.map((f) => [...f, 0]);
  chkBool('columna de ceros descartada', JSON.stringify(qrLeastSquares(Xz, y).dropped) === '[6]');
}

console.log(`\nRESULTADO: ${ok} pruebas OK, ${mal} fallas`);
if (mal) { console.log('Fallaron:', fallos.join(' | ')); process.exitCode = 1; }

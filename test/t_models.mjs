// Pruebas de js/core/models.js contra valores conocidos y recuperación de parámetros.
import * as M from '../js/core/models.js';
import { inverse, matmul, transpose, matvec, crossprod, crossprodXY } from '../js/core/matrix.js';
import { normalCdf } from '../js/core/dist.js';

let ok = 0, fallas = 0;
function chk(nombre, valor, esperado, tol) {
  const err = Math.abs(valor - esperado);
  const bien = err <= tol;
  if (bien) ok++; else fallas++;
  console.log(`${bien ? 'OK  ' : 'FALLA'} ${nombre.padEnd(48)} valor=${String(valor).slice(0, 20).padEnd(21)} esp=${String(esperado).slice(0, 16).padEnd(17)} err=${err.toExponential(3)} tol=${tol}`);
}
function chkb(nombre, cond, extra = '') {
  if (cond) ok++; else fallas++;
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${nombre}${extra ? '  ' + extra : ''}`);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normalDe(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ------------------------------------------------------------------ MCO
console.log('=== ols ===');
{
  const rng = mulberry32(7);
  const N = 500;
  const X = [], y = [];
  const beta = [3.5, -1.2, 0.8, 10];   // x1, x2, x3, cons
  for (let i = 0; i < N; i++) {
    const x1 = rng() * 10, x2 = rng() * 5, x3 = normalDe(rng);
    const e = normalDe(rng) * 2;
    X.push([x1, x2, x3, 1]);
    y.push(beta[0] * x1 + beta[1] * x2 + beta[2] * x3 + beta[3] + e);
  }
  const fit = M.ols(X, y, { names: ['x1', 'x2', 'x3', '_cons'], depvar: 'y' });

  // solución cerrada calculada aparte con álgebra matricial
  const bCerrada = matvec(inverse(crossprod(X)), crossprodXY(X, y));
  for (let j = 0; j < 4; j++) chk(`b[${j}] vs (X'X)^-1 X'y`, fit.b[j], bCerrada[j], 1e-9);

  // R² comprobado a mano
  const ybar = y.reduce((a, b) => a + b, 0) / N;
  let rss = 0, tss = 0;
  for (let i = 0; i < N; i++) {
    let yh = 0;
    for (let j = 0; j < 4; j++) yh += X[i][j] * fit.b[j];
    rss += (y[i] - yh) ** 2; tss += (y[i] - ybar) ** 2;
  }
  chk('R2 a mano', fit.r2, 1 - rss / tss, 1e-12);
  chk('rmse a mano', fit.rmse, Math.sqrt(rss / (N - 4)), 1e-10);
  chkb('F global significativa', fit.p_F < 1e-10, `F=${fit.F.toFixed(1)}`);
  chk('recupera beta x1', fit.b[0], beta[0], 0.08);

  // robust: mismos coeficientes, distintos EE
  const rob = M.ols(X, y, { names: ['x1', 'x2', 'x3', '_cons'], vce: 'robust' });
  let maxDif = 0;
  for (let j = 0; j < 4; j++) maxDif = Math.max(maxDif, Math.abs(rob.b[j] - fit.b[j]));
  chk('robust NO cambia los coeficientes', maxDif, 0, 1e-12);
  chkb('robust SÍ cambia los errores estándar', Math.abs(rob.se[0] - fit.se[0]) > 1e-9,
    `ols=${fit.se[0].toFixed(5)} rob=${rob.se[0].toFixed(5)}`);

  // colineal: x4 = 2*x1 debe salir omitida
  const Xc = X.map((f) => [...f, f[0] * 2]);
  const col = M.ols(Xc, y, { names: ['x1', 'x2', 'x3', '_cons', 'x4'] });
  chkb('columna colineal reportada como omitida', col.omitted.length === 1, `omitted=${JSON.stringify(col.omitted)}`);
  chk('R2 no cambia al agregar la colineal', col.r2, fit.r2, 1e-9);
}

// ------------------------------------------------------------------ logit
console.log('\n=== logitFit ===');
let fitLogit = null, XL = null, yL = null;
{
  const rng = mulberry32(21);
  const N = 8000;
  const beta = [0.9, -0.6, 0.35, -0.4];   // x1, x2, x3, cons
  XL = []; yL = [];
  for (let i = 0; i < N; i++) {
    const x1 = normalDe(rng), x2 = rng() * 2, x3 = normalDe(rng) * 1.5;
    const xb = beta[0] * x1 + beta[1] * x2 + beta[2] * x3 + beta[3];
    const p = 1 / (1 + Math.exp(-xb));
    XL.push([x1, x2, x3, 1]);
    yL.push(rng() < p ? 1 : 0);
  }
  fitLogit = M.logitFit(XL, yL, { names: ['x1', 'x2', 'x3', '_cons'], depvar: 'formal' });
  chkb('converge', fitLogit.converged, `iter=${fitLogit.iterations}`);
  // la tolerancia se mide en errores estándar: un coeficiente estimado no tiene por qué
  // caer a menos de un número fijo del verdadero, sino dentro de su propio ruido muestral
  for (let j = 0; j < 4; j++) chk(`recupera beta[${j}] (±3 EE)`, fitLogit.b[j], beta[j], 3 * fitLogit.se[j]);
  chkb('pseudo R2 entre 0 y 1', fitLogit.r2_p > 0 && fitLogit.r2_p < 1, `r2_p=${fitLogit.r2_p.toFixed(4)}`);
  chkb('LR chi2 significativo', fitLogit.p_chi2 < 1e-10, `chi2=${fitLogit.chi2.toFixed(1)}`);

  // la log-verosimilitud debe crecer: la comprobamos evaluando en b y en b desplazado
  const llEn = (b) => {
    let s = 0;
    for (let i = 0; i < N; i++) {
      let xb = 0;
      for (let j = 0; j < 4; j++) xb += XL[i][j] * b[j];
      const p = 1 / (1 + Math.exp(-xb));
      s += yL[i] ? Math.log(p) : Math.log(1 - p);
    }
    return s;
  };
  chk('ll reportada coincide con la calculada aparte', fitLogit.ll, llEn(fitLogit.b), 1e-8);
  const peor = fitLogit.b.map((v) => v * 0.7);
  chkb('ll del óptimo es mayor que la de un punto peor', fitLogit.ll > llEn(peor),
    `${fitLogit.ll.toFixed(2)} > ${llEn(peor).toFixed(2)}`);
}

// ------------------------------------------------------------------ probit
console.log('\n=== probitFit ===');
{
  const rng = mulberry32(33);
  const N = 8000;
  const beta = [0.5, -0.35, 0.2];   // x1, x2, cons
  const X = [], y = [];
  for (let i = 0; i < N; i++) {
    const x1 = normalDe(rng), x2 = rng() * 3;
    const xb = beta[0] * x1 + beta[1] * x2 + beta[2];
    X.push([x1, x2, 1]);
    y.push(normalDe(rng) < xb ? 1 : 0);
  }
  const fit = M.probitFit(X, y, { names: ['x1', 'x2', '_cons'] });
  chkb('converge', fit.converged, `iter=${fit.iterations}`);
  for (let j = 0; j < 3; j++) chk(`recupera beta[${j}]`, fit.b[j], beta[j], 0.06);
}

// ------------------------------------------------------------------ mlogit
console.log('\n=== mlogitFit ===');
{
  const rng = mulberry32(45);
  const N = 12000;
  // categoría 1 = base; b2 y b3 son los verdaderos de las ecuaciones 2 y 3
  const b2 = [0.8, -0.5, 0.3];   // x1, x2, cons
  const b3 = [-0.6, 0.4, 0.1];
  const X = [], y = [];
  for (let i = 0; i < N; i++) {
    const x1 = normalDe(rng), x2 = rng() * 2;
    const e1 = 1;
    const e2 = Math.exp(b2[0] * x1 + b2[1] * x2 + b2[2]);
    const e3 = Math.exp(b3[0] * x1 + b3[1] * x2 + b3[2]);
    const s = e1 + e2 + e3;
    const u = rng();
    let cat;
    if (u < e1 / s) cat = 1; else if (u < (e1 + e2) / s) cat = 2; else cat = 3;
    X.push([x1, x2, 1]);
    y.push(cat);
  }
  const fit = M.mlogitFit(X, y, { names: ['x1', 'x2', '_cons'], base: 1, depvar: 'situacion' });
  chkb('converge', fit.converged, `iter=${fit.iterations}`);
  chkb('base = 1', fit.base === 1, `base=${fit.base}`);
  chkb('2 ecuaciones', fit.eqs.length === 2, `eqs=${fit.eqs.length}`);
  const e2 = fit.eqs.find((e) => e.nivel === 2), e3 = fit.eqs.find((e) => e.nivel === 3);
  for (let j = 0; j < 3; j++) chk(`eq2 beta[${j}]`, e2.b[j], b2[j], 0.1);
  for (let j = 0; j < 3; j++) chk(`eq3 beta[${j}]`, e3.b[j], b3[j], 0.1);
}

// ------------------------------------------------------------------ ologit
console.log('\n=== ologitFit ===');
{
  const rng = mulberry32(57);
  const N = 9000;
  const beta = [0.7, -0.45];
  const cortes = [-1.0, 0.2, 1.4];    // 4 categorías
  const X = [], y = [];
  for (let i = 0; i < N; i++) {
    const x1 = normalDe(rng), x2 = rng() * 2;
    const xb = beta[0] * x1 + beta[1] * x2;
    const u = rng();
    const e = Math.log(u / (1 - u));   // logística
    const yl = xb + e;
    let cat = 4;
    if (yl <= cortes[0]) cat = 1;
    else if (yl <= cortes[1]) cat = 2;
    else if (yl <= cortes[2]) cat = 3;
    X.push([x1, x2, 1]);
    y.push(cat);
  }
  const fit = M.ologitFit(X, y, { names: ['x1', 'x2', '_cons'], depvar: 'satisf' });
  chkb('converge', fit.converged, `iter=${fit.iterations}`);
  for (let j = 0; j < 2; j++) chk(`recupera beta[${j}]`, fit.b[j], beta[j], 0.08);
  chkb('3 cortes', fit.cuts.length === 3, `cuts=${fit.cuts.map((c) => c.b.toFixed(3)).join(', ')}`);
  const ord = fit.cuts.every((c, i) => i === 0 || c.b > fit.cuts[i - 1].b);
  chkb('los cortes salen en orden creciente', ord);
  for (let j = 0; j < 3; j++) chk(`corte ${j + 1}`, fit.cuts[j].b, cortes[j], 0.1);
  chkb('EE de los cortes positivos', fit.cuts.every((c) => c.se > 0 && isFinite(c.se)));
}

// ------------------------------------------------------------------ mprobit
console.log('\n=== mprobitFit ===');
{
  const rng = mulberry32(61);
  const N = 4000;
  const X = [], y = [];
  const b2 = [0.6, -0.4], b3 = [-0.5, 0.3];
  for (let i = 0; i < N; i++) {
    const x1 = normalDe(rng);
    const V = [0, b2[0] * x1 + b2[1], b3[0] * x1 + b3[1]];
    const U = V.map((v) => v + normalDe(rng));
    const cat = U.indexOf(Math.max(...U)) + 1;
    X.push([x1, 1]);
    y.push(cat);
  }
  const t0 = Date.now();
  const fit = M.mprobitFit(X, y, { names: ['x1', '_cons'], base: 1, depvar: 'situacion' });
  const ms = Date.now() - t0;
  chkb('devuelve 2 ecuaciones', fit.eqs.length === 2, `iter=${fit.iterations} tiempo=${ms}ms`);
  chkb('signos correctos en eq2 y eq3',
    fit.eqs[0].b[0] > 0 && fit.eqs[1].b[0] < 0,
    `eq2.x1=${fit.eqs[0].b[0].toFixed(3)} eq3.x1=${fit.eqs[1].b[0].toFixed(3)}`);
  chkb('EE finitos y positivos', fit.eqs.every((e) => e.se.every((s) => s > 0 && isFinite(s))));
  chkb('log-verosimilitud finita', isFinite(fit.ll), `ll=${fit.ll.toFixed(2)}`);
}

// ------------------------------------------------------------------ margins
console.log('\n=== marginsDydx ===');
{
  const ame = M.marginsDydx(fitLogit, {});
  // comparación contra diferencias finitas del promedio de probabilidades
  const N = XL.length;
  const b = fitLogit.b;
  const promP = (bb, j, h) => {
    let s = 0;
    for (let i = 0; i < N; i++) {
      let xb = 0;
      for (let l = 0; l < 4; l++) xb += (XL[i][l] + (l === j ? h : 0)) * bb[l];
      s += 1 / (1 + Math.exp(-xb));
    }
    return s / N;
  };
  for (let j = 0; j < 3; j++) {
    const h = 1e-6;
    const df = (promP(b, j, h) - promP(b, j, -h)) / (2 * h);
    chk(`AME[${j}] vs diferencias finitas`, ame.dydx[j], df, 1e-4);
  }
  chkb('EE de los AME positivos', ame.se.every((s) => s > 0 && isFinite(s)),
    `se=${ame.se.map((s) => s.toFixed(5)).join(', ')}`);
  chkb('AME no incluye _cons', !ame.names.includes('_cons'), `names=${ame.names.join(', ')}`);
}

// ------------------------------------------------------------------ ROC
console.log('\n=== rocPoints / clasificación ===');
{
  const y = [], pPerf = [], pRuido = [];
  const rng = mulberry32(99);
  for (let i = 0; i < 2000; i++) {
    const yi = rng() < 0.4 ? 1 : 0;
    y.push(yi);
    pPerf.push(yi === 1 ? 0.6 + rng() * 0.4 : rng() * 0.4);   // separación perfecta
    pRuido.push(rng());
  }
  const r1 = M.rocPoints(y, pPerf);
  const r2 = M.rocPoints(y, pRuido);
  chk('AUC con predictor perfecto', r1.auc, 1, 1e-9);
  chk('AUC con puro ruido ~ 0.5', r2.auc, 0.5, 0.05);
  chkb('EE del AUC finito', isFinite(r1.seAuc) && isFinite(r2.seAuc));

  const tab = M.classificationTable(y, pPerf, 0.5);
  chk('correctamente clasificados con predictor perfecto', tab.correct, 1, 1e-9);
  chk('sensibilidad', tab.sensitivity, 1, 1e-9);
  chk('especificidad', tab.specificity, 1, 1e-9);
  chkb('tp+fp+tn+fn = N', tab.tp + tab.fp + tab.tn + tab.fn === y.length);

  const curva = M.sensSpecCurve(y, pPerf);
  chkb('la curva de sensibilidad baja al subir el corte',
    curva[0].sens >= curva[curva.length - 1].sens);
  const hl = M.hosmerLemeshow(y, pRuido, 10);
  chkb('Hosmer-Lemeshow devuelve p válido', hl.p >= 0 && hl.p <= 1, `chi2=${hl.chi2.toFixed(2)} p=${hl.p.toFixed(3)}`);
}

// ------------------------------------------------------------------ diagnósticos
console.log('\n=== vif / heterocedasticidad / RESET ===');
{
  const rng = mulberry32(123);
  const N = 800;
  const Xh = [], yh = [], Xc = [], yc = [];
  for (let i = 0; i < N; i++) {
    const x1 = rng() * 10, x2 = rng() * 5;
    const casiIgual = x1 + normalDe(rng) * 0.01;
    const eHom = normalDe(rng) * 3;
    const eHet = normalDe(rng) * (0.5 + x1 * 0.9);
    Xh.push([x1, x2, 1]);
    yh.push(2 * x1 + 1.5 * x2 + 4 + eHom);
    Xc.push([x1, casiIgual, x2, 1]);
    yc.push(2 * x1 + 1.5 * x2 + 4 + eHet);
  }
  const fHom = M.ols(Xh, yh, { names: ['x1', 'x2', '_cons'] });
  const fHet = M.ols(Xc.map((f) => [f[0], f[2], f[3]]), yc, { names: ['x1', 'x2', '_cons'] });

  const v = M.vif(Xc, ['x1', 'casiIgual', 'x2', '_cons']);
  const vMax = Math.max(...v.map((r) => r.vif));
  chkb('VIF alto con dos columnas casi idénticas', vMax > 50, `vifMax=${vMax.toFixed(1)}`);
  chkb('VIF de x2 bajo', v.find((r) => r.name === 'x2').vif < 3,
    `vif(x2)=${v.find((r) => r.name === 'x2').vif.toFixed(2)}`);

  const bpHom = M.breuschPagan(fHom);
  const bpHet = M.breuschPagan(fHet);
  chkb('BP no rechaza con errores homocedásticos', bpHom.p > 0.05, `p=${bpHom.p.toFixed(4)}`);
  chkb('BP rechaza con errores heterocedásticos', bpHet.p < 0.01, `p=${bpHet.p.toExponential(2)}`);

  const wh = M.whiteTest(fHet);
  chkb('White también rechaza', wh.p < 0.01, `chi2=${wh.chi2.toFixed(1)} gl=${wh.df} p=${wh.p.toExponential(2)}`);

  // RESET: modelo bien especificado vs. con forma funcional omitida
  const Xmal = [], ymal = [];
  for (let i = 0; i < N; i++) {
    const x = rng() * 8 + 1;
    Xmal.push([x, 1]);
    ymal.push(3 * x - 0.35 * x * x + normalDe(rng) * 0.5);   // falta el cuadrático
  }
  const fMal = M.ols(Xmal, ymal, { names: ['x', '_cons'] });
  const rst = M.resetTest(fMal);
  chkb('RESET detecta la forma funcional omitida', rst.p < 0.01, `F=${rst.F.toFixed(2)} p=${rst.p.toExponential(2)}`);
  const rstBien = M.resetTest(fHom);
  chkb('RESET no rechaza el modelo bien especificado', rstBien.p > 0.05, `p=${rstBien.p.toFixed(4)}`);

  const lt = M.linktest(fHom);
  chkb('linktest no rechaza el modelo correcto', lt.p_hatsq > 0.05, `p(_hatsq)=${lt.p_hatsq.toFixed(4)}`);

  const dw = M.durbinWatson(fHom.resid);
  chkb('Durbin-Watson ~ 2 sin autocorrelación', Math.abs(dw.dw - 2) < 0.25, `dw=${dw.dw.toFixed(3)}`);
}

console.log('\n=== normalidad ===');
{
  const rng = mulberry32(321);
  const normales = [], sesgados = [];
  for (let i = 0; i < 1200; i++) {
    normales.push(normalDe(rng));
    sesgados.push(Math.exp(normalDe(rng)));      // log-normal, muy asimétrica
  }
  const s1 = M.sktest(normales), s2 = M.sktest(sesgados);
  chkb('sktest no rechaza normalidad en datos normales', s1.p > 0.05, `p=${s1.p.toFixed(4)}`);
  chkb('sktest rechaza en datos log-normales', s2.p < 1e-6, `p=${s2.p.toExponential(2)}`);
  const jb1 = M.jarqueBera(normales), jb2 = M.jarqueBera(sesgados);
  chkb('Jarque-Bera coherente', jb1.p > 0.05 && jb2.p < 1e-6, `p1=${jb1.p.toFixed(3)} p2=${jb2.p.toExponential(2)}`);
  const sw1 = M.shapiroWilk(normales), sw2 = M.shapiroWilk(sesgados);
  chkb('Shapiro-Wilk W cerca de 1 en normales', sw1.W > 0.99, `W=${sw1.W.toFixed(4)} p=${sw1.p.toFixed(4)}`);
  chkb('Shapiro-Wilk rechaza en log-normales', sw2.p < 1e-6, `W=${sw2.W.toFixed(4)} p=${sw2.p.toExponential(2)}`);
}

// ------------------------------------------------------------------ ANOVA
console.log('\n=== anovaFit ===');
{
  const rng = mulberry32(777);
  const y = [], g = [];
  const medias = [500, 580, 670, 790];
  for (let i = 0; i < 1200; i++) {
    const gi = 1 + Math.floor(rng() * 4);
    g.push(gi);
    y.push(medias[gi - 1] + normalDe(rng) * 90);
  }
  const a = M.anovaFit(y, [{ name: 'tamano', type: 'factor', levels: g }]);
  chkb('ANOVA detecta diferencias entre grupos', a.model.p < 1e-20,
    `F=${a.model.F.toFixed(1)} p=${a.model.p.toExponential(2)}`);
  chk('gl del modelo = 3', a.model.df, 3, 0);
  chk('gl residual = N - 4', a.residual.df, 1200 - 4, 0);
  chk('SC modelo + SC residual = SC total', a.model.ss + a.residual.ss, a.total.ss, 1e-6);
  chkb('la SC parcial del único término = SC del modelo',
    Math.abs(a.rows[0].ss - a.model.ss) < 1e-6, `${a.rows[0].ss.toFixed(1)} vs ${a.model.ss.toFixed(1)}`);

  // reg y i.grupo debe dar el mismo R² que anova
  const X = y.map((_, i) => [g[i] === 2 ? 1 : 0, g[i] === 3 ? 1 : 0, g[i] === 4 ? 1 : 0, 1]);
  const r = M.ols(X, y, { names: ['2.g', '3.g', '4.g', '_cons'] });
  chk('anova y reg i.grupo dan el mismo R2', a.r2, r.r2, 1e-12);
  chk('la diferencia grupo2 - grupo1 se recupera', r.b[0], medias[1] - medias[0], 15);
}

// ------------------------------------------------------------------ test lineal
console.log('\n=== testLineal ===');
{
  const rng = mulberry32(888);
  const N = 3000;
  const X = [], y = [];
  for (let i = 0; i < N; i++) {
    const l = Math.log(1 + rng() * 50), k = Math.log(1 + rng() * 80);
    X.push([l, k, 1]);
    y.push(0.62 * l + 0.38 * k + 2 + normalDe(rng) * 0.3);   // suma = 1 exacta
  }
  const fit = M.ols(X, y, { names: ['lnL', 'lnK', '_cons'] });
  const t1 = M.testLineal(fit, [[1, 1, 0]], [1]);
  chkb('no rechaza rendimientos constantes cuando SÍ suman 1', t1.p > 0.05,
    `F=${t1.F.toFixed(3)} p=${t1.p.toFixed(4)} suma=${(fit.b[0] + fit.b[1]).toFixed(4)}`);
  const t2 = M.testLineal(fit, [[1, 1, 0]], [1.5]);
  chkb('rechaza la hipótesis falsa (suma = 1.5)', t2.p < 1e-10, `p=${t2.p.toExponential(2)}`);
}

console.log(`\nRESULTADO: ${ok} pruebas OK, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);

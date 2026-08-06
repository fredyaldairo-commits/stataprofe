// Comandos de estimación y de postestimación.

import { ErrorStata } from './dataset.js';
import { registrarComando } from './session.js';
import * as M from './models.js';
import * as F from './format.js';
import * as G from './graphs.js';
import * as Prof from '../professor.js';
import { esNulo, padI, padD, corta, fmtG, fmtP, masParecido } from './util.js';

function exigeDatos(ses) {
  if (!ses.ds.cargado) {
    throw new ErrorStata('no hay datos en memoria', 4,
      'Primero abre una base: <code>use enemdu_eloro_2024, clear</code>');
  }
}

function nivelDe(p) {
  const l = p.opciones.level ? Number(p.opciones.level) : 95;
  return isNaN(l) ? 95 : l;
}

function vceDe(p, ses) {
  if (p.opciones.robust) return { vce: 'robust', cluster: null };
  if (p.opciones.vce) {
    const v = String(p.opciones.vce).trim();
    if (/^rob/i.test(v)) return { vce: 'robust', cluster: null };
    const mc = v.match(/^cl\w*\s+(\S+)/i);
    if (mc) {
      const nm = mc[1];
      if (!ses.ds.existe(nm)) throw ses.ds.errorVariable(nm);
      return { vce: 'cluster', clusterVar: nm };
    }
    if (/^ols$/i.test(v)) return { vce: 'ols', cluster: null };
  }
  if (p.opciones.cluster) {
    const nm = String(p.opciones.cluster).trim();
    if (!ses.ds.existe(nm)) throw ses.ds.errorVariable(nm);
    return { vce: 'cluster', clusterVar: nm };
  }
  return { vce: 'ols', cluster: null };
}

/** Prepara y y X para cualquier modelo. */
function preparar(p, ses, { constante = true } = {}) {
  exigeDatos(ses);
  const tokens = p.tokens;
  if (tokens.length < 1) throw new ErrorStata(`${p.cmd} necesita variables`, 100, null);
  const dep = tokens[0].replace(/^[ic]\./, '');
  if (!ses.ds.existe(dep)) throw ses.ds.errorVariable(dep);
  if (ses.ds.esString(dep)) {
    throw new ErrorStata(`${dep} es de texto`, 109,
      `La variable que quieres explicar no puede ser texto. Conviértela: <code>encode ${dep}, gen(${dep}_n)</code>`);
  }
  const regs = tokens.slice(1);
  const idxBase = ses.muestra(p).filter((i) => !esNulo(ses.ds.cols[dep][i]));
  const mm = regs.length
    ? ses.matrizModelo(regs, idxBase, { constante })
    : { X: idxBase.map(() => [1]), nombres: ['_cons'], idxFactor: [], filas: idxBase, avisos: [], piezas: [] };
  const y = ses.vectorY(dep, mm.filas);
  if (!mm.filas.length) {
    throw new ErrorStata('no queda ninguna observación utilizable', 2000,
      'Todas las filas tienen algún valor faltante en las variables del modelo. Revísalo con <code>misstable summarize</code>.');
  }
  return { dep, X: mm.X, y, nombres: mm.nombres, idxFactor: mm.idxFactor, filas: mm.filas, avisos: mm.avisos, piezas: mm.piezas };
}

function mostrarAvisos(ses, avisos) { for (const a of avisos) ses.aviso(a.texto); }

function guardarModelo(ses, fit, extra = {}) {
  ses.ultimoModelo = Object.assign(fit, extra);
  ses.guardarE({ N: fit.N, r2: fit.r2, ll: fit.ll, cmd: fit.cmd, depvar: fit.depvar });
}

function avisoObsPerdidas(ses, usadas, disponibles) {
  if (usadas < disponibles) {
    const perdidas = disponibles - usadas;
    ses.aviso(`Se usaron ${usadas} observaciones: ${perdidas} quedaron fuera porque les falta el dato en alguna variable del modelo. Si corres otro modelo con distintas variables, la muestra cambia y los R² ya no son comparables. Para fijar una sola muestra: <code>drop if missing(${'variables del modelo'})</code>.`);
  }
}

// ------------------------------------------------------------------ regress

registrarComando('regress', (p, ses) => {
  const prep = preparar(p, ses);
  const { vce, clusterVar } = vceDe(p, ses);
  const cluster = clusterVar ? prep.filas.map((i) => ses.ds.cols[clusterVar][i]) : null;
  const fit = M.ols(prep.X, prep.y, {
    names: prep.nombres, vce, cluster, level: nivelDe(p), depvar: prep.dep,
    noconstant: !!p.opciones.noconstant,
  });
  fit.idxFactor = prep.idxFactor;
  fit.filas = prep.filas;
  fit.piezas = prep.piezas;
  mostrarAvisos(ses, prep.avisos);

  if (vce === 'ols') ses.txt(F.encabezadoOLS(fit));
  else ses.txt(F.encabezadoOLSRobusto(fit));
  ses.coef(fit, { etiquetaCoef: 'Coef.' });

  if (fit.omitted.length) {
    ses.aviso(`Stata sacó del modelo ${fit.omitted.map((o) => `<code>${o}</code>`).join(', ')} porque se puede calcular exactamente a partir de las otras variables (colinealidad perfecta). Casi siempre pasa por meter todas las categorías de un grupo en vez de dejar una como base.`);
  }
  avisoObsPerdidas(ses, fit.N, ses.muestra(p).length);
  guardarModelo(ses, fit);
  ses.profe(Prof.interpretarRegress(fit, { ds: ses.ds, comando: p.linea }));
});

// ------------------------------------------------------------------ anova / oneway

registrarComando('anova', (p, ses) => {
  exigeDatos(ses);
  const dep = p.tokens[0];
  if (!ses.ds.existe(dep)) throw ses.ds.errorVariable(dep);
  const factores = p.tokens.slice(1);
  if (!factores.length) throw new ErrorStata('anova necesita al menos un factor', 100,
    'Se escribe: <code>anova ingreso tamano</code>');
  // las variables que intervienen, incluidas las de los términos con #
  const usadas = [...new Set(factores.flatMap((f) => f.split('#').map((x) => x.replace(/^[ci]\./, '').trim())))];
  for (const nm of usadas) if (!ses.ds.existe(nm)) throw ses.ds.errorVariable(nm);
  const idx = ses.muestra(p).filter((i) =>
    !esNulo(ses.ds.cols[dep][i]) && usadas.every((nm) => !esNulo(ses.ds.cols[nm][i])));
  const y = idx.map((i) => ses.ds.cols[dep][i]);

  const terms = factores.map((f) => {
    // término de interacción: se arma un factor con las combinaciones
    if (f.includes('#')) {
      const partes = f.split('#').map((x) => x.replace(/^[ci]\./, '').trim());
      const cols = partes.map((nm) => ses.ds.col(nm));
      const claves = idx.map((i) => partes.map((_, k) => cols[k][i]).join('|'));
      const unicas = [...new Set(claves)].sort();
      const mapa = new Map(unicas.map((k, j) => [k, j + 1]));
      return { name: partes.join('#'), type: 'factor', levels: claves.map((k) => mapa.get(k)) };
    }
    const cont = f.startsWith('c.');
    const nm = f.replace(/^[ci]\./, '');
    return cont
      ? { name: nm, type: 'continuous', x: idx.map((i) => ses.ds.cols[nm][i]) }
      : { name: nm, type: 'factor', levels: idx.map((i) => ses.ds.cols[nm][i]) };
  });
  const a = M.anovaFit(y, terms);

  ses.txt(`                          Número de obs = ${padI(a.N, 8)}     R-cuadrado     = ${a.r2.toFixed(4)}`);
  ses.txt(`                          Raíz CM error = ${padI(a.rmse.toFixed(4), 8)}     R-cuad. ajust. = ${a.r2_a.toFixed(4)}`);
  ses.txt('');
  ses.txt('                  Suma de      gl     Cuadrado        F        Prob > F');
  ses.txt('                 cuadrados             medio');
  ses.txt('    ' + '-'.repeat(70));
  const fila = (nm, r) => `    ${padD(corta(nm, 14), 14)} ${padI(r.ss.toFixed(1), 14)} ${padI(r.df, 6)} ${padI((r.ss / r.df).toFixed(1), 13)} ${padI(r.F === undefined || isNaN(r.F) ? '' : r.F.toFixed(2), 9)} ${padI(r.p === undefined || isNaN(r.p) ? '' : fmtP(r.p), 10)}`;
  ses.txt(fila('Modelo', a.model));
  ses.txt('    ' + '-'.repeat(70));
  for (const r of a.rows) ses.txt(fila(r.name, r));
  ses.txt('    ' + '-'.repeat(70));
  ses.txt(fila('Residual', a.residual));
  ses.txt('    ' + '-'.repeat(70));
  ses.txt(fila('Total', a.total));

  ses.ultimoModelo = a.fit;
  ses.ultimoModelo.depvar = dep;
  ses.profe(Prof.interpretarAnova(a, { ds: ses.ds, dep, factores }));
});

registrarComando('oneway', (p, ses) => {
  exigeDatos(ses);
  const [dep, grupo] = p.tokens;
  if (!dep || !grupo) throw new ErrorStata('oneway necesita dos variables', 100,
    'Se escribe: <code>oneway ingreso tamano, tabulate</code>');
  if (!ses.ds.existe(dep)) throw ses.ds.errorVariable(dep);
  if (!ses.ds.existe(grupo)) throw ses.ds.errorVariable(grupo);
  const idx = ses.muestra(p).filter((i) => !esNulo(ses.ds.cols[dep][i]) && !esNulo(ses.ds.cols[grupo][i]));
  const y = idx.map((i) => ses.ds.cols[dep][i]);
  const g = idx.map((i) => ses.ds.cols[grupo][i]);
  const a = M.anovaFit(y, [{ name: grupo, type: 'factor', levels: g }]);

  if (p.opciones.tabulate || p.opciones.tab) {
    const niveles = [...new Set(g)].sort((x, z) => x - z);
    const filas = niveles.map((nv) => {
      const vals = y.filter((_, k) => g[k] === nv);
      const m = vals.reduce((x, z) => x + z, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((x, z) => x + (z - m) ** 2, 0) / (vals.length - 1));
      const et = ses.ds.etiquetaDe(grupo, nv);
      return [et || String(nv), m.toFixed(2), sd.toFixed(2), vals.length];
    });
    const mTot = y.reduce((x, z) => x + z, 0) / y.length;
    const sdTot = Math.sqrt(y.reduce((x, z) => x + (z - mTot) ** 2, 0) / (y.length - 1));
    filas.push(['Total', mTot.toFixed(2), sdTot.toFixed(2), y.length]);
    ses.txt(F.tablaSimple([ses.ds.meta(grupo).label || grupo, 'Media', 'Desv. est.', 'Obs'], filas, ['i', 'd', 'd', 'd']));
    ses.txt('');
  }
  ses.txt('                        Análisis de la varianza');
  ses.txt('    Fuente             SC          gl        CM        F      Prob > F');
  ses.txt('    ' + '-'.repeat(66));
  ses.txt(`    Entre grupos ${padI(a.model.ss.toFixed(2), 14)} ${padI(a.model.df, 6)} ${padI(a.model.ms.toFixed(2), 12)} ${padI(a.model.F.toFixed(2), 8)} ${padI(fmtP(a.model.p), 10)}`);
  ses.txt(`    Dentro       ${padI(a.residual.ss.toFixed(2), 14)} ${padI(a.residual.df, 6)} ${padI(a.residual.ms.toFixed(2), 12)}`);
  ses.txt('    ' + '-'.repeat(66));
  ses.txt(`    Total        ${padI(a.total.ss.toFixed(2), 14)} ${padI(a.total.df, 6)} ${padI(a.total.ms.toFixed(2), 12)}`);

  // comparaciones post-hoc con Bonferroni
  if (p.opciones.bonferroni || p.opciones.scheffe || p.opciones.sidak) {
    const niveles = [...new Set(g)].sort((x, z) => x - z);
    const X = idx.map((_, k) => niveles.slice(1).map((nv) => (g[k] === nv ? 1 : 0)).concat([1]));
    const nombres = niveles.slice(1).map((nv) => `${nv}.${grupo}`).concat(['_cons']);
    const fit = M.ols(X, y, { names: nombres, depvar: dep });
    fit.piezas = [{ nombre: grupo, base: niveles[0], niveles }];
    const r = M.comparacionesPares(fit, nombres.slice(0, -1).map((_, j) => j), {
      base: String(ses.ds.etiquetaDe(grupo, niveles[0]) || niveles[0]),
      niveles: niveles.slice(1).map((nv) => String(ses.ds.etiquetaDe(grupo, nv) || nv)),
    });
    ses.txt('');
    ses.txt(`Comparación de ${dep} por ${grupo} — corrección de Bonferroni`);
    ses.txt('');
    ses.txt(F.tablaSimple(['Comparación', 'Diferencia', 'p (Bonferroni)'],
      r.pares.map((x) => [`${x.b} vs ${x.a}`, x.dif.toFixed(4), fmtP(x.p)]), ['i', 'd', 'd']));
    ses.profeTexto('Por qué se corrige el valor p', [
      { tono: 'info', texto: `Estás haciendo <strong>${r.nComparaciones} comparaciones</strong> a la vez. Si cada una usara el 5% por su cuenta, la probabilidad de que <u>alguna</u> salga significativa por pura casualidad sería mucho mayor al 5%.` },
      { tono: 'ok', texto: 'Bonferroni lo arregla de la forma más simple: multiplica cada valor p por el número de comparaciones. Es conservador (le cuesta más declarar diferencias), pero nadie te lo va a discutir.' },
    ]);
  }
  ses.profe(Prof.interpretarAnova(a, { ds: ses.ds, dep, factores: [grupo] }));
});

// ------------------------------------------------------------------ binarios

function corridaBinaria(p, ses, tipo, { mostrarOR = false } = {}) {
  const prep = preparar(p, ses);
  const niveles = [...new Set(prep.y)];
  if (niveles.length !== 2 || !niveles.every((v) => v === 0 || v === 1)) {
    const nv = [...new Set(prep.y)].sort((a, b) => a - b);
    throw new ErrorStata(`${prep.dep} no es una variable de sí/no`, 450,
      nv.length > 2
        ? `<code>${prep.dep}</code> tiene ${nv.length} valores distintos (${nv.slice(0, 6).join(', ')}${nv.length > 6 ? '...' : ''}). Para 3 o más categorías se usa <code>mlogit</code> (sin orden) u <code>ologit</code> (con orden).`
        : `<code>${prep.dep}</code> vale ${nv.join(' y ')}. Para logit tiene que valer 0 y 1. Créala así: <code>gen ${prep.dep}01 = (${prep.dep} == ${nv[1]})</code>`);
  }
  const fit = tipo === 'logit'
    ? M.logitFit(prep.X, prep.y, { names: prep.nombres, level: nivelDe(p), depvar: prep.dep })
    : M.probitFit(prep.X, prep.y, { names: prep.nombres, level: nivelDe(p), depvar: prep.dep });
  fit.idxFactor = prep.idxFactor;
  fit.filas = prep.filas;
  mostrarAvisos(ses, prep.avisos);

  ses.txt(F.encabezadoMV(fit, tipo === 'logit' ? 'Regresión logística' : 'Regresión probit'));

  if (mostrarOR) {
    const or = { ...fit };
    or.b = fit.b.map((b, i) => (fit.names[i] === '_cons' ? Math.exp(b) : Math.exp(b)));
    or.se = fit.se.map((s, i) => s * Math.exp(fit.b[i]));   // método delta
    or.ci = fit.ci.map((c) => [Math.exp(c[0]), Math.exp(c[1])]);
    ses.coef(or, { etiquetaCoef: 'Razón momios', esOR: true });
  } else {
    ses.coef(fit, { etiquetaCoef: 'Coef.' });
  }

  const nEventos = prep.y.reduce((a, b) => a + b, 0);
  const kVars = fit.names.filter((n) => n !== '_cons').length;
  if (Math.min(nEventos, fit.N - nEventos) / kVars < 10) {
    ses.aviso(`Regla práctica: conviene tener al menos 10 casos del grupo más chico por cada variable explicativa. Aquí el grupo más chico tiene ${Math.min(nEventos, fit.N - nEventos)} casos y hay ${kVars} variables (${(Math.min(nEventos, fit.N - nEventos) / kVars).toFixed(1)} por variable). Los resultados pueden ser inestables.`);
  }
  if (fit.warnings.includes('separacion')) {
    ses.aviso('Alguna variable predice el resultado <strong>perfectamente</strong>: su coeficiente se dispara y su error estándar es enorme. Eso se llama separación. Suele pasar cuando una categoría tiene todos los casos de un solo lado. Quita esa variable o junta categorías.');
  }
  guardarModelo(ses, fit);
  const ame = M.marginsDydx(fit, { factorCols: prep.idxFactor });
  ses.profe(Prof.interpretarLogit(fit, ame, { ds: ses.ds, tipo, mostrarOR }));
  return fit;
}

registrarComando('logit', (p, ses) => corridaBinaria(p, ses, 'logit', { mostrarOR: !!p.opciones.or }));
registrarComando('probit', (p, ses) => corridaBinaria(p, ses, 'probit'));
registrarComando('logistic', (p, ses) => corridaBinaria(p, ses, 'logit', { mostrarOR: true }));

registrarComando('poisson', (p, ses) => {
  const prep = preparar(p, ses);
  const fit = M.poissonFit(prep.X, prep.y, { names: prep.nombres, level: nivelDe(p), depvar: prep.dep });
  mostrarAvisos(ses, prep.avisos);
  ses.txt(F.encabezadoMV(fit, 'Regresión de Poisson'));
  ses.coef(fit, { etiquetaCoef: 'Coef.' });
  guardarModelo(ses, fit);
  ses.profe(Prof.interpretarPoisson(fit, { ds: ses.ds }));
});

// ------------------------------------------------------------------ multinomial y ordenado

function tablaEcuaciones(ses, fit, { rrr = false } = {}) {
  for (const eq of fit.eqs) {
    const et = ses.ds.etiquetaDe(fit.depvar, eq.nivel);
    ses.txt('');
    ses.txt(`${et || eq.name}  (comparado con: ${ses.ds.etiquetaDe(fit.depvar, fit.base) || fit.base})`);
    const b = rrr ? eq.b.map((v) => Math.exp(v)) : eq.b;
    const se = rrr ? eq.se.map((s, i) => s * Math.exp(eq.b[i])) : eq.se;
    const ci = rrr ? eq.ci.map((c) => [Math.exp(c[0]), Math.exp(c[1])]) : eq.ci;
    ses.coef({
      depvar: fit.depvar, names: eq.names, b, se, stat: eq.stat,
      statName: 'z', p: eq.p, ci, level: fit.level, omitted: [],
    }, { etiquetaCoef: rrr ? 'RRR' : 'Coef.', esOR: rrr });
  }
  if (rrr) {
    ses.profeTexto('Qué es una razón de riesgo relativo (RRR)', [
      { tono: 'info', texto: 'Es e^coeficiente, igual que la razón de momios del logit. Dice por cuánto se <strong>multiplica</strong> la chance relativa de estar en esa categoría en vez de la base.' },
      { tono: 'ojo', texto: 'El valor neutro es el <strong>1</strong>, no el 0. Y sigue siendo "comparado con la categoría base": la RRR tampoco es una probabilidad.' },
    ]);
  }
}

registrarComando('mlogit', (p, ses) => {
  const prep = preparar(p, ses);
  const nv = [...new Set(prep.y)].sort((a, b) => a - b);
  if (nv.length < 3) {
    throw new ErrorStata(`${prep.dep} solo tiene ${nv.length} categorías`, 198,
      `Con dos categorías el modelo correcto es <code>logit</code> o <code>probit</code>, no <code>mlogit</code>.`);
  }
  const base = p.opciones.base || p.opciones.baseoutcome;
  const fit = M.mlogitFit(prep.X, prep.y, {
    names: prep.nombres, level: nivelDe(p), depvar: prep.dep,
    base: base && base !== true ? Number(base) : null,
  });
  mostrarAvisos(ses, prep.avisos);
  ses.txt(F.encabezadoMV(fit, 'Logit multinomial'));
  tablaEcuaciones(ses, fit, { rrr: !!p.opciones.rrr });
  guardarModelo(ses, fit);
  ses.profe(Prof.interpretarMlogit(fit, { ds: ses.ds }));
});

registrarComando('mprobit', (p, ses) => {
  const prep = preparar(p, ses);
  const base = p.opciones.base || p.opciones.baseoutcome;
  const fit = M.mprobitFit(prep.X, prep.y, {
    names: prep.nombres, level: nivelDe(p), depvar: prep.dep,
    base: base && base !== true ? Number(base) : null,
  });
  mostrarAvisos(ses, prep.avisos);
  ses.txt(F.encabezadoMV(fit, 'Probit multinomial'));
  tablaEcuaciones(ses, fit);
  guardarModelo(ses, fit);
  ses.profe(Prof.interpretarMlogit(fit, { ds: ses.ds, esProbit: true }));
});

function corridaOrdenada(p, ses, tipo) {
  const prep = preparar(p, ses);
  const nv = [...new Set(prep.y)].sort((a, b) => a - b);
  if (nv.length < 3) throw new ErrorStata(`${prep.dep} solo tiene ${nv.length} categorías`, 198,
    'Con dos categorías usa <code>logit</code> o <code>probit</code>.');
  const fit = tipo === 'logit'
    ? M.ologitFit(prep.X, prep.y, { names: prep.nombres, level: nivelDe(p), depvar: prep.dep })
    : M.oprobitFit(prep.X, prep.y, { names: prep.nombres, level: nivelDe(p), depvar: prep.dep });
  mostrarAvisos(ses, prep.avisos);
  ses.txt(F.encabezadoMV(fit, tipo === 'logit' ? 'Logit ordenado' : 'Probit ordenado'));
  ses.coef(fit, { etiquetaCoef: 'Coef.' });
  guardarModelo(ses, fit);
  ses.profe(Prof.interpretarOlogit(fit, { ds: ses.ds, tipo }));
}

registrarComando('ologit', (p, ses) => corridaOrdenada(p, ses, 'logit'));
registrarComando('oprobit', (p, ses) => corridaOrdenada(p, ses, 'probit'));

// ------------------------------------------------------------------ postestimación

function exigeModelo(ses, quien) {
  if (!ses.ultimoModelo) {
    throw new ErrorStata(`${quien} necesita un modelo corrido antes`, 301,
      'Estos comandos trabajan sobre el último modelo. Corre primero una regresión, por ejemplo:<br><code>regress ingreso educ exper mujer, robust</code>');
  }
  return ses.ultimoModelo;
}

registrarComando('predict', (p, ses) => {
  const fit = exigeModelo(ses, 'predict');
  const nombre = p.tokens[0];
  if (!nombre) throw new ErrorStata('predict necesita un nombre para la variable nueva', 100,
    'Por ejemplo: <code>predict yhat</code> o <code>predict e, resid</code>');
  if (ses.ds.existe(nombre)) throw new ErrorStata(`${nombre} ya existe`, 110, 'Ponle otro nombre.');

  const op = p.opciones.__orden ? p.opciones.__orden.filter((o) => o !== 'level')[0] : null;
  const out = new Array(ses.ds.n).fill(null);
  const filas = fit.filas || fit.X.map((_, i) => i);

  let etiqueta = '';
  if (!op || op === 'xb' || op === 'pr' || op === 'p') {
    if (fit.link === 'identity') {
      filas.forEach((f, k) => { out[f] = fit.yhat[k]; });
      etiqueta = 'Valores ajustados';
    } else if (['logit', 'probit'].includes(fit.link)) {
      if (op === 'xb') { filas.forEach((f, k) => { out[f] = fit.xb[k]; }); etiqueta = 'Índice lineal xb'; }
      else { filas.forEach((f, k) => { out[f] = fit.pred[k]; }); etiqueta = 'Probabilidad ajustada'; }
    } else {
      throw new ErrorStata('para este modelo hay que decir qué predecir', 198,
        'Por ejemplo <code>predict p, pr</code>');
    }
  } else if (op === 'resid' || op === 'residuals' || op === 'r') {
    if (fit.link !== 'identity') throw new ErrorStata('los residuos así solo salen después de regress', 198,
      'En logit y probit los residuos se piden distinto; para revisar el ajuste usa <code>estat gof</code> o <code>lroc</code>.');
    filas.forEach((f, k) => { out[f] = fit.resid[k]; });
    etiqueta = 'Residuos';
  } else if (op === 'rstandard') {
    const s = fit.rmse;
    filas.forEach((f, k) => { out[f] = fit.resid[k] / s; });
    etiqueta = 'Residuos estandarizados';
  } else {
    throw new ErrorStata(`no reconozco la opción ${op}`, 198,
      'Opciones disponibles: <code>xb</code> (ajustado), <code>resid</code> (residuo), <code>pr</code> (probabilidad, en logit/probit), <code>rstandard</code>.');
  }
  ses.ds.poner(nombre, out, { type: 'numeric', label: etiqueta });
  const faltan = out.filter((v) => esNulo(v)).length;
  ses.ok(`<code>${nombre}</code> creada (${etiqueta.toLowerCase()}).` + (faltan ? ` ${faltan} filas quedaron vacías porque no entraron al modelo.` : ''));
});

/** Lee at(educ=(0(3)18)) o at(educ=(0 5 10)) y devuelve {variable, valores}. */
function leerAt(txt) {
  const m = String(txt).match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(?\s*(.+?)\s*\)?\s*$/s);
  if (!m) return null;
  const nombre = m[1];
  let cuerpo = m[2].replace(/^\(|\)$/g, '').trim();
  const rango = cuerpo.match(/^(-?[\d.]+)\s*\(\s*(-?[\d.]+)\s*\)\s*(-?[\d.]+)$/);
  if (rango) {
    const [, a, paso, b] = rango.map(Number);
    const vals = [];
    if (Number(paso) === 0) return null;
    for (let v = Number(a); (paso > 0 ? v <= Number(b) + 1e-9 : v >= Number(b) - 1e-9); v += Number(paso)) {
      vals.push(Math.round(v * 1e8) / 1e8);
    }
    return { variable: nombre, valores: vals };
  }
  const vals = cuerpo.split(/[\s,]+/).map(Number).filter((v) => !isNaN(v));
  return vals.length ? { variable: nombre, valores: vals } : null;
}

registrarComando('margins', (p, ses) => {
  const fit = exigeModelo(ses, 'margins');
  const nivel = nivelDe(p);
  const esMulti = ['mlogit', 'mprobit'].includes(fit.cmd);
  const esOrdenado = ['ologit', 'oprobit'].includes(fit.cmd);

  // ---- margins nombreFactor  → medias ajustadas por grupo
  if (p.tokens.length && !p.opciones.dydx) {
    const nom = p.tokens[0].replace(/^i\./, '');
    const re = new RegExp(`^(\\d+)\\.${nom}$`);
    const cols = [], etiquetas = [];
    const pieza = (fit.piezas || []).find((x) => x.nombre === nom);
    if (!pieza) throw new ErrorStata(`${nom} no está como factor en el modelo`, 111,
      `Vuelve a correrlo con <code>i.${nom}</code>. El modelo tiene: ${fit.names.join(', ')}`);
    etiquetas.push(ses.ds.etiquetaDe(nom, pieza.base) || `${nom}=${pieza.base}`);
    fit.names.forEach((nm, j) => {
      const m = nm.match(re);
      if (m) { cols.push(j); etiquetas.push(ses.ds.etiquetaDe(nom, Number(m[1])) || `${nom}=${m[1]}`); }
    });
    const r = M.mediasAjustadas(fit, cols, etiquetas, { level: nivel });
    ses.txt(`Medias ajustadas (predictive margins) de ${fit.depvar} por ${nom}`);
    ses.txt(`Número de obs = ${fit.N}`);
    ses.txt('');
    ses.txt(F.tablaSimple([nom, 'Media ajustada', 'Err. est.', `[${nivel}% int. conf.]`],
      r.map((x) => [x.etiqueta, fmtG(x.est, 6), fmtG(x.se, 5), `${fmtG(x.ci[0], 6)}  ${fmtG(x.ci[1], 6)}`]),
      ['i', 'd', 'd', 'd']));
    ses.ultimosMargins = { names: r.map((x) => x.etiqueta), dydx: r.map((x) => x.est),
      se: r.map((x) => x.se), ci: r.map((x) => x.ci), esMedias: true };
    ses.profeTexto('Qué son las medias ajustadas', [
      { tono: 'info', texto: `Es el promedio de ${fit.depvar} que tendría <strong>cada grupo</strong> si todos tuvieran las mismas características en las demás variables del modelo. Sirve para comparar grupos "en igualdad de condiciones".` },
      { tono: 'ojo', texto: 'Ojo: no son los promedios crudos de cada grupo (esos salen con <code>tabstat</code>). Estos ya están controlados por el resto del modelo, por eso suelen estar más juntos.' },
      { tono: 'info', texto: 'Se grafican bonito con <code>marginsplot</code>.' },
    ]);
    return;
  }

  // ---- margins, at(...)  → predicción en valores concretos
  if (p.opciones.at && p.opciones.at !== true) {
    const at = leerAt(p.opciones.at);
    if (!at) throw new ErrorStata('no entiendo la opción at()', 198,
      'Se escribe así:<br>· <code>margins, at(educ=(0(3)18))</code> — de 0 a 18 de 3 en 3<br>· <code>margins, at(educ=(0 6 12 18))</code> — solo esos valores');
    if (esMulti || esOrdenado) throw new ErrorStata(`at() después de ${fit.cmd} todavía no está`, 199,
      'Para estos modelos usa <code>margins, dydx(*) predict(outcome(N))</code>.');
    if (!fit.xnames.includes(at.variable)) throw ses.ds.errorVariable(at.variable);
    const derivada = p.opciones.dydx !== undefined;
    const r = M.marginsEn(fit, at.variable, at.valores, { level: nivel, derivada });
    ses.txt(derivada ? `Efecto marginal de ${at.variable} en distintos valores` : 'Probabilidad ajustada en distintos valores');
    ses.txt(`Modelo: ${fit.cmd}   Número de obs = ${fit.N}`);
    ses.txt('');
    ses.txt(F.tablaSimple([at.variable, derivada ? 'dy/dx' : 'Predicción', 'Err. est.', 'z', 'P>|z|', `[${nivel}% int. conf.]`],
      r.map((x) => [x.valor, fmtG(x.est, 6), fmtG(x.se, 5), isNaN(x.z) ? '—' : x.z.toFixed(2), fmtP(x.p),
        `${fmtG(x.ci[0], 5)}  ${fmtG(x.ci[1], 5)}`]),
      ['d', 'd', 'd', 'd', 'd', 'd']));
    ses.ultimosMargins = { names: r.map((x) => `${at.variable}=${x.valor}`), dydx: r.map((x) => x.est),
      se: r.map((x) => x.se), ci: r.map((x) => x.ci), esAt: true, variable: at.variable, valores: at.valores };
    ses.svg(G.marginsPlot(r.map((x) => ({ label: `${at.variable}=${x.valor}`, est: x.est, lo: x.ci[0], hi: x.ci[1] })),
      { title: derivada ? `Efecto marginal según ${at.variable}` : `Probabilidad predicha según ${at.variable}`,
        xlabel: derivada ? 'dy/dx' : 'Probabilidad' }), 'margins at');
    ses.profeTexto('Para qué sirve esto', [
      { tono: 'info', texto: `Aquí ves cómo cambia ${derivada ? 'el efecto' : 'la probabilidad'} <strong>a lo largo de ${at.variable}</strong>, en vez de un solo número promedio. En un modelo de curva (logit/probit) el efecto <u>no</u> es el mismo en todos los niveles: es más fuerte en el medio y más débil en los extremos.` },
      { tono: 'ok', texto: 'Esta tabla es de lo que mejor queda en un trabajo, porque se explica sola: "una persona con 6 años de estudio tiene X% de probabilidad; con 18 años, Y%".' },
    ]);
    return;
  }

  // ---- margins de un mlogit para una categoría
  if (esMulti) {
    let cat = null;
    const pr = p.opciones.predict;
    if (pr && pr !== true) {
      const m = String(pr).match(/outcome\s*\(\s*(\d+)\s*\)/i);
      if (m) cat = Number(m[1]);
    }
    if (cat === null) {
      throw new ErrorStata('falta decir de qué categoría quieres los efectos', 198,
        `En un modelo de varias categorías, los efectos marginales se piden <strong>una categoría a la vez</strong>:<br>${
          fit.niveles.map((nv) => `<code>margins, dydx(*) predict(outcome(${nv}))</code> &nbsp;<span style="color:var(--ink3)">${ses.ds.etiquetaDe(fit.depvar, nv) || ''}</span>`).join('<br>')}`);
    }
    if (fit.cmd === 'mprobit') throw new ErrorStata('margins después de mprobit todavía no está', 199,
      'Usa <code>mlogit</code> para los efectos marginales; <code>mprobit</code> sirve para comprobar que los signos coinciden.');
    if (!fit.niveles.includes(cat)) throw new ErrorStata(`la categoría ${cat} no existe`, 198,
      `Las categorías son: ${fit.niveles.join(', ')}`);
    const r = M.marginsMlogit(fit, cat, { level: nivel });
    const et = ses.ds.etiquetaDe(fit.depvar, cat) || cat;
    ses.txt(`Efectos marginales promedio sobre Pr(${fit.depvar} = ${et})`);
    ses.txt(`Modelo: mlogit   Número de obs = ${r.N}`);
    ses.coef({
      depvar: fit.depvar, names: r.names, b: r.dydx, se: r.se, stat: r.stat,
      statName: 'z', p: r.p, ci: r.ci, level: r.level, omitted: [],
    }, { etiquetaCoef: 'dy/dx', esMargins: true, link: 'logit' });
    ses.ultimosMargins = r;
    ses.profeTexto(`Efectos sobre "${et}"`, [
      { tono: 'ok', texto: `<strong>Estos sí son puntos de probabilidad</strong>, y a diferencia de los coeficientes crudos <u>no</u> necesitan la muletilla de "comparado con la base": son el cambio en la probabilidad de estar en <strong>${et}</strong>, sin más.` },
      { tono: 'ojo', texto: 'Ojo con esto: los efectos marginales de todas las categorías <strong>suman cero</strong> para cada variable. Tiene sentido: si una variable sube la probabilidad de una categoría, tiene que bajar la de alguna otra. Compruébalo corriendo las tres.' },
      { tono: 'info', texto: `Corre también las otras: ${fit.niveles.filter((n) => n !== cat).map((n) => `<code>margins, dydx(*) predict(outcome(${n}))</code>`).join(' ')}` },
    ]);
    return;
  }

  if (esOrdenado) {
    throw new ErrorStata(`margins después de ${fit.cmd} todavía no está en el simulador`, 199,
      'En un modelo ordenado lo que se reporta es el <strong>signo</strong> de cada coeficiente (hacia qué lado de la escala empuja) y su significancia. Eso ya te lo interpreta el profesor al correr el modelo.');
  }

  // ---- caso normal
  const pideDydx = p.opciones.dydx !== undefined;
  if (!pideDydx) {
    ses.aviso('Casi siempre lo que se quiere es <code>margins, dydx(*)</code>: eso traduce los coeficientes a puntos de probabilidad (o a unidades de la dependiente). Lo corro así.');
  }
  const ame = M.marginsDydx(fit, {
    atMeans: !!p.opciones.atmeans,
    factorCols: fit.idxFactor || [],
    level: nivel,
  });
  ses.txt(ame.atMeans ? 'Efectos marginales en las medias (MEM)' : 'Efectos marginales promedio (AME)');
  ses.txt(`Modelo: ${fit.cmd}   Número de obs = ${ame.N}`);
  ses.txt(`Expresión: ${fit.link === 'identity' ? `valor ajustado de ${fit.depvar}` : `probabilidad ajustada de ${fit.depvar}`}`);
  ses.coef({
    depvar: fit.depvar, names: ame.names, b: ame.dydx, se: ame.se, stat: ame.stat,
    statName: 'z', p: ame.p, ci: ame.ci, level: ame.level, omitted: [],
  }, { etiquetaCoef: 'dy/dx', esMargins: true, link: fit.link });
  if (ame.atMeans) {
    ses.aviso('Estás usando <code>atmeans</code>: eso calcula el efecto para una "persona promedio" (con la educación promedio, la experiencia promedio, y <strong>sexo 0,44</strong>, que no existe). Lo estándar hoy es el AME, sin <code>atmeans</code>.');
  }
  ses.profe(Prof.interpretarMargins(ame, { ds: ses.ds, fit }));
  ses.ultimosMargins = ame;

  // margins, post: deja los efectos marginales como si fueran un modelo, para esttab
  if (p.opciones.post) {
    ses.ultimoModelo = {
      cmd: 'margins', depvar: fit.depvar, N: ame.N, names: ame.names, b: ame.dydx,
      se: ame.se, stat: ame.stat, statName: 'z', p: ame.p, ci: ame.ci, level: ame.level,
      omitted: [], V: null, link: fit.link, esMargins: true,
    };
    ses.ok('Efectos marginales guardados como resultado activo: ya puedes hacer <code>estimates store</code> y compararlos con <code>esttab</code>.');
  }
});

registrarComando('test', (p, ses) => {
  const fit = exigeModelo(ses, 'test');
  let txt = p.cuerpo.trim();
  if (!txt) throw new ErrorStata('test necesita una hipótesis', 100,
    'Por ejemplo:<br>· <code>test educ = 0</code><br>· <code>test educ exper</code> (las dos a la vez)<br>· <code>test lnhoras + lnk = 1</code>');

  // en modelos de varias ecuaciones, [2]educ se refiere al coeficiente de educ
  // en la ecuación de la categoría 2. Internamente se llama "2:educ".
  txt = txt.replace(/\[\s*(\d+)\s*\]\s*([A-Za-z_][A-Za-z0-9_.]*)/g, '$1:$2');

  // varias variables sueltas -> prueba conjunta de que todas son cero
  const soloNombres = txt.split(/\s+/).every((t) => fit.names.includes(t));
  let R = [], q = [];
  if (soloNombres) {
    for (const t of txt.split(/\s+/)) {
      const fila = new Array(fit.b.length).fill(0);
      fila[fit.names.indexOf(t)] = 1;
      R.push(fila); q.push(0);
    }
  } else {
    // ecuación: combinación lineal = número
    const partes = txt.split('=');
    const izq = partes[0].trim();
    const der = partes.length > 1 ? Number(partes[1].trim()) : 0;
    const fila = new Array(fit.b.length).fill(0);
    const term = izq.replace(/\s*-\s*/g, ' + -').split('+').map((s) => s.trim()).filter(Boolean);
    for (const t of term) {
      const m = t.match(/^(-?\d*\.?\d*)\s*\*?\s*([A-Za-z_][A-Za-z0-9_.#]*)$/);
      if (!m) throw new ErrorStata(`no entiendo "${t}"`, 198,
        'Escribe la hipótesis como una suma, por ejemplo <code>test lnhoras + lnk = 1</code>.');
      const coef = m[1] === '' || m[1] === '-' ? (m[1] === '-' ? -1 : 1) : Number(m[1]);
      const nm = m[2];
      const j = fit.names.indexOf(nm);
      if (j < 0) {
        const sug = masParecido(nm, fit.names);
        throw new ErrorStata(`${nm} no está en el modelo`, 111,
          sug ? `¿Quisiste decir <code>${sug}</code>?` : `Variables del modelo: ${fit.names.join(', ')}`);
      }
      fila[j] = coef;
    }
    R.push(fila); q.push(isNaN(der) ? 0 : der);
  }

  const r = M.testLineal(fit, R, q);
  if (r.error) throw new ErrorStata(r.error, 198, null);
  ses.txt(soloNombres
    ? txt.split(/\s+/).map((t, i) => ` (${i + 1})  ${t} = 0`).join('\n')
    : ` (1)  ${txt}`);
  ses.txt('');
  if (r.tipo === 'F') {
    ses.txt(`       F(${r.df1}, ${r.df2}) = ${r.F.toFixed(2)}`);
    ses.txt(`            Prob > F = ${r.p.toFixed(4)}`);
  } else {
    ses.txt(`       chi2(${r.df}) = ${r.chi2.toFixed(2)}`);
    ses.txt(`     Prob > chi2 = ${r.p.toFixed(4)}`);
  }
  ses.profe(Prof.interpretarPrueba('test', { ...r, hipotesis: txt }, { ds: ses.ds, fit }));
});

registrarComando('testparm', (p, ses) => {
  const fit = exigeModelo(ses, 'testparm');
  const pedido = p.tokens[0];
  if (!pedido) throw new ErrorStata('testparm necesita un grupo', 100,
    'Por ejemplo: <code>testparm i.tamano</code>');
  const nm = pedido.replace(/^i\./, '');
  const cuales = fit.names.filter((n) => new RegExp(`^\\d+\\.${nm}$`).test(n) || n === nm);
  if (!cuales.length) throw new ErrorStata(`no encuentro ${pedido} en el modelo`, 111,
    `Variables del modelo: ${fit.names.join(', ')}`);
  const R = cuales.map((c) => {
    const fila = new Array(fit.b.length).fill(0);
    fila[fit.names.indexOf(c)] = 1;
    return fila;
  });
  const r = M.testLineal(fit, R, R.map(() => 0));
  ses.txt(cuales.map((c, i) => ` (${i + 1})  ${c} = 0`).join('\n'));
  ses.txt('');
  if (r.tipo === 'F') {
    ses.txt(`       F(${r.df1}, ${r.df2}) = ${r.F.toFixed(2)}`);
    ses.txt(`            Prob > F = ${r.p.toFixed(4)}`);
  } else {
    ses.txt(`       chi2(${r.df}) = ${r.chi2.toFixed(2)}`);
    ses.txt(`     Prob > chi2 = ${r.p.toFixed(4)}`);
  }
  ses.profe(Prof.interpretarPrueba('testparm', { ...r, grupo: nm, cuantas: cuales.length }, { ds: ses.ds, fit }));
});

registrarComando('linktest', (p, ses) => {
  const fit = exigeModelo(ses, 'linktest');
  const r = M.linktest(fit);
  ses.coef(r.fit, { etiquetaCoef: 'Coef.' });
  ses.profe(Prof.interpretarPrueba('linktest', r, { ds: ses.ds, fit }));
});

registrarComando('vif', (p, ses) => {
  const fit = exigeModelo(ses, 'vif');
  mostrarVif(ses, fit);
});

function mostrarVif(ses, fit) {
  if (fit.link !== 'identity') {
    throw new ErrorStata('estat vif solo va después de regress', 301,
      'La multicolinealidad se revisa en la regresión lineal. Si tu modelo es logit, corre la misma especificación con <code>regress</code> solo para mirar los VIF.');
  }
  const v = M.vif(fit.X, fit.names);
  ses.txt(F.tablaSimple(['Variable', 'VIF', '1/VIF'],
    v.sort((a, b) => b.vif - a.vif).map((r) => [r.name, r.vif.toFixed(2), r.tolerance.toFixed(6)]),
    ['i', 'd', 'd']));
  const medio = v.reduce((a, r) => a + r.vif, 0) / v.length;
  ses.txt(`\n    VIF medio ${medio.toFixed(2)}`);
  ses.profe(Prof.interpretarPrueba('vif', { filas: v, medio }, { ds: ses.ds, fit }));
}

registrarComando('estat', (p, ses) => {
  const sub = (p.tokens[0] || '').toLowerCase();
  const fit = exigeModelo(ses, 'estat');

  if (sub === 'vif') { mostrarVif(ses, fit); return; }

  if (sub === 'hettest') {
    if (fit.link !== 'identity') throw new ErrorStata('estat hettest solo va después de regress', 301, null);
    const r = M.breuschPagan(fit, { rhs: !!p.opciones.rhs });
    ses.txt('Prueba de Breusch-Pagan de heterocedasticidad');
    ses.txt(`Hipótesis nula: la varianza del error es constante`);
    ses.txt(`Variables: ${p.opciones.rhs ? 'todas las explicativas' : 'valores ajustados de ' + fit.depvar}`);
    ses.txt('');
    ses.txt(`         chi2(${r.df})  =  ${r.chi2.toFixed(2)}`);
    ses.txt(`       Prob > chi2  =  ${r.p.toFixed(4)}`);
    ses.profe(Prof.interpretarPrueba('hettest', r, { ds: ses.ds, fit }));
    return;
  }

  if (sub === 'imtest') {
    if (fit.link !== 'identity') throw new ErrorStata('estat imtest solo va después de regress', 301, null);
    const r = M.whiteTest(fit);
    ses.txt('Prueba de White de heterocedasticidad');
    ses.txt(`Hipótesis nula: varianza constante (homocedasticidad)`);
    ses.txt('');
    ses.txt(`         chi2(${r.df})  =  ${r.chi2.toFixed(2)}`);
    ses.txt(`       Prob > chi2  =  ${r.p.toFixed(4)}`);
    ses.profe(Prof.interpretarPrueba('white', r, { ds: ses.ds, fit }));
    return;
  }

  if (sub === 'ovtest') {
    if (fit.link !== 'identity') throw new ErrorStata('estat ovtest solo va después de regress', 301, null);
    const r = M.resetTest(fit);
    if (r.error || isNaN(r.F)) {
      throw new ErrorStata('no se pudo calcular la prueba RESET', 198,
        'Las potencias de los valores ajustados salen casi idénticas entre sí, así que la prueba no se puede estimar. Pasa cuando el modelo tiene muy pocas variables o predice un rango muy estrecho. Revisa la forma funcional a ojo con <code>rvfplot</code>.');
    }
    ses.txt('Prueba RESET de Ramsey de variables omitidas');
    ses.txt('Hipótesis nula: el modelo no tiene variables omitidas ni forma funcional equivocada');
    ses.txt(`Potencias de los valores ajustados usadas: ${r.potencias.join(', ')}`);
    ses.txt('');
    ses.txt(`       F(${r.df1}, ${r.df2}) =   ${r.F.toFixed(2)}`);
    ses.txt(`            Prob > F =   ${r.p.toFixed(4)}`);
    if (r.reducida) {
      ses.aviso(`Normalmente esta prueba usa los cuadrados, cubos y cuartas potencias del valor ajustado. Aquí solo se pudo usar ${r.potencias.join(' y ')}: las demás salían casi idénticas entre sí y el cálculo no se sostenía. El resultado sigue siendo válido, solo con menos grados de libertad.`);
    }
    ses.profe(Prof.interpretarPrueba('ovtest', r, { ds: ses.ds, fit }));
    return;
  }

  if (sub === 'classification' || sub === 'class') {
    if (!['logit', 'probit'].includes(fit.link)) throw new ErrorStata('estat classification va después de logit o probit', 301, null);
    const corte = p.opciones.cutoff ? Number(p.opciones.cutoff) : 0.5;
    const t = M.classificationTable(fit.y, fit.pred, corte);
    ses.txt(`Tabla de clasificación, punto de corte = ${corte}`);
    ses.txt('');
    ses.txt('              |      Verdadero      |');
    ses.txt('  Clasificado |     Sí        No    |  Total');
    ses.txt('  ------------+---------------------+--------');
    ses.txt(`       Sí     | ${padI(t.tp, 7)} ${padI(t.fp, 9)}   | ${padI(t.tp + t.fp, 7)}`);
    ses.txt(`       No     | ${padI(t.fn, 7)} ${padI(t.tn, 9)}   | ${padI(t.fn + t.tn, 7)}`);
    ses.txt('  ------------+---------------------+--------');
    ses.txt(`      Total   | ${padI(t.tp + t.fn, 7)} ${padI(t.fp + t.tn, 9)}   | ${padI(t.N, 7)}`);
    ses.txt('');
    ses.txt(`  Sensibilidad  (bien detectados entre los que SÍ)   ${(t.sensitivity * 100).toFixed(2)}%`);
    ses.txt(`  Especificidad (bien detectados entre los que NO)   ${(t.specificity * 100).toFixed(2)}%`);
    ses.txt(`  Valor predictivo positivo                          ${(t.ppv * 100).toFixed(2)}%`);
    ses.txt(`  Valor predictivo negativo                          ${(t.npv * 100).toFixed(2)}%`);
    ses.txt(`  ------------------------------------------------------------`);
    ses.txt(`  Correctamente clasificados                         ${(t.correct * 100).toFixed(2)}%`);
    ses.profe(Prof.interpretarPrueba('clasificacion', t, { ds: ses.ds, fit }));
    return;
  }

  if (sub === 'gof') {
    if (!['logit', 'probit'].includes(fit.link)) throw new ErrorStata('estat gof va después de logit o probit', 301, null);
    const g = p.opciones.group ? Number(p.opciones.group) : 10;
    const r = M.hosmerLemeshow(fit.y, fit.pred, g);
    ses.txt(`Prueba de bondad de ajuste de Hosmer-Lemeshow (${g} grupos)`);
    ses.txt('');
    ses.txt(`  Número de obs   = ${fit.N}`);
    ses.txt(`  chi2(${r.df})       = ${r.chi2.toFixed(2)}`);
    ses.txt(`  Prob > chi2     = ${r.p.toFixed(4)}`);
    ses.profe(Prof.interpretarPrueba('gof', r, { ds: ses.ds, fit }));
    return;
  }

  if (sub === 'summarize' || sub === 'sum') {
    const filas = fit.names.map((nm, j) => {
      const col = fit.X.map((f) => f[j]);
      const m = col.reduce((a, b) => a + b, 0) / col.length;
      const sd = Math.sqrt(col.reduce((a, b) => a + (b - m) ** 2, 0) / (col.length - 1));
      return { nombre: nm, n: col.length, media: m, sd, min: Math.min(...col), max: Math.max(...col) };
    });
    filas.unshift({
      nombre: fit.depvar, n: fit.N,
      media: fit.y.reduce((a, b) => a + b, 0) / fit.N,
      sd: Math.sqrt(fit.y.reduce((a, b) => a + (b - fit.y.reduce((x, z) => x + z, 0) / fit.N) ** 2, 0) / (fit.N - 1)),
      min: Math.min(...fit.y), max: Math.max(...fit.y),
    });
    ses.txt('Estadísticos de la muestra que usó el modelo');
    ses.txt(F.tablaSummarize(filas));
    return;
  }

  throw new ErrorStata(`no reconozco "estat ${sub}"`, 198,
    'Las que puedes usar:<br>· <code>estat vif</code> — multicolinealidad<br>· <code>estat hettest</code> — heterocedasticidad<br>· <code>estat imtest, white</code> — prueba de White<br>· <code>estat ovtest</code> — forma funcional<br>· <code>estat classification</code> — sensibilidad y especificidad<br>· <code>estat gof</code> — bondad de ajuste<br>· <code>estat summarize</code> — descriptivas de la muestra usada');
});

// ------------------------------------------------------------------ gráficos de postestimación

registrarComando('rvfplot', (p, ses) => {
  const fit = exigeModelo(ses, 'rvfplot');
  if (fit.link !== 'identity') throw new ErrorStata('rvfplot va después de regress', 301, null);
  ses.svg(G.rvfplot(fit.yhat, fit.resid, {
    title: 'Residuos contra valores ajustados',
    xlabel: `${fit.depvar} ajustado`, ylabel: 'Residuo',
  }), 'rvfplot');
  ses.profeTexto('Cómo se lee este gráfico', [
    { tono: 'info', texto: 'Lo que quieres ver es una <strong>nube pareja</strong>, del mismo grosor de izquierda a derecha y centrada en la línea del cero.' },
    { tono: 'ojo', texto: 'Si la nube se abre como un embudo (más ancha a un lado), hay <strong>heterocedasticidad</strong>: agrega <code>robust</code> al comando.' },
    { tono: 'ojo', texto: 'Si la nube dibuja una curva (una U o una U al revés), a tu modelo le falta <strong>forma funcional</strong>: prueba metiendo el término al cuadrado o pasando a logaritmos.' },
  ]);
});

registrarComando('qnorm', (p, ses) => {
  exigeDatos(ses);
  let vals;
  let titulo;
  if (p.tokens[0]) {
    if (!ses.ds.existe(p.tokens[0])) throw ses.ds.errorVariable(p.tokens[0]);
    vals = ses.muestra(p).map((i) => ses.ds.cols[p.tokens[0]][i]).filter((v) => !esNulo(v));
    titulo = `Normalidad de ${p.tokens[0]}`;
  } else {
    const fit = exigeModelo(ses, 'qnorm');
    vals = fit.resid;
    titulo = 'Normalidad de los residuos';
  }
  ses.svg(G.qnormPlot(vals, { title: titulo, xlabel: 'Normal teórica', ylabel: 'Datos observados' }), 'qnorm');
  const sk = M.sktest(vals);
  ses.profeTexto('Qué mirar aquí', [
    { tono: 'info', texto: 'Si los puntos siguen la línea diagonal, los datos se parecen a una campana normal. Si se despegan en los extremos, hay colas más largas de lo normal.' },
    { tono: sk.p < 0.05 ? 'ojo' : 'ok', texto: `La prueba formal (sktest) da p = ${fmtP(sk.p)}: ${sk.p < 0.05 ? 'se rechaza la normalidad. Con muestras grandes esto casi siempre pasa y <strong>no</strong> es grave: lo que importa de verdad para los valores p es tener bastantes observaciones, no que los residuos sean perfectamente normales.' : 'no se rechaza la normalidad.'}` },
  ]);
});

registrarComando('lroc', (p, ses) => {
  const fit = exigeModelo(ses, 'lroc');
  if (!['logit', 'probit'].includes(fit.link)) throw new ErrorStata('lroc va después de logit o probit', 301, null);
  const r = M.rocPoints(fit.y, fit.pred);
  ses.txt(`Regresión logística: número de obs = ${fit.N}`);
  ses.txt(`Área bajo la curva ROC = ${r.auc.toFixed(4)}   (error estándar ${r.seAuc.toFixed(4)})`);
  ses.svg(G.rocCurve(r.points, r.auc, {
    title: `Curva ROC · ${fit.depvar}`,
    xlabel: '1 − especificidad (falsos positivos)', ylabel: 'Sensibilidad (verdaderos positivos)',
  }), 'lroc');
  ses.profe(Prof.interpretarPrueba('roc', r, { ds: ses.ds, fit }));
});

registrarComando('lsens', (p, ses) => {
  const fit = exigeModelo(ses, 'lsens');
  if (!['logit', 'probit'].includes(fit.link)) throw new ErrorStata('lsens va después de logit o probit', 301, null);
  const curva = M.sensSpecCurve(fit.y, fit.pred);
  ses.svg(G.sensSpecPlot(curva, {
    title: 'Sensibilidad y especificidad según el punto de corte',
    xlabel: 'Punto de corte de la probabilidad', ylabel: 'Sensibilidad / Especificidad',
  }), 'lsens');
  let mejor = curva[0], mejorSuma = -1;
  for (const c of curva) {
    const s = c.sens + c.spec;
    if (isFinite(s) && s > mejorSuma) { mejorSuma = s; mejor = c; }
  }
  ses.profeTexto('Para qué sirve este gráfico', [
    { tono: 'info', texto: 'Las dos líneas se cruzan: mientras más alto pones el corte, atrapas menos casos positivos (baja la sensibilidad) pero te equivocas menos con los negativos (sube la especificidad). No existe un corte "correcto": depende de qué error te duele más.' },
    { tono: 'info', texto: `Si los dos errores te importan igual, el corte que mejor equilibra ambas es alrededor de <strong>${mejor.cut.toFixed(2)}</strong> (sensibilidad ${(mejor.sens * 100).toFixed(1)}%, especificidad ${(mejor.spec * 100).toFixed(1)}%).` },
    { tono: 'ojo', texto: 'Ejemplo para decidir: si estás detectando quién necesita ayuda social, prefieres <strong>sensibilidad alta</strong> (mejor incluir de más que dejar a alguien fuera). Si estás dando un crédito, prefieres <strong>especificidad alta</strong>.' },
  ]);
});

registrarComando('marginsplot', (p, ses) => {
  const ame = ses.ultimosMargins;
  if (!ame) throw new ErrorStata('primero hay que correr margins', 301,
    'Se usa así:<br><code>logit formal educ exper mujer</code><br><code>margins, dydx(*)</code><br><code>marginsplot</code>');
  ses.svg(G.marginsPlot(ame.names.map((nm, i) => ({
    label: nm, est: ame.dydx[i], lo: ame.ci[i][0], hi: ame.ci[i][1],
  })), { title: 'Efectos marginales promedio', xlabel: 'Cambio en la probabilidad' }), 'marginsplot');
  ses.profeTexto('Cómo se lee', [
    { tono: 'info', texto: 'Cada punto es el efecto de una variable y la línea es su intervalo de confianza. <strong>Si la línea cruza el cero, esa variable no es significativa.</strong>' },
  ]);
});

registrarComando('estimates', (p, ses) => {
  const sub = (p.tokens[0] || '').toLowerCase();
  if (sub.startsWith('sto')) {
    const nm = p.tokens[1];
    if (!nm) throw new ErrorStata('falta el nombre', 100, 'Se escribe: <code>estimates store modelo1</code>');
    ses.modelosGuardados[nm] = exigeModelo(ses, 'estimates store');
    ses.ok(`Modelo guardado como <code>${nm}</code>. Compáralo después con <code>estimates table modelo1 modelo2</code>.`);
    return;
  }
  if (sub.startsWith('tab')) {
    const nombres = p.tokens.slice(1).filter((n) => ses.modelosGuardados[n]);
    if (!nombres.length) throw new ErrorStata('no hay modelos guardados con esos nombres', 111,
      `Guardados: ${Object.keys(ses.modelosGuardados).join(', ') || '(ninguno)'}`);
    const todas = [];
    for (const n of nombres) for (const v of ses.modelosGuardados[n].names) if (!todas.includes(v)) todas.push(v);
    const filas = [];
    for (const v of todas) {
      const fila = [v];
      for (const n of nombres) {
        const f = ses.modelosGuardados[n];
        const j = f.names.indexOf(v);
        if (j < 0) { fila.push(''); continue; }
        const estrellas = f.p[j] < 0.01 ? '***' : f.p[j] < 0.05 ? '**' : f.p[j] < 0.1 ? '*' : '';
        fila.push(`${f.b[j].toFixed(4)}${estrellas}`);
      }
      filas.push(fila);
    }
    filas.push(['N', ...nombres.map((n) => String(ses.modelosGuardados[n].N))]);
    filas.push(['R2', ...nombres.map((n) => (ses.modelosGuardados[n].r2 !== undefined && !isNaN(ses.modelosGuardados[n].r2) ? ses.modelosGuardados[n].r2.toFixed(4) : ''))]);
    ses.txt(F.tablaSimple(['Variable', ...nombres], filas, ['i', ...nombres.map(() => 'd')]));
    ses.txt('\n  * p<0.10   ** p<0.05   *** p<0.01');
    return;
  }
  throw new ErrorStata(`no reconozco "estimates ${sub}"`, 198,
    '· <code>estimates store nombre</code> guarda el modelo<br>· <code>estimates table m1 m2</code> los pone lado a lado');
});

// ------------------------------------------------------------------ normalidad

function pruebaNormalidad(p, ses, cual) {
  exigeDatos(ses);
  let vals, nombre;
  if (p.tokens.length) {
    nombre = p.tokens[0];
    if (!ses.ds.existe(nombre)) throw ses.ds.errorVariable(nombre);
    vals = ses.muestra(p).map((i) => ses.ds.cols[nombre][i]).filter((v) => !esNulo(v));
  } else {
    const fit = exigeModelo(ses, cual);
    if (!fit.resid) throw new ErrorStata(`${cual} necesita una variable`, 100,
      `Guarda primero los residuos: <code>predict u, resid</code> y después <code>${cual} u</code>.`);
    vals = fit.resid;
    nombre = 'residuos';
  }
  if (cual === 'swilk') {
    const r = M.shapiroWilk(vals);
    if (r.error) throw new ErrorStata(r.error, 198, null);
    ses.txt('Prueba de normalidad de Shapiro-Wilk');
    ses.txt('Hipótesis nula: los datos vienen de una distribución normal');
    ses.txt('');
    ses.txt(F.tablaSimple(['Variable', 'Obs', 'W', 'z', 'Prob>z'],
      [[nombre, r.N, r.W.toFixed(5), r.z.toFixed(3), fmtP(r.p)]], ['i', 'd', 'd', 'd', 'd']));
    ses.profe(Prof.interpretarPrueba('normalidad', { ...r, prueba: 'Shapiro-Wilk', N: r.N }, { ds: ses.ds }));
  } else {
    const r = M.sktest(vals);
    if (r.error) throw new ErrorStata(r.error, 198, null);
    ses.txt('Prueba de normalidad por asimetría y curtosis');
    ses.txt('Hipótesis nula: los datos vienen de una distribución normal');
    ses.txt('');
    ses.txt(F.tablaSimple(['Variable', 'Obs', 'Pr(asimetría)', 'Pr(curtosis)', 'chi2(2)', 'Prob>chi2'],
      [[nombre, r.N, fmtP(r.pSkew), fmtP(r.pKurt), r.chi2.toFixed(2), fmtP(r.p)]],
      ['i', 'd', 'd', 'd', 'd', 'd']));
    ses.profe(Prof.interpretarPrueba('normalidad', { ...r, prueba: 'asimetría y curtosis' }, { ds: ses.ds }));
  }
}
registrarComando('swilk', (p, ses) => pruebaNormalidad(p, ses, 'swilk'));
registrarComando('sktest', (p, ses) => pruebaNormalidad(p, ses, 'sktest'));

// ------------------------------------------------------------------ nlcom

registrarComando('nlcom', (p, ses) => {
  const fit = exigeModelo(ses, 'nlcom');
  let txt = p.cuerpo.trim();
  if (!txt) throw new ErrorStata('nlcom necesita una expresión', 100,
    'Por ejemplo:<br>· punto de giro de un cuadrático: <code>nlcom -_b[exper]/(2*_b[exper2])</code><br>· efecto exacto de una dummy en un modelo log: <code>nlcom (exp(_b[mujer]) - 1)*100</code>');
  // permite "nombre: expresión"
  let etiqueta = '_nl_1';
  const mEt = txt.match(/^\(?\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\s\S]+?)\)?$/);
  if (mEt && txt.indexOf(':') < txt.indexOf('_b[')) { etiqueta = mEt[1]; txt = mEt[2]; }
  txt = txt.replace(/^\((.*)\)$/s, '$1').trim();

  // traduce _b[nombre] a b[i] y comprueba que las variables existan
  const usados = [];
  const jsExpr = txt.replace(/_b\[\s*([^\]]+?)\s*\]/g, (m0, nm) => {
    const j = fit.names.indexOf(nm.trim());
    if (j < 0) {
      const sug = masParecido(nm.trim(), fit.names);
      throw new ErrorStata(`${nm.trim()} no está en el modelo`, 111,
        sug ? `¿Quisiste decir <code>_b[${sug}]</code>?` : `Coeficientes disponibles: ${fit.names.join(', ')}`);
    }
    usados.push(nm.trim());
    return `b[${j}]`;
  });
  if (!usados.length) throw new ErrorStata('la expresión no usa ningún coeficiente', 198,
    'Los coeficientes se escriben <code>_b[nombre]</code>. Por ejemplo: <code>nlcom _b[educ]/_b[exper]</code>');
  if (/[^0-9b\[\]()+\-*/.,\s]|[a-zA-Z](?!\w*\s*\()/.test(jsExpr.replace(/\b(exp|ln|log|sqrt|abs)\b/g, ''))) {
    // se permite solo aritmética y unas pocas funciones
  }
  let fn;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function('b', 'Math', `"use strict";
      const exp=Math.exp, ln=Math.log, log=Math.log, sqrt=Math.sqrt, abs=Math.abs;
      return (${jsExpr});`);
  } catch {
    throw new ErrorStata('no entiendo la expresión', 198,
      'Usa solo sumas, restas, multiplicaciones, divisiones, paréntesis y las funciones <code>exp()</code>, <code>ln()</code>, <code>sqrt()</code>.');
  }
  const r = M.nlcom(fit, (b) => fn(b, Math), { level: nivelDe(p) });
  ses.txt(`       ${etiqueta}:  ${txt}`);
  ses.txt('');
  ses.coef({
    depvar: fit.depvar, names: [etiqueta], b: [r.est], se: [r.se], stat: [r.stat],
    statName: r.statName, p: [r.p], ci: [r.ci], level: r.level, omitted: [],
  }, { etiquetaCoef: 'Coef.' });
  ses.profe(Prof.interpretarPrueba('nlcom', { ...r, expresion: txt, usados }, { ds: ses.ds, fit }));
});

// ------------------------------------------------------------------ pwcompare

registrarComando('pwcompare', (p, ses) => {
  const fit = exigeModelo(ses, 'pwcompare');
  const pedido = (p.tokens[0] || '').replace(/^i\./, '');
  if (!pedido) throw new ErrorStata('pwcompare necesita un factor', 100,
    'Por ejemplo: <code>pwcompare tamano, mcompare(bonferroni) effects</code>');
  const re = new RegExp(`^(\\d+)\\.${pedido}$`);
  const indices = [], niveles = [];
  fit.names.forEach((nm, j) => {
    const m = nm.match(re);
    if (m) { indices.push(j); niveles.push(ses.ds.etiquetaDe(pedido, Number(m[1])) || `${pedido}=${m[1]}`); }
  });
  if (!indices.length) throw new ErrorStata(`no encuentro ${pedido} en el modelo`, 111,
    `El modelo tiene: ${fit.names.join(', ')}. ¿Lo corriste con <code>i.${pedido}</code>?`);
  const pieza = (fit.piezas || []).find((x) => x.nombre === pedido);
  const etBase = pieza ? (ses.ds.etiquetaDe(pedido, pieza.base) || `${pedido}=${pieza.base}`) : 'grupo base';
  const r = M.comparacionesPares(fit, indices, { base: etBase, niveles });

  ses.txt(`Comparaciones por pares de ${pedido}, con corrección de Bonferroni`);
  ses.txt(`(${r.nComparaciones} comparaciones; cada valor p ya viene multiplicado por ${r.nComparaciones})`);
  ses.txt('');
  ses.txt(F.tablaSimple(['Comparación', 'Diferencia', 'Err. est.', fit.statName, 'p (Bonf.)'],
    r.pares.map((x) => [`${x.b} vs ${x.a}`, fmtG(x.dif, 6), fmtG(x.se, 5), x.t.toFixed(2), fmtP(x.p)]),
    ['i', 'd', 'd', 'd', 'd']));
  ses.profe(Prof.interpretarPrueba('pwcompare', r, { ds: ses.ds, fit, factor: pedido }));
});

// ------------------------------------------------------------------ mlogtest

registrarComando('mlogtest', (p, ses) => {
  const fit = exigeModelo(ses, 'mlogtest');
  if (fit.cmd !== 'mlogit') throw new ErrorStata('mlogtest va después de mlogit', 301,
    'Corre primero: <code>mlogit situacion educ exper mujer, base(1)</code>');
  const quiere = (k) => p.opciones[k] !== undefined;
  const todo = !quiere('hausman') && !quiere('smhsiao') && !quiere('combine') && !quiere('lr') && !quiere('wald');

  if (quiere('hausman') || todo) {
    const r = M.hausmanIIA(fit.X, fit.y, { names: fit.xnames, base: fit.base });
    ses.txt('Prueba de Hausman-McFadden del supuesto IIA');
    ses.txt('Hipótesis nula: las probabilidades relativas NO dependen de las otras alternativas');
    ses.txt('');
    ses.txt(F.tablaSimple(['Categoría omitida', 'chi2', 'gl', 'P>chi2', 'Evidencia'],
      r.filas.map((f) => {
        const et = ses.ds.etiquetaDe(fit.depvar, f.omitida) || f.omitida;
        return [et, f.negativo ? '—' : f.chi2.toFixed(3), f.df,
          f.negativo ? '—' : fmtP(f.p),
          f.negativo ? 'chi2 negativo' : (f.p > 0.05 ? 'a favor de Ho' : 'contra Ho')];
      }), ['i', 'd', 'd', 'd', 'i']));
    const algunNeg = r.filas.some((f) => f.negativo);
    const rechaza = r.filas.some((f) => !f.negativo && f.p < 0.05);
    ses.profe(Prof.interpretarPrueba('iia', { filas: r.filas, rechaza, algunNeg }, { ds: ses.ds, fit }));
  }
  if (quiere('combine') || todo) {
    const c = M.combinarCategorias(fit);
    ses.txt('');
    ses.txt('¿Se pueden fusionar categorías? (prueba de Wald)');
    ses.txt('Hipótesis nula: todos los coeficientes de esa ecuación son cero, o sea que');
    ses.txt('las dos categorías son indistinguibles y podrían tratarse como una sola.');
    ses.txt('');
    ses.txt(F.tablaSimple(['Categorías', 'chi2', 'gl', 'P>chi2', '¿Fusionar?'],
      c.map((x) => {
        const ea = ses.ds.etiquetaDe(fit.depvar, x.a) || x.a;
        const eb = ses.ds.etiquetaDe(fit.depvar, x.b) || x.b;
        return [`${ea} — ${eb}`, x.chi2.toFixed(2), x.df, fmtP(x.p), x.p > 0.05 ? 'sí se podrían' : 'no, son distintas'];
      }), ['i', 'd', 'd', 'd', 'i']));
  }
  if (quiere('smhsiao')) {
    ses.aviso('La prueba de Small-Hsiao usa una partición aleatoria de la muestra, así que da un resultado distinto cada vez que se corre. Por eso este simulador no la incluye: usa la de Hausman-McFadden (<code>mlogtest, hausman</code>), que es determinista.');
  }
});

// ------------------------------------------------------------------ esttab

registrarComando('esttab', (p, ses) => {
  const nombres = p.tokens.filter((n) => ses.modelosGuardados[n]);
  if (!nombres.length) throw new ErrorStata('no hay modelos guardados con esos nombres', 111,
    `Guárdalos primero con <code>estimates store nombre</code>. Guardados: ${Object.keys(ses.modelosGuardados).join(', ') || '(ninguno)'}`);
  const conSE = !!p.opciones.se;
  const estrellas = p.opciones.star && p.opciones.star !== true
    ? [...String(p.opciones.star).matchAll(/(\*+)\s*([\d.]+)/g)].map((m) => ({ s: m[1], p: Number(m[2]) })).sort((a, b) => b.p - a.p)
    : [{ s: '*', p: 0.10 }, { s: '**', p: 0.05 }, { s: '***', p: 0.01 }];

  const todas = [];
  for (const n of nombres) for (const v of ses.modelosGuardados[n].names) if (!todas.includes(v)) todas.push(v);
  const filas = [];
  for (const v of todas) {
    const fila = [v];
    const filaSE = [''];
    for (const n of nombres) {
      const f = ses.modelosGuardados[n];
      const j = f.names.indexOf(v);
      if (j < 0) { fila.push(''); filaSE.push(''); continue; }
      let est = '';
      for (const e of estrellas) if (f.p[j] < e.p) { est = e.s; }
      fila.push(fmtG(f.b[j], 5) + est);
      filaSE.push(conSE ? `(${fmtG(f.se[j], 5)})` : '');
    }
    filas.push(fila);
    if (conSE) filas.push(filaSE);
  }
  filas.push(['N', ...nombres.map((n) => String(ses.modelosGuardados[n].N))]);
  filas.push(['R2', ...nombres.map((n) => {
    const f = ses.modelosGuardados[n];
    if (f.r2 !== undefined && !isNaN(f.r2)) return f.r2.toFixed(4);
    if (f.r2_p !== undefined && !isNaN(f.r2_p)) return f.r2_p.toFixed(4) + ' (pseudo)';
    return '';
  })]);
  ses.txt(F.tablaSimple(['', ...nombres], filas, ['i', ...nombres.map(() => 'd')]));
  ses.txt('\n  ' + estrellas.slice().reverse().map((e) => `${e.s} p<${e.p}`).join('   '));
  ses.profeTexto('Esta es la tabla que va en tu trabajo', [
    { tono: 'info', texto: 'Poner los modelos lado a lado sirve para mostrar que tu resultado <strong>no depende</strong> de qué controles metiste. Si el coeficiente que te interesa se mantiene parecido en todas las columnas, tu hallazgo es sólido.' },
    { tono: 'ojo', texto: 'Si comparas un MPL con efectos marginales de logit y probit, recuerda que <strong>solo son comparables los efectos marginales</strong>, nunca los coeficientes crudos del logit contra los del MPL.' },
  ]);
});

registrarComando('lincom', (p, ses) => {
  const fit = exigeModelo(ses, 'lincom');
  const txt = p.cuerpo.trim();
  const fila = new Array(fit.b.length).fill(0);
  const term = txt.replace(/\s*-\s*/g, ' + -').split('+').map((s) => s.trim()).filter(Boolean);
  for (const t of term) {
    const m = t.match(/^(-?\d*\.?\d*)\s*\*?\s*([A-Za-z_][A-Za-z0-9_.#]*)$/);
    if (!m) throw new ErrorStata(`no entiendo "${t}"`, 198, 'Por ejemplo: <code>lincom educ + exper</code>');
    const coef = m[1] === '' || m[1] === '-' ? (m[1] === '-' ? -1 : 1) : Number(m[1]);
    const j = fit.names.indexOf(m[2]);
    if (j < 0) throw new ErrorStata(`${m[2]} no está en el modelo`, 111, `Variables: ${fit.names.join(', ')}`);
    fila[j] = coef;
  }
  const est = fila.reduce((a, v, j) => a + v * fit.b[j], 0);
  let varianza = 0;
  for (let a = 0; a < fila.length; a++) for (let b = 0; b < fila.length; b++) varianza += fila[a] * fit.V[a][b] * fila[b];
  const se = Math.sqrt(Math.max(0, varianza));
  const r = M.testLineal(fit, [fila], [0]);
  ses.txt(` (1)  ${txt}`);
  ses.txt('');
  ses.coef({
    depvar: fit.depvar, names: ['(1)'], b: [est], se: [se],
    stat: [est / se], statName: fit.statName, p: [r.p],
    ci: [[est - 1.96 * se, est + 1.96 * se]], level: 95, omitted: [],
  }, { etiquetaCoef: 'Coef.' });
});

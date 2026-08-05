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
  const idx = ses.muestra(p).filter((i) =>
    !esNulo(ses.ds.cols[dep][i]) && factores.every((f) => !esNulo(ses.ds.cols[f.replace(/^c\./, '')][i])));
  const y = idx.map((i) => ses.ds.cols[dep][i]);
  const terms = factores.map((f) => {
    const cont = f.startsWith('c.');
    const nm = f.replace(/^c\./, '');
    if (!ses.ds.existe(nm)) throw ses.ds.errorVariable(nm);
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
});

// ------------------------------------------------------------------ multinomial y ordenado

function tablaEcuaciones(ses, fit) {
  for (const eq of fit.eqs) {
    const et = ses.ds.etiquetaDe(fit.depvar, eq.nivel);
    ses.txt('');
    ses.txt(`${et || eq.name}  (comparado con: ${ses.ds.etiquetaDe(fit.depvar, fit.base) || fit.base})`);
    ses.coef({
      depvar: fit.depvar, names: eq.names, b: eq.b, se: eq.se, stat: eq.stat,
      statName: 'z', p: eq.p, ci: eq.ci, level: fit.level, omitted: [],
    }, { etiquetaCoef: 'Coef.' });
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
  tablaEcuaciones(ses, fit);
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

registrarComando('margins', (p, ses) => {
  const fit = exigeModelo(ses, 'margins');
  const pideDydx = p.opciones.dydx !== undefined;
  if (!pideDydx) {
    ses.aviso('Casi siempre lo que se quiere es <code>margins, dydx(*)</code>: eso traduce los coeficientes a puntos de probabilidad (o a unidades de la dependiente). Lo corro así.');
  }
  if (['mlogit', 'mprobit', 'ologit', 'oprobit'].includes(fit.cmd)) {
    throw new ErrorStata(`margins después de ${fit.cmd} todavía no está en el simulador`, 199,
      'Para estos modelos, interpreta el signo y la significancia de cada comparación contra la categoría base, que es lo que se pide en el curso.');
  }
  const ame = M.marginsDydx(fit, {
    atMeans: !!p.opciones.atmeans,
    factorCols: fit.idxFactor || [],
    level: nivelDe(p),
  });
  ses.txt(ame.atMeans ? 'Efectos marginales en las medias' : 'Efectos marginales promedio');
  ses.txt(`Modelo: ${fit.cmd}   Número de obs = ${ame.N}`);
  ses.txt(`Expresión: probabilidad ajustada de ${fit.depvar}`);
  ses.coef({
    depvar: fit.depvar, names: ame.names, b: ame.dydx, se: ame.se, stat: ame.stat,
    statName: 'z', p: ame.p, ci: ame.ci, level: ame.level, omitted: [],
  }, { etiquetaCoef: 'dy/dx', esMargins: true, link: fit.link });
  ses.profe(Prof.interpretarMargins(ame, { ds: ses.ds, fit }));
  ses.ultimosMargins = ame;
});

registrarComando('test', (p, ses) => {
  const fit = exigeModelo(ses, 'test');
  const txt = p.cuerpo.trim();
  if (!txt) throw new ErrorStata('test necesita una hipótesis', 100,
    'Por ejemplo:<br>· <code>test educ = 0</code><br>· <code>test educ exper</code> (las dos a la vez)<br>· <code>test lnhoras + lnk = 1</code>');

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
    ses.txt('Prueba RESET de Ramsey de variables omitidas');
    ses.txt('Hipótesis nula: el modelo no tiene variables omitidas ni forma funcional equivocada');
    ses.txt('');
    ses.txt(`       F(${r.df1}, ${r.df2}) =   ${r.F.toFixed(2)}`);
    ses.txt(`            Prob > F =   ${r.p.toFixed(4)}`);
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

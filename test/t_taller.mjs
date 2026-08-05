// Corre los bloques de código EXACTOS del documento "Taller de modelos econométricos"
// (econometria_interactiva.html) para comprobar que el simulador los aguanta todos.

import { Sesion, ejecutarLinea } from '../js/core/comandos.js';

let ok = 0, fallas = 0;
const fallidas = [];

function texto(bloques) {
  return bloques.map((b) => {
    if (b.t === 'txt') return b.s;
    if (b.t === 'ok' || b.t === 'aviso') return b.s;
    if (b.t === 'err') return `ERROR(${b.codigo}): ${b.mensaje}`;
    if (b.t === 'coef') return b.fit.names.map((n, i) => `${n}=${b.fit.b[i]}`).join(' ');
    if (b.t === 'profe') return [b.bloque.titulo, b.bloque.resumen,
      ...(b.bloque.items || []).map((x) => x.texto)].filter(Boolean).join(' ');
    if (b.t === 'svg') return '[SVG]';
    return '';
  }).join('\n');
}

const ses = new Sesion();
function corre(linea, { debeFallar = false, contiene = null } = {}) {
  const b = ejecutarLinea(linea, ses);
  const errs = b.filter((x) => x.t === 'err');
  const t = texto(b);
  let bien = debeFallar ? errs.length > 0 : errs.length === 0;
  if (bien && contiene) bien = t.toLowerCase().includes(contiene.toLowerCase());
  if (bien) ok++; else { fallas++; fallidas.push(`${linea}  →  ${errs.length ? errs[0].mensaje : 'no contiene "' + contiene + '"'}`); }
  console.log(`${bien ? 'OK  ' : 'FALLA'} ${linea}${!bien && errs.length ? '   ⟶ ' + errs[0].mensaje : ''}`);
  return b;
}

console.log('═══ bloque 1: abrir, filtrar, transformar, etiquetar ═══');
corre('use enemdu_eloro_2024, clear');
corre('describe');
corre('codebook ingreso educ exper mujer formal situacion');
corre('summarize ingreso educ exper horas k, detail');
corre('keep if edad >= 18 & edad <= 65 & ingreso > 0');
corre('drop if missing(educ, exper, horas)');
corre('gen lningreso = ln(ingreso)');
corre('gen lnhoras   = ln(horas)');
corre('gen lnk       = ln(k)');
corre('label define tam 1 "Micro" 2 "Pequeña" 3 "Mediana" 4 "Grande"');
corre('label values tamano tam');

console.log('\n═══ bloque 3: regresión y diagnóstico completo ═══');
corre('reg ingreso educ exper exper2 mujer horas, robust');
corre('estat vif');
corre('estat hettest');
corre('estat imtest, white');
corre('estat ovtest');
corre('predict u, resid');
corre('swilk u', { contiene: 'Shapiro' });
corre('rvfplot, yline(0)');
corre('nlcom -_b[exper]/(2*_b[exper2])', { contiene: 'punto de giro' });
corre('margins, dydx(exper) at(exper=(0(10)40))', { contiene: 'exper' });

console.log('\n═══ bloque 5: logaritmos y elasticidades ═══');
corre('reg lningreso lnhoras lnk, robust');
corre('test lnhoras + lnk = 1');
corre('lincom lnhoras + lnk');
corre('reg lningreso educ exper exper2 mujer, robust');
corre('nlcom (exp(_b[mujer]) - 1)*100', { contiene: 'Halvorsen' });

console.log('\n═══ bloque 7: ANOVA y dummies ═══');
corre('tabstat ingreso, by(tamano) stats(n mean sd)');
corre('anova ingreso tamano');
corre('oneway ingreso tamano, tabulate bonferroni', { contiene: 'Bonferroni' });
corre('robvar ingreso, by(tamano)', { contiene: 'Levene' });
corre('reg ingreso i.tamano, robust');
corre('testparm i.tamano');
corre('margins tamano', { contiene: 'ajustadas' });
corre('marginsplot');
corre('pwcompare tamano, mcompare(bonferroni) effects', { contiene: 'pares' });
corre('reg ingreso ib4.tamano, robust');
corre('anova ingreso tamano mujer tamano#mujer');
corre('reg ingreso i.tamano##i.mujer, robust');
corre('reg ingreso i.tamano c.educ, robust');

console.log('\n═══ bloque 8: MPL ═══');
corre('reg formal educ exper mujer, robust');
corre('predict phat');
corre('summarize phat');
corre('count if phat < 0 | phat > 1');
corre('histogram phat');

console.log('\n═══ bloque 9: logit, probit y comparación ═══');
corre('logit formal educ exper mujer');
corre('logit formal educ exper mujer, or');
corre('margins, dydx(*)');
corre('margins, dydx(*) atmeans');
corre('margins, at(educ=(0(3)18))', { contiene: 'Probabilidad' });
corre('marginsplot');
corre('estat class', { contiene: 'Sensibilidad' });
corre('lroc');
corre('estat gof, group(10)');
corre('linktest');
corre('probit formal educ exper mujer');
corre('margins, dydx(*)');
corre('quietly reg formal educ exper mujer, robust');
corre('estimates store MPL');
corre('quietly logit formal educ exper mujer');
corre('margins, dydx(*) post');
corre('estimates store LOGIT_AME');
corre('quietly probit formal educ exper mujer');
corre('margins, dydx(*) post');
corre('estimates store PROBIT_AME');
corre('esttab MPL LOGIT_AME PROBIT_AME, se star(* 0.10 ** 0.05 *** 0.01)', { contiene: 'LOGIT_AME' });

console.log('\n═══ bloque 11: multinomial ═══');
corre('tab situacion');
corre('mlogit situacion educ exper mujer, base(1)');
corre('mlogit situacion educ exper mujer, base(1) rrr', { contiene: 'riesgo relativo' });
corre('margins, dydx(*) predict(outcome(1))', { contiene: 'puntos de probabilidad' });
corre('margins, dydx(*) predict(outcome(2))');
corre('margins, dydx(*) predict(outcome(3))');
corre('test [2]educ [3]educ');
corre('mlogtest, hausman detail', { contiene: 'IIA' });
corre('mlogtest, combine', { contiene: 'fusionar' });
corre('mprobit situacion educ exper mujer, base(1)');

console.log('\n═══ comprobaciones de contenido ═══');
function chk(nombre, cond, extra = '') {
  if (cond) ok++; else { fallas++; fallidas.push(nombre + (extra ? ' — ' + extra : '')); }
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${nombre}${extra ? '  ' + extra : ''}`);
}

// los efectos marginales del mlogit deben sumar cero entre categorías
{
  const s2 = new Sesion();
  ejecutarLinea('use enemdu_eloro_2024, clear', s2);
  ejecutarLinea('mlogit situacion educ exper mujer, base(1)', s2);
  const sumas = {};
  for (const cat of [1, 2, 3]) {
    ejecutarLinea(`margins, dydx(*) predict(outcome(${cat}))`, s2);
    const m = s2.ultimosMargins;
    m.names.forEach((nm, i) => { sumas[nm] = (sumas[nm] || 0) + m.dydx[i]; });
  }
  const maxDesv = Math.max(...Object.values(sumas).map(Math.abs));
  chk('los efectos marginales de las 3 categorías suman cero', maxDesv < 1e-8,
    `desviación máxima = ${maxDesv.toExponential(2)}`);
}

// nlcom del punto de giro debe coincidir con el cálculo a mano
{
  const s3 = new Sesion();
  ejecutarLinea('use enemdu_eloro_2024, clear', s3);
  ejecutarLinea('reg ingreso educ exper exper2 mujer, robust', s3);
  const f = s3.ultimoModelo;
  const aMano = -f.b[f.names.indexOf('exper')] / (2 * f.b[f.names.indexOf('exper2')]);
  const b = ejecutarLinea('nlcom -_b[exper]/(2*_b[exper2])', s3);
  const coef = b.find((x) => x.t === 'coef');
  chk('nlcom coincide con el cálculo a mano', Math.abs(coef.fit.b[0] - aMano) < 1e-6,
    `nlcom=${coef.fit.b[0].toFixed(4)} aMano=${aMano.toFixed(4)}`);
  chk('el error estándar del nlcom es positivo y finito',
    coef.fit.se[0] > 0 && isFinite(coef.fit.se[0]), `se=${coef.fit.se[0].toFixed(4)}`);
}

// i.a##i.b debe generar los efectos principales Y la interacción
{
  const s4 = new Sesion();
  ejecutarLinea('use enemdu_eloro_2024, clear', s4);
  const b = ejecutarLinea('reg ingreso i.tamano##i.mujer, robust', s4);
  const coef = b.find((x) => x.t === 'coef');
  const nombres = coef.fit.names;
  chk('## crea los efectos principales de tamano', nombres.filter((n) => /^\d+\.tamano$/.test(n)).length === 3);
  chk('## crea el efecto principal de mujer', nombres.some((n) => /^1\.mujer$/.test(n)));
  chk('## crea las interacciones', nombres.filter((n) => n.includes('#')).length === 3, nombres.filter((n) => n.includes('#')).join(' '));
}

// margins at() en logit: la probabilidad debe crecer con la educación
{
  const s5 = new Sesion();
  ejecutarLinea('use enemdu_eloro_2024, clear', s5);
  ejecutarLinea('logit formal educ exper mujer', s5);
  ejecutarLinea('margins, at(educ=(0(6)18))', s5);
  const m = s5.ultimosMargins;
  const crece = m.dydx.every((v, i) => i === 0 || v >= m.dydx[i - 1]);
  chk('la probabilidad predicha crece con la educación', crece,
    m.dydx.map((v) => (v * 100).toFixed(1) + '%').join(' → '));
  chk('todas las probabilidades están entre 0 y 1', m.dydx.every((v) => v >= 0 && v <= 1));
}

// la salida no debe tener basura
{
  const s6 = new Sesion();
  const lineas = ['use enemdu_eloro_2024, clear', 'reg ingreso educ exper exper2 mujer, robust',
    'nlcom -_b[exper]/(2*_b[exper2])', 'margins, dydx(*)', 'margins tamano', 'estat vif',
    'predict u, resid', 'swilk u', 'sktest u', 'robvar ingreso, by(tamano)',
    'reg ingreso i.tamano, robust', 'pwcompare tamano', 'mlogit situacion educ mujer, base(1)',
    'mlogtest, hausman', 'margins, dydx(*) predict(outcome(2))'];
  const sucias = [];
  for (const l of lineas) {
    const t = texto(ejecutarLinea(l, s6));
    for (const mala of ['undefined', 'NaN', '[object Object]']) if (t.includes(mala)) sucias.push(`${l} → ${mala}`);
  }
  chk('ninguna salida nueva tiene undefined / NaN / [object Object]', sucias.length === 0, sucias.slice(0, 3).join(' | '));
}

console.log(`\nRESULTADO: ${ok} pruebas OK, ${fallas} fallas`);
if (fallidas.length) { console.log('\nFallidas:'); for (const f of fallidas) console.log('  - ' + f); }
process.exit(fallas ? 1 : 0);

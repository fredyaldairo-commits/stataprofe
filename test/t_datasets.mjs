// Calibración y verificación de las bases. Comprueba que las regresiones del documento
// "Econometría sin tecnicismos" salen con los números que ahí se muestran.
// Con --calibrar, además propone los parámetros corregidos por punto fijo.

import { cargar, CATALOGO, PARAMS, generarEnemdu } from '../js/data/datasets.js';
import * as M from '../js/core/models.js';

const CALIBRAR = process.argv.includes('--calibrar');
let ok = 0, fallas = 0;

function chk(nombre, valor, esperado, tol) {
  const err = Math.abs(valor - esperado);
  const bien = err <= tol;
  if (bien) ok++; else fallas++;
  console.log(`${bien ? 'OK  ' : 'FALLA'} ${nombre.padEnd(34)} obtenido=${valor.toFixed(4).padStart(11)}  objetivo=${String(esperado).padStart(9)}  ±${tol}   dif=${(valor - esperado).toFixed(4)}`);
  return valor;
}
function chkb(nombre, cond, extra = '') {
  if (cond) ok++; else fallas++;
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${nombre}${extra ? '  ' + extra : ''}`);
}

function armar(d, deps, regs) {
  const X = [], y = [];
  for (let i = 0; i < d.n; i++) {
    let bien = true;
    const fila = [];
    for (const r of regs) {
      const v = typeof r === 'function' ? r(d.data, i) : d.data[r][i];
      if (v === null || !isFinite(v)) { bien = false; break; }
      fila.push(v);
    }
    const yv = typeof deps === 'function' ? deps(d.data, i) : d.data[deps][i];
    if (!bien || yv === null || !isFinite(yv)) continue;
    fila.push(1);
    X.push(fila); y.push(yv);
  }
  return { X, y };
}

console.log('=== enemdu_eloro_2024: regresión principal ===');
const d = cargar('enemdu_eloro_2024');
chkb('número de observaciones', d.n === 3412, `n=${d.n}`);
chkb('sin faltantes en la base limpia',
  Object.values(d.data).every((c) => c.every((v) => v !== null && v !== '')), '');
chkb('ingreso siempre positivo (para poder aplicar ln)', d.data.ingreso.every((v) => v > 0),
  `min=${Math.min(...d.data.ingreso).toFixed(2)}`);
chkb('capital siempre positivo', d.data.k.every((v) => v > 0), `min=${Math.min(...d.data.k).toFixed(2)}`);

const r1 = armar(d, 'ingreso', ['educ', 'exper', 'exper2', 'mujer', 'horas']);
const f1 = M.ols(r1.X, r1.y, { names: ['educ', 'exper', 'exper2', 'mujer', 'horas', '_cons'], vce: 'robust', depvar: 'ingreso' });
const g = (nm) => f1.b[f1.names.indexOf(nm)];
chk('educ', g('educ'), 42.3, 3);
chk('exper', g('exper'), 11.6, 2);
chk('exper2', g('exper2'), -0.20, 0.06);
chk('mujer', g('mujer'), -78.5, 10);
chk('horas', g('horas'), 2.87, 0.6);
chkb('R2 entre 0.28 y 0.36', f1.r2 >= 0.28 && f1.r2 <= 0.36, `R2=${f1.r2.toFixed(4)}`);
console.log(`     media del ingreso = ${(d.data.ingreso.reduce((a, b) => a + b, 0) / d.n).toFixed(2)}`);

console.log('\n=== heterocedasticidad (necesaria para la lección) ===');
const f1s = M.ols(r1.X, r1.y, { names: ['educ', 'exper', 'exper2', 'mujer', 'horas', '_cons'] });
const bp = M.breuschPagan(f1s);
chkb('Breusch-Pagan rechaza homocedasticidad', bp.p < 0.001,
  `chi2=${bp.chi2.toFixed(1)} p=${bp.p.toExponential(2)}`);

console.log('\n=== Cobb-Douglas ===');
const r2 = armar(d, (c, i) => Math.log(c.ingreso[i]),
  [(c, i) => Math.log(c.horas[i]), (c, i) => Math.log(c.k[i])]);
const f2 = M.ols(r2.X, r2.y, { names: ['lnhoras', 'lnk', '_cons'], vce: 'robust', depvar: 'lningreso' });
chk('lnhoras (elasticidad)', f2.b[0], 0.612, 0.08);
chk('lnk (elasticidad)', f2.b[1], 0.271, 0.06);
chkb('suma < 1 (rendimientos decrecientes)', f2.b[0] + f2.b[1] < 1,
  `suma=${(f2.b[0] + f2.b[1]).toFixed(4)}`);

console.log('\n=== reg ingreso i.tamano ===');
const r3 = armar(d, 'ingreso', [
  (c, i) => (c.tamano[i] === 2 ? 1 : 0),
  (c, i) => (c.tamano[i] === 3 ? 1 : 0),
  (c, i) => (c.tamano[i] === 4 ? 1 : 0)]);
const f3 = M.ols(r3.X, r3.y, { names: ['2.tamano', '3.tamano', '4.tamano', '_cons'], vce: 'robust', depvar: 'ingreso' });
chk('empresa pequeña vs micro', f3.b[0], 83.6, 25);
chk('empresa mediana vs micro', f3.b[1], 168.9, 25);
chk('empresa grande vs micro', f3.b[2], 287.3, 25);

console.log('\n=== logit formal educ exper mujer ===');
const r4 = armar(d, 'formal', ['educ', 'exper', 'mujer']);
const f4 = M.logitFit(r4.X, r4.y, { names: ['educ', 'exper', 'mujer', '_cons'], depvar: 'formal' });
chk('educ', f4.b[0], 0.187, 0.04);
chk('mujer', f4.b[2], -0.254, 0.08);
chkb('proporción de formales razonable',
  d.data.formal.reduce((a, b) => a + b, 0) / d.n > 0.3 && d.data.formal.reduce((a, b) => a + b, 0) / d.n < 0.55,
  `formal=${(d.data.formal.reduce((a, b) => a + b, 0) / d.n * 100).toFixed(1)}%`);
const ame = M.marginsDydx(f4, {});
console.log(`     efectos marginales: educ=${(ame.dydx[0] * 100).toFixed(2)} pp   mujer=${(ame.dydx[2] * 100).toFixed(2)} pp`);

console.log('\n=== mlogit situacion educ exper mujer, base(1) ===');
const r5 = armar(d, 'situacion', ['educ', 'exper', 'mujer']);
const f5 = M.mlogitFit(r5.X, r5.y, { names: ['educ', 'exper', 'mujer', '_cons'], base: 1, depvar: 'situacion' });
const eq2 = f5.eqs.find((e) => e.nivel === 2), eq3 = f5.eqs.find((e) => e.nivel === 3);
chk('informal: educ', eq2.b[0], -0.214, 0.05);
chk('cuenta propia: educ', eq3.b[0], -0.169, 0.05);
chk('cuenta propia: mujer', eq3.b[2], 0.445, 0.12);
console.log(`     informal: mujer = ${eq2.b[2].toFixed(3)}  (p = ${eq2.p[2].toFixed(3)})`);
chkb('el coeficiente de mujer en "informal" NO es significativo al 5% (lección del documento)',
  eq2.p[2] > 0.05, `p=${eq2.p[2].toFixed(3)}`);
const rep = [1, 2, 3].map((s) => d.data.situacion.filter((v) => v === s).length);
console.log(`     reparto: formal=${rep[0]} informal=${rep[1]} cuenta propia=${rep[2]}`);
chkb('las tres categorías tienen suficientes casos', rep.every((v) => v > 300));

console.log('\n=== satisf: 5 niveles con orden ===');
const cs = [1, 2, 3, 4, 5].map((s) => d.data.satisf.filter((v) => v === s).length);
console.log(`     ${cs.map((v, i) => `${i + 1}:${v}`).join('  ')}`);
chkb('los 5 niveles están representados', cs.every((v) => v > 100));

console.log('\n=== base sin depurar ===');
const c = cargar('enemdu_eloro_2024_crudo');
chkb('tiene 14 filas de más por duplicados', c.n === 3412 + 14, `n=${c.n}`);
const noNum = c.data.ingreso_txt.filter((v) => {
  const s = String(v).trim();
  if (s === '') return true;
  const limpio = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s;
  return isNaN(Number(limpio));
}).length;
chkb('ingreso_txt trae valores no numéricos', noNum > 100, `${noNum} de ${c.n} (${(noNum / c.n * 100).toFixed(1)}%)`);
chkb('ingreso_txt trae el formato 1.234,50',
  c.data.ingreso_txt.some((v) => /^\d{1,3}(\.\d{3})+,\d{2}$/.test(v)),
  `ej: ${c.data.ingreso_txt.find((v) => /^\d{1,3}(\.\d{3})+,\d{2}$/.test(v))}`);
chkb('edad trae el código 99', c.data.edad.filter((v) => v === 99).length > 40,
  `${c.data.edad.filter((v) => v === 99).length} casos`);
chkb('educ trae el código 99', c.data.educ.filter((v) => v === 99).length > 40,
  `${c.data.educ.filter((v) => v === 99).length} casos`);
chkb('horas trae el código 999', c.data.horas.filter((v) => v === 999).length > 30,
  `${c.data.horas.filter((v) => v === 999).length} casos`);
const faltReales = ['exper', 'k', 'hijos'].reduce((a, nm) => a + c.data[nm].filter((v) => v === null).length, 0);
chkb('hay faltantes de verdad (null)', faltReales > 80, `${faltReales} celdas vacías`);
const formasSexo = new Set(c.data.sexo_txt);
chkb('sexo_txt viene inconsistente', formasSexo.size >= 8,
  `${formasSexo.size} formas distintas: ${[...formasSexo].slice(0, 6).map((v) => `"${v}"`).join(', ')}`);
chkb('satisf_txt viene en palabras', new Set(c.data.satisf_txt).size === 5,
  [...new Set(c.data.satisf_txt)].join(' / '));
chkb('provincia viene con espacios y mayúsculas mezcladas', new Set(c.data.provincia).size >= 8,
  `${new Set(c.data.provincia).size} formas`);
chkb('hay valores absurdos', c.data.edad.filter((v) => v === 250).length >= 3 &&
  c.data.ingreso_txt.filter((v) => v === '999999').length >= 3);
// duplicados exactos
const claves = new Map();
const nomsC = c.vars.map((v) => v.name);
for (let i = 0; i < c.n; i++) {
  const k = nomsC.map((nm) => String(c.data[nm][i])).join('|');
  claves.set(k, (claves.get(k) || 0) + 1);
}
const sobran = [...claves.values()].reduce((a, v) => a + v - 1, 0);
chkb('duplicates drop debería eliminar 14 filas', sobran === 14, `sobran=${sobran}`);

console.log('\n=== produccion_eloro ===');
const pe = cargar('produccion_eloro');
const r6 = armar(pe, (x, i) => Math.log(x.produccion[i]),
  [(x, i) => Math.log(x.trabajo[i]), (x, i) => Math.log(x.capital[i])]);
const f6 = M.ols(r6.X, r6.y, { names: ['lntrabajo', 'lncapital', '_cons'], vce: 'robust' });
chk('elasticidad del trabajo', f6.b[0], 0.62, 0.07);
chk('elasticidad del capital', f6.b[1], 0.33, 0.07);
const t = M.testLineal(f6, [[1, 1, 0]], [1]);
console.log(`     suma = ${(f6.b[0] + f6.b[1]).toFixed(4)}   test suma=1: F=${t.F.toFixed(2)} p=${t.p.toFixed(4)}`);

console.log('\n=== hogares_satisfaccion ===');
const h = cargar('hogares_satisfaccion');
const r7 = armar(h, 'satisfaccion', [(x, i) => Math.log(x.ingreso_hogar[i]), 'educ_jefe', 'desempleo']);
const f7 = M.ologitFit(r7.X, r7.y, { names: ['lningreso', 'educ_jefe', 'desempleo', '_cons'], depvar: 'satisfaccion' });
chkb('ologit converge', f7.converged, `iter=${f7.iterations}`);
chkb('más ingreso -> más satisfacción', f7.b[0] > 0, `b(lningreso)=${f7.b[0].toFixed(3)}`);
chkb('desempleo -> menos satisfacción', f7.b[2] < 0, `b(desempleo)=${f7.b[2].toFixed(3)}`);
chkb('4 cortes ordenados', f7.cuts.length === 4 && f7.cuts.every((cc, i) => i === 0 || cc.b > f7.cuts[i - 1].b));

console.log('\n=== auto_ec ===');
const a = cargar('auto_ec');
chkb('74 observaciones', a.n === 74, `n=${a.n}`);
chkb('precios razonables', Math.min(...a.data.precio) > 8000 && Math.max(...a.data.precio) < 50000,
  `${Math.min(...a.data.precio)} a ${Math.max(...a.data.precio)}`);

console.log('\n=== reproducibilidad ===');
const d2 = cargar('enemdu_eloro_2024');
chkb('cargar dos veces da exactamente los mismos datos',
  d2.data.ingreso.every((v, i) => v === d.data.ingreso[i]));
chkb('modificar la copia no daña el original',
  (() => { d2.data.ingreso[0] = -999; return cargar('enemdu_eloro_2024').data.ingreso[0] !== -999; })());

// -------------------------------------------------------------- calibración
if (CALIBRAR) {
  console.log('\n=== propuesta de parámetros por punto fijo ===');
  const media = d.data.ingreso.reduce((x, b) => x + b, 0) / d.n;
  const prop = {
    gEduc: PARAMS.gEduc * (42.3 / g('educ')),
    gExper: PARAMS.gExper * (11.6 / g('exper')),
    gExper2: PARAMS.gExper2 * (-0.20 / g('exper2')),
    gMujer: PARAMS.gMujer * (-78.5 / g('mujer')),
    dTamano: [0,
      Math.log(1 + (83.6 / f3.b[3])),
      Math.log(1 + (168.9 / f3.b[3])),
      Math.log(1 + (287.3 / f3.b[3]))],
    a0: PARAMS.a0 + Math.log(720 / media),
  };
  console.log(JSON.stringify(prop, null, 2));
  console.log(`media actual del ingreso: ${media.toFixed(2)}   constante de i.tamano: ${f3.b[3].toFixed(2)}`);
}

console.log(`\nRESULTADO: ${ok} pruebas OK, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);

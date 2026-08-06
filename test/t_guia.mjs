// Prueba del modo guiado: que clasifique bien cada variable de cada base
// y que el do-file que arma corra sin errores.

import { Sesion, ejecutarDoFile, ejecutarLinea } from '../js/core/comandos.js';
import { clasificarY, sugerirX, armarPlan } from '../js/guia.js';
import { textoCompleto } from '../js/dofiles.js';

let ok = 0, fallas = 0;
const fallidas = [];
function chk(nombre, cond, extra = '') {
  if (cond) ok++; else { fallas++; fallidas.push(nombre + (extra ? ' — ' + extra : '')); }
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${nombre}${extra ? '  ' + extra : ''}`);
}

function base(nombre) {
  const s = new Sesion();
  ejecutarLinea(`use ${nombre}, clear`, s);
  return s;
}

console.log('=== clasificación de la variable dependiente ===');
{
  const s = base('enemdu_eloro_2024');
  const esperado = {
    formal: 'binaria', ingreso: 'continua', educ: 'continua', exper: 'continua',
    horas: 'continua', k: 'continua', edad: 'continua',
    satisf: 'ordenada', situacion: 'nominal', sector: 'nominal',
    hijos: 'conteo', mujer: 'binaria', urbano: 'binaria', provincia: 'texto',
  };
  for (const [v, tipo] of Object.entries(esperado)) {
    const c = clasificarY(s.ds, v);
    chk(`${v} → ${tipo}`, c && c.tipo === tipo, c ? `dio ${c.tipo} (${c.modelo || 'sin modelo'})` : 'null');
  }
  // el modelo recomendado tiene que ser coherente con el tipo
  const mapa = { binaria: 'logit', ordenada: 'ologit', nominal: 'mlogit', conteo: 'poisson' };
  for (const [v, tipo] of Object.entries(esperado)) {
    if (!mapa[tipo]) continue;
    const c = clasificarY(s.ds, v);
    chk(`${v} recomienda ${mapa[tipo]}`, c.modelo === mapa[tipo], `dio ${c.modelo}`);
  }
  // el ingreso está sesgado: debe sugerir logaritmos
  const ci = clasificarY(s.ds, 'ingreso');
  chk('ingreso detecta la cola larga y sugiere logaritmo',
    ci.modelo === 'log-nivel' && ci.arreglo && /gen ln/.test(ci.arreglo.comando), ci.modelo);
  // el texto no puede ser dependiente y ofrece encode
  const cp = clasificarY(s.ds, 'provincia');
  chk('provincia no sirve de dependiente y ofrece encode',
    cp.puedeSerY === false && /encode/.test(cp.arreglo.comando));
}

console.log('\n=== las explicativas se escriben bien ===');
{
  const s = base('enemdu_eloro_2024');
  const xs = sugerirX(s.ds, 'ingreso');
  const tamano = xs.find((x) => x.nombre === 'tamano');
  const educ = xs.find((x) => x.nombre === 'educ');
  chk('un factor se escribe con i.', tamano.comoSeEscribe === 'i.tamano', tamano.comoSeEscribe);
  chk('una continua se escribe pelada', educ.comoSeEscribe === 'educ', educ.comoSeEscribe);
  chk('no se ofrece la dependiente como explicativa', !xs.some((x) => x.nombre === 'ingreso'));
  chk('no se ofrecen variables de texto', !xs.some((x) => s.ds.esString(x.nombre)));
  chk('no se ofrece el identificador', !xs.some((x) => x.nombre === 'id'));
}

console.log('\n=== el do-file que arma corre de verdad ===');
const casos = [
  { b: 'enemdu_eloro_2024', y: 'ingreso',   xs: ['educ', 'exper', 'mujer', 'tamano'] },
  { b: 'enemdu_eloro_2024', y: 'formal',    xs: ['educ', 'exper', 'mujer'] },
  { b: 'enemdu_eloro_2024', y: 'situacion', xs: ['educ', 'mujer'] },
  { b: 'enemdu_eloro_2024', y: 'satisf',    xs: ['educ', 'mujer'] },
  { b: 'enemdu_eloro_2024', y: 'hijos',     xs: ['educ', 'edad', 'mujer'] },
  { b: 'enemdu_eloro_2024', y: 'horas',     xs: ['educ', 'mujer'] },
  { b: 'produccion_eloro',  y: 'produccion', xs: ['trabajo', 'capital', 'exporta'] },
  { b: 'hogares_satisfaccion', y: 'satisfaccion', xs: ['educ_jefe', 'miembros', 'desempleo'] },
  { b: 'auto_ec',           y: 'precio',    xs: ['peso', 'extranjero'] },
];

for (const caso of casos) {
  const s = base(caso.b);
  const clas = clasificarY(s.ds, caso.y);
  const todas = sugerirX(s.ds, caso.y);
  const xs = caso.xs.map((n) => todas.find((x) => x.nombre === n)).filter(Boolean);
  const plan = armarPlan(s.ds, caso.y, xs, clas);

  // paso a paso, sobre una sesión limpia
  const s2 = new Sesion();
  let errPaso = null;
  plan.secciones.forEach((sec, i) => {
    const res = ejecutarDoFile(sec.codigo, s2);
    for (const r of res) {
      const e = (r.bloques || []).find((b) => b.t === 'err');
      if (e && !errPaso) errPaso = `paso ${i + 1} (${sec.t}): "${r.linea}" → ${e.mensaje}`;
    }
  });
  chk(`[${caso.b}] ${caso.y} ~ ${caso.xs.join(' ')} corre paso a paso (${plan.secciones.length} pasos)`,
    !errPaso, errPaso || `modelo: ${clas.modelo}`);

  // y de una sola vez
  const s3 = new Sesion();
  const res = ejecutarDoFile(textoCompleto(plan), s3);
  const e = res.flatMap((r) => r.bloques || []).find((b) => b.t === 'err');
  chk(`[${caso.b}] ${caso.y} corre entero de una vez`, !e, e ? e.mensaje : '');

  // el do-file debe enseñar a preparar variables
  const t = textoCompleto(plan);
  chk(`[${caso.b}] ${caso.y} etiqueta las variables`, /label variable/.test(t));
  chk(`[${caso.b}] ${caso.y} define la muestra`, /drop if missing/.test(t));
  chk(`[${caso.b}] ${caso.y} ninguna línea pasa de 78`,
    t.split('\n').every((l) => l.length <= 78),
    (t.split('\n').find((l) => l.length > 78) || '').slice(0, 46));
  chk(`[${caso.b}] ${caso.y} no repite ningún gen`,
    (() => { const gens = (t.match(/^gen \w+/gm) || []); return new Set(gens).size === gens.length; })(),
    (t.match(/^gen \w+/gm) || []).join(', '));
}

console.log(`\nRESULTADO: ${ok} pruebas OK, ${fallas} fallas`);
if (fallidas.length) { console.log('\nFallidas:'); for (const f of fallidas) console.log('  - ' + f); }
process.exit(fallas ? 1 : 0);

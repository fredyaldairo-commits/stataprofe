// Corre las secuencias completas de la chuleta, de punta a punta y por pasos.
// Si algo de la chuleta no funciona, aquí se ve.

import { Sesion, ejecutarDoFile } from '../js/core/comandos.js';
import { CHULETA, secuencia } from '../js/chuleta.js';

let ok = 0, fallas = 0;
const fallidas = [];
function chk(nombre, cond, extra = '') {
  if (cond) ok++; else { fallas++; fallidas.push(nombre + (extra ? ' — ' + extra : '')); }
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${nombre}${extra ? '  ' + extra : ''}`);
}

console.log('=== cada secuencia, paso a paso ===\n');
for (const m of CHULETA) {
  const ses = new Sesion();
  const errores = [];
  let pasosOK = 0;
  m.pasos.forEach((p, i) => {
    const res = ejecutarDoFile(p.comandos.join('\n'), ses);
    let malo = null;
    for (const r of res) {
      if (r.detenido) continue;
      const e = (r.bloques || []).find((b) => b.t === 'err');
      if (e && !malo) malo = `paso ${i + 1} (${p.paso}) → "${r.linea}" → ${e.mensaje}`;
    }
    if (malo) errores.push(malo); else pasosOK++;
  });
  chk(`${m.nombre.padEnd(32)} ${pasosOK}/${m.pasos.length} pasos`,
    errores.length === 0, errores[0] || '');
}

console.log('\n=== cada secuencia, de una sola vez ===');
for (const m of CHULETA) {
  const ses = new Sesion();
  const res = ejecutarDoFile(secuencia(m.id), ses);
  const det = res.find((r) => r.detenido);
  const err = res.flatMap((r) => r.bloques || []).find((b) => b.t === 'err');
  chk(`${m.nombre} corre entera`, !det && !err,
    err ? err.mensaje : (det ? 'se detuvo en la línea ' + det.numero : ''));
}

console.log('\n=== la preparación deja la base utilizable ===');
{
  const mco = CHULETA.find((x) => x.id === 'mco');
  const ses = new Sesion();
  // solo los pasos de preparación (los que van antes de las descriptivas)
  const prep = mco.pasos.slice(0, 10);
  for (const p of prep) ejecutarDoFile(p.comandos.join('\n'), ses);
  const ds = ses.ds;
  for (const v of ['ingreso', 'mujer', 'satisf', 'exper2', 'lningreso']) {
    chk(`   crea ${v}`, ds.existe(v));
  }
  chk('   ingreso quedó numérico', !ds.esString('ingreso'));
  const ing = ds.col('ingreso').filter((v) => v !== null);
  const orden = ing.slice().sort((a, b) => a - b);
  chk('   la mediana del ingreso es razonable',
    orden[Math.floor(orden.length / 2)] > 400 && orden[Math.floor(orden.length / 2)] < 1100,
    `mediana=${orden[Math.floor(orden.length / 2)].toFixed(2)}`);
  chk('   mujer es binaria con etiquetas', ds.esBinaria('mujer') && ds.etiquetaDe('mujer', 1) === 'Mujer');
  chk('   satisf tiene los 5 niveles en orden',
    ds.niveles('satisf').length === 5 && ds.etiquetaDe('satisf', 1) === 'Muy triste'
    && ds.etiquetaDe('satisf', 5) === 'Muy feliz');
  chk('   sin faltantes en las variables del modelo',
    ['ingreso', 'educ', 'exper', 'horas'].every((v) => ds.contarFaltantes(v) === 0));
  chk('   quedó una muestra utilizable', ds.n > 2000, `${ds.n} observaciones`);
}

console.log('\n=== estructura ===');
{
  chk('hay una secuencia por familia de modelo', CHULETA.length === 7, String(CHULETA.length));
  for (const m of CHULETA) {
    chk(`${m.id}: todos los pasos tienen comandos y explicación`,
      m.pasos.every((p) => p.comandos.length && p.busca && p.paso));
    chk(`${m.id}: los pasos no traen número escrito a mano`,
      m.pasos.every((p) => !/^\d+\./.test(p.paso)),
      (m.pasos.find((p) => /^\d+\./.test(p.paso)) || {}).paso || '');
  }
  const s = secuencia('mco');
  chk('la secuencia exportada trae encabezado y numeración', /^\* ={10,}/.test(s) && /\* ---- 1\./.test(s));
  chk('la numeración es correlativa sin saltos', (() => {
    const nums = [...s.matchAll(/\* ---- (\d+)\./g)].map((x) => Number(x[1]));
    return nums.every((n, i) => n === i + 1);
  })());
  chk('ninguna línea de la secuencia pasa de 90 columnas',
    s.split('\n').every((l) => l.length <= 90),
    (s.split('\n').find((l) => l.length > 90) || '').slice(0, 45));
}

console.log(`\nRESULTADO: ${ok} pruebas OK, ${fallas} fallas`);
if (fallidas.length) { console.log('\nFallidas:'); for (const f of fallidas) console.log('  - ' + f); }
process.exit(fallas ? 1 : 0);

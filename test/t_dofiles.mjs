// Corre los 18 do-files de la biblioteca, sección por sección, sobre un motor limpio.
// Comprueba que cada paso funciona por su cuenta y que las variables que usa existen.

import { Sesion, ejecutarDoFile } from '../js/core/comandos.js';
import { DOFILES, textoCompleto } from '../js/dofiles.js';

let ok = 0, fallas = 0;
const fallidas = [];

function chk(nombre, cond, extra = '') {
  if (cond) ok++; else { fallas++; fallidas.push(nombre + (extra ? ' — ' + extra : '')); }
  if (!cond) console.log(`  FALLA ${nombre}  ${extra}`);
  return cond;
}

console.log('═══ los 18 do-files, paso a paso ═══\n');

for (const df of DOFILES) {
  const ses = new Sesion();
  let errores = [];
  let bloquesConSalida = 0;
  let pasosOK = 0;

  for (let i = 0; i < df.secciones.length; i++) {
    const s = df.secciones[i];
    const res = ejecutarDoFile(s.codigo, ses);
    let malo = null;
    for (const r of res) {
      if (r.detenido) continue;
      const err = (r.bloques || []).find((b) => b.t === 'err');
      if (err && !malo) malo = `paso ${i + 1} (${s.t}) → "${r.linea}" → ${err.mensaje}`;
      if ((r.bloques || []).length) bloquesConSalida++;
    }
    if (malo) errores.push(malo); else pasosOK++;
  }

  const bien = errores.length === 0;
  if (bien) ok++; else { fallas++; fallidas.push(...errores.map((e) => `[${df.n} ${df.nombre}] ${e}`)); }
  console.log(`${bien ? 'OK  ' : 'FALLA'} ${String(df.n).padStart(2)}. ${df.nombre.padEnd(38)} ${pasosOK}/${df.secciones.length} pasos${bien ? '' : '  ⟶ ' + errores[0]}`);
}

console.log('\n═══ estructura de cada do-file ═══');
for (const df of DOFILES) {
  const t = textoCompleto(df);
  chk(`[${df.n}] tiene encabezado`, t.includes(`Do-file ${df.n} — ${df.nombre}`));
  chk(`[${df.n}] las marcas de sección son únicas y están todas`,
    df.secciones.every((s, i) => t.split(`* ---- ${i + 1}. ${s.t}`).length === 2));
  chk(`[${df.n}] ninguna sección va vacía`, df.secciones.every((s) => s.codigo.trim().length > 0));
  chk(`[${df.n}] ninguna línea pasa de 78 caracteres`,
    t.split('\n').every((l) => l.length <= 78),
    (t.split('\n').find((l) => l.length > 78) || '').slice(0, 50));
}

console.log('\n═══ contenido pedagógico ═══');
{
  const conGen = DOFILES.filter((d) => d.secciones.some((s) => /\bgen\b/.test(s.codigo)));
  const conLabel = DOFILES.filter((d) => d.secciones.some((s) => /label /.test(s.codigo)));
  const conDrop = DOFILES.filter((d) => d.secciones.some((s) => /drop if|keep if/.test(s.codigo)));
  // no todo modelo necesita variables nuevas, pero TODOS deben decir qué variables
  // usan y cómo prepararlas: con gen, con label, o diciendo que no hace falta nada
  const sinSeccionDeVariables = DOFILES.filter((d) =>
    !d.secciones.some((s) => /\bgen\b|label |encode|destring|recode/.test(s.codigo)));
  chk('todos explican qué variables usan y cómo prepararlas',
    sinSeccionDeVariables.length === 0,
    sinSeccionDeVariables.map((d) => d.nombre).join(', '));
  chk('varios enseñan a transformar con gen', conGen.length >= 7, `${conGen.length} de ${DOFILES.length}`);
  chk('la mayoría enseña a etiquetar con label', conLabel.length >= 13, `${conLabel.length} de ${DOFILES.length}`);
  chk('la mayoría define la muestra explícitamente', conDrop.length >= 14, `${conDrop.length} de ${DOFILES.length}`);
  chk('hay un do-file por cada modelo del catálogo (17) más depuración',
    DOFILES.length === 18, `${DOFILES.length}`);
  chk('todas las secciones explican POR QUÉ (salvo notas finales)',
    DOFILES.every((d) => d.secciones.filter((s) => s.porque).length >= d.secciones.length - 2));
  const recode = DOFILES.find((d) => d.secciones.some((s) => /recode/.test(s.codigo)));
  chk('alguno enseña a recodificar de 5 a 3 categorías', !!recode, recode ? recode.nombre : '');
  const encode = DOFILES.find((d) => d.secciones.some((s) => /encode/.test(s.codigo)));
  chk('alguno enseña encode para variables de texto', !!encode, encode ? encode.nombre : '');
  const destring = DOFILES.find((d) => d.secciones.some((s) => /destring/.test(s.codigo)));
  chk('alguno enseña destring', !!destring, destring ? destring.nombre : '');
}

console.log('\n═══ el do-file entero, de una sola vez ═══');
for (const df of DOFILES) {
  const ses = new Sesion();
  const res = ejecutarDoFile(textoCompleto(df), ses);
  const detenido = res.find((r) => r.detenido);
  const err = res.flatMap((r) => r.bloques || []).find((b) => b.t === 'err');
  chk(`[${df.n}] ${df.nombre} corre entero sin detenerse`, !detenido && !err,
    err ? err.mensaje : (detenido ? 'se detuvo en la línea ' + detenido.numero : ''));
}

console.log(`\nRESULTADO: ${ok} pruebas OK, ${fallas} fallas`);
if (fallidas.length) { console.log('\nFallidas:'); for (const f of fallidas.slice(0, 25)) console.log('  - ' + f); }
process.exit(fallas ? 1 : 0);

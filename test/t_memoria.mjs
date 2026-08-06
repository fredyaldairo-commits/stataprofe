// Prueba de la memoria del profe: detección de temas (con typos reales),
// perfil que se ajusta, errores repetidos y el resumen que se le pasa al modelo.

import * as Mem from '../js/memoria.js';

// localStorage falso para poder correr en Node
const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
  clear: () => almacen.clear(),
};

let ok = 0, fallas = 0;
const fallidas = [];
function chk(nombre, cond, extra = '') {
  if (cond) ok++; else { fallas++; fallidas.push(nombre + (extra ? ' — ' + extra : '')); }
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${nombre}${extra ? '  ' + extra : ''}`);
}
const limpio = () => { almacen.clear(); };

console.log('=== detección de temas con preguntas reales (con typos) ===');
{
  const casos = [
    ['noc como crear una varible nueva de ln de otro variblr', ['variables', 'logaritmos']],
    ['cual es mejor punto de corte', ['corte']],
    ['que es la funcion logistica y la normal', ['logit']],
    ['que son los falsos positivos', ['clasificacion']],
    ['porque logit o logistic o las dos', ['logit', 'odds']],
    ['no entiendo el odd ratio ni margins', ['margins', 'odds']],
    ['como recodifico una variable de 5 a 3', ['depuracion']],
    ['que es la categoria base en mprobit', ['multinomial']],
    ['porque mi r2 es tan bajo', ['ajuste']],
    ['que hago si sale heterocedasticidad', ['supuestos']],
    ['como pongo etiquetas a mis variables', ['variables']],
    ['para que sirve el vif', ['supuestos']],
  ];
  for (const [pregunta, esperados] of casos) {
    const t = Mem.detectarTemas(pregunta);
    const faltan = esperados.filter((e) => !t.includes(e));
    chk(`"${pregunta.slice(0, 38)}…"`, faltan.length === 0,
      faltan.length ? `faltó ${faltan.join(',')} (dio: ${t.join(',') || 'nada'})` : t.join(','));
  }
  // el falso positivo que encontramos: "heterocedasticidad" contiene "roc"
  chk('heterocedasticidad NO se confunde con la curva ROC',
    !Mem.detectarTemas('que hago si sale heterocedasticidad').includes('clasificacion'));
}

console.log('\n=== el perfil aprende del tema repetido ===');
{
  limpio();
  Mem.guardarDuda('que es margins', 'r1');
  chk('con una sola pregunta todavía no sugiere repaso', !Mem.queRepasar());
  Mem.guardarDuda('no entendi los efectos marginales', 'r2');
  const r = Mem.queRepasar();
  chk('con dos preguntas del mismo tema ya sugiere repaso', !!r, r ? `${r.tema} ${r.veces}×` : '');
  chk('el repaso apunta a un apartado que existe', r && r.concepto === 'escalas', r ? r.concepto : '');
  chk('el repaso apunta a un do-file válido', r && r.modelo >= 1 && r.modelo <= 18, r ? String(r.modelo) : '');
}

console.log('\n=== el nivel se ajusta a cómo le va ===');
{
  limpio();
  const a = Mem.guardarDuda('p1', 'r'); const b = Mem.guardarDuda('p2', 'r');
  chk('empieza en nivel normal', Mem.perfil().nivel === 'normal', Mem.perfil().nivel);
  Mem.marcarDuda(a.id, false); Mem.marcarDuda(b.id, false);
  chk('si marca "no entendí" baja a básico', Mem.perfil().nivel === 'basico', Mem.perfil().nivel);
  chk('el resumen le pide bajar el nivel',
    /Baja el nivel/.test(Mem.resumenParaPrompt() || ''));
  Mem.marcarDuda(a.id, true); Mem.marcarDuda(b.id, true);
  for (let i = 0; i < 16; i++) { const d = Mem.guardarDuda('p' + i, 'r'); Mem.marcarDuda(d.id, true); }
  chk('con muchas entendidas sube a avanzado', Mem.perfil().nivel === 'avanzado', Mem.perfil().nivel);
}

console.log('\n=== errores repetidos ===');
{
  limpio();
  let r;
  for (let i = 0; i < 3; i++) {
    r = Mem.registrarError(198, '"robust" parece una opción, pero le falta la coma', 'reg y x robust');
  }
  chk('agrupa el mismo error', r && r.clave === 'coma_olvidada' && r.veces === 3, JSON.stringify(r));
  chk('tiene consejo para ese error', !!Mem.CONSEJO_ERROR[r.clave].consejo);
  Mem.registrarError(111, 'variable ingrso no encontrada', 'sum ingrso');
  Mem.registrarError(111, 'variable educ2 no encontrada', 'sum educ2');
  const e = Mem.errores();
  chk('distingue tipos de error', Object.keys(e).length === 2, Object.keys(e).join(', '));
  chk('el resumen menciona los errores repetidos',
    /errores que repite|Errores que repite/i.test(Mem.resumenParaPrompt() || ''));
  const errNoClasificado = Mem.registrarError(1, 'algo rarísimo que no está en la lista', 'xyz');
  chk('un error desconocido no ensucia la memoria', !errNoClasificado);
}

console.log('\n=== historial para dar continuidad al chat ===');
{
  limpio();
  for (let i = 1; i <= 10; i++) Mem.guardarDuda('pregunta ' + i, 'respuesta ' + i);
  const h = Mem.historialReciente(6);
  chk('devuelve los últimos 6', h.length === 6, `${h.length}`);
  chk('en orden, del más viejo al más nuevo',
    h[0].p === 'pregunta 5' && h[5].p === 'pregunta 10', `${h[0].p} … ${h[5].p}`);
}

console.log('\n=== la memoria no crece sin límite ===');
{
  limpio();
  for (let i = 0; i < 200; i++) Mem.guardarDuda('p' + i, 'r' + i);
  chk('se queda con las últimas 120', Mem.dudas().length === 120, String(Mem.dudas().length));
  chk('conserva las más recientes', Mem.dudas()[119].p === 'p199', Mem.dudas()[119].p);
}

console.log('\n=== borrar deja todo limpio ===');
{
  Mem.borrarDudas(); Mem.borrarErrores();
  chk('sin dudas', Mem.dudas().length === 0);
  chk('sin errores', Object.keys(Mem.errores()).length === 0);
  chk('sin resumen que pasar al modelo', Mem.resumenParaPrompt() === null);
  chk('sin sugerencia de repaso', Mem.queRepasar() === null);
}

console.log(`\nRESULTADO: ${ok} pruebas OK, ${fallas} fallas`);
if (fallidas.length) { console.log('\nFallidas:'); for (const f of fallidas) console.log('  - ' + f); }
process.exit(fallas ? 1 : 0);

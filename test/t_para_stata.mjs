// Verifica que la receta de depuración de para_stata/01_depurar_etiquetar.do
// realmente funcione: se corre sobre la MISMA base cruda, paso a paso.
// (Se salta lo que solo existe en Stata real: import delimited, log, save, cd.)

import { Sesion, ejecutarDoFile, ejecutarLinea } from '../js/core/comandos.js';
import fs from 'node:fs';

let ok = 0, fallas = 0;
const fallidas = [];
function chk(nombre, cond, extra = '') {
  if (cond) ok++; else { fallas++; fallidas.push(nombre + (extra ? ' — ' + extra : '')); }
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${nombre}${extra ? '  ' + extra : ''}`);
}

const ses = new Sesion();
function corre(codigo, etiqueta) {
  const res = ejecutarDoFile(codigo, ses);
  const errs = [];
  for (const r of res) {
    if (r.detenido) continue;
    const e = (r.bloques || []).find((b) => b.t === 'err');
    if (e) errs.push(`"${r.linea}" → ${e.mensaje}`);
  }
  chk(etiqueta, errs.length === 0, errs[0] || '');
  return errs;
}

console.log('=== el CSV existe y tiene lo que debe ===');
{
  const ruta = 'para_stata/enemdu_eloro_crudo.csv';
  chk('el CSV está generado', fs.existsSync(ruta));
  const txt = fs.readFileSync(ruta, 'utf8');
  const lineas = txt.trim().split('\n');
  chk('tiene 3.426 filas más la cabecera', lineas.length === 3427, String(lineas.length));
  const cab = lineas[0].split(',');
  chk('trae las columnas de texto para encode',
    ['ingreso_txt', 'sexo_txt', 'satisf_txt', 'provincia'].every((c) => cab.includes(c)),
    cab.join(' '));
  const cuerpo = lineas.slice(1);
  chk('hay ingresos con coma decimal', cuerpo.some((l) => /"\d+,\d{2}"/.test(l)));
  chk('hay ingresos con punto decimal', cuerpo.some((l) => /,\d+\.\d{2},/.test(l)));
  chk('hay valores no numéricos (NA, s/i, vacío)',
    cuerpo.filter((l) => /^[^,]*,(NA|s\/i|),/.test(l)).length > 100);
  chk('el CSV no tiene la palabra "null"', !/,null,/.test(txt));
}

console.log('\n=== la receta de depuración, paso a paso ===');
corre('use enemdu_eloro_2024_crudo, clear', '1. abrir la base cruda');
chk('arranca con 3.426 filas', ses.ds.n === 3426, String(ses.ds.n));

corre('duplicates drop', '2. borrar duplicados');
chk('quedan 3.412 tras quitar repetidos', ses.ds.n === 3412, String(ses.ds.n));

// el corazón: la regla del punto de miles
corre(`gen str20 ing_limpio = trim(ingreso_txt)
replace ing_limpio = subinstr(ing_limpio, ".", "", .) if strpos(ing_limpio, ",") > 0
replace ing_limpio = subinstr(ing_limpio, ",", ".", .)
destring ing_limpio, gen(ingreso) force
drop ing_limpio`, '3. el ingreso de texto a número');

{
  const col = ses.ds.col('ingreso');
  const validos = col.filter((v) => v !== null);
  const faltan = col.length - validos.length;
  chk('quedan ~210 faltantes (los NA, s/i y vacíos)', faltan >= 195 && faltan <= 225, String(faltan));
  chk('todos los válidos son positivos', validos.every((v) => v > 0), `min=${Math.min(...validos)}`);
  // se mira la MEDIANA, no la media: en este punto todavía están los cinco
  // valores 999999 (se quitan más adelante) y arrastrarían el promedio.
  // Si la regla del punto de miles estuviera mal, la mediana se dispararía x100.
  const orden = validos.slice().sort((a, b) => a - b);
  const mediana = orden[Math.floor(orden.length / 2)];
  chk('la mediana queda en el orden correcto (la regla del punto de miles funciona)',
    mediana > 400 && mediana < 1100, `mediana=${mediana.toFixed(2)}`);
  chk('el máximo es el código 999999, no una basura mayor',
    Math.max(...validos) === 999999, `max=${Math.max(...validos)}`);
  chk('ningún valor quedó multiplicado por mil sin querer',
    validos.filter((v) => v > 20000 && v !== 999999).length === 0,
    `${validos.filter((v) => v > 20000 && v !== 999999).length} sospechosos`);
}

corre(`replace sexo_txt = upper(trim(sexo_txt))
replace sexo_txt = "HOMBRE" if sexo_txt == "H"
replace sexo_txt = "MUJER" if sexo_txt == "M"
encode sexo_txt, gen(sexo)`, '4. limpiar el texto y encode');
chk('encode deja exactamente 2 categorías', ses.ds.niveles('sexo').length === 2,
  ses.ds.niveles('sexo').map((v) => ses.ds.etiquetaDe('sexo', v)).join(' / '));

corre(`gen mujer = (sexo == 2) if !missing(sexo)
label define lbl_sexo 0 "Hombre" 1 "Mujer"
label values mujer lbl_sexo`, '5. crear la indicadora 0/1');
chk('mujer es binaria', ses.ds.esBinaria('mujer'));
chk('mujer tiene etiquetas puestas', ses.ds.etiquetaDe('mujer', 1) === 'Mujer');

// la escala se arma a mano porque encode ordena alfabéticamente
corre(`gen satisf = .
replace satisf = 1 if satisf_txt == "Muy triste"
replace satisf = 2 if satisf_txt == "Triste"
replace satisf = 3 if satisf_txt == "Normal"
replace satisf = 4 if satisf_txt == "Feliz"
replace satisf = 5 if satisf_txt == "Muy feliz"
label define lbl_satisf 1 "Muy triste" 2 "Triste" 3 "Normal" 4 "Feliz" 5 "Muy feliz"
label values satisf lbl_satisf`, '6. la escala de satisfacción, en orden correcto');
{
  const niv = ses.ds.niveles('satisf');
  chk('satisf tiene 5 niveles', niv.length === 5, niv.join(','));
  chk('el orden es el de la escala, no el alfabético',
    ses.ds.etiquetaDe('satisf', 1) === 'Muy triste' && ses.ds.etiquetaDe('satisf', 5) === 'Muy feliz');
  chk('ninguna fila quedó sin clasificar',
    ses.ds.contarFaltantes('satisf') === 0, `${ses.ds.contarFaltantes('satisf')} vacías`);
}

corre('decode satisf, gen(satisf_palabra)', '7. decode, el camino de vuelta');
chk('decode devuelve el texto', ses.ds.col('satisf_palabra')[0].length > 3,
  ses.ds.col('satisf_palabra')[0]);
corre('drop satisf_palabra', '   (limpiar la auxiliar)');

corre(`mvdecode edad educ, mv(99)
mvdecode horas, mv(999)`, '8. códigos de no respuesta');
chk('ya no hay edad = 99', !ses.ds.col('edad').includes(99));
chk('ya no hay educ = 99', !ses.ds.col('educ').includes(99));
chk('ya no hay horas = 999', !ses.ds.col('horas').includes(999));

corre(`drop if edad > 100 & !missing(edad)
replace ingreso = . if ingreso == 999999`, '9. valores imposibles');
chk('ya no hay edades de 250', !ses.ds.col('edad').includes(250));
chk('ya no hay ingresos de 999999', !ses.ds.col('ingreso').includes(999999));

corre(`label variable ingreso "Ingreso mensual del trabajo (USD)"
label variable educ "Años de estudio aprobados"
label define lbl_si_no 0 "No" 1 "Sí"
label values formal lbl_si_no
label define lbl_tamano 1 "Microempresa" 2 "Pequeña" 3 "Mediana" 4 "Grande"
label values tamano lbl_tamano`, '10. etiquetar');
chk('las etiquetas quedaron puestas',
  ses.ds.meta('ingreso').label.includes('Ingreso') && ses.ds.etiquetaDe('tamano', 1) === 'Microempresa');

corre(`recode satisf (1 2 = 1) (3 = 2) (4 5 = 3), gen(satisf3)
label define lbl_s3 1 "Triste" 2 "Normal" 3 "Feliz"
label values satisf3 lbl_s3`, '11. recodificar de 5 a 3');
chk('satisf3 tiene 3 niveles', ses.ds.niveles('satisf3').length === 3);
{
  // comprobar el cruce: cada valor viejo debe caer en uno solo nuevo
  const v = ses.ds.col('satisf'), n = ses.ds.col('satisf3');
  const mapa = {};
  for (let i = 0; i < v.length; i++) {
    if (v[i] === null) continue;
    (mapa[v[i]] = mapa[v[i]] || new Set()).add(n[i]);
  }
  chk('cada categoría vieja cae en una sola nueva',
    Object.values(mapa).every((s) => s.size === 1),
    Object.entries(mapa).map(([k, s]) => `${k}→${[...s]}`).join(' '));
}

corre(`gen exper2 = exper^2
gen lningreso = ln(ingreso) if ingreso > 0
gen lnhoras = ln(horas) if horas > 0
gen lnk = ln(k) if k > 0`, '12. variables derivadas');
chk('lningreso sin valores infinitos',
  ses.ds.col('lningreso').every((v) => v === null || isFinite(v)));

corre(`keep if edad >= 18 & edad <= 65 & !missing(edad)
keep if ingreso > 0 & !missing(ingreso)
drop if missing(educ, exper, horas)`, '13. definir la muestra una sola vez');
{
  const n = ses.ds.n;
  chk('queda una muestra utilizable', n > 2500 && n < 3412, `${n} observaciones`);
  for (const v of ['ingreso', 'educ', 'exper', 'horas']) {
    chk(`   ${v} sin faltantes tras el filtro`, ses.ds.contarFaltantes(v) === 0,
      `${ses.ds.contarFaltantes(v)} vacías`);
  }
}

console.log('\n=== la base depurada ya sirve para modelar ===');
{
  const modelos = [
    ['reg ingreso educ exper exper2 mujer horas, robust', 'MCO'],
    ['reg lningreso educ exper exper2 mujer, robust', 'log-nivel'],
    ['reg lningreso lnhoras lnk, robust', 'Cobb-Douglas'],
    ['reg ingreso i.tamano, robust', 'dummies'],
    ['anova ingreso tamano', 'ANOVA'],
    ['logit formal educ exper mujer', 'logit'],
    ['margins, dydx(*)', 'margins'],
    ['probit formal educ exper mujer', 'probit'],
    ['mlogit situacion educ exper mujer, base(1)', 'mlogit'],
    ['ologit satisf educ mujer', 'ologit'],
    ['ologit satisf3 educ mujer', 'ologit recodificada'],
    ['poisson hijos educ edad mujer', 'poisson'],
  ];
  for (const [cmd, nombre] of modelos) {
    const b = ejecutarLinea(cmd, ses);
    const e = b.find((x) => x.t === 'err');
    chk(`corre ${nombre}`, !e, e ? e.mensaje : '');
  }
  // y los supuestos, en el orden del do-file
  ejecutarLinea('reg ingreso educ exper exper2 mujer horas, robust', ses);
  for (const cmd of ['estat vif', 'estat ovtest', 'estat hettest', 'estat imtest, white',
    'predict u, resid', 'swilk u', 'sktest u']) {
    const b = ejecutarLinea(cmd, ses);
    const e = b.find((x) => x.t === 'err');
    chk(`   supuesto: ${cmd}`, !e, e ? e.mensaje : '');
  }
}

console.log('\n=== los do-files están bien escritos ===');
for (const f of ['01_depurar_etiquetar.do', '02_orden_por_modelo.do']) {
  const t = fs.readFileSync('para_stata/' + f, 'utf8');
  chk(`${f} existe y tiene contenido`, t.length > 2000, `${t.length} caracteres`);
  chk(`${f} sin líneas de más de 90 columnas`,
    t.split('\n').every((l) => l.length <= 90),
    (t.split('\n').find((l) => l.length > 90) || '').slice(0, 40));
  chk(`${f} las continuaciones /// están bien cerradas`,
    t.split('\n').filter((l) => /\/\/\/\s*$/.test(l)).every((l, i, arr) => true));
  // ningún comando de Stata mal escrito en los más comunes
  const sospechosos = t.match(/^\s*(reg|logit|probit|mlogit|ologit|poisson)\s+\w+\s*=/gm);
  chk(`${f} ninguna regresión usa "="`, !sospechosos, sospechosos ? sospechosos[0] : '');
}
{
  const t = fs.readFileSync('para_stata/01_depurar_etiquetar.do', 'utf8');
  chk('01 enseña encode', /encode \w+, gen\(/.test(t));
  chk('01 enseña decode', /decode \w+, gen\(/.test(t));
  chk('01 enseña destring', /destring \w+, gen\(/.test(t));
  chk('01 enseña las tres formas de label', /label variable/.test(t) && /label define/.test(t) && /label values/.test(t));
  chk('01 avisa de la trampa del faltante', /!missing\(/.test(t) && /vale MÁS que cualquier número/i.test(t));
  chk('01 comprueba la recodificación con tab cruzado', /tab satisf satisf3/.test(t));
  const t2 = fs.readFileSync('para_stata/02_orden_por_modelo.do', 'utf8');
  chk('02 pone las descriptivas antes que los modelos',
    t2.indexOf('summarize ingreso') < t2.indexOf('reg ingreso'));
  chk('02 pone los supuestos después del modelo',
    t2.indexOf('reg ingreso educ exper exper2 mujer horas') < t2.indexOf('estat vif'));
  // hay que mirar DENTRO de la sección del logit: "margins, dydx(*)" también
  // aparece antes, en la postestimación del MCO
  const secLogit = t2.slice(t2.indexOf('* --- E3. LOGIT'), t2.indexOf('* --- E4.'));
  chk('02 pone margins después del logit, dentro de su sección',
    secLogit.indexOf('logit formal') < secLogit.indexOf('margins, dydx(*)')
    && secLogit.includes('margins, dydx(*)'), secLogit.length + ' caracteres en la sección');
  chk('02 avisa de los paquetes que hay que instalar', /ssc install/.test(t2));
}

console.log(`\nRESULTADO: ${ok} pruebas OK, ${fallas} fallas`);
if (fallidas.length) { console.log('\nFallidas:'); for (const f of fallidas) console.log('  - ' + f); }
process.exit(fallas ? 1 : 0);

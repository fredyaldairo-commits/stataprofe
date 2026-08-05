// Prueba de extremo a extremo: corre comandos como los escribiría un estudiante
// y comprueba que salen resultados correctos y que los errores se explican bien.

import { Sesion, ejecutarLinea, ejecutarDoFile } from '../js/core/comandos.js';

let ok = 0, fallas = 0;
const fallidas = [];

function texto(bloques) {
  return bloques.map((b) => {
    if (b.t === 'txt') return b.s;
    if (b.t === 'ok' || b.t === 'aviso') return b.s;
    if (b.t === 'err') return `ERROR(${b.codigo}): ${b.mensaje} || ${b.sugerencia || ''}`;
    if (b.t === 'coef') return b.fit.names.map((n, i) => `${n}=${b.fit.b[i]}`).join(' ');
    if (b.t === 'profe') return [b.bloque.titulo, b.bloque.resumen,
      ...(b.bloque.items || []).map((x) => x.texto),
      ...(b.bloque.filas || []).map((x) => x.texto)].filter(Boolean).join(' ');
    if (b.t === 'svg') return '[SVG ' + b.titulo + ']';
    return '';
  }).join('\n');
}

function corre(ses, linea) { return ejecutarLinea(linea, ses); }

function chkb(nombre, cond, extra = '') {
  if (cond) ok++; else { fallas++; fallidas.push(nombre + (extra ? ' — ' + extra : '')); }
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${nombre}${extra ? '  ' + extra : ''}`);
}
function sinError(nombre, bloques) {
  const errs = bloques.filter((b) => b.t === 'err');
  chkb(nombre, errs.length === 0, errs.length ? errs[0].mensaje : '');
  return errs.length === 0;
}
function conError(nombre, bloques, debeContener) {
  const errs = bloques.filter((b) => b.t === 'err');
  const t = texto(bloques);
  const bien = errs.length > 0 && (!debeContener || t.toLowerCase().includes(debeContener.toLowerCase()));
  chkb(nombre, bien, errs.length ? `(${errs[0].codigo}) ${errs[0].mensaje}` : 'no dio error');
  return bien;
}

const ses = new Sesion();

console.log('=== abrir y mirar ===');
sinError('use enemdu_eloro_2024, clear', corre(ses, 'use enemdu_eloro_2024, clear'));
chkb('se cargaron 3412 observaciones', ses.ds.n === 3412, `n=${ses.ds.n}`);
sinError('describe', corre(ses, 'describe'));
sinError('summarize ingreso educ exper', corre(ses, 'summarize ingreso educ exper'));
sinError('sum ingreso, detail', corre(ses, 'sum ingreso, detail'));
sinError('count if mujer == 1', corre(ses, 'count if mujer == 1'));
sinError('tab tamano', corre(ses, 'tab tamano'));
sinError('tab tamano mujer, row chi2', corre(ses, 'tab tamano mujer, row chi2'));
{
  const t = texto(corre(ses, 'tab tamano'));
  chkb('la tabla usa las etiquetas de valores', t.includes('Microempresa'), '');
}

console.log('\n=== crear variables ===');
sinError('gen lningreso = ln(ingreso)', corre(ses, 'gen lningreso = ln(ingreso)'));
sinError('gen lnhoras = ln(horas)', corre(ses, 'gen lnhoras = ln(horas)'));
sinError('gen lnk = ln(k)', corre(ses, 'gen lnk = ln(k)'));
chkb('lningreso existe y no tiene faltantes',
  ses.ds.existe('lningreso') && ses.ds.contarFaltantes('lningreso') === 0);
conError('gen sobre variable existente avisa', corre(ses, 'gen lningreso = 1'), 'ya existe');
sinError('replace sí funciona', corre(ses, 'replace lningreso = ln(ingreso)'));
sinError('gen joven = (edad < 30)', corre(ses, 'gen joven = (edad < 30)'));
sinError('egen media_ing = mean(ingreso), by(tamano)', corre(ses, 'egen media_ing = mean(ingreso), by(tamano)'));
chkb('egen creó una media por grupo', ses.ds.existe('media_ing') &&
  new Set(ses.ds.col('media_ing')).size === 4, `valores distintos=${new Set(ses.ds.col('media_ing')).size}`);

console.log('\n=== regresión ===');
{
  const b = corre(ses, 'reg ingreso educ exper exper2 mujer horas, robust');
  sinError('reg ... , robust', b);
  const coef = b.find((x) => x.t === 'coef');
  chkb('la tabla de coeficientes tiene 6 filas', coef && coef.fit.names.length === 6);
  const educ = coef.fit.b[coef.fit.names.indexOf('educ')];
  chkb('el coeficiente de educ coincide con el documento', Math.abs(educ - 42.3) < 3, `educ=${educ.toFixed(2)}`);
  chkb('R2 alrededor de 0.33', Math.abs(coef.fit.r2 - 0.33) < 0.05, `R2=${coef.fit.r2.toFixed(4)}`);
  const prof = b.find((x) => x.t === 'profe');
  chkb('el profesor explica la regresión', !!prof && prof.bloque.filas.length === 6);
  chkb('el profesor avisa que la constante no se interpreta',
    prof.bloque.filas.some((f) => f.noInterpretar));
  chkb('el profesor da frases para el informe', prof.bloque.frases.length > 0);
  chkb('el profesor felicita el uso de robust',
    prof.bloque.items.some((i) => i.texto.includes('robust') && i.tono === 'ok'));
}
{
  const b = corre(ses, 'reg ingreso educ exper exper2 mujer horas');
  const prof = b.find((x) => x.t === 'profe');
  chkb('sin robust, el profesor lo señala',
    prof.bloque.items.some((i) => i.tono === 'ojo' && i.texto.includes('robust')));
}

console.log('\n=== supuestos ===');
sinError('estat hettest', corre(ses, 'estat hettest'));
{
  const b = corre(ses, 'estat hettest');
  const prof = b.find((x) => x.t === 'profe');
  chkb('hettest detecta heterocedasticidad y manda usar robust',
    prof.bloque.resumen.includes('Sí hay') && prof.bloque.items.some((i) => i.texto.includes('robust')));
}
sinError('estat vif', corre(ses, 'estat vif'));
sinError('estat ovtest', corre(ses, 'estat ovtest'));
sinError('estat imtest, white', corre(ses, 'estat imtest, white'));
sinError('linktest', corre(ses, 'linktest'));
sinError('predict e, resid', corre(ses, 'predict e, resid'));
sinError('rvfplot', corre(ses, 'rvfplot'));
sinError('qnorm', corre(ses, 'qnorm'));
{
  const b = corre(ses, 'estat vif');
  const t = texto(b);
  chkb('el VIF de exper y exper2 sale alto y el profe lo justifica',
    t.includes('exper2') && t.includes('normal y no se arregla'));
}

console.log('\n=== logaritmos y Cobb-Douglas ===');
{
  const b = corre(ses, 'reg lningreso lnhoras lnk, robust');
  sinError('Cobb-Douglas', b);
  const coef = b.find((x) => x.t === 'coef');
  chkb('elasticidad de horas cerca de 0.61', Math.abs(coef.fit.b[0] - 0.612) < 0.08, `b=${coef.fit.b[0].toFixed(4)}`);
  const prof = b.find((x) => x.t === 'profe');
  chkb('el profesor lee los coeficientes como elasticidades',
    prof.bloque.filas.some((f) => f.texto.includes('elasticidad')));
}
{
  const b = corre(ses, 'test lnhoras + lnk = 1');
  sinError('test lnhoras + lnk = 1', b);
  chkb('el profesor explica los rendimientos a escala',
    texto(b).includes('rendimientos'));
}

console.log('\n=== ANOVA y dummies ===');
sinError('anova ingreso tamano', corre(ses, 'anova ingreso tamano'));
sinError('reg ingreso i.tamano, robust', corre(ses, 'reg ingreso i.tamano, robust'));
{
  const b = corre(ses, 'reg ingreso i.tamano, robust');
  const coef = b.find((x) => x.t === 'coef');
  chkb('i.tamano genera 3 indicadoras + constante', coef.fit.names.length === 4,
    coef.fit.names.join(' '));
  chkb('la diferencia de empresa grande coincide con el documento',
    Math.abs(coef.fit.b[2] - 287.3) < 25, `b=${coef.fit.b[2].toFixed(1)}`);
  const prof = b.find((x) => x.t === 'profe');
  chkb('el profesor dice contra qué grupo se compara',
    prof.bloque.filas.some((f) => f.texto.includes('categoría base') || f.texto.includes('Microempresa')));
}
{
  const b = corre(ses, 'reg ingreso tamano');
  chkb('sin i. el simulador avisa que tamano es un grupo',
    texto(b).includes('i.tamano'));
}
sinError('testparm i.tamano', (corre(ses, 'reg ingreso i.tamano, robust'), corre(ses, 'testparm i.tamano')));

console.log('\n=== logit y postestimación ===');
{
  const b = corre(ses, 'logit formal educ exper mujer');
  sinError('logit', b);
  const coef = b.find((x) => x.t === 'coef');
  chkb('coeficiente de educ cerca de 0.187', Math.abs(coef.fit.b[0] - 0.187) < 0.04, `b=${coef.fit.b[0].toFixed(4)}`);
  const prof = b.find((x) => x.t === 'profe');
  chkb('el profesor prohíbe leer el coeficiente como probabilidad',
    prof.bloque.items.some((i) => i.texto.includes('no</u> se pueden leer como probabilidad') ||
      i.texto.includes('no se pueden leer como probabilidad')));
  chkb('el profesor manda correr margins',
    prof.bloque.siguientes.some((s) => s.includes('margins')));
}
{
  const b = corre(ses, 'margins, dydx(*)');
  sinError('margins, dydx(*)', b);
  const coef = b.find((x) => x.t === 'coef');
  chkb('el efecto marginal de educ está entre 3 y 5 puntos',
    coef.fit.b[0] * 100 > 3 && coef.fit.b[0] * 100 < 5, `${(coef.fit.b[0] * 100).toFixed(2)} pp`);
}
sinError('estat classification', corre(ses, 'estat classification'));
sinError('lroc', corre(ses, 'lroc'));
sinError('lsens', corre(ses, 'lsens'));
sinError('estat gof', corre(ses, 'estat gof'));
sinError('marginsplot', corre(ses, 'marginsplot'));
{
  const b = corre(ses, 'logistic formal educ exper mujer');
  sinError('logistic', b);
  const prof = b.find((x) => x.t === 'profe');
  chkb('con odds ratio el profesor aclara que el neutro es 1',
    prof.bloque.items.some((i) => i.texto.includes('<strong>1</strong>')));
}
sinError('probit formal educ exper mujer', corre(ses, 'probit formal educ exper mujer'));

console.log('\n=== multinomial y ordenado ===');
{
  const b = corre(ses, 'mlogit situacion educ exper mujer, base(1)');
  sinError('mlogit', b);
  const prof = b.find((x) => x.t === 'profe');
  chkb('el profesor insiste en "comparado con"',
    prof.bloque.items.some((i) => i.texto.includes('comparado con')));
  chkb('hay filas para las dos comparaciones', prof.bloque.filas.length >= 6);
}
sinError('ologit satisf educ mujer', corre(ses, 'ologit satisf educ mujer'));
{
  const b = corre(ses, 'ologit satisf educ mujer');
  const prof = b.find((x) => x.t === 'profe');
  chkb('el profesor dice que los cortes no se interpretan',
    prof.bloque.items.some((i) => i.texto.includes('cut1')));
}

console.log('\n=== errores: el simulador debe corregir, no solo fallar ===');
sinError('regres es abreviatura válida de regress', corre(ses, 'regres ingreso educ'));
conError('comando mal escrito sugiere el correcto', corre(ses, 'regrss ingreso educ'), 'regress');
conError('otro comando mal escrito', corre(ses, 'sumarize ingreso'), 'summarize');
conError('variable inexistente sugiere la parecida', corre(ses, 'sum ingres'), 'ingreso');
conError('coma olvidada antes de robust', corre(ses, 'reg ingreso educ robust'), 'coma');
conError('usar = en una regresión', corre(ses, 'reg ingreso = educ'), 'no se escribe');
conError('generate sin =', corre(ses, 'gen nueva ingreso'), '=');
conError('un solo = al comparar', corre(ses, 'count if mujer = 1'), 'dos');
conError('modelo sin datos previos', (() => { const s2 = new Sesion(); return corre(s2, 'reg y x'); })(), 'no hay datos');
conError('estat sin modelo', (() => { const s2 = new Sesion(); corre(s2, 'use auto_ec, clear'); return corre(s2, 'estat vif'); })(), 'modelo');
conError('logit con variable no binaria', corre(ses, 'logit tamano educ'), 'mlogit');
conError('función mal escrita', corre(ses, 'gen z = lin(ingreso)'), 'ln');
conError('paréntesis sin cerrar', corre(ses, 'gen z = ln(ingreso'), 'paréntesis');
{
  const b = corre(ses, 'reg ingreso provincia');
  conError('variable de texto en un modelo', b, 'encode');
}

console.log('\n=== depuración sobre la base sucia ===');
const s3 = new Sesion();
sinError('use enemdu_eloro_2024_crudo, clear', corre(s3, 'use enemdu_eloro_2024_crudo, clear'));
chkb('la base sucia trae 3426 filas', s3.ds.n === 3426, `n=${s3.ds.n}`);
sinError('duplicates report', corre(s3, 'duplicates report'));
{
  const b = corre(s3, 'duplicates report');
  chkb('detecta las 14 filas repetidas', texto(b).includes('14'));
}
sinError('duplicates drop', corre(s3, 'duplicates drop'));
chkb('después de duplicates drop quedan 3412', s3.ds.n === 3412, `n=${s3.ds.n}`);
sinError('misstable summarize', corre(s3, 'misstable summarize'));
conError('destring falla con texto no numérico', corre(s3, 'destring ingreso_txt, gen(ingreso)'), 'ignore');
sinError('destring con ignore y force', corre(s3, 'destring ingreso_txt, gen(ingreso) ignore(".,$ ") force'));
chkb('ingreso quedó numérico', ses.ds !== s3.ds && !s3.ds.esString('ingreso'));
chkb('el formato 1.234,50 se convirtió bien',
  s3.ds.col('ingreso').filter((v) => v !== null && v > 0).length > 3000,
  `válidos=${s3.ds.col('ingreso').filter((v) => v !== null && v > 0).length}`);
// el texto viene con "Hombre", "hombre", "HOMBRE ", "H", "M"... hay que unificarlo todo
sinError('limpiar el texto de sexo', corre(s3, 'replace sexo_txt = upper(trim(sexo_txt))'));
{
  const b = corre(s3, 'encode sexo_txt, gen(sexo_sucio)');
  chkb('encode avisa cuando quedan categorías de más',
    texto(b).includes('viene sucio') || texto(b).includes('cuentan como tres') ||
    s3.ds.niveles('sexo_sucio').length > 2,
    `niveles=${s3.ds.niveles('sexo_sucio').length}`);
}
sinError('unificar las abreviaturas H y M', corre(s3, 'replace sexo_txt = "HOMBRE" if sexo_txt == "H"'));
sinError('unificar M', corre(s3, 'replace sexo_txt = "MUJER" if sexo_txt == "M"'));
sinError('encode sexo_txt', corre(s3, 'encode sexo_txt, gen(sexo)'));
chkb('encode dejó 2 categorías después de limpiar bien',
  s3.ds.niveles('sexo').length === 2, `niveles=${s3.ds.niveles('sexo').length}`);
sinError('mvdecode edad educ, mv(99)', corre(s3, 'mvdecode edad educ, mv(99)'));
chkb('los códigos 99 se volvieron faltantes',
  !s3.ds.col('edad').includes(99), '');
sinError('mvdecode horas, mv(999)', corre(s3, 'mvdecode horas, mv(999)'));
sinError('drop if missing(edad)', corre(s3, 'drop if missing(edad)'));

console.log('\n=== recodificar 5 categorías a 3 ===');
sinError('encode satisf_txt', corre(s3, 'encode satisf_txt, gen(satisf)'));
{
  const b = corre(s3, 'recode satisf (1 2 = 1) (3 = 2) (4 5 = 3), gen(satisf3)');
  sinError('recode 5 -> 3', b);
  chkb('satisf3 tiene 3 niveles', s3.ds.niveles('satisf3').length === 3,
    `niveles=${s3.ds.niveles('satisf3').join(',')}`);
  chkb('el profesor manda comprobar con tab', texto(b).includes('tab satisf satisf3'));
}
sinError('label define para la nueva', corre(s3, 'label define lbl3 1 "Triste" 2 "Normal" 3 "Feliz"'));
sinError('label values satisf3 lbl3', corre(s3, 'label values satisf3 lbl3'));
{
  const t = texto(corre(s3, 'tab satisf3'));
  chkb('la nueva variable muestra sus etiquetas', t.includes('Triste') && t.includes('Feliz'));
}
sinError('label variable', corre(s3, 'label variable satisf3 "Satisfacción en 3 niveles"'));
chkb('la etiqueta quedó puesta', s3.ds.meta('satisf3').label === 'Satisfacción en 3 niveles');
sinError('tab satisf satisf3 comprueba la recodificación', corre(s3, 'tab satisf satisf3'));

console.log('\n=== la trampa del faltante ===');
{
  const s4 = new Sesion();
  corre(s4, 'use enemdu_eloro_2024_crudo, clear');
  corre(s4, 'mvdecode edad, mv(99)');
  const antes = s4.ds.n;
  const b = corre(s4, 'keep if edad >= 18');
  chkb('keep if avisa de la trampa del faltante',
    texto(b).includes('más grande que cualquier número'), '');
  chkb('efectivamente conservó los faltantes (por eso el aviso)',
    s4.ds.contarFaltantes('edad') > 0, `faltantes=${s4.ds.contarFaltantes('edad')}`);
  void antes;
}

console.log('\n=== do-file completo ===');
{
  const s5 = new Sesion();
  const doFile = `
* ============================================
* Trabajo final de econometría
* ============================================
clear all
set more off

use enemdu_eloro_2024, clear

* 1. depuración
misstable summarize
drop if missing(ingreso, educ, exper)

* 2. variables nuevas
gen lningreso = ln(ingreso)
label variable lningreso "Logaritmo del ingreso"

* 3. descriptivas
summarize ingreso educ exper mujer
tab tamano

* 4. modelo
reg lningreso educ exper exper2 mujer i.tamano, robust
estimates store modelo1

* 5. supuestos
estat vif
estat hettest
estat ovtest
`;
  const res = ejecutarDoFile(doFile, s5);
  const conError2 = res.filter((r) => r.bloques && r.bloques.some((b) => b.t === 'err'));
  chkb('el do-file corre entero sin errores', conError2.length === 0,
    conError2.length ? conError2[0].linea + ' -> ' + conError2[0].bloques.find((b) => b.t === 'err').mensaje : '');
  chkb('se ejecutaron todas las líneas', !res.some((r) => r.detenido));
  chkb('quedó un modelo guardado', !!s5.modelosGuardados.modelo1);
}
{
  const s6 = new Sesion();
  const malo = 'use enemdu_eloro_2024, clear\nreg ingreso educ robust\nsummarize';
  const res = ejecutarDoFile(malo, s6);
  chkb('el do-file se detiene en la línea con error',
    res.some((r) => r.detenido) && res.find((r) => r.detenido).numero === 2,
    `se detuvo en la línea ${(res.find((r) => r.detenido) || {}).numero}`);
}

console.log('\n=== otras bases ===');
{
  const s7 = new Sesion();
  sinError('produccion_eloro', corre(s7, 'use produccion_eloro, clear'));
  sinError('gen lnq', corre(s7, 'gen lnq = ln(produccion)'));
  sinError('gen lnl', corre(s7, 'gen lnl = ln(trabajo)'));
  sinError('gen lnk2', corre(s7, 'gen lnk2 = ln(capital)'));
  const b = corre(s7, 'reg lnq lnl lnk2, robust');
  sinError('Cobb-Douglas de empresas', b);
  const coef = b.find((x) => x.t === 'coef');
  chkb('elasticidad del trabajo cerca de 0.62', Math.abs(coef.fit.b[0] - 0.62) < 0.07,
    `b=${coef.fit.b[0].toFixed(4)}`);
  sinError('test de rendimientos constantes', corre(s7, 'test lnl + lnk2 = 1'));
}
{
  const s8 = new Sesion();
  corre(s8, 'use hogares_satisfaccion, clear');
  corre(s8, 'gen lningh = ln(ingreso_hogar)');
  sinError('ologit en hogares', corre(s8, 'ologit satisfaccion lningh educ_jefe desempleo'));
  sinError('oprobit en hogares', corre(s8, 'oprobit satisfaccion lningh educ_jefe desempleo'));
}
{
  const s9 = new Sesion();
  corre(s9, 'use auto_ec, clear');
  sinError('base corta de autos', corre(s9, 'reg precio peso extranjero, robust'));
  sinError('histograma', corre(s9, 'histogram precio, normal'));
  sinError('scatter con recta', corre(s9, 'twoway (scatter precio peso) (lfit precio peso)'));
  sinError('graph box', corre(s9, 'graph box precio, over(extranjero)'));
  sinError('correlate', corre(s9, 'correlate precio peso rendimiento'));
  sinError('ttest by', corre(s9, 'ttest precio, by(extranjero)'));
}

console.log('\n=== ayuda ===');
sinError('ayuda general', corre(ses, 'ayuda'));
sinError('ayuda regress', corre(ses, 'ayuda regress'));
sinError('ayuda funciones', corre(ses, 'ayuda funciones'));
{
  const t = texto(corre(ses, 'ayuda logit'));
  chkb('la ayuda de logit insiste en margins', t.includes('margins'));
}

console.log('\n=== calidad de la salida ===');
{
  // ninguna salida debe contener undefined / NaN / [object Object]
  const s10 = new Sesion();
  const lineas = ['use enemdu_eloro_2024, clear', 'describe', 'summarize', 'tab tamano mujer, row chi2',
    'gen lny = ln(ingreso)', 'reg lny educ exper mujer i.tamano, robust', 'estat vif', 'estat hettest',
    'logit formal educ exper mujer', 'margins, dydx(*)', 'lroc', 'estat classification',
    'mlogit situacion educ mujer, base(1)', 'ologit satisf educ mujer', 'correlate ingreso educ exper'];
  let sucias = [];
  for (const l of lineas) {
    const t = texto(corre(s10, l));
    for (const mala of ['undefined', 'NaN', '[object Object]']) {
      if (t.includes(mala)) sucias.push(`${l} -> ${mala}`);
    }
  }
  chkb('ninguna salida tiene undefined / NaN / [object Object]', sucias.length === 0,
    sucias.slice(0, 3).join(' | '));
}

console.log(`\nRESULTADO: ${ok} pruebas OK, ${fallas} fallas`);
if (fallidas.length) {
  console.log('\nFallidas:');
  for (const f of fallidas) console.log('  - ' + f);
}
process.exit(fallas ? 1 : 0);

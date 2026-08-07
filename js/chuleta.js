// La chuleta: la secuencia de comandos EN ORDEN para cada modelo.
// Compacta, para tenerla al lado mientras trabajas. Cada paso se puede correr.

// El número del paso se pone solo al mostrarlo, para que nunca se
// desincronice cuando se agreguen o quiten pasos a la preparación.
const P = (paso, comandos, busca) => ({ paso: paso.replace(/^\d+\.\s*/, ''), comandos, busca });

// Preparación: se arranca de la base SUCIA, que es el caso real.
// Es la misma secuencia para todos los modelos, y deja la base lista.
const PREPARAR = [
  P('1. Abrir y conocer',
    ['use enemdu_eloro_2024_crudo, clear', 'describe', 'misstable summarize'],
    'Qué es texto y qué es número. Las de texto no entran en ningún modelo tal como vienen.'),
  P('2. Filas repetidas',
    ['duplicates report', 'duplicates drop', 'count'],
    'Si una encuesta se digitó dos veces, esa persona pesa el doble en todo.'),
  P('3. destring: números guardados como texto',
    ['gen str20 ing_limpio = trim(ingreso_txt)',
      'replace ing_limpio = subinstr(ing_limpio, ".", "", .) if strpos(ing_limpio, ",") > 0',
      'replace ing_limpio = subinstr(ing_limpio, ",", ".", .)',
      'destring ing_limpio, gen(ingreso) force',
      'drop ing_limpio',
      'summarize ingreso'],
    'El punto solo es separador de miles cuando en el MISMO número hay una coma. Si no hay coma, ese punto es el decimal.'),
  P('4. encode: texto de categorías a número',
    ['tab sexo_txt',
      'replace sexo_txt = upper(trim(sexo_txt))',
      'replace sexo_txt = "HOMBRE" if sexo_txt == "H"',
      'replace sexo_txt = "MUJER" if sexo_txt == "M"',
      'encode sexo_txt, gen(sexo)',
      'gen mujer = (sexo == 2) if !missing(sexo)',
      'label define lbl_sexo 0 "Hombre" 1 "Mujer"',
      'label values mujer lbl_sexo',
      'tab mujer'],
    'Limpia el texto ANTES de encode, o "Mujer", "MUJER " y "mujer" te salen como tres categorías.'),
  P('5. Las escalas se arman a mano',
    ['gen satisf = .',
      'replace satisf = 1 if satisf_txt == "Muy triste"',
      'replace satisf = 2 if satisf_txt == "Triste"',
      'replace satisf = 3 if satisf_txt == "Normal"',
      'replace satisf = 4 if satisf_txt == "Feliz"',
      'replace satisf = 5 if satisf_txt == "Muy feliz"',
      'label define lbl_sat 1 "Muy triste" 2 "Triste" 3 "Normal" 4 "Feliz" 5 "Muy feliz"',
      'label values satisf lbl_sat',
      'tab satisf'],
    'encode ordena ALFABÉTICAMENTE, no por la escala. Para una escala hay que fijar el orden tú.'),
  P('6. decode: el camino de vuelta',
    ['decode satisf, gen(satisf_palabra)', 'list satisf satisf_palabra in 1/8', 'drop satisf_palabra'],
    'Saca el texto de una variable etiquetada. Sirve para exportar tablas a Word.'),
  P('7. Códigos de no respuesta y atípicos',
    ['mvdecode edad educ, mv(99)', 'mvdecode horas, mv(999)',
      'drop if edad > 100 & !missing(edad)',
      'replace ingreso = . if ingreso == 999999',
      'summarize edad educ horas ingreso'],
    'El 99 y el 999 son "no responde", no datos. Una edad de 250 es imposible; un ingreso alto puede ser real.'),
  P('8. Etiquetar todo',
    ['label variable ingreso "Ingreso mensual (USD)"',
      'label variable educ "Años de estudio"',
      'label variable exper "Años de experiencia"',
      'label define lbl_tam 1 "Micro" 2 "Pequeña" 3 "Mediana" 4 "Grande"',
      'label values tamano lbl_tam',
      'label define lbl_si_no 0 "No" 1 "Sí"',
      'label values formal lbl_si_no',
      'describe'],
    'Son tres pasos: label variable nombra la columna, label define crea el diccionario y label values lo pega. El tercero es el que se olvida.'),
  P('9. Definir la muestra UNA sola vez',
    ['keep if edad >= 18 & edad <= 65 & !missing(edad)',
      'drop if missing(ingreso, educ, exper, horas)',
      'count'],
    'Si cada modelo bota filas distintas, los R² dejan de ser comparables. Ojo: el faltante vale más que cualquier número, por eso va !missing().'),
  P('10. Crear las variables derivadas',
    ['gen exper2 = exper^2', 'gen lningreso = ln(ingreso)',
      'label variable exper2 "Experiencia al cuadrado"',
      'label variable lningreso "Log del ingreso"'],
    'Recién ahora, con los datos limpios. El logaritmo solo existe para valores mayores que cero.'),
];

const DESCRIPTIVAS = [
  P('6. Descriptivas',
    ['summarize ingreso educ exper horas', 'summarize ingreso, detail', 'tab tamano', 'tab tamano formal, row chi2', 'tabstat ingreso, by(tamano) stats(n mean sd)', 'correlate ingreso educ exper horas', 'histogram ingreso, normal'],
    'Compara la media con la mediana: si difieren mucho, hay cola larga y conviene el logaritmo. Correlaciones sobre 0,8 avisan de multicolinealidad.'),
];

const SUPUESTOS_LIN = [
  P('8. Supuestos (en orden de gravedad)',
    ['estat ovtest', 'estat vif', 'estat hettest', 'estat imtest, white', 'predict u, resid', 'swilk u', 'rvfplot', 'linktest'],
    'ovtest p>0,05 · VIF<10 · hettest p>0,05 (si falla: robust) · normalidad casi nunca importa con N grande.'),
];

export const CHULETA = [
{
  id: 'mco', icono: '📈', nombre: 'Regresión lineal (MCO)',
  cuando: 'La variable a explicar es un número continuo: dólares, horas, kilos.',
  pasos: [
    ...PREPARAR, ...DESCRIPTIVAS,
    P('7. El modelo', ['reg ingreso educ exper exper2 mujer horas, robust', 'estimates store mco'],
      'robust corrige los valores p; NO cambia los coeficientes. Con encuesta va casi siempre.'),
    ...SUPUESTOS_LIN,
    P('9. Postestimación', ['margins, dydx(*)', 'test educ exper', 'nlcom -_b[exper]/(2*_b[exper2])'],
      'El punto de giro de un término cuadrático sale de -b1/(2*b2).'),
  ],
},
{
  id: 'logs', icono: '📐', nombre: 'Con logaritmos (elasticidades)',
  cuando: 'Quieres leer el resultado en PORCENTAJE en vez de en unidades.',
  pasos: [
    ...PREPARAR, ...DESCRIPTIVAS,
    P('7. Crear los logaritmos', ['gen lnhoras = ln(horas)', 'gen lnk = ln(k)'],
      'Solo existe para valores mayores que cero: filtra antes.'),
    P('8. Log-nivel (semielasticidad)', ['reg lningreso educ exper exper2 mujer, robust', 'nlcom (exp(_b[mujer]) - 1)*100'],
      'Coeficiente x100 = %, pero SOLO si es menor a 0,10. Si es mayor, usa la cuenta exacta del nlcom.'),
    P('9. Log-log (elasticidad de verdad)', ['reg lningreso lnhoras lnk, robust', 'lincom lnhoras + lnk', 'test lnhoras + lnk = 1'],
      '¿Suman 1? Rendimientos constantes. Menos de 1, decrecientes. No basta mirar la suma: hay que probarlo.'),
    ...SUPUESTOS_LIN,
  ],
},
{
  id: 'grupos', icono: '👥', nombre: 'Grupos, ANOVA y dummies',
  cuando: 'Comparar promedios entre categorías: tamaño de empresa, provincia, sector.',
  pasos: [
    ...PREPARAR,
    P('6. Descriptivas del grupo', ['tabstat ingreso, by(tamano) stats(n mean sd)', 'graph box ingreso, over(tamano)', 'robvar ingreso, by(tamano)'],
      'robvar comprueba que las varianzas sean iguales, que es el supuesto del ANOVA.'),
    P('7. ANOVA', ['anova ingreso tamano', 'oneway ingreso tamano, tabulate bonferroni'],
      'Un solo valor p: dice QUE hay diferencia, no CUÁL. Bonferroni corrige por hacer muchas pruebas.'),
    P('8. Lo mismo como regresión (da más)', ['reg ingreso i.tamano, robust', 'testparm i.tamano'],
      'La i. es OBLIGATORIA. Sin ella Stata cree que 1,2,3,4 son cantidades.'),
    P('9. Medias y comparaciones', ['margins tamano', 'marginsplot', 'pwcompare tamano, mcompare(bonferroni)'],
      'Medias ajustadas = lo que ganaría cada grupo en igualdad de condiciones.'),
    P('10. Con interacción', ['reg ingreso i.tamano##i.mujer, robust', 'testparm i.tamano#i.mujer'],
      '## crea los efectos principales Y la interacción. Pregunta si el efecto del tamaño es distinto para hombres y mujeres.'),
    P('11. El modelo final, con controles', ['reg ingreso i.tamano educ exper mujer, robust', 'estimates store ancova'],
      'Si las diferencias entre grupos se achican al meter controles, parte de la brecha venía de quién trabaja dónde. Los supuestos se revisan sobre ESTE modelo, que es el que lleva variables continuas.'),
    ...SUPUESTOS_LIN,
  ],
},
{
  id: 'binario', icono: '🎯', nombre: 'Sí / No (logit y probit)',
  cuando: 'La variable a explicar vale 0 o 1: tiene empleo formal, sí o no.',
  pasos: [
    ...PREPARAR,
    P('6. Comprobar que sea 0/1', ['tab formal', 'summarize formal'],
      'Si tiene 3 o más categorías, este no es el modelo: va mlogit u ologit.'),
    P('7. El de referencia (MPL)', ['reg formal educ exper mujer, robust', 'predict phat', 'count if phat < 0 | phat > 1'],
      'Fácil de leer, pero predice probabilidades imposibles. Aquí robust NO es opcional.'),
    P('8. El logit', ['logit formal educ exper mujer'],
      'El coeficiente crudo NO es una probabilidad. Solo se lee el signo y la significancia.'),
    P('9. margins — OBLIGATORIO', ['margins, dydx(*)', 'margins, at(educ=(0(3)18))', 'marginsplot'],
      'Aquí sale el número que va en tu texto: puntos de probabilidad.'),
    P('10. Momios (opcional)', ['logistic formal educ exper mujer'],
      'Es el MISMO modelo. Valor neutro = 1, no 0. "21% más momios" no es "21% más probabilidad".'),
    P('11. Qué tan bien clasifica', ['estat classification', 'lroc', 'lsens', 'estat gof, group(10)'],
      'AUC>0,70 aceptable. Compara el % de aciertos contra la categoría más frecuente. lsens elige el corte.'),
    P('12. Especificación', ['linktest'],
      '_hatsq NO debe ser significativa.'),
    P('13. Probit, para confirmar', ['probit formal educ exper mujer', 'margins, dydx(*)'],
      'Los coeficientes no se comparan con los del logit; los efectos marginales sí, y salen casi iguales.'),
  ],
},
{
  id: 'multi', icono: '🔱', nombre: 'Tres o más categorías',
  cuando: 'La variable a explicar tiene 3+ opciones. Con orden: ologit. Sin orden: mlogit.',
  pasos: [
    ...PREPARAR,
    P('6. Mirar las categorías', ['tab situacion', 'tab satisf'],
      'Que ninguna esté casi vacía. Y decidir: ¿tienen orden o no?'),
    P('7. SIN orden: mlogit', ['mlogit situacion educ exper mujer, base(1)', 'mlogit situacion educ exper mujer, base(1) rrr'],
      'TODO se lee "comparado con la categoría base". Sin esa frase, está mal dicho.'),
    P('8. Efectos marginales, categoría por categoría',
      ['margins, dydx(*) predict(outcome(1))', 'margins, dydx(*) predict(outcome(2))', 'margins, dydx(*) predict(outcome(3))'],
      'Estos SÍ son probabilidad y no necesitan la muletilla. Los tres suman cero.'),
    P('9. Pruebas del multinomial', ['test [2]educ [3]educ', 'mlogtest, hausman', 'mlogtest, combine'],
      'IIA: que agregar o quitar una opción no cambie cómo se comparan las demás. Probarlo suma mucho.'),
    P('10. CON orden: ologit', ['ologit satisf lningreso educ mujer', 'oprobit satisf lningreso educ mujer'],
      'Coeficiente positivo empuja hacia las categorías altas. Las filas /cut NO se interpretan.'),
    P('11. Recodificar si hace falta', ['recode satisf (1 2 = 1) (3 = 2) (4 5 = 3), gen(satisf3)', 'tab satisf satisf3', 'label define lbl3 1 "Triste" 2 "Normal" 3 "Feliz"', 'label values satisf3 lbl3'],
      'Siempre comprueba el cruce y etiqueta la nueva. Nunca juntes categorías para que salga significativo.'),
  ],
},
{
  id: 'conteo', icono: '🔢', nombre: 'Conteos (Poisson)',
  cuando: 'La variable cuenta cosas: número de hijos, de visitas, de veces.',
  pasos: [
    ...PREPARAR,
    P('6. Comprobar que sea un conteo', ['tab hijos', 'tabstat hijos, stats(mean var)'],
      'Enteros no negativos. Y Poisson exige que la media y la varianza se parezcan.'),
    P('7. El modelo', ['poisson hijos educ edad mujer', 'nlcom (exp(_b[educ]) - 1)*100'],
      'Los coeficientes están en logaritmo: se pasan a % con (e^b − 1)×100.'),
    P('8. Si la varianza es mucho mayor que la media',
      ['* eso es sobredispersión: en Stata real va nbreg',
        '* nbreg hijos educ edad mujer'],
      'nbreg (binomial negativa) es lo correcto cuando hay sobredispersión. No está en el simulador, pero sí en tu Stata: quítale el asterisco allá. Menciónalo en el informe.'),
  ],
},
{
  id: 'cierre', icono: '📊', nombre: 'Cerrar el trabajo',
  cuando: 'Ya tienes los modelos y hay que armar la tabla del informe.',
  pasos: [
    P('1. Partir de la base ya lista',
      ['use enemdu_eloro_2024, clear', 'gen lningreso = ln(ingreso)', 'count'],
      'Aquí se usa la base ya depurada. Si vienes de limpiar la cruda, sáltate este paso.'),
    P('2. Guardar cada modelo', ['quietly reg lningreso educ, robust', 'estimates store m1', 'quietly reg lningreso educ exper exper2, robust', 'estimates store m2', 'quietly reg lningreso educ exper exper2 mujer i.tamano, robust', 'estimates store m3'],
      'quietly corre sin mostrar la salida; estimates store lo guarda con un nombre.'),
    P('2. La tabla comparativa', ['estimates table m1 m2 m3'],
      'Si el coeficiente que te interesa se mantiene parecido en las tres columnas, tu hallazgo es sólido.'),
    P('3. Para Word (en Stata real)', ['esttab m1 m2 m3, se star(* 0.10 ** 0.05 *** 0.01)'],
      'Necesita: ssc install estout'),
  ],
},
];

/** Todos los comandos de un modelo, en orden, listos para correr. */
export function secuencia(id) {
  const m = CHULETA.find((x) => x.id === id);
  if (!m) return '';
  const comentar = (t) => {
    const out = []; let l = '*';
    for (const w of String(t).split(/\s+/)) {
      if (l !== '*' && (l + ' ' + w).length > 74) { out.push(l); l = '*'; }
      l += ' ' + w;
    }
    if (l !== '*') out.push(l);
    return out.join('\n');
  };
  const cab = ['* ' + '='.repeat(62), `* ${m.nombre}`, comentar(m.cuando),
    '* ' + '='.repeat(62), ''].join('\n');
  return cab + m.pasos.map((p, i) => {
    const t = `* ---- ${i + 1}. ${p.paso} `;
    return `\n${t}${'-'.repeat(Math.max(3, 74 - t.length))}\n${comentar(p.busca)}\n\n${p.comandos.join('\n')}`;
  }).join('\n');
}

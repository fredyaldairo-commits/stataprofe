// Catálogo de modelos ordenado del más fácil al más difícil.
// Cada ejemplo es autosuficiente: incluye el "use" y los "gen" que necesita,
// así se puede correr en cualquier momento sin depender de lo que hayas hecho antes.

export const REGLA = {
  titulo: 'La única regla que hay que memorizar',
  texto: `Mira <strong>qué tipo de cosa es lo que quieres explicar</strong> (la variable Y).
    Eso solo decide qué modelo va. Todo lo demás son detalles.`,
  ramas: [
    { y: 'Un número que puede tomar cualquier valor', ej: 'ingreso en dólares, producción, precio', modelo: 'Regresión (MCO)', n: [1, 2, 3] },
    { y: 'Un número, pero lo quieres leer en porcentaje', ej: '¿en qué % sube el sueldo por año de estudio?', modelo: 'Regresión con logaritmos', n: [6, 7, 8] },
    { y: 'Comparar promedios entre grupos', ej: '¿pagan distinto las empresas grandes?', modelo: 'ANOVA / dummies', n: [4, 5] },
    { y: 'Un sí o un no (dos opciones)', ej: '¿tiene empleo formal?', modelo: 'Logit / Probit', n: [9, 10, 11, 12] },
    { y: 'Tres o más opciones SIN orden', ej: 'formal / informal / cuenta propia', modelo: 'Mlogit / Mprobit', n: [15, 16] },
    { y: 'Tres o más opciones CON orden', ej: 'muy triste → muy feliz', modelo: 'Ologit / Oprobit', n: [13, 14] },
    { y: 'Un conteo (0, 1, 2, 3 … cosas que se cuentan)', ej: 'número de hijos, número de visitas', modelo: 'Poisson', n: [17] },
  ],
};

const M = (o) => o;

export const MODELOS_CATALOGO = [
// ═══════════════════════════════════ NIVEL 1 — la base de todo
M({
  n: 1, id: 'mco-simple', nombre: 'Regresión simple', nivel: 1, familia: 'Regresión lineal (MCO)',
  pregunta: '¿Cuánto cambia Y cuando cambia UNA sola variable?',
  ejemplo: '¿Cuántos dólares más gana alguien por cada año extra de estudio?',
  necesitas: 'Y numérica continua (dólares, horas, kilos). Una sola variable explicativa.',
  comandos: `use enemdu_eloro_2024, clear
reg ingreso educ, robust`,
  lectura: 'El coeficiente es <strong>directamente</strong> el cambio en las unidades de Y (aquí, dólares) por cada unidad más de X.',
  ojo: 'Este número está "sucio": mezcla el efecto de la educación con el de todo lo que no metiste. Alguien con más estudios suele tener también más experiencia, y aquí no se separan.',
  despues: [],
  cuandoNo: 'Casi nunca se usa solo en un trabajo. Sirve para entender la mecánica; para concluir se pasa a la múltiple.',
}),
M({
  n: 2, id: 'mco-multiple', nombre: 'Regresión múltiple', nivel: 1, familia: 'Regresión lineal (MCO)',
  pregunta: '¿Cuánto aporta cada variable, ya descontado el efecto de las demás?',
  ejemplo: '¿Cuánto pesa la educación en el ingreso, comparando personas con la misma experiencia, sexo y horas trabajadas?',
  necesitas: 'Y numérica continua. Varias variables explicativas.',
  comandos: `use enemdu_eloro_2024, clear
reg ingreso educ exper exper2 mujer horas, robust`,
  lectura: 'Cada coeficiente ya viene <strong>limpio</strong> de los demás: es como comparar dos personas idénticas en todo menos en esa variable. Esa frase — "manteniendo lo demás constante" — tiene que estar en tu interpretación.',
  ojo: 'Poner <code>exper</code> y <code>exper2</code> juntas es a propósito: hace que el efecto de la experiencia se curve (sube rápido al inicio y luego se aplana). Nunca metas una sin la otra.',
  despues: ['estat vif', 'estat hettest', 'estat ovtest', 'predict e, resid'],
  cuandoNo: 'Si tu Y es un sí/no o son categorías, este modelo no va. Baja a los números 9 en adelante.',
}),
// ═══════════════════════════════════ NIVEL 2 — grupos
M({
  n: 3, id: 'mco-dummies', nombre: 'Regresión con grupos (dummies)', nivel: 2, familia: 'Regresión lineal (MCO)',
  pregunta: '¿Cuánta diferencia hay entre categorías, controlando por lo demás?',
  ejemplo: '¿Cuánto más paga una empresa grande que una microempresa?',
  necesitas: 'Y numérica. Una variable de categorías (grupos), con la <code>i.</code> delante.',
  comandos: `use enemdu_eloro_2024, clear
reg ingreso i.tamano, robust
testparm i.tamano`,
  lectura: 'Cada coeficiente es la <strong>diferencia contra el grupo base</strong> (el que Stata dejó fuera), no un valor absoluto. "+287" quiere decir "287 dólares más <u>que una microempresa</u>".',
  ojo: '<strong>El error más caro de todos:</strong> si escribes <code>tamano</code> sin la <code>i.</code>, Stata cree que 1,2,3,4 son cantidades y supone que pasar de micro a pequeña vale lo mismo que de mediana a grande. Casi nunca es cierto.',
  despues: ['testparm i.tamano', 'reg ingreso ib3.tamano, robust'],
  cuandoNo: 'Si el grupo tiene un orden real y te interesa esa escalera, mira también los ordenados (13 y 14).',
}),
M({
  n: 4, id: 'anova', nombre: 'ANOVA', nivel: 2, familia: 'Regresión lineal (MCO)',
  pregunta: '¿Todos los grupos tienen el mismo promedio, o hay alguno distinto?',
  ejemplo: '¿Ganan igual las personas de micro, pequeñas, medianas y grandes empresas?',
  necesitas: 'Y numérica. Una o más variables de grupo. Ninguna variable continua.',
  comandos: `use enemdu_eloro_2024, clear
anova ingreso tamano
oneway ingreso tamano, tabulate`,
  lectura: 'Un solo valor p para toda la pregunta. Si es menor a 0,05: <strong>al menos un grupo</strong> es distinto de los demás.',
  ojo: '<strong>ANOVA no es un modelo aparte.</strong> Es exactamente la misma regresión del número 3, presentada distinto. Da el mismo R², el mismo F. Te dice <u>que hay</u> diferencia pero no <u>cuál</u>: para eso corre <code>reg ingreso i.tamano</code>.',
  despues: ['reg ingreso i.tamano, robust'],
  cuandoNo: 'Si además tienes variables continuas que quieres controlar, pasa al 5.',
}),
M({
  n: 5, id: 'ancova', nombre: 'ANCOVA (grupos + cantidades)', nivel: 2, familia: 'Regresión lineal (MCO)',
  pregunta: '¿La diferencia entre grupos se mantiene después de controlar por otras cosas?',
  ejemplo: '¿Las empresas grandes siguen pagando más una vez que descuento que ahí trabaja gente más preparada?',
  necesitas: 'Y numérica. Grupos (con <code>i.</code>) mezclados con variables continuas.',
  comandos: `use enemdu_eloro_2024, clear
reg ingreso i.tamano educ exper mujer, robust
testparm i.tamano`,
  lectura: 'Los coeficientes de los grupos ahora son diferencias <strong>a igualdad de educación y experiencia</strong>. Suelen achicarse respecto al modelo 3: esa caída es información valiosa, quiere decir que parte de la brecha venía de quién trabaja en cada tipo de empresa.',
  ojo: 'Se llama ANCOVA por costumbre, pero por debajo <strong>sigue siendo la misma regresión de siempre</strong>. No es un modelo nuevo que haya que aprender.',
  despues: ['testparm i.tamano', 'estat vif', 'estat hettest'],
  cuandoNo: '',
}),
// ═══════════════════════════════════ NIVEL 3 — porcentajes
M({
  n: 6, id: 'log-nivel', nombre: 'Log-nivel (semielasticidad)', nivel: 3, familia: 'Regresión con logaritmos',
  pregunta: '¿En qué PORCENTAJE cambia Y por cada unidad más de X?',
  ejemplo: '¿En qué porcentaje sube el sueldo por cada año extra de estudio?',
  necesitas: 'Y numérica y <strong>siempre positiva</strong> (para poder aplicarle logaritmo). X en sus unidades normales.',
  comandos: `use enemdu_eloro_2024, clear
gen lningreso = ln(ingreso)
reg lningreso educ exper exper2 mujer, robust`,
  lectura: 'El coeficiente por 100 da el cambio porcentual. Un 0,059 = <strong>5,9% más</strong> por cada año de estudio. Es la forma <u>más usada</u> en estudios de salarios, porque el efecto no depende de si la persona ya ganaba mucho o poco.',
  ojo: 'La cuenta rápida (×100) solo vale si el coeficiente es menor a 0,10. Si es más grande hay que usar la exacta: <strong>(e^b − 1) × 100</strong>. Con b = −0,147 la rápida da −14,7% pero la exacta da −13,7%. El profesor te avisa cuándo hace falta.',
  despues: ['estat hettest', 'estat ovtest'],
  cuandoNo: 'Si tu Y tiene ceros o negativos, <code>ln()</code> los deja vacíos y pierdes esas filas.',
}),
M({
  n: 7, id: 'nivel-log', nombre: 'Nivel-log', nivel: 3, familia: 'Regresión con logaritmos',
  pregunta: '¿Cuántas unidades cambia Y por cada 1% que sube X?',
  ejemplo: '¿Cuántos dólares más se ganan si la escolaridad sube un 1%?',
  necesitas: 'Y en sus unidades normales. X positiva y en logaritmo.',
  comandos: `use enemdu_eloro_2024, clear
gen lneduc = ln(educ + 1)
reg ingreso lneduc exper mujer, robust`,
  lectura: 'El coeficiente <strong>dividido para 100</strong> da el cambio en unidades de Y por cada 1% de X.',
  ojo: 'Es la menos usada de las cuatro. Sirve cuando X crece de forma muy desigual (población de una ciudad, tamaño de empresa) y quieres suavizar esos saltos. Fíjate en el <code>+1</code>: es para que <code>ln()</code> no falle con los que tienen cero años de estudio.',
  despues: [],
  cuandoNo: 'Si lo que quieres es comparar sensibilidades entre variables, usa log-log (8).',
}),
M({
  n: 8, id: 'log-log', nombre: 'Log-log · Cobb-Douglas (elasticidad)', nivel: 3, familia: 'Regresión con logaritmos',
  pregunta: '¿En qué porcentaje cambia Y por cada 1% que cambia X?',
  ejemplo: 'Si las horas trabajadas suben 1%, ¿cuánto sube el ingreso? ¿Y el capital?',
  necesitas: 'Todas las variables positivas y en logaritmo.',
  comandos: `use enemdu_eloro_2024, clear
gen lningreso = ln(ingreso)
gen lnhoras = ln(horas)
gen lnk = ln(k)
reg lningreso lnhoras lnk, robust
test lnhoras + lnk = 1`,
  lectura: '<strong>Esta es la única de las cuatro que es elasticidad de verdad.</strong> Las dos partes están en porcentaje, así que puedes comparar qué pesa más sin que estorben las unidades (dólares de capital contra horas de trabajo).',
  ojo: 'Si sumas las elasticidades: mayor a 1 = rendimientos crecientes, igual a 1 = constantes, menor a 1 = <strong>decrecientes</strong>. Pero no basta mirar la suma: hay que probarlo con <code>test lnhoras + lnk = 1</code>, porque podría estar cerca de 1 por casualidad.',
  despues: ['test lnhoras + lnk = 1', 'estat hettest'],
  cuandoNo: '',
}),
// ═══════════════════════════════════ NIVEL 3-4 — sí/no
M({
  n: 9, id: 'mpl', nombre: 'MPL (recta para un sí/no)', nivel: 3, familia: 'Modelos de sí/no',
  pregunta: '¿Cuántos puntos de probabilidad cambia la chance de que pase algo?',
  ejemplo: '¿Cuánto sube la probabilidad de tener empleo formal por cada año de estudio?',
  necesitas: 'Y que valga solo 0 o 1.',
  comandos: `use enemdu_eloro_2024, clear
reg formal educ exper mujer, robust`,
  lectura: 'Es la regresión de siempre, pero con Y de 0/1. El coeficiente se lee <strong>directo</strong> como puntos de probabilidad: 0,031 = 3,1 puntos más. Es el más fácil de explicar de los tres.',
  ojo: '<strong>Su problema de fondo:</strong> una recta estirada predice probabilidades de −8% o de 115%, que no existen. Mira la constante de este modelo y lo verás. Además el <code>robust</code> aquí <u>no es opcional</u>: con Y de 0/1 el error nunca puede ser parejo.',
  despues: ['predict p_mpl', 'summarize p_mpl'],
  cuandoNo: 'Para reportar en un trabajo casi siempre se prefiere el logit (10). El MPL sirve para tener una referencia rápida y fácil de leer.',
}),
M({
  n: 10, id: 'logit', nombre: 'Logit', nivel: 4, familia: 'Modelos de sí/no',
  pregunta: 'La misma que el MPL, pero con una curva que nunca sale del 0% al 100%.',
  ejemplo: '¿Qué hace más probable tener empleo formal?',
  necesitas: 'Y que valga solo 0 o 1.',
  comandos: `use enemdu_eloro_2024, clear
logit formal educ exper mujer
margins, dydx(*)`,
  lectura: '<strong>El coeficiente crudo NO se interpreta.</strong> De él solo sacas el signo y si es significativo. El número que se reporta sale de <code>margins, dydx(*)</code>, ya en puntos de probabilidad.',
  ojo: 'Saltarse el <code>margins</code> es el error más común del curso. Un 0,187 no significa "18,7%" de nada: es un paso intermedio en escala de logaritmo de momios.',
  despues: ['margins, dydx(*)', 'estat classification', 'lroc', 'lsens', 'estat gof', 'marginsplot'],
  cuandoNo: 'Si tus categorías son 3 o más, sube a mlogit (15) u ologit (13).',
}),
M({
  n: 11, id: 'probit', nombre: 'Probit', nivel: 4, familia: 'Modelos de sí/no',
  pregunta: 'La misma del logit, con una curva ligeramente distinta (la campana de Gauss).',
  ejemplo: '¿Qué hace más probable tener empleo formal?',
  necesitas: 'Y que valga solo 0 o 1.',
  comandos: `use enemdu_eloro_2024, clear
probit formal educ exper mujer
margins, dydx(*)`,
  lectura: 'Igual que el logit. Los coeficientes crudos <strong>no</strong> son comparables entre logit y probit, pero los efectos marginales de <code>margins</code> sí, y salen casi idénticos.',
  ojo: 'Correr los dos y mostrar que dan lo mismo se llama <strong>análisis de sensibilidad</strong> y queda muy bien en un trabajo: demuestra que tu conclusión no depende de qué curva elegiste.',
  despues: ['margins, dydx(*)', 'estat classification', 'lroc'],
  cuandoNo: '',
}),
M({
  n: 12, id: 'logistic', nombre: 'Logistic (razón de momios)', nivel: 4, familia: 'Modelos de sí/no',
  pregunta: 'El MISMO logit, mostrado en momios en vez de coeficientes.',
  ejemplo: '¿Por cuánto se multiplican los momios de ser formal por cada año de estudio?',
  necesitas: 'Y que valga solo 0 o 1.',
  comandos: `use enemdu_eloro_2024, clear
logistic formal educ exper mujer`,
  lectura: 'Es e^coeficiente. Los momios se <strong>multiplican</strong> por ese número. Un 1,206 = 20,6% más momios.',
  ojo: '<strong>Dos trampas.</strong> Primera: el valor neutro es el <strong>1</strong>, no el 0 (mayor a 1 ayuda, menor a 1 perjudica). Segunda: 1,206 significa "20,6% más <u>momios</u>", <strong>no</strong> "20,6% más probabilidad" — son cosas distintas. Si quieres hablar de probabilidad, usa <code>margins</code>.',
  despues: ['margins, dydx(*)'],
  cuandoNo: 'No es un modelo aparte: es el logit (10) con otra vista. No los reportes como si fueran dos modelos.',
}),
// ═══════════════════════════════════ NIVEL 5 — varias categorías
M({
  n: 13, id: 'ologit', nombre: 'Ologit (ordenado)', nivel: 5, familia: 'Tres o más categorías',
  pregunta: '¿Qué empuja hacia las categorías ALTAS de una escala ordenada?',
  ejemplo: '¿Qué hace que alguien pase de "triste" a "feliz"? (escala de 5 niveles)',
  necesitas: 'Y con 3 o más categorías <strong>que tengan un orden natural</strong>.',
  comandos: `use enemdu_eloro_2024, clear
gen lningreso = ln(ingreso)
ologit satisf lningreso educ mujer`,
  lectura: 'Coeficiente positivo = empuja hacia los niveles <strong>altos</strong>; negativo, hacia los bajos. Aprovecha la escalera, así que necesita muchos menos números que un mlogit.',
  ojo: 'Las filas <code>/cut1</code>, <code>/cut2</code>… <strong>no se interpretan</strong>: son solo las fronteras entre un nivel y el siguiente. No las comentes. Supone además "líneas paralelas": que el efecto es el mismo para pasar del 1 al 2 que del 4 al 5.',
  despues: [],
  cuandoNo: 'Si tus categorías NO tienen orden (formal/informal/cuenta propia), este modelo está mal usado: va mlogit (15).',
}),
M({
  n: 14, id: 'oprobit', nombre: 'Oprobit (ordenado)', nivel: 5, familia: 'Tres o más categorías',
  pregunta: 'La misma del ologit, con la curva normal por debajo.',
  ejemplo: '¿Qué determina la satisfacción del hogar, de 1 a 5?',
  necesitas: 'Y con 3 o más categorías ordenadas.',
  comandos: `use hogares_satisfaccion, clear
gen lningh = ln(ingreso_hogar)
oprobit satisfaccion lningh educ_jefe miembros desempleo`,
  lectura: 'Igual que el ologit. Se usa para confirmar que la conclusión no cambia según la curva.',
  ojo: 'Los coeficientes de ologit y oprobit no son comparables entre sí en tamaño, pero los <strong>signos y las significancias sí</strong>. Si coinciden, tu resultado es sólido.',
  despues: [],
  cuandoNo: '',
}),
M({
  n: 15, id: 'mlogit', nombre: 'Mlogit (multinomial)', nivel: 5, familia: 'Tres o más categorías',
  pregunta: '¿Qué hace más probable estar en una categoría en vez de otra, cuando no hay orden?',
  ejemplo: '¿Qué hace más probable ser informal o cuenta propia, en vez de asalariado formal?',
  necesitas: 'Y con 3 o más categorías <strong>sin orden</strong>.',
  comandos: `use enemdu_eloro_2024, clear
mlogit situacion educ exper mujer, base(1)`,
  lectura: 'La tabla sale más larga: hay un bloque por cada comparación contra la <strong>categoría base</strong>. <code>base(1)</code> dice cuál se usa de referencia.',
  ojo: '<strong>La regla de oro:</strong> nunca digas "la educación reduce la informalidad". Di "la educación reduce la probabilidad de ser informal <u>comparado con ser formal</u>". Sin esa segunda parte la frase afirma algo que el modelo nunca dijo. Es el error más castigado en una defensa.',
  despues: ['mlogit situacion educ exper mujer, base(2)'],
  cuandoNo: 'Si tus categorías SÍ tienen orden, estás desperdiciando información: usa ologit (13).',
}),
M({
  n: 16, id: 'mprobit', nombre: 'Mprobit (multinomial)', nivel: 5, familia: 'Tres o más categorías',
  pregunta: 'La misma del mlogit, con otra curva.',
  ejemplo: '¿Qué determina la situación laboral? (comprobación)',
  necesitas: 'Y con 3 o más categorías sin orden.',
  comandos: `use enemdu_eloro_2024, clear
mprobit situacion educ mujer, base(1)`,
  lectura: 'Se usa sobre todo para <strong>confirmar</strong> que la conclusión del mlogit no cambia. Si los signos coinciden, tu resultado aguanta.',
  ojo: 'Es más lento de calcular porque necesita integrar numéricamente. Y ojo: el <code>mprobit</code> de Stata <strong>todavía supone IIA</strong> por dentro, aunque mucha gente crea que no. Los que sí lo relajan son <code>asmprobit</code> y <code>nlogit</code>.',
  despues: [],
  cuandoNo: '',
}),
M({
  n: 17, id: 'poisson', nombre: 'Poisson (conteos)', nivel: 5, familia: 'Conteos',
  pregunta: '¿Qué explica un número de veces que pasa algo?',
  ejemplo: '¿Qué explica el número de hijos en el hogar?',
  necesitas: 'Y que sea un conteo: 0, 1, 2, 3… nunca negativo, nunca con decimales.',
  comandos: `use enemdu_eloro_2024, clear
poisson hijos educ edad mujer`,
  lectura: 'El coeficiente se lee en porcentaje: <strong>(e^b − 1) × 100</strong> da el cambio porcentual esperado en el conteo por cada unidad más de X.',
  ojo: 'Poisson supone que la media y la varianza del conteo son iguales. Cuando la varianza es mucho mayor (pasa seguido), lo correcto es <code>nbreg</code> (binomial negativa), que no está en este simulador.',
  despues: [],
  cuandoNo: 'Si el conteo tiene muchísimos ceros, existen modelos especiales (<code>zip</code>, <code>zinb</code>).',
}),
];

// Los que existen en Stata pero no en este simulador: hay que saber que están.
export const PRIMOS = [
  { nombre: 'ologit / oprobit', comando: 'ologit', cuando: 'Tus opciones SÍ tienen orden (pobre/medio/rico)',
    porque: 'Mlogit trataría "rico" y "pobre" como categorías sin relación. La versión ordenada aprovecha la escalera y necesita menos números.', enSimulador: true },
  { nombre: 'Logit condicional / efectos fijos', comando: 'clogit, xtlogit', cuando: 'Mides a las MISMAS personas varias veces en el tiempo',
    porque: 'El modelo base supone que cada observación es independiente. Si es la misma persona repetida, hay que avisarle al modelo.', enSimulador: false },
  { nombre: 'Logit con atributos de la alternativa', comando: 'asclogit', cuando: 'Cada opción tiene características propias (el precio de cada medio de transporte)',
    porque: 'Mlogit solo usa características de la persona (educación, sexo). Esta versión también usa las de cada opción.', enSimulador: false },
  { nombre: 'Probit multinomial completo / logit anidado', comando: 'asmprobit, nlogit', cuando: 'Sospechas que el supuesto IIA no se cumple',
    porque: 'Que agregar o quitar una opción no cambie cómo se comparan las demás. Estas versiones sí lo relajan, a cambio de ser mucho más lentas.', enSimulador: false },
  { nombre: 'Binomial negativa', comando: 'nbreg', cuando: 'Tu conteo tiene mucha más varianza que media',
    porque: 'Poisson obliga a que media y varianza sean iguales. Cuando no lo son, los errores estándar salen mal.', enSimulador: false },
];

export const NIVELES_DIF = {
  1: { nombre: 'Básico', color: 'sig' },
  2: { nombre: 'Básico +', color: 'sig' },
  3: { nombre: 'Intermedio', color: 'blue' },
  4: { nombre: 'Avanzado', color: 'ochre' },
  5: { nombre: 'Avanzado +', color: 'nosig' },
};

/** Bloque de supuestos que va después de cualquier modelo lineal.
 *  Trae su propio modelo delante para que se pueda correr suelto sin dar error:
 *  estas pruebas necesitan SÍ o SÍ una regresión corrida justo antes. */
export const SUPUESTOS_MCO = `use enemdu_eloro_2024, clear
reg ingreso educ exper exper2 mujer horas, robust

estat vif
estat hettest
estat ovtest
predict e, resid
qnorm
rvfplot`;

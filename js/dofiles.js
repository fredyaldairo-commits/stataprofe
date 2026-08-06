// Un do-file completo por cada modelo. Cada uno viene partido en secciones
// numeradas para poder correrlas de a una y no recibir todo el resultado de golpe.

const S = (t, porque, codigo) => ({ t, porque, codigo });

/** Secciones que se repiten en casi todos: abrir y depurar. */
const ABRIR = (base = 'enemdu_eloro_2024') => S(
  'Abrir la base y dejarla limpia',
  'Siempre se empieza igual: memoria vacía, base abierta y una sola depuración. Si cada modelo bota filas distintas, los R² dejan de ser comparables entre sí.',
  `clear all
set more off

use ${base}, clear

* ¿Cuántos vacíos hay y dónde?
misstable summarize`);

export const DOFILES = [
// ═══════════════════════════════════════════════════ 1
{
  n: 1, id: 'mco-simple', nombre: 'Regresión simple', familia: 'Regresión lineal (MCO)',
  base: 'enemdu_eloro_2024', y: 'ingreso', x: 'educ',
  resumen: 'Una sola variable explicativa. Sirve para entender la mecánica antes de complicar el modelo.',
  secciones: [
    ABRIR(),
    S('Dejar solo la muestra de trabajo',
      'Se define UNA vez la muestra y no se toca más. Ojo con la trampa: el faltante en Stata vale más que cualquier número, por eso va el !missing().',
      `keep if edad >= 18 & edad <= 65 & ingreso > 0
drop if missing(ingreso, educ)

count`),
    S('Las variables de este modelo',
      'Este modelo NO necesita variables nuevas: usa ingreso y educ tal como vienen. Lo que sí conviene siempre es etiquetarlas, para que la salida se lea sola.',
      `* ingreso : numérica continua  → sirve de dependiente
* educ    : numérica continua  → sirve de explicativa

label variable ingreso "Ingreso mensual (USD)"
label variable educ    "Años de estudio aprobados"

describe ingreso educ`),
    S('Mirar las variables antes de modelar',
      'Nunca corras un modelo sin haber visto los promedios, mínimos y máximos. Aquí es donde aparecen los errores que no viste antes.',
      `summarize ingreso educ

* la forma de la variable dependiente importa
histogram ingreso, normal`),
    S('El modelo',
      'Primero la variable que quieres explicar, después la explicativa. El robust corrige los valores p cuando unos varían más que otros: con datos de encuesta casi siempre hace falta.',
      `reg ingreso educ, robust`),
    S('Qué reportar',
      'Con una sola variable el coeficiente está "sucio": mezcla el efecto de la educación con todo lo que no metiste. Por eso esto casi nunca se reporta solo.',
      `* El coeficiente de educ = dólares más por cada año de estudio.
* El R2 dice qué parte del ingreso queda explicada.
* Pasa al do-file 2 para limpiar ese número con más controles.`),
  ],
},
// ═══════════════════════════════════════════════════ 2
{
  n: 2, id: 'mco-multiple', nombre: 'Regresión múltiple', familia: 'Regresión lineal (MCO)',
  base: 'enemdu_eloro_2024', y: 'ingreso', x: 'educ exper exper2 mujer horas',
  resumen: 'El modelo base de todo trabajo. Cada coeficiente ya viene limpio del efecto de los demás.',
  secciones: [
    ABRIR(),
    S('Muestra de trabajo',
      'Una sola vez, con todas las variables del modelo dentro del missing().',
      `keep if edad >= 18 & edad <= 65 & ingreso > 0
drop if missing(ingreso, educ, exper, horas)`),
    S('Crear las variables que faltan',
      'exper2 es la experiencia al cuadrado: hace que el efecto de la experiencia se curve (sube rápido al inicio y luego se aplana). Nunca metas una sin la otra.',
      `capture drop exper2
gen exper2 = exper^2
label variable exper2 "Experiencia al cuadrado"

* etiquetas para que las salidas se lean solas
label variable ingreso "Ingreso mensual (USD)"
label variable educ    "Años de estudio"
label variable exper   "Años de experiencia"
label variable mujer   "Sexo (1 = mujer)"
label variable horas   "Horas trabajadas al mes"

label define sexo 0 "Hombre" 1 "Mujer"
label values mujer sexo`),
    S('Descriptivas',
      'La tabla que va al principio de todo trabajo.',
      `summarize ingreso educ exper horas
tab mujer
correlate ingreso educ exper horas`),
    S('El modelo',
      'Cada coeficiente se lee "manteniendo lo demás constante": es como comparar dos personas idénticas salvo en esa variable.',
      `reg ingreso educ exper exper2 mujer horas, robust
estimates store completo`),
    S('El punto de giro de la experiencia',
      'Con un término al cuadrado, el efecto cambia de dirección en algún punto. Ese número se calcula con -b1/(2*b2) y su error estándar sale por método delta.',
      `nlcom -_b[exper]/(2*_b[exper2])`),
    S('Revisar los supuestos',
      'Stata siempre te da una tabla bonita, esté bien o mal usado el modelo. Por eso se revisa.',
      `estat vif        // multicolinealidad: más de 10 es problema
estat hettest    // heterocedasticidad: si p<0.05, usa robust
estat ovtest     // forma funcional: si p<0.05, prueba logaritmos
predict u, resid
swilk u          // normalidad de los residuos
rvfplot          // la nube debe ser pareja, sin forma de embudo`),
  ],
},
// ═══════════════════════════════════════════════════ 3
{
  n: 3, id: 'mco-dummies', nombre: 'Regresión con grupos (dummies)', familia: 'Regresión lineal (MCO)',
  base: 'enemdu_eloro_2024', y: 'ingreso', x: 'i.tamano',
  resumen: 'Cuando la variable explicativa son categorías y no cantidades. La i. es obligatoria.',
  secciones: [
    ABRIR(),
    S('Preparar la variable de grupo',
      'Antes de usarla, mira cuántas categorías tiene y ponle etiquetas: sin etiquetas la tabla sale con números pelados y no se entiende.',
      `drop if missing(ingreso, tamano)

tab tamano

label define tam 1 "Micro" 2 "Pequeña" 3 "Mediana" 4 "Grande"
label values tamano tam
label variable tamano "Tamaño de la empresa"

tab tamano`),
    S('Ver las diferencias antes de modelar',
      'Si los promedios ya se ven distintos, el modelo te lo va a confirmar. Si no, tampoco esperes milagros.',
      `tabstat ingreso, by(tamano) stats(n mean sd)
graph box ingreso, over(tamano)`),
    S('El modelo — la i. lo es todo',
      'Sin la i., Stata cree que 1,2,3,4 son cantidades y supone que pasar de micro a pequeña vale lo mismo que de mediana a grande. Casi nunca es cierto.',
      `reg ingreso i.tamano, robust`),
    S('¿El grupo importa en conjunto?',
      'Puede pasar que unas categorías salgan significativas y otras no. Esto da una sola respuesta para todo el grupo.',
      `testparm i.tamano`),
    S('Medias ajustadas y comparaciones',
      'Las medias ajustadas son lo que ganaría cada grupo en igualdad de condiciones. Las comparaciones por pares dicen entre cuáles hay diferencia de verdad.',
      `margins tamano
marginsplot

pwcompare tamano, mcompare(bonferroni)`),
    S('Cambiar el grupo base',
      'Los coeficientes son diferencias CONTRA la base. Si cambias la base, cambian todos los números aunque el modelo sea el mismo.',
      `reg ingreso ib4.tamano, robust`),
  ],
},
// ═══════════════════════════════════════════════════ 4
{
  n: 4, id: 'anova', nombre: 'ANOVA', familia: 'Regresión lineal (MCO)',
  base: 'enemdu_eloro_2024', y: 'ingreso', x: 'tamano',
  resumen: '¿Todos los grupos tienen el mismo promedio? Es la misma regresión de dummies, presentada distinto.',
  secciones: [
    ABRIR(),
    S('Preparar los grupos',
      'Igual que en el do-file 3: etiquetas primero.',
      `drop if missing(ingreso, tamano)

label define tam 1 "Micro" 2 "Pequeña" 3 "Mediana" 4 "Grande"
label values tamano tam

tabstat ingreso, by(tamano) stats(n mean sd)`),
    S('¿Se cumple el supuesto de varianzas iguales?',
      'El ANOVA clásico supone que la dispersión es igual en todos los grupos. Esto lo comprueba.',
      `robvar ingreso, by(tamano)`),
    S('El ANOVA',
      'Un solo valor p para toda la pregunta. Si es menor a 0.05, al menos un grupo se separa de los demás.',
      `anova ingreso tamano`),
    S('¿Cuál grupo se separa?',
      'El ANOVA dice QUE hay diferencia, no CUÁL. Con bonferroni se compara cada par corrigiendo por hacer muchas pruebas a la vez.',
      `oneway ingreso tamano, tabulate bonferroni`),
    S('Lo mismo, como regresión',
      'Da exactamente el mismo R2 y el mismo F. Compruébalo tú misma: es la prueba de que ANOVA no es un modelo aparte.',
      `reg ingreso i.tamano, robust`),
    S('ANOVA de dos vías con interacción',
      'La interacción pregunta si el efecto del tamaño de empresa es distinto para hombres y mujeres.',
      `anova ingreso tamano mujer tamano#mujer

* la misma idea escrita como regresión
reg ingreso i.tamano##i.mujer, robust`),
  ],
},
// ═══════════════════════════════════════════════════ 5
{
  n: 5, id: 'ancova', nombre: 'ANCOVA (grupos + cantidades)', familia: 'Regresión lineal (MCO)',
  base: 'enemdu_eloro_2024', y: 'ingreso', x: 'i.tamano educ exper mujer',
  resumen: '¿La diferencia entre grupos aguanta después de controlar por educación y experiencia?',
  secciones: [
    ABRIR(),
    S('Preparar todo',
      'Mezclamos una variable de grupo con variables continuas. Por debajo sigue siendo la misma regresión.',
      `keep if edad >= 18 & edad <= 65 & ingreso > 0
drop if missing(ingreso, educ, exper, tamano)

label define tam 1 "Micro" 2 "Pequeña" 3 "Mediana" 4 "Grande"
label values tamano tam`),
    S('Primero sin controles',
      'Guarda este resultado: lo vas a comparar en un minuto.',
      `reg ingreso i.tamano, robust
estimates store sin_controles`),
    S('Ahora con controles',
      'Aquí está la gracia: las diferencias entre empresas ahora están limpias del hecho de que en las grandes trabaja gente más preparada.',
      `reg ingreso i.tamano educ exper mujer, robust
estimates store con_controles`),
    S('Comparar los dos',
      'Si los coeficientes de tamaño se achican mucho, parte de la brecha venía de quién trabaja en cada tipo de empresa. Eso es un hallazgo, no un problema.',
      `estimates table sin_controles con_controles

testparm i.tamano`),
  ],
},
// ═══════════════════════════════════════════════════ 6
{
  n: 6, id: 'log-nivel', nombre: 'Log-nivel (semielasticidad)', familia: 'Regresión con logaritmos',
  base: 'enemdu_eloro_2024', y: 'lningreso', x: 'educ exper exper2 mujer',
  resumen: 'El resultado se lee en PORCENTAJE. Es la forma más usada en estudios de salarios.',
  secciones: [
    ABRIR(),
    S('Muestra',
      'El logaritmo solo existe para números mayores que cero: por eso el filtro de ingreso > 0 es obligatorio aquí.',
      `keep if edad >= 18 & edad <= 65 & ingreso > 0
drop if missing(ingreso, educ, exper)`),
    S('Crear las variables transformadas',
      'ln() aplica el logaritmo. Si quedara algún cero o negativo, esas filas saldrían vacías: por eso se filtró antes.',
      `* un capture drop por variable: si se ponen juntas y una no existe,
* falla el drop entero y la otra se queda sin borrar
capture drop lningreso
capture drop exper2

gen lningreso = ln(ingreso)
gen exper2    = exper^2

label variable lningreso "Logaritmo del ingreso mensual"
label variable exper2    "Experiencia al cuadrado"

* comprobar que no se generaron vacíos
count if missing(lningreso)
summarize ingreso lningreso`),
    S('El modelo',
      'Ahora el coeficiente ya no está en dólares sino en porcentaje.',
      `reg lningreso educ exper exper2 mujer, robust`),
    S('Pasar el coeficiente a porcentaje',
      'La cuenta rápida (x100) solo vale si el coeficiente es menor a 0.10. Para los más grandes hay que usar la cuenta exacta.',
      `* cuenta exacta para la variable de sexo (corrección de Halvorsen-Palmquist)
nlcom (exp(_b[mujer]) - 1)*100`),
    S('Supuestos',
      'Pasar a logaritmos suele arreglar de paso buena parte de la heterocedasticidad. Compruébalo comparando con el do-file 2.',
      `estat hettest
estat ovtest
predict u, resid
sktest u`),
  ],
},
// ═══════════════════════════════════════════════════ 7
{
  n: 7, id: 'nivel-log', nombre: 'Nivel-log', familia: 'Regresión con logaritmos',
  base: 'enemdu_eloro_2024', y: 'ingreso', x: 'lneduc exper mujer',
  resumen: 'La menos usada de las cuatro. Sirve cuando la variable explicativa crece de forma muy desigual.',
  secciones: [
    ABRIR(),
    S('Muestra',
      '',
      `keep if edad >= 18 & edad <= 65 & ingreso > 0
drop if missing(ingreso, educ, exper)`),
    S('Transformar solo la variable explicativa',
      'Fíjate en el +1: hay gente con cero años de estudio, y ln(0) no existe. Sumar 1 es el truco estándar para no perder esas filas.',
      `capture drop lneduc
gen lneduc = ln(educ + 1)
label variable lneduc "Log de los años de estudio"

summarize educ lneduc`),
    S('El modelo',
      'El coeficiente dividido para 100 da el cambio en dólares por cada 1% que sube la educación.',
      `reg ingreso lneduc exper mujer, robust`),
  ],
},
// ═══════════════════════════════════════════════════ 8
{
  n: 8, id: 'log-log', nombre: 'Log-log · Cobb-Douglas', familia: 'Regresión con logaritmos',
  base: 'enemdu_eloro_2024', y: 'lningreso', x: 'lnhoras lnk',
  resumen: 'La única de las cuatro que da elasticidades de verdad. Las dos partes en porcentaje.',
  secciones: [
    ABRIR(),
    S('Muestra',
      'Todas las variables que van a llevar logaritmo tienen que ser positivas.',
      `keep if edad >= 18 & edad <= 65 & ingreso > 0 & horas > 0 & k > 0
drop if missing(ingreso, horas, k)`),
    S('Transformar TODAS las variables',
      'En log-log el logaritmo va en la dependiente y en las explicativas. Por eso los coeficientes quedan en porcentaje contra porcentaje.',
      `* un capture drop por variable: si se ponen juntas y una no existe,
* falla el drop entero y las otras se quedan sin borrar
capture drop lningreso
capture drop lnhoras
capture drop lnk

gen lningreso = ln(ingreso)
gen lnhoras   = ln(horas)
gen lnk       = ln(k)

label variable lningreso "Log del ingreso"
label variable lnhoras   "Log de las horas trabajadas"
label variable lnk       "Log del capital de trabajo"

summarize lningreso lnhoras lnk`),
    S('El modelo',
      'Cada coeficiente es una elasticidad: "si las horas suben 1%, el ingreso sube tanto por ciento".',
      `reg lningreso lnhoras lnk, robust`),
    S('¿Rendimientos constantes a escala?',
      'Si las elasticidades suman 1, duplicar todo duplica el resultado. No basta mirar la suma: hay que probarlo, porque podría estar cerca de 1 por casualidad.',
      `* la suma con su intervalo de confianza
lincom lnhoras + lnk

* la prueba formal
test lnhoras + lnk = 1`),
    S('La misma idea con datos de empresas',
      'La Cobb-Douglas clásica se estima con producción, trabajo y capital de empresas.',
      `use produccion_eloro, clear

gen lnq = ln(produccion)
gen lnl = ln(trabajo)
gen lnk2 = ln(capital)

label variable lnq  "Log de la producción"
label variable lnl  "Log del trabajo"
label variable lnk2 "Log del capital"

reg lnq lnl lnk2, robust
test lnl + lnk2 = 1`),
  ],
},
// ═══════════════════════════════════════════════════ 9
{
  n: 9, id: 'mpl', nombre: 'MPL (recta para un sí/no)', familia: 'Modelos de sí/no',
  base: 'enemdu_eloro_2024', y: 'formal', x: 'educ exper mujer',
  resumen: 'La regresión de siempre, pero con Y de 0/1. Fácil de leer, con un defecto de fondo.',
  secciones: [
    ABRIR(),
    S('Comprobar que la dependiente sea de 0/1',
      'Antes de correr nada, verifica que la variable solo tome dos valores. Si tiene tres o más, este no es el modelo.',
      `drop if missing(formal, educ, exper)

tab formal
summarize formal`),
    S('Las variables de este modelo',
      'La dependiente tiene que ser 0/1. Si la tuya viniera como texto o con otros códigos, aquí es donde se arregla: esta sección te muestra las dos formas.',
      `* formal : 0/1        → dependiente
* educ   : continua   → explicativa
* exper  : continua   → explicativa
* mujer  : 0/1        → explicativa

label variable formal "Tiene empleo formal"
label define si_no 0 "No" 1 "Sí"
label values formal si_no

* Si tu dependiente NO fuera 0/1, se crea así:
*   gen formal01 = (situacion == 1)
*   label values formal01 si_no
* Y si viniera como texto ("Sí"/"No"):
*   encode formal_txt, gen(formal01)

tab formal`),
    S('El modelo — robust NO es opcional aquí',
      'Con Y de 0/1 el error nunca puede ser parejo: es un problema de fondo, no de tus datos. Por eso el robust es obligatorio en el MPL.',
      `reg formal educ exper mujer, robust`),
    S('Ver el defecto con tus propios ojos',
      'Una recta estirada predice probabilidades imposibles. Esta sección te lo muestra en números.',
      `predict phat
summarize phat

* ¿cuántas predicciones se salen del rango posible?
count if phat < 0
count if phat > 1

histogram phat`),
    S('Qué hacer con eso',
      '',
      `* Si hay predicciones fuera de 0-1, el MPL se queda como referencia rápida
* y el modelo que se reporta es el logit. Pasa al do-file 10.`),
  ],
},
// ═══════════════════════════════════════════════════ 10
{
  n: 10, id: 'logit', nombre: 'Logit', familia: 'Modelos de sí/no',
  base: 'enemdu_eloro_2024', y: 'formal', x: 'educ exper mujer',
  resumen: 'El modelo estándar para un sí/no. Ojo: el coeficiente crudo NO se interpreta.',
  secciones: [
    ABRIR(),
    S('Las variables de este modelo',
      'Etiqueta la dependiente: en un logit conviene tener clarísimo qué significa el 1. Este modelo no necesita variables nuevas, solo que la dependiente sea 0/1.',
      `* formal : 0/1        → dependiente (el 1 es "sí tiene empleo formal")
* educ   : continua   → explicativa
* exper  : continua   → explicativa
* mujer  : 0/1        → explicativa

drop if missing(formal, educ, exper)

label define si_no 0 "No" 1 "Sí"
label values formal si_no
label variable formal "Tiene empleo formal"

tab formal`),
    S('El modelo',
      'De estos coeficientes solo puedes leer el SIGNO y si son significativos. El 0.187 no significa 18.7% de nada.',
      `logit formal educ exper mujer`),
    S('EL PASO QUE NO SE PUEDE SALTAR',
      'margins traduce los coeficientes a puntos de probabilidad. Esto es lo que se reporta en un trabajo, no el coeficiente crudo.',
      `margins, dydx(*)`),
    S('La otra forma de leerlo: razón de momios',
      'Es el mismo modelo mostrado distinto. El valor neutro aquí es el 1, no el 0. Y "20% más momios" NO es "20% más probabilidad".',
      `logit formal educ exper mujer, or`),
    S('¿Qué tan bien clasifica?',
      'Cuidado con el porcentaje de aciertos: si el 85% de los casos son "no", decir siempre "no" ya te da 85% sin que el modelo sirva.',
      `estat classification
lroc
lsens
estat gof, group(10)`),
    S('Probabilidad predicha según la educación',
      'Esta tabla es la que mejor se explica sola: "con 6 años de estudio la probabilidad es X%, con 18 años es Y%".',
      `margins, at(educ=(0(3)18))
marginsplot`),
    S('Especificación',
      '_hatsq NO debe ser significativa. Si lo es, algo le falta al modelo.',
      `linktest`),
  ],
},
// ═══════════════════════════════════════════════════ 11
{
  n: 11, id: 'probit', nombre: 'Probit', familia: 'Modelos de sí/no',
  base: 'enemdu_eloro_2024', y: 'formal', x: 'educ exper mujer',
  resumen: 'Lo mismo que el logit con otra curva. Sirve para mostrar que tu conclusión no depende de cuál elegiste.',
  secciones: [
    ABRIR(),
    S('Las variables de este modelo',
      'Mismas variables que el logit: no hace falta transformar nada. Solo etiquetar.',
      `drop if missing(formal, educ, exper)

label variable formal "Tiene empleo formal"
label define si_no 0 "No" 1 "Sí"
label values formal si_no

tab formal`),
    S('El probit',
      'Los coeficientes crudos NO son comparables con los del logit. Los efectos marginales sí.',
      `probit formal educ exper mujer
margins, dydx(*)
estimates store probit_ame`),
    S('El logit, para comparar',
      'Si los efectos marginales salen casi iguales, tu resultado es sólido. Eso se llama análisis de sensibilidad y queda muy bien en un trabajo.',
      `logit formal educ exper mujer
margins, dydx(*)`),
    S('Los tres enfoques lado a lado',
      'MPL, logit y probit contestan lo mismo. Solo son comparables los efectos marginales, nunca los coeficientes crudos.',
      `quietly reg formal educ exper mujer, robust
estimates store MPL

quietly logit formal educ exper mujer
margins, dydx(*) post
estimates store LOGIT_AME

quietly probit formal educ exper mujer
margins, dydx(*) post
estimates store PROBIT_AME

esttab MPL LOGIT_AME PROBIT_AME, se star(* 0.10 ** 0.05 *** 0.01)`),
  ],
},
// ═══════════════════════════════════════════════════ 12
{
  n: 12, id: 'logistic', nombre: 'Logistic (razón de momios)', familia: 'Modelos de sí/no',
  base: 'enemdu_eloro_2024', y: 'formal', x: 'educ exper mujer',
  resumen: 'El mismo logit mostrado en momios. No es un modelo aparte: no lo reportes como si fueran dos.',
  secciones: [
    ABRIR(),
    S('Las variables de este modelo',
      'No hay nada que transformar: logistic usa exactamente las mismas variables que el logit.',
      `drop if missing(formal, educ, exper)

label variable formal "Tiene empleo formal"
label define si_no 0 "No" 1 "Sí"
label values formal si_no`),
    S('Las dos formas del mismo modelo',
      'Corre las dos y compara: la log-verosimilitud es idéntica, porque es el mismo cálculo.',
      `logit formal educ exper mujer

logistic formal educ exper mujer`),
    S('Cómo se lee la razón de momios',
      'Se multiplica, no se suma. Por eso el neutro es el 1.',
      `* Una razón de 1.21 = 21% MÁS MOMIOS, no 21% más probabilidad.
* Si quieres hablar de probabilidad, usa margins:
margins, dydx(*)`),
  ],
},
// ═══════════════════════════════════════════════════ 13
{
  n: 13, id: 'ologit', nombre: 'Ologit (ordenado)', familia: 'Tres o más categorías',
  base: 'enemdu_eloro_2024', y: 'satisf', x: 'lningreso educ mujer',
  resumen: 'Para categorías CON orden. Aprovecha la escalera y necesita menos números que un mlogit.',
  secciones: [
    ABRIR(),
    S('Mirar la variable ordenada',
      'Comprueba que las categorías tengan un orden real y que todas tengan casos suficientes.',
      `drop if missing(satisf, ingreso, educ)

label define sat 1 "Muy triste" 2 "Triste" 3 "Normal" 4 "Feliz" 5 "Muy feliz"
label values satisf sat
label variable satisf "Satisfacción con la vida"

tab satisf`),
    S('Transformar el ingreso',
      'En modelos de satisfacción el ingreso casi siempre entra en logaritmo: lo que importa no es un dólar más, sino el cambio relativo.',
      `capture drop lningreso
gen lningreso = ln(ingreso)
label variable lningreso "Log del ingreso"`),
    S('El modelo',
      'Coeficiente positivo = empuja hacia las categorías altas. Las filas /cut1, /cut2... NO se interpretan.',
      `ologit satisf lningreso educ mujer`),
    S('Recodificar de 5 a 3 categorías',
      'A veces los extremos tienen muy pocos casos y conviene juntarlos. SIEMPRE se comprueba con un tab cruzado y se etiqueta el resultado.',
      `recode satisf (1 2 = 1) (3 = 2) (4 5 = 3), gen(satisf3)

label define sat3 1 "Triste" 2 "Normal" 3 "Feliz"
label values satisf3 sat3
label variable satisf3 "Satisfacción en 3 niveles"

* comprobar que cada valor cayó donde debía
tab satisf satisf3

ologit satisf3 lningreso educ mujer`),
  ],
},
// ═══════════════════════════════════════════════════ 14
{
  n: 14, id: 'oprobit', nombre: 'Oprobit (ordenado)', familia: 'Tres o más categorías',
  base: 'hogares_satisfaccion', y: 'satisfaccion', x: 'lningh educ_jefe miembros desempleo',
  resumen: 'La versión con curva normal. Se usa para confirmar que la conclusión del ologit aguanta.',
  secciones: [
    S('Abrir la base de hogares',
      'Esta base es de hogares, no de personas: la unidad de análisis cambia y hay que decirlo en el informe.',
      `clear all
set more off

use hogares_satisfaccion, clear
describe
tab satisfaccion`),
    S('Transformar',
      '',
      `drop if missing(satisfaccion, ingreso_hogar, educ_jefe)

gen lningh = ln(ingreso_hogar)
label variable lningh "Log del ingreso del hogar"

summarize ingreso_hogar lningh`),
    S('Los dos modelos, para comparar',
      'Los coeficientes no son comparables en tamaño entre ologit y oprobit, pero los signos y las significancias sí. Si coinciden, el resultado es firme.',
      `ologit  satisfaccion lningh educ_jefe miembros desempleo
oprobit satisfaccion lningh educ_jefe miembros desempleo`),
  ],
},
// ═══════════════════════════════════════════════════ 15
{
  n: 15, id: 'mlogit', nombre: 'Mlogit (multinomial)', familia: 'Tres o más categorías',
  base: 'enemdu_eloro_2024', y: 'situacion', x: 'educ exper mujer',
  resumen: 'Para 3 o más categorías SIN orden. Todo se interpreta "comparado con la categoría base".',
  secciones: [
    ABRIR(),
    S('Mirar las categorías',
      'Comprueba que ninguna categoría esté casi vacía: con pocos casos los coeficientes salen inestables.',
      `drop if missing(situacion, educ, exper)

* con /// se parte una línea larga y se sigue abajo
label define sit 1 "Asalariado formal" ///
                 2 "Asalariado informal" ///
                 3 "Cuenta propia"
label values situacion sit
label variable situacion "Situación laboral"

tab situacion`),
    S('El modelo',
      'base(1) dice cuál categoría se usa de referencia. Sale un bloque de coeficientes por cada comparación.',
      `mlogit situacion educ exper mujer, base(1)`),
    S('En razones de riesgo relativo',
      'Es e^coeficiente, igual que la razón de momios. El neutro es el 1.',
      `mlogit situacion educ exper mujer, base(1) rrr`),
    S('Efectos marginales, categoría por categoría',
      'Estos SÍ son puntos de probabilidad y no necesitan la muletilla de "comparado con". Los de las tres categorías suman cero: si una sube, otra baja.',
      `margins, dydx(*) predict(outcome(1))
margins, dydx(*) predict(outcome(2))
margins, dydx(*) predict(outcome(3))`),
    S('¿Una variable importa en todas las ecuaciones?',
      'Prueba el mismo coeficiente en las dos comparaciones a la vez.',
      `test [2]educ [3]educ`),
    S('El supuesto IIA',
      'Que agregar o quitar una opción no cambie cómo se comparan las demás. Probarlo y reportarlo suma mucho en un trabajo.',
      `mlogtest, hausman
mlogtest, combine`),
    S('Cambiar la base',
      'Cambian TODOS los números aunque el modelo sea el mismo. Por eso hay que decir siempre contra qué comparas.',
      `mlogit situacion educ exper mujer, base(2)`),
  ],
},
// ═══════════════════════════════════════════════════ 16
{
  n: 16, id: 'mprobit', nombre: 'Mprobit (multinomial)', familia: 'Tres o más categorías',
  base: 'enemdu_eloro_2024', y: 'situacion', x: 'educ exper mujer',
  resumen: 'La versión con otra curva. Se usa para confirmar que el mlogit no depende de la curva elegida.',
  secciones: [
    ABRIR(),
    S('Preparar', '', `drop if missing(situacion, educ, exper)

* con /// se parte una línea larga y se sigue abajo
label define sit 1 "Asalariado formal" ///
                 2 "Asalariado informal" ///
                 3 "Cuenta propia"
label values situacion sit
tab situacion`),
    S('Los dos modelos',
      'Compara los signos y las significancias. Si coinciden, tu conclusión aguanta el cambio de modelo.',
      `mlogit  situacion educ exper mujer, base(1)
mprobit situacion educ exper mujer, base(1)`),
    S('Nota sobre IIA',
      '',
      `* Ojo: el mprobit de Stata TAMBIÉN supone IIA por dentro, aunque
* mucha gente crea que no. Los que sí lo relajan son asmprobit y nlogit.`),
  ],
},
// ═══════════════════════════════════════════════════ 17
{
  n: 17, id: 'poisson', nombre: 'Poisson (conteos)', familia: 'Conteos',
  base: 'enemdu_eloro_2024', y: 'hijos', x: 'educ edad mujer',
  resumen: 'Para variables que se cuentan: 0, 1, 2, 3... Nunca negativas, nunca con decimales.',
  secciones: [
    ABRIR(),
    S('Comprobar que sea un conteo',
      'Mira que sean enteros no negativos, y compara la media con la varianza: ese es el supuesto clave del modelo.',
      `drop if missing(hijos, educ, edad)

tab hijos
summarize hijos, detail

* el supuesto de Poisson: media = varianza
tabstat hijos, stats(mean var)`),
    S('Las variables de este modelo',
      'La dependiente tiene que ser un conteo entero no negativo. Si la tuya viniera con decimales o negativos, este no es el modelo.',
      `* hijos : conteo 0,1,2,3...  → dependiente
* educ  : continua           → explicativa
* edad  : continua           → explicativa
* mujer : 0/1                → explicativa

label variable hijos "Número de hijos en el hogar"
label variable edad  "Edad en años cumplidos"

* comprobar que de verdad son enteros no negativos
count if hijos < 0
count if hijos != int(hijos)`),
    S('El modelo',
      'Los coeficientes están en escala de logaritmo: se pasan a porcentaje con (e^b - 1)*100.',
      `poisson hijos educ edad mujer`),
    S('Pasar un coeficiente a porcentaje',
      '',
      `nlcom (exp(_b[educ]) - 1)*100`),
    S('Si la varianza es mucho mayor que la media',
      '',
      `* Eso se llama sobredispersión y hace que los errores estándar salgan
* más chicos de lo que deberían. Lo correcto sería nbreg (binomial
* negativa), que no está en este simulador: menciónalo en el informe.`),
  ],
},
// ═══════════════════════════════════════════════════ 18 — depuración
{
  n: 18, id: 'depuracion', nombre: 'Depuración completa (base sucia)', familia: 'Preparación de datos',
  base: 'enemdu_eloro_2024_crudo', y: '—', x: '—',
  resumen: 'Todo el trabajo previo: texto a número, códigos de no respuesta, duplicados, atípicos y etiquetas.',
  secciones: [
    S('Abrir la base tal como viene del campo',
      'Esta es la base sin depurar: texto mal escrito, códigos 99 y 999, celdas vacías, filas repetidas y edades imposibles.',
      `clear all
set more off

use enemdu_eloro_2024_crudo, clear
describe
misstable summarize`),
    S('Filas repetidas',
      'Si una encuesta se digitó dos veces, esa persona pesa el doble en todos tus resultados. Primero se mira, después se borra.',
      `duplicates report
duplicates drop`),
    S('Números guardados como texto: la regla del punto de miles',
      'Aquí hay TRES formatos mezclados, como cuando digitan varias personas: "1.234,50" (punto de miles y coma decimal), "554,31" (solo coma) y "843.47" (punto decimal). Un destring a secas los arruina.',
      `list ingreso_txt in 1/15

* LA REGLA QUE LO RESUELVE: el punto solo es separador de miles cuando en
* el MISMO número hay una coma. Si no hay coma, ese punto es el decimal.

gen str20 ing_limpio = trim(ingreso_txt)

* 1) quitar el punto de miles SOLO donde hay coma decimal
replace ing_limpio = subinstr(ing_limpio, ".", "", .) ///
        if strpos(ing_limpio, ",") > 0

* 2) la coma decimal pasa a punto, que es lo que Stata entiende
replace ing_limpio = subinstr(ing_limpio, ",", ".", .)

destring ing_limpio, gen(ingreso) force
drop ing_limpio

label variable ingreso "Ingreso mensual (USD)"
summarize ingreso
count if missing(ingreso)`),
    S('Limpiar el texto antes de convertirlo',
      'Para Stata "Mujer", "MUJER " y "mujer" son tres cosas distintas. Si no unificas primero, encode te crea categorías de más.',
      `replace sexo_txt = upper(trim(sexo_txt))
replace sexo_txt = "HOMBRE" if sexo_txt == "H"
replace sexo_txt = "MUJER"  if sexo_txt == "M"

tab sexo_txt`),
    S('Texto de categorías a número',
      'encode numera las categorías y les pone las etiquetas solo. Siempre necesita gen().',
      `encode sexo_txt, gen(sexo)
tab sexo`),
    S('La trampa de encode con las ESCALAS',
      'encode ordena ALFABÉTICAMENTE, no por la escala. Para satisfacción daría Feliz, Muy feliz, Muy triste, Normal, Triste: un desorden. Cuando la variable es una escala, el orden se arma a mano.',
      `* así se ve el desorden que produce encode:
encode satisf_txt, gen(satisf_alf)
tab satisf_alf
drop satisf_alf

* la forma correcta, fijando el orden de la escala:
gen satisf = .
replace satisf = 1 if satisf_txt == "Muy triste"
replace satisf = 2 if satisf_txt == "Triste"
replace satisf = 3 if satisf_txt == "Normal"
replace satisf = 4 if satisf_txt == "Feliz"
replace satisf = 5 if satisf_txt == "Muy feliz"

label define lbl_sat 1 "Muy triste" 2 "Triste" 3 "Normal" ///
                     4 "Feliz" 5 "Muy feliz"
label values satisf lbl_sat
label variable satisf "Satisfacción con la vida"

tab satisf
count if missing(satisf)`),
    S('decode: el camino de vuelta',
      'decode saca el texto de una variable numérica etiquetada. Sirve para exportar tablas a Word, donde quieres leer la palabra y no el código.',
      `decode satisf, gen(satisf_palabra)
list satisf satisf_palabra in 1/10
drop satisf_palabra`),
    S('Códigos de no respuesta',
      'Si no los conviertes, Stata cree que hay gente con 99 años de estudio y el promedio sale absurdo. Cada variable puede tener su propio código.',
      `mvdecode edad educ, mv(99)
mvdecode horas, mv(999)

summarize edad educ horas`),
    S('Valores imposibles',
      'Un ingreso alto puede ser real; una edad de 250 años no. Bota solo lo físicamente imposible y dilo en el informe.',
      `summarize edad, detail
drop if edad > 100 & !missing(edad)

count`),
    S('Etiquetar todo',
      'Sin etiquetas las tablas salen con números pelados. Son tres pasos: nombrar la columna, crear el diccionario y pegarlo.',
      `label variable educ  "Años de estudio"
label variable exper "Años de experiencia"
label variable horas "Horas trabajadas al mes"

label define tam 1 "Micro" 2 "Pequeña" 3 "Mediana" 4 "Grande"
label values tamano tam

label define si_no 0 "No" 1 "Sí"
label values formal si_no

describe`),
    S('Crear las variables derivadas',
      'Recién ahora, con los datos limpios, se crean las transformaciones.',
      `gen lningreso = ln(ingreso)
gen exper2    = exper^2

label variable lningreso "Log del ingreso"
label variable exper2    "Experiencia al cuadrado"

drop if missing(ingreso, educ, exper)
count`),
    S('Comprobar que quedó utilizable',
      'Si esto corre sin errores, la base ya sirve para cualquiera de los 17 modelos.',
      `misstable summarize
summarize ingreso educ exper horas
reg lningreso educ exper exper2, robust`),
  ],
},
];

/** Parte un texto largo en líneas de comentario que quepan en 74 caracteres. */
function comentar(texto, ancho = 74) {
  const out = [];
  let linea = '*';
  for (const p of String(texto).split(/\s+/)) {
    if (linea !== '*' && (linea + ' ' + p).length > ancho) { out.push(linea); linea = '*'; }
    linea += ' ' + p;
  }
  if (linea !== '*') out.push(linea);
  return out;
}

/** Junta las secciones en un solo archivo .do con encabezado. */
export function textoCompleto(df) {
  const raya = '* ' + '='.repeat(62);
  const cab = [
    raya,
    `* Do-file ${df.n} — ${df.nombre}`,
    '*',
    ...comentar(df.resumen),
    '*',
    `* Base:         ${df.base}`,
    df.y !== '—' ? `* Dependiente:  ${df.y}` : null,
    df.x !== '—' ? `* Explicativas: ${df.x}` : null,
    '*',
    '* Autora: (tu nombre)          Fecha: (fecha)',
    raya,
    '',
  ].filter((l) => l !== null);
  const cuerpo = df.secciones.map((s, i) => {
    const titulo = `* ---- ${i + 1}. ${s.t} `;
    const t = [titulo + '-'.repeat(Math.max(3, 74 - titulo.length))];
    if (s.porque) t.push(...comentar(s.porque));
    t.push('');
    t.push(s.codigo);
    return t.join('\n');
  }).join('\n\n');
  return cab.join('\n') + cuerpo + '\n';
}

export const FAMILIAS_DO = [...new Set(DOFILES.map((d) => d.familia))];

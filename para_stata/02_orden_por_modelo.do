* =============================================================================
* 02 — EL ORDEN DE LOS COMANDOS, MODELO POR MODELO
*
* Cada bloque va SIEMPRE en el mismo orden:
*      descriptivas  ->  modelo  ->  supuestos  ->  postestimación
*
* Corre primero 01_depurar_etiquetar.do, que deja lista la base.
* Autora: (tu nombre)                                    Fecha: (fecha)
* =============================================================================

clear all
set more off
cd "C:/Users/USER/Downloads/StataProfe/para_stata"
use "enemdu_eloro_limpia.dta", clear

capture log close
log using "02_modelos.log", replace text


* #############################################################################
* PARTE A — DESCRIPTIVAS: siempre antes de cualquier modelo
* #############################################################################

* --- A1. Lo básico de las variables numéricas ---
summarize ingreso educ exper horas k

* --- A2. Con percentiles, para ver la forma ---
* Compara la MEDIA con el percentil 50 (la mediana).
* Si la media es mucho mayor, hay cola larga a la derecha -> usa logaritmos.
summarize ingreso, detail

* --- A3. Las categóricas van con tab, NO con summarize ---
* El promedio de "tamaño de empresa" no significa nada.
tab tamano
tab situacion
tab mujer

* --- A4. Cruces entre categóricas, con la prueba de independencia ---
tab tamano formal, row chi2

* --- A5. Promedios por grupo: la tabla que va en todo trabajo ---
tabstat ingreso educ exper, by(tamano) stat(n mean sd) col(stat)

* --- A6. Correlaciones: para explorar y detectar variables repetidas ---
* Si dos pasan de 0.8, no las metas juntas en el mismo modelo.
correlate ingreso educ exper horas
pwcorr ingreso educ exper horas, sig star(.05)

* --- A7. Gráficos ---
histogram ingreso, normal name(g1, replace)
histogram lningreso, normal name(g2, replace)     // compara: el log lo endereza
graph box ingreso, over(tamano) name(g3, replace)


* #############################################################################
* PARTE B — MODELO 1: REGRESIÓN LINEAL (MCO)
* Cuándo: la variable a explicar es un NÚMERO continuo (dólares, horas).
* #############################################################################

* --- B1. El modelo ---
* robust corrige los valores p; NO cambia los coeficientes.
reg ingreso educ exper exper2 mujer horas, robust
estimates store mco

* --- B2. SUPUESTOS, en orden de gravedad ---

* B2.1 Multicolinealidad: ¿hay variables que son casi la misma?
*      VIF < 5 bien | 5 a 10 ojo | > 10 problema.
*      OJO: exper y exper2 SIEMPRE dan VIF alto. Es normal, no se arregla.
estat vif

* B2.2 Forma funcional (RESET): ¿falta una variable o la relación es curva?
*      ES EL MÁS GRAVE: si falla, los coeficientes están sesgados.
*      Si p < 0.05 -> prueba logaritmos o mete un término al cuadrado.
estat ovtest

* B2.3 Heterocedasticidad: ¿el error es igual de grande para todos?
*      Si p < 0.05 -> agrega robust. Eso es todo. NO sesga los coeficientes.
estat hettest
estat imtest, white

* B2.4 Normalidad de los residuos: el MENOS grave de todos.
*      Con muestras grandes casi siempre se rechaza y no importa.
predict u, resid
swilk u
sktest u
qnorm u, name(g4, replace)

* B2.5 El gráfico que resume todo: la nube debe ser pareja.
*      Forma de embudo -> heterocedasticidad. Forma de U -> falta forma funcional.
rvfplot, yline(0) name(g5, replace)

* --- B3. Postestimación ---
test educ exper                        // ¿aportan las dos juntas?
nlcom -_b[exper]/(2*_b[exper2])        // punto de giro de la experiencia
margins, dydx(*)                       // efecto marginal promedio


* #############################################################################
* PARTE C — MODELO 2: REGRESIÓN EN LOGARITMOS (elasticidades)
* Cuándo: quieres leer el resultado en PORCENTAJE.
* #############################################################################

* --- C1. Log-nivel (semielasticidad): % por cada unidad ---
reg lningreso educ exper exper2 mujer, robust
estimates store mincer

* El coeficiente x 100 da el %, pero SOLO si es menor a 0.10.
* Si es más grande, la cuenta exacta es (e^b - 1)*100:
nlcom (exp(_b[mujer]) - 1)*100

* --- C2. Log-log (elasticidad de verdad): % por cada 1% ---
reg lningreso lnhoras lnk, robust

* ¿Rendimientos constantes a escala? (¿suman 1?)
lincom lnhoras + lnk                   // la suma con su intervalo
test lnhoras + lnk = 1                 // la prueba formal

* --- C3. Supuestos: los mismos de siempre ---
estat vif
estat hettest
estat ovtest


* #############################################################################
* PARTE D — MODELO 3: GRUPOS Y ANOVA
* Cuándo: comparar promedios entre categorías.
* #############################################################################

* --- D1. Descriptivas del grupo ---
tabstat ingreso, by(tamano) stat(n mean sd)
robvar ingreso, by(tamano)             // ¿varianzas iguales? (supuesto del ANOVA)

* --- D2. ANOVA ---
anova ingreso tamano
oneway ingreso tamano, tabulate bonferroni

* --- D3. Lo mismo como regresión, que da MÁS información ---
* La i. es OBLIGATORIA: sin ella Stata cree que 1,2,3,4 son cantidades.
reg ingreso i.tamano, robust
testparm i.tamano                      // ¿el grupo importa en conjunto?
margins tamano                         // medias ajustadas por grupo
marginsplot, name(g6, replace)
pwcompare tamano, mcompare(bonferroni) // ¿entre cuáles hay diferencia?

* --- D4. Cambiar el grupo base cambia TODOS los números ---
reg ingreso ib4.tamano, robust

* --- D5. Con interacción y con controles ---
anova ingreso tamano mujer tamano#mujer
reg ingreso i.tamano##i.mujer, robust
reg ingreso i.tamano educ exper mujer, robust      // ANCOVA


* #############################################################################
* PARTE E — MODELO 4: SÍ / NO  (logit, probit)
* Cuándo: la variable a explicar vale 0 o 1.
* #############################################################################

* --- E1. Comprobar que de verdad es 0/1 ---
tab formal

* --- E2. El de referencia: modelo de probabilidad lineal ---
* Fácil de leer, pero predice probabilidades imposibles. robust NO es opcional.
reg formal educ exper mujer, robust
predict phat
count if phat < 0 | phat > 1           // mira: predicciones imposibles
drop phat

* --- E3. LOGIT ---
logit formal educ exper mujer
estimates store logit

* EL PASO QUE NO SE PUEDE SALTAR.
* El coeficiente crudo NO es una probabilidad. margins lo traduce.
margins, dydx(*)

* --- E4. La misma cosa en razón de momios (valor neutro = 1, no 0) ---
logistic formal educ exper mujer
* ojo: 1.21 = "21% más MOMIOS", no "21% más probabilidad"

* --- E5. Probabilidad predicha en distintos niveles: se explica sola ---
quietly logit formal educ exper mujer
margins, at(educ = (0(3)18))
marginsplot, name(g7, replace)

* --- E6. Qué tan bien clasifica ---
estat classification
* sensibilidad = de los que SÍ eran, cuántos atrapó   (se lee por COLUMNA)
* especificidad = de los que NO eran, cuántos acertó  (se lee por COLUMNA)
* valor predictivo = cuando dice "sí", cuántas acierta (se lee por FILA)
*
* CUIDADO con el "% correctamente clasificado": si el 85% son "no",
* decir siempre "no" ya acierta 85% sin servir de nada.

* --- E7. Curva ROC: resume el modelo en TODOS los cortes ---
lroc, name(g8, replace)
* AUC: <0.6 malo | 0.6-0.7 pobre | 0.7-0.8 aceptable | 0.8-0.9 bueno | >0.9 revisar

* --- E8. Elegir el punto de corte ---
lsens, name(g9, replace)
* donde se cruzan las dos líneas = mejor equilibrio (criterio de Youden).
* Si un error te cuesta más que el otro, muévelo A PROPÓSITO y explica por qué.
estat classification, cutoff(0.4)

* --- E9. Supuestos del logit ---
estat gof, group(10)      // bondad de ajuste: aquí p ALTO es buena noticia
linktest                  // _hatsq NO debe ser significativa

* --- E10. PROBIT: la misma pregunta, otra curva ---
probit formal educ exper mujer
margins, dydx(*)
* Los COEFICIENTES de logit y probit no se comparan (escalas distintas).
* Los EFECTOS MARGINALES sí, y salen casi iguales. Eso demuestra solidez.


* #############################################################################
* PARTE F — MODELO 5: TRES O MÁS CATEGORÍAS
* #############################################################################

* --- F1. SIN orden: mlogit ---
tab situacion
mlogit situacion educ exper mujer, base(1)
* TODO se lee "comparado con la categoría base". Sin esa frase, está mal dicho.

mlogit situacion educ exper mujer, base(1) rrr    // razón de riesgo relativo

* Efectos marginales, UNA categoría a la vez. Estos SÍ son probabilidad
* y NO necesitan la muletilla de "comparado con".
margins, dydx(*) predict(outcome(1))
margins, dydx(*) predict(outcome(2))
margins, dydx(*) predict(outcome(3))
* comprobación: los tres suman cero para cada variable

test [2]educ [3]educ                  // ¿educ importa en las dos ecuaciones?

* Supuesto IIA (necesita: ssc install spost13_ado)
* mlogtest, hausman
* mlogtest, combine

* Cambiar la base cambia todos los números, no el modelo:
mlogit situacion educ exper mujer, base(2)

* --- F2. CON orden: ologit ---
* Si hay escalera, mlogit desperdicia información.
ologit satisf lningreso educ mujer
* coeficiente positivo = empuja hacia las categorías ALTAS
* las filas /cut1, /cut2... NO se interpretan

oprobit satisf lningreso educ mujer   // para confirmar que da lo mismo

* --- F3. La versión recodificada a 3 ---
ologit satisf3 lningreso educ mujer


* #############################################################################
* PARTE G — CONTEOS
* Cuándo: la variable a explicar cuenta cosas (0, 1, 2, 3...).
* #############################################################################

tab hijos
tabstat hijos, stat(mean var)         // Poisson exige media ≈ varianza
poisson hijos educ edad mujer
nlcom (exp(_b[educ]) - 1)*100         // el coeficiente en %
* Si la varianza es MUCHO mayor que la media hay sobredispersión:
* lo correcto sería nbreg. Menciónalo en el informe.
nbreg hijos educ edad mujer


* #############################################################################
* PARTE H — LA TABLA FINAL DEL TRABAJO
* #############################################################################

* Varios modelos lado a lado: muestra que el hallazgo no depende
* de qué controles metiste.
quietly reg lningreso educ, robust
estimates store m1
quietly reg lningreso educ exper exper2, robust
estimates store m2
quietly reg lningreso educ exper exper2 mujer i.tamano, robust
estimates store m3

estimates table m1 m2 m3, star stats(N r2 r2_a)

* Versión bonita para pegar en Word (necesita: ssc install estout)
* esttab m1 m2 m3, se star(* 0.10 ** 0.05 *** 0.01) stats(N r2)

log close

* =============================================================================
* PAQUETES QUE HAY QUE INSTALAR UNA SOLA VEZ (con internet):
*     ssc install estout           -> esttab, tablas para Word
*     ssc install spost13_ado      -> mlogtest, pruebas de IIA
* =============================================================================

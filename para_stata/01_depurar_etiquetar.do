* =============================================================================
* 01 — DEPURAR, ETIQUETAR Y CREAR VARIABLES
* Base: enemdu_eloro_crudo.csv  (3.426 filas, sin depurar)
*
* Este do-file corre en STATA DE VERDAD. Deja la base lista para modelar.
* Autora: (tu nombre)                                    Fecha: (fecha)
* =============================================================================

clear all
set more off

* ---- 0. Ubicarse en la carpeta --------------------------------------------
* Cambia esta ruta por la carpeta donde tengas el CSV.
* En Windows las rutas van con / o con \\ , nunca con \ sola.
cd "C:/Users/USER/Downloads/StataProfe/para_stata"

* Para dejar registro de todo lo que sale en pantalla:
capture log close
log using "01_depuracion.log", replace text


* ---- 1. Abrir el CSV -------------------------------------------------------
* varnames(1) = la primera fila trae los nombres de las columnas.
* encoding("UTF-8") evita que las tildes salgan como símbolos raros.
import delimited "enemdu_eloro_crudo.csv", clear varnames(1) encoding("UTF-8")

describe
count


* ---- 2. Filas repetidas ----------------------------------------------------
* Si una encuesta se digitó dos veces, esa persona pesa el doble en TODO.
* Primero se mira, y solo si hay, se borra.
duplicates report
duplicates drop
count                            // deberían quedar 3.412


* ---- 3. El ingreso viene como TEXTO ----------------------------------------
* Mira cómo está guardado antes de tocarlo:
list ingreso_txt in 1/15

* Hay tres formatos mezclados, como pasa cuando digitan varias personas:
*    "1.234,50"  punto de miles + coma decimal
*    "554,31"    solo coma decimal
*    "843.47"    punto decimal
* y además "NA", "s/i" y celdas vacías.
*
* LA REGLA QUE LO RESUELVE: el punto solo es separador de miles cuando en el
* MISMO número hay una coma. Si no hay coma, ese punto es el decimal.

gen str20 ing_limpio = trim(ingreso_txt)

* 3a. quitar el punto de miles SOLO donde hay coma decimal
replace ing_limpio = subinstr(ing_limpio, ".", "", .) if strpos(ing_limpio, ",") > 0

* 3b. la coma decimal pasa a punto, que es lo que Stata entiende
replace ing_limpio = subinstr(ing_limpio, ",", ".", .)

* 3c. recién ahora se convierte a número.
*     force manda a faltante lo que no sea número ("NA", "s/i", vacías).
destring ing_limpio, gen(ingreso) force

* comprobar que salió bien
summarize ingreso
count if missing(ingreso)         // deberían ser ~210
list ingreso_txt ingreso in 1/15

drop ing_limpio


* ---- 4. ENCODE: texto de categorías a número con etiquetas -----------------
* PRIMERO se limpia el texto. Si no, "Mujer", "MUJER " y "mujer" cuentan
* como tres categorías distintas y encode te crea un desastre.
tab sexo_txt                      // mira cuántas formas hay: son 11

replace sexo_txt = upper(trim(sexo_txt))
replace sexo_txt = "HOMBRE" if sexo_txt == "H"
replace sexo_txt = "MUJER"  if sexo_txt == "M"
replace sexo_txt = ""       if sexo_txt == "."

tab sexo_txt                      // ahora deben quedar 2 (más las vacías)

* encode numera las categorías EN ORDEN ALFABÉTICO y les pone las etiquetas.
* Siempre necesita gen(): nunca pisa la variable original.
encode sexo_txt, gen(sexo)
tab sexo
codebook sexo

* Como HOMBRE va antes que MUJER, queda sexo = 1 hombre, 2 mujer.
* Para los modelos conviene una indicadora 0/1:
gen byte mujer = (sexo == 2) if !missing(sexo)
label variable mujer "Sexo (1 = mujer, 0 = hombre)"
label define lbl_sexo 0 "Hombre" 1 "Mujer"
label values mujer lbl_sexo
tab mujer

* Lo mismo con la satisfacción, que viene en palabras:
tab satisf_txt
encode satisf_txt, gen(satisf_alf)

* OJO: encode ordena ALFABÉTICAMENTE, no por la escala.
* "Feliz" < "Muy feliz" < "Muy triste" < "Normal" < "Triste"  <- ¡mal orden!
tab satisf_alf
* Por eso, cuando la variable es una ESCALA, hay que fijar el orden a mano:
gen byte satisf = .
replace satisf = 1 if satisf_txt == "Muy triste"
replace satisf = 2 if satisf_txt == "Triste"
replace satisf = 3 if satisf_txt == "Normal"
replace satisf = 4 if satisf_txt == "Feliz"
replace satisf = 5 if satisf_txt == "Muy feliz"

label define lbl_satisf 1 "Muy triste" 2 "Triste" 3 "Normal" 4 "Feliz" 5 "Muy feliz"
label values satisf lbl_satisf
label variable satisf "Satisfacción con la vida"
tab satisf
drop satisf_alf


* ---- 5. DECODE: el camino de vuelta ----------------------------------------
* decode saca el texto de una variable numérica etiquetada.
* Sirve para exportar tablas a Word o Excel, donde quieres leer la palabra.
decode satisf, gen(satisf_palabra)
list satisf satisf_palabra in 1/10
drop satisf_palabra


* ---- 6. La provincia también viene sucia -----------------------------------
tab provincia
replace provincia = upper(trim(provincia))
replace provincia = subinstr(provincia, "  ", " ", .)   // dobles espacios
tab provincia
encode provincia, gen(prov)
tab prov


* ---- 7. Códigos de no respuesta --------------------------------------------
* En las encuestas "no sabe / no responde" NO se guarda vacío: se guarda como
* 99, 999 o -1. Si no los conviertes, Stata cree que hay gente con 99 años
* de estudio y te calcula un promedio absurdo.
summarize edad educ horas          // fíjate en los máximos: 250, 99, 999

mvdecode edad educ, mv(99)
mvdecode horas, mv(999)

summarize edad educ horas          // ahora los máximos ya tienen sentido


* ---- 8. Valores imposibles -------------------------------------------------
* Un ingreso alto PUEDE ser real. Una edad de 250 años NO.
* Bota solo lo físicamente imposible, y dilo en el informe.
summarize edad, detail
count if edad > 100 & !missing(edad)
drop if edad > 100 & !missing(edad)

* Los ingresos de 999999 son código de no respuesta disfrazado:
count if ingreso == 999999
replace ingreso = . if ingreso == 999999


* ---- 9. ETIQUETAR TODO -----------------------------------------------------
* Son TRES cosas distintas:
*   label variable  -> nombra la columna
*   label define    -> crea el diccionario de códigos
*   label values    -> pega el diccionario a la variable
* La que más se olvida es la tercera.

label variable id       "Número de la persona encuestada"
label variable ingreso  "Ingreso mensual del trabajo (USD)"
label variable edad     "Edad en años cumplidos"
label variable educ     "Años de estudio aprobados"
label variable exper    "Años de experiencia laboral"
label variable horas    "Horas trabajadas al mes"
label variable k        "Capital de trabajo (USD)"
label variable hijos    "Número de hijos en el hogar"

label define lbl_si_no 0 "No" 1 "Sí"
label values formal lbl_si_no
label values urbano lbl_si_no
label values casado lbl_si_no
label variable formal "Tiene empleo formal (contrato y seguro)"
label variable urbano "Vive en zona urbana"
label variable casado "Tiene pareja estable"

label define lbl_tamano 1 "Microempresa" 2 "Pequeña" 3 "Mediana" 4 "Grande"
label values tamano lbl_tamano
label variable tamano "Tamaño de la empresa"

label define lbl_situacion 1 "Asalariado formal" 2 "Asalariado informal" ///
                           3 "Cuenta propia"
label values situacion lbl_situacion
label variable situacion "Situación laboral"

label define lbl_sector 1 "Agricultura y banano" 2 "Minería" 3 "Comercio" ///
                        4 "Servicios" 5 "Construcción"
label values sector lbl_sector
label variable sector "Rama de actividad"

* comprobar que quedó legible
describe
tab tamano
tab situacion


* ---- 10. RECODIFICAR: de 5 categorías a 3 ----------------------------------
* Se junta cuando los extremos tienen muy pocos casos o cuando la diferencia
* entre "triste" y "muy triste" no le importa a tu pregunta.
* NUNCA se junta solo para que salga significativo: eso se nota.
tab satisf

recode satisf (1 2 = 1) (3 = 2) (4 5 = 3), gen(satisf3)

label define lbl_s3 1 "Triste" 2 "Normal" 3 "Feliz"
label values satisf3 lbl_s3
label variable satisf3 "Satisfacción en 3 niveles"

* EL PASO QUE NO SE PUEDE SALTAR: comprobar el cruce.
* Cada valor viejo debe caer en uno solo nuevo.
tab satisf satisf3


* ---- 11. Variables derivadas -----------------------------------------------
* Recién ahora, con los datos limpios, se crean las transformaciones.
gen exper2 = exper^2
label variable exper2 "Experiencia al cuadrado"

* el logaritmo solo existe para valores > 0
gen lningreso = ln(ingreso) if ingreso > 0
gen lnhoras   = ln(horas)   if horas   > 0
gen lnk       = ln(k)       if k       > 0
label variable lningreso "Log del ingreso mensual"
label variable lnhoras   "Log de las horas trabajadas"
label variable lnk       "Log del capital de trabajo"


* ---- 12. Definir la muestra UNA SOLA VEZ -----------------------------------
* Si cada modelo bota filas distintas, los R2 dejan de ser comparables.
*
* LA TRAMPA MÁS CARA DE STATA: el faltante vale MÁS que cualquier número.
* Por eso "keep if edad >= 18" también se queda con los vacíos.
* Hay que decirlo explícito con !missing().
keep if edad >= 18 & edad <= 65 & !missing(edad)
keep if ingreso > 0 & !missing(ingreso)
drop if missing(educ, exper, horas)

count
misstable summarize


* ---- 13. Guardar la base limpia --------------------------------------------
compress
label data "ENEMDU El Oro 2024 — base depurada"
save "enemdu_eloro_limpia.dta", replace

describe
summarize

log close

* =============================================================================
* De aquí en adelante ya se puede modelar. Sigue con 02_orden_por_modelo.do
* =============================================================================

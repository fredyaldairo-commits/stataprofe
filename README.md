# StataProfe

Un simulador de Stata que corre entero en el navegador, con un profesor incorporado que
corrige los comandos y explica los resultados. Pensado para estudiantes de econometría
que trabajan con datos de encuesta.

**No necesita instalar nada.** Funciona en computadora y en tablet.

## Qué hace

- **Ejecuta comandos de Stata de verdad.** Los números salen de cálculos reales sobre los
  datos cargados (mínimos cuadrados por descomposición QR, máxima verosimilitud por
  Newton-Raphson, cuadratura de Gauss-Hermite para el probit multinomial). No hay
  resultados guardados de antemano.
- **Corrige lo que escribes mal.** Si olvidas la coma antes de una opción, escribes `=` en
  una regresión, confundes `=` con `==`, o metes una variable de texto en un modelo, no te
  da un error seco: te dice cómo debería ir la línea.
- **Interpreta cada resultado.** Toca cualquier fila de una tabla de coeficientes y te
  explica qué significa, si es significativo, si el efecto es grande o chico en la vida
  real, y qué revisar después.
- **Curso de 14 módulos** que se desbloquean de a poco, con 78 lecciones, pistas
  escalonadas, XP e insignias.

## Contenido del curso

Depuración de datos (faltantes, códigos 99/999, duplicados, atípicos) · tipos y variables
alfanuméricas (`destring`, `encode`) · etiquetas · recodificación de categorías ·
estadística descriptiva · regresión múltiple · supuestos (multicolinealidad,
heterocedasticidad, forma funcional, normalidad) · logaritmos y elasticidades ·
Cobb-Douglas · ANOVA y variables indicadoras · modelos de sí/no (MPL, logit, probit,
márgenes, razón de momios, clasificación, ROC) · multinomial y ordenado · proyecto final.

## La ventana

Reproduce la disposición de Stata: barra de menús, **ventana de revisión** a la izquierda
(historial de comandos, en rojo los que fallaron; un clic los recupera, doble clic los
vuelve a correr), **panel de variables** a la derecha (un clic pega el nombre en la línea
de comando), la caja **Comando** abajo y la barra de estado. Los menús **Gráficos** y
**Estadísticas** arman el comando por ti y lo dejan escrito en la caja, para que veas la
sintaxis en vez de esconderla. En tablet los paneles se recogen solos.

## Comandos que entiende

**Datos** — `use` `describe` `codebook` `list` `count` `generate` `egen` `replace`
`recode` `drop` `keep` `rename` `order` `sort` `gsort` `label` `notes` `encode` `decode`
`destring` `tostring` `duplicates` `misstable` `mvdecode` `mvencode` `assert` `preserve`
`restore`

**Descriptiva** — `summarize` `tabulate` `tab1` `tab2` `tabstat` `table` `correlate`
`pwcorr` `ttest` `prtest` `oneway` `robvar` `swilk` `sktest` `inspect`

**Modelos** — `regress` `anova` `logit` `logistic` `probit` `mlogit` `mprobit` `ologit`
`oprobit` `poisson`

**Después del modelo** — `predict` `margins` (con `dydx()`, `at()`, `atmeans`, `post`,
`predict(outcome())` y medias ajustadas por factor) `test` (incluye `[2]educ`) `testparm`
`lincom` `nlcom` `pwcompare` `mlogtest` `linktest` `estat` (`vif` `hettest` `imtest,white`
`ovtest` `classification` `gof` `summarize`) `estimates` `esttab`

**Gráficos** — `histogram` `scatter` `twoway` `graph box` `graph bar` `kdensity`
`rvfplot` `qnorm` `lroc` `lsens` `marginsplot`

**Notación de factores** — `i.var` `ib3.var` `c.var` `a#b` `a##b`

## Bases incluidas

Se generan con semilla fija, así que salen idénticas en cualquier dispositivo. Están
calibradas para que los resultados coincidan con los de la guía de econometría que las
acompaña. **Son simuladas**: sirven para aprender a leer resultados, no para sacar
conclusiones sobre la realidad.

| Base | Obs | Para qué |
|---|---|---|
| `enemdu_eloro_2024` | 3 412 | Encuesta de empleo ya depurada |
| `enemdu_eloro_2024_crudo` | 3 426 | La misma, sin depurar: para practicar limpieza |
| `produccion_eloro` | 480 | Cobb-Douglas y elasticidades |
| `hogares_satisfaccion` | 900 | Modelos ordenados (`ologit` / `oprobit`) |
| `auto_ec` | 74 | Base corta para probar comandos rápido |

También puedes subir tu propio CSV con el botón **Subir datos**.

## Privacidad

Todo se guarda **solo en tu dispositivo** (`localStorage` del navegador): el progreso del
curso, tu do-file y los archivos que subas. No hay servidor ni base de datos.

El chat libre con Gemini es **opcional** y viene desactivado. Las interpretaciones de
resultados no lo usan: son reglas de econometría programadas, funcionan sin internet.
Si activas el chat, la clave se guarda en tu navegador y las preguntas van directo a
Google; consíguela en [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

## Correr en tu computadora

```bash
npx serve .
```

Y abre `http://localhost:3000`.

## Pruebas

```bash
node test/t_math.mjs && node test/t_models.mjs && node test/t_datasets.mjs && node test/t_motor.mjs && node test/t_taller.mjs
```

447 comprobaciones. Verifican el álgebra lineal y las distribuciones contra valores
conocidos, la recuperación de parámetros de cada estimador sobre datos simulados, la
calibración de las bases, el comportamiento de los comandos de punta a punta (incluida la
corrección de errores), y que los bloques de código de los dos documentos de econometría
que acompañan al proyecto corran completos y sin errores.

## Cómo está armado

Sin dependencias ni paso de compilación: módulos ES nativos.

```
js/core/matrix.js     álgebra lineal (Householder, Cholesky, colinealidad)
js/core/dist.js       distribuciones (normal, t, chi², F, Gauss-Hermite)
js/core/models.js     estimadores y pruebas de diagnóstico
js/core/expr.js       evaluador de expresiones de Stata
js/core/parser.js     análisis de comandos y detección de errores típicos
js/core/cmd_*.js      implementación de los comandos
js/core/graphs.js     gráficos en SVG
js/professor.js       motor de interpretación
js/curriculum.js      los 14 módulos del curso
js/app.js             interfaz
```

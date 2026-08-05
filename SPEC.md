# StataProfe — contrato de módulos (LEER ANTES DE ESCRIBIR CÓDIGO)

App web **100% estática** (sin backend obligatorio) que simula Stata en el navegador,
corrige los comandos del estudiante y le interpreta los resultados como un profesor.
Idioma de toda la interfaz y de los textos: **español (Ecuador)**.

## Reglas duras para todos los archivos

1. **ES modules puros**: `export function foo(...)`. Nada de `require`, `window.X = ...`,
   ni dependencias externas (no npm, no CDN). Solo JavaScript estándar del navegador.
2. **Sin `Date.now()` ni `Math.random()` sin semilla** en la generación de datos (deben ser
   reproducibles). Para aleatoriedad usar el PRNG `mulberry32` definido abajo.
3. Todo número que se muestre al usuario lo formatea la capa de UI, **no** los módulos de
   cálculo. Los módulos devuelven `number` crudos.
4. Valor faltante numérico = `null`. Valor faltante string = `""`.
5. Sin `console.log` en producción. Sin `alert`.
6. Comentarios en español, cortos.
7. Cada archivo debe poder importarse en Node 20 (`"type":"module"`) sin tocar el DOM.
   Los módulos que generan SVG devuelven **strings**, no tocan `document`.

## Convención de nombres de coeficientes

Los nombres de términos siguen el estilo Stata:
- variable continua → `educ`
- indicadora de nivel de factor → `2.tamano` (nivel 2 de `tamano`)
- interacción → `2.tamano#c.educ`
- constante → `_cons`
- término omitido por colinealidad → se marca en `omitted: ['3.tamano']`

---

# 1. `js/core/matrix.js`

Matrices = `number[][]` (fila-mayor). Vectores = `number[]`.

```js
export function zeros(r, c)                  // number[][]
export function identity(n)
export function transpose(A)
export function matmul(A, B)
export function matvec(A, v)                 // A (r x c) * v (c) -> number[r]
export function vecmat(v, A)
export function add(A, B)
export function sub(A, B)
export function scale(A, k)
export function diag(A)                      // number[] con la diagonal
export function inverse(A)                   // Gauss-Jordan con pivoteo parcial; lanza Error('singular')
export function solve(A, b)                  // resuelve A x = b
export function crossprod(X)                 // X'X
export function crossprodXY(X, y)            // X'y
export function cholesky(A)                  // L triangular inferior, o null si no es def. positiva
export function invSPD(A)                    // inversa vía Cholesky, fallback a inverse()
export function dot(u, v)
export function colMeans(X)
export function detectCollinear(X, tol = 1e-9)
// -> { keep: number[], dropped: number[] }  índices de columnas.
// Usa descomposición QR con pivoteo o eliminación gaussiana sobre X'X.
// La PRIMERA columna (constante) nunca se descarta si es la única constante.
export function qrLeastSquares(X, y)
// -> { beta: number[], rank: number, dropped: number[] }
// beta tiene la longitud de columnas de X; las columnas descartadas llevan 0.
```
Requisito de precisión: `qrLeastSquares` debe usar Householder (no ecuaciones normales)
y coincidir con la solución exacta a 1e-8 en problemas bien condicionados.

---

# 2. `js/core/dist.js`

```js
export function lnGamma(x)
export function incompleteGammaP(a, x)       // P(a,x) regularizada
export function incompleteGammaQ(a, x)
export function incompleteBeta(a, b, x)      // I_x(a,b) regularizada
export function normalPdf(z)
export function normalCdf(z)                 // precisión >= 1e-12
export function normalInv(p)                 // Acklam/Wichura, precisión >= 1e-9
export function tCdf(t, df)
export function tInv(p, df)                  // cuantil de una cola izquierda
export function chi2Cdf(x, df)
export function chi2Inv(p, df)
export function fCdf(f, d1, d2)
export function fInv(p, d1, d2)
export function pT(t, df)                    // p de DOS colas: 2*(1 - tCdf(|t|,df))
export function pZ(z)                        // p de dos colas normal
export function pChi2(x, df)                 // cola superior
export function pF(f, d1, d2)                // cola superior
export function gaussHermite(n)              // -> {nodes:number[], weights:number[]}
// Nodos/pesos para  ∫ f(x) e^{-x^2} dx  (versión "físicos"). n hasta 40.
```
Casos borde: `df` no entero permitido; `p` fuera de (0,1) → `NaN`; `x<=0` en chi2 → 0.

---

# 3. `js/core/models.js`

Importa de `./matrix.js` y `./dist.js`.

### Forma común del resultado (`Fit`)

```js
{
  cmd: 'regress',            // 'regress'|'logit'|'probit'|'ologit'|'oprobit'|'mlogit'|'mprobit'|'poisson'
  depvar: 'ingreso',
  N: 3412,
  names: ['educ','exper','_cons'],
  b:  [42.3, 11.6, 61.2],
  se: [...],
  stat: [...],               // t o z
  statName: 't',             // 't' | 'z'
  p:  [...],
  ci: [[lo,hi], ...],
  level: 95,
  df_r: 3406,                // null si statName==='z'
  omitted: [],               // nombres de términos descartados por colinealidad
  vce: 'ols',                // 'ols'|'robust'|'cluster'
  converged: true,
  // --- solo MCO/ANOVA ---
  r2, r2_a, rmse, F, df_m, p_F, mss, rss, tss,
  // --- solo máxima verosimilitud ---
  ll, ll0, chi2, df_chi2, p_chi2, r2_p, iterations,
  // --- solo mlogit/mprobit (ecuaciones múltiples) ---
  eqs: [{ name:'2', label:'Informal', names:[...], b:[...], se:[...], stat:[...], p:[...], ci:[...] }],
  base: 1,
  // --- guardado para postestimación ---
  X: number[][], y: number[], V: number[][],
  xnames: string[],           // = names
  factorCols: number[],       // índices de columnas que son indicadoras 0/1 de un factor
  link: 'identity'|'logit'|'probit'|'log'
}
```

### Funciones

```js
export function ols(X, y, opts)
// opts = {names, vce:'ols'|'robust'|'cluster', cluster:number[]|null, level:95, depvar, noconstant:false, weights:number[]|null}
// - HC1 para robust: (X'X)^-1 (Σ u_i² x_i x_i') (X'X)^-1 * N/(N-k)
// - cluster: (X'X)^-1 (Σ_g u_g' x_g' x_g u_g) (X'X)^-1 * [G/(G-1)]*[(N-1)/(N-k)]
// - F global: con vce ols usa (R²/df_m)/((1-R²)/df_r); con robust usa test de Wald
//   sobre todos los coeficientes menos _cons.
// - Columnas colineales se descartan y sus nombres van en `omitted` (b=0, se=0, p=NaN).

export function logitFit(X, y, opts)     // y ∈ {0,1}. IRLS/Newton, tol 1e-10, máx 50 iter.
export function probitFit(X, y, opts)
export function poissonFit(X, y, opts)
export function ologitFit(X, y, opts)    // y ∈ {1..J}. Devuelve además cuts:[{name:'/cut1', b, se}]
export function oprobitFit(X, y, opts)
export function mlogitFit(X, y, opts)    // opts.base = nivel base (default: el más frecuente, igual que Stata)
export function mprobitFit(X, y, opts)   // errores iid normales, cuadratura Gauss-Hermite (>=24 nodos)

export function anovaFit(y, terms, opts)
// terms = [{name:'tamano', levels:number[] (código por fila), type:'factor'} | {name:'educ', x:number[], type:'continuous'}]
// -> { N, r2, r2_a, rmse, model:{ss,df,ms,F,p}, residual:{ss,df,ms}, total:{ss,df},
//      rows:[{name, ss, df, ms, F, p}] }   // SS parciales (tipo III de Stata)
```

Notas de máxima verosimilitud:
- `ll0` = log-verosimilitud del modelo solo con constante.
- `r2_p` = McFadden = 1 - ll/ll0.
- Si no converge en 50 iteraciones → `converged:false` pero devolver lo obtenido.
- Detectar **separación perfecta**: si algún |b| > 15 y su se > 100 → marcar
  `warnings:['separacion']` en el Fit.
- Si una variable predice perfectamente (todas las y=1 cuando x=1), Stata elimina esas
  observaciones. Aquí basta con la bandera de advertencia.

### Diagnósticos

```js
export function vif(X, names)
// -> [{name, vif, tolerance}]  (excluye _cons). VIF_j = 1/(1-R²_j)

export function breuschPagan(fit, opts)
// opts = {rhs:false, variables:number[][]|null, iid:true}
// Por defecto (Stata `estat hettest`): regresa u²/σ̂² sobre yhat -> LM = SSM/2 ~ χ²(1)
// Con rhs:true usa todas las X. -> {chi2, df, p, variant:'BP'|'BP-rhs'}

export function whiteTest(fit)   // `estat imtest, white` -> {chi2, df, p}
export function resetTest(fit)   // `estat ovtest` -> {F, df1, df2, p}   (potencias 2,3,4 de yhat)
export function linktest(fit)    // -> {b_hat, p_hat, b_hatsq, p_hatsq, ok:boolean}
export function sktest(x)        // D'Agostino -> {N, pSkew, pKurt, chi2, p, skew, kurt}
export function jarqueBera(x)    // -> {chi2, p, skew, kurt}
export function shapiroWilk(x)   // Royston 1992 -> {W, z, p}   (N entre 4 y 5000)
export function durbinWatson(res)// -> {dw}
export function ramseyPowers(...)// opcional

export function marginsDydx(fit, opts)
// Efectos marginales promedio (AME). opts = {atMeans:false, factorCols:[], level:95}
// Continuas: dydx_k = mean( f(xb_i) ) * b_k    con f = pdf del enlace
//   logit: f = p(1-p);  probit: f = φ(xb);  identity: 1;  log/poisson: exp(xb)
// Indicadoras 0/1 (factorCols): diferencia discreta mean(P(x_k=1) - P(x_k=0))
// Errores estándar por método delta con jacobiano numérico (diferencias centrales, h=1e-5)
//   se = sqrt(J V J')
// -> {names:[], dydx:[], se:[], stat:[], p:[], ci:[[lo,hi]], statName:'z'}

export function predictProb(fit, X)         // -> number[]  probabilidades ajustadas
export function rocPoints(y, p)
// -> {points:[{cut, tpr, fpr}], auc, seAuc}   auc por Mann-Whitney (manejar empates)
export function classificationTable(y, p, cut = 0.5)
// -> {tp, fp, tn, fn, sensitivity, specificity, ppv, npv, correct, cut}
export function hosmerLemeshow(y, p, g = 10)  // -> {chi2, df, p, groups:[{obs1,exp1,n}]}
export function sensSpecCurve(y, p)           // -> [{cut, sens, spec}] para el gráfico lsens
```

---

# 4. `js/core/graphs.js`

Sin DOM. Devuelve **string SVG** completo (`<svg ...>...</svg>`), `viewBox` puesto,
`width="100%"`, alto fijo por opción. Usa variables CSS para color de forma que
funcione en claro y oscuro:
`var(--ink)`, `var(--ink3)`, `var(--line)`, `var(--card)`, `var(--blue)`, `var(--sig)`, `var(--nosig)`, `var(--ochre)`.
Nada de `fill="#fff"` fijo salvo `none`.

```js
const OPTS = { width:720, height:420, title:'', xlabel:'', ylabel:'', note:'' }

export function histogram(values, opts)      // opts.bins (default Sturges), opts.normal:true dibuja la campana
export function scatter(x, y, opts)          // opts.fit:'lfit'|'qfit'|null, opts.labels
export function rvfplot(yhat, resid, opts)   // residuos vs ajustados + línea en 0 + banda lowess opcional
export function qnormPlot(resid, opts)       // cuantiles normales
export function rocCurve(points, auc, opts)  // + diagonal de referencia + AUC anotado
export function sensSpecPlot(curve, opts)    // sensibilidad y especificidad vs punto de corte
export function boxplot(groups, opts)        // groups = [{label, values}]
export function barMeans(groups, opts)       // groups = [{label, mean, se}] con barras de error
export function marginsPlot(items, opts)     // items = [{label, est, lo, hi}] gráfico de puntos con IC
export function corrHeatmap(names, M, opts)
export function linePlot(series, opts)       // series = [{label, x:[], y:[]}]
export function densityPlot(values, opts)    // kernel gaussiano, regla de Silverman
export function lorenzCurve(values, opts)    // bonus: curva de Lorenz + Gini
```
Ejes: ticks "bonitos" (1,2,2.5,5 × 10^k), máximo 7 ticks, etiquetas rotadas si no caben.
Todo texto en español. `font-family: var(--m)` para números, `var(--d)` para títulos.

---

# 5. `js/data/datasets.js`

```js
export function mulberry32(seed) { /* PRNG estándar */ }

export const CATALOGO = [
  { nombre:'enemdu_eloro_2024', titulo:'...', desc:'...', obs:3412, limpio:true },
  ...
]
export function cargar(nombre)  // -> DatasetRaw
```

`DatasetRaw`:
```js
{
  nombre: 'enemdu_eloro_2024',
  n: 3412,
  vars: [{ name:'ingreso', type:'numeric'|'string', label:'Ingreso mensual (USD)',
           vallab:'lbl_sexo'|null, format:'%9.0g' }],
  data: { ingreso: [1234, null, ...], sexo: ['Hombre', ...] },   // columnas
  valueLabels: { lbl_sexo: { 0:'Hombre', 1:'Mujer' } },
  notas: 'texto que se muestra al abrirlo'
}
```

### Datasets requeridos

**A) `enemdu_eloro_2024`** — limpio, 3412 obs. Variables:
`id, ingreso, lningreso, educ, exper, exper2, edad, mujer, horas, formal, tamano (1..4),
situacion (1 formal,2 informal,3 cuenta propia), satisf (1..5), k (capital), sector (1..5),
urbano, casado, hijos, provincia (string)`.
Calibración obligatoria (verificar con Node y ajustar la varianza del error hasta cumplir):
`reg ingreso educ exper exper2 mujer horas, robust` debe dar
educ ≈ 42.3 (±3), exper ≈ 11.6 (±2), exper2 ≈ −0.20 (±0.06), mujer ≈ −78.5 (±10),
horas ≈ 2.87 (±0.6), R² entre 0.28 y 0.36.
`logit formal educ exper mujer` → educ ≈ 0.187 (±0.04), mujer ≈ −0.254 (±0.08).
`reg lningreso lnhoras lnk, robust` → 0.612 (±0.08) y 0.271 (±0.06).
`reg ingreso i.tamano` → +83.6, +168.9, +287.3 (±25 cada uno).
El error de `ingreso` debe ser **heterocedástico** (varianza creciente en educ/horas) para
que `estat hettest` rechace y la lección de heterocedasticidad tenga sentido.

**B) `enemdu_eloro_2024_crudo`** — la MISMA base pero sucia, para las lecciones de depuración:
- `ingreso_txt`: string con formatos `"1.234,50"`, `"  980"`, `"NA"`, `"s/i"`, `""` (≈6% no numérico)
- códigos de faltante: `edad = 99`, `educ = 99`, `horas = 999` en ≈4% de los casos
- ≈120 valores faltantes reales (`null`) repartidos
- 14 filas duplicadas exactas
- 9 valores atípicos absurdos (`ingreso 999999`, `edad 250`)
- `sexo_txt`: `"Hombre"`,`"MUJER "`,`"mujer"`,`"H"`,`"M"`,`""` (necesita limpieza + `encode`)
- `satisf_txt`: `"Muy triste","Triste","Normal","Feliz","Muy feliz"` (para `encode` y luego recodificar 5→3)
- `provincia`: con espacios y mayúsculas inconsistentes

**C) `produccion_eloro`** — 480 empresas: `empresa, produccion, trabajo, capital, sector, exporta`.
Cobb-Douglas verdadera con elasticidades 0.62 y 0.33 (rendimientos ligeramente decrecientes).

**D) `hogares_satisfaccion`** — 900 obs para `ologit`/`oprobit`:
`satisfaccion (1..5), ingreso_hogar, educ_jefe, miembros, urbano, desempleo`.

**E) `auto_ec`** — 74 obs, imitación didáctica del `auto.dta` clásico pero con autos y precios
de Ecuador: `marca (string), precio, mpg, peso, largo, extranjero`. Sirve para ejemplos cortos.

Cada dataset debe traer `label variable` en español y value labels para todas las categóricas.

---

# 6. `js/professor.js`

Motor de interpretación **determinista** (funciona sin internet). Recibe resultados ya
calculados y devuelve texto en español sencillo, al estilo del documento de referencia
(`econometria_facil.html`): sin tecnicismos sin explicar, tuteando, directo.

```js
// Bloque de interpretación estándar
// { titulo, resumen, items:[{tono:'ok'|'ojo'|'mal'|'info', texto}], 
//   filas:[{nombre, veredicto, texto}], siguientes:[texto], frases:[texto] }

export function interpretarRegress(fit, ctx)
export function interpretarLogit(fit, ame, ctx)     // ctx.tipo = 'logit'|'probit'
export function interpretarMlogit(fit, ctx)
export function interpretarOlogit(fit, ctx)
export function interpretarAnova(res, ctx)
export function interpretarMargins(ame, ctx)
export function interpretarPrueba(tipo, res, ctx)
// tipo: 'vif'|'hettest'|'ovtest'|'linktest'|'sktest'|'swilk'|'ttest'|'chi2'|'gof'|'roc'|'clasificacion'
export function interpretarDescriptivas(res, ctx)
export function interpretarCorrelacion(res, ctx)
export function interpretarCoeficiente(nombre, b, p, contexto)  // frase suelta
export function calificarModelo(fit, pruebas)   // -> {nota:0..100, insignias:[], faltantes:[]}
export function frasesParaInforme(fit, ctx)     // -> string[] listas para copiar al documento
```

Reglas de interpretación que **deben** estar implementadas:
- p<0.01 / <0.05 / <0.10 / >=0.10 → cuatro veredictos distintos, siempre diciendo el nivel.
- Signo esperado vs. inesperado (ctx.esperado opcional).
- Magnitud: comparar el coeficiente con la media/desviación de la dependiente para decir
  si el efecto es "grande" o "chico" en la vida real (el punto de "significativo ≠ importante").
- R² : contexto de corte transversal (0.2–0.4 es normal, >0.9 sospechar), series de tiempo distinto.
- VIF: <5 bien, 5–10 ojo, >10 problema, y qué hacer.
- hettest: p<0.05 → hay heterocedasticidad → usar `robust`.
- ovtest: p<0.05 → falta forma funcional (probar logs o cuadráticos).
- Colinealidad perfecta / variable omitida → explicar la "trampa de las dummies".
- Logit: nunca interpretar el coeficiente crudo como probabilidad; exigir `margins`.
- Odds ratio: valor neutro = 1, no 0.
- Mlogit: siempre "comparado con la categoría base X".
- log-nivel: usar `(e^b − 1)×100` cuando |b| > 0.1 y decir por qué.
- Constante: casi nunca se interpreta.
- Muestra chica (N<50), pocos casos por variable en logit (regla de 10 eventos por variable).
- AUC: <0.6 malo, 0.6–0.7 pobre, 0.7–0.8 aceptable, 0.8–0.9 bueno, >0.9 excelente/sospechoso.
- Sensibilidad vs especificidad: explicar el trade-off y cuándo mover el punto de corte.

---

# 7. `js/curriculum.js`

```js
export const MODULOS = [{
  id: 'm0',
  titulo: 'Primer contacto con Stata',
  subtitulo: '...',
  icono: '📂',
  requiere: [],              // ids de módulos previos
  color: 'blue',
  lecciones: [{
    id: 'm0l1',
    titulo: 'Abrir una base y mirarla',
    objetivo: 'Una frase de qué vas a lograr.',
    teoria: '<p>HTML corto (2–5 párrafos). Puede usar <code>, <strong>, <ul>.</p>',
    tarea: 'Lo que el estudiante debe hacer, en imperativo.',
    ejemplo: 'use enemdu_eloro_2024, clear',     // se muestra solo si pide la solución
    validar: {
      comandos: ['use'],            // nombre canónico del comando (o varios aceptados)
      variables: [],                // variables que deben aparecer
      opciones: [],                 // opciones obligatorias, ej: ['robust']
      prohibido: [],                // opciones/atajos que NO debe usar
      chequeo: null                 // 'sinFaltantes' | 'tieneEtiqueta:ingreso' | null
    },
    pistas: ['pista 1 suave', 'pista 2 más concreta', 'pista 3 casi la respuesta'],
    xp: 10,
    felicitacion: '¡Muy bien! Ya sabes abrir una base.'
  }]
}]

export const INSIGNIAS = [{ id, nombre, desc, icono, condicion:'xp>=200' }]
export const NIVELES = [{ nivel:1, nombre:'Aprendiz', xpMin:0 }, ...]
```

### Cobertura obligatoria de módulos (mínimo 13 módulos, 60+ lecciones)

| # | Módulo | Contenido |
|---|--------|-----------|
| 0 | Primer contacto | `use`, `describe`, `list`, `browse`, `count`, comentarios `*` y `//`, `clear` |
| 1 | El do-file | estructura de un do-file profesional, `clear all`, `set more off`, `log using`, sangría, comentarios, `capture`, guardar y correr |
| 2 | Depuración | faltantes (`misstable`, `mdesc` casero), `drop if missing()`, `mvdecode`, duplicados (`duplicates report/drop`), atípicos, `assert`, `codebook` |
| 3 | Tipos y strings | `destring`, `encode`, `decode`, `tostring`, `real()`, `trim/upper/lower`, `subinstr`, por qué una variable alfanumérica no entra a una regresión |
| 4 | Etiquetas | `label variable`, `label define`, `label values`, `label list`, `notes`, `rename`, `order` |
| 5 | Recodificar | `recode`, `gen ... cond()`, `egen cut`, pasar una categórica de 5 (muy triste…muy feliz) a 3 (triste/normal/feliz), verificar con `tab viejo nuevo` |
| 6 | Descriptiva | `summarize`, `sum, detail`, `tabstat`, `tabulate`, `tab a b, chi2 row col`, `correlate`, `pwcorr, sig`, `ttest`, histogramas y cajas |
| 7 | Regresión | `regress`, lectura de coeficiente / EE / t / p / IC / R², `robust`, `test`, `predict` |
| 8 | Supuestos | `estat vif`, `estat hettest`, `estat imtest, white`, `estat ovtest`, `linktest`, `sktest` sobre residuos, `rvfplot`, `qnorm`, qué hacer con cada falla |
| 9 | Logaritmos | log-nivel, nivel-log, log-log, elasticidad vs semielasticidad, Cobb-Douglas, `test lnhoras + lnk = 1` |
| 10 | ANOVA y dummies | `anova`, `oneway`, `reg y i.grupo`, grupo base, `i.` vs sin `i.`, `testparm` |
| 11 | Binarios | MPL, `logit`, `probit`, `logistic`, `margins, dydx(*)`, odds ratio, `estat classification`, `lroc`, `lsens`, `estat gof` |
| 12 | Multinomial y ordenado | `mlogit`, `mprobit`, `ologit`, `oprobit`, categoría base, `margins` por categoría, supuesto IIA |
| 13 | Proyecto final | do-file completo de principio a fin + tabla de resultados + párrafo de conclusión |

Cada lección: teoría breve, tarea, 3 pistas escalonadas, felicitación distinta (no repetir
la misma frase), XP entre 10 y 40. El tono: profesor paciente, ecuatoriano, cero soberbia.

---

# 8. Formato de salida de Stata (`js/core/format.js`, lo escribe el integrador)

Las tablas de resultados imitan a Stata:
```
------------------------------------------------------------------------------
     ingreso | Coefficient  Std. err.      t    P>|t|     [95% conf. interval]
-------------+----------------------------------------------------------------
        educ |   42.31245   3.842011    11.01   0.000     34.77918    49.84572
```
Anchos: nombre 12 (der.), coef 11, se 10, t 8, p 7, ci 10+10.

---

# 9. Qué NO hacer

- No inventar resultados: todo número que se muestre sale de un cálculo real sobre los datos.
- No usar librerías externas.
- No romper si el usuario escribe cualquier disparate: siempre error claro y sugerencia.
- No escribir textos en inglés en la interfaz.

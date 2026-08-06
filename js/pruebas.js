// Catálogo de pruebas y supuestos, EN ORDEN, con el criterio de aprobación
// explícito: qué valor debería tener, por qué pasa o no, y qué hacer si falla.
// Cada una se puede evaluar de verdad sobre el último modelo corrido.

import * as M from './core/models.js';

const n2 = (v, d = 2) => (v === null || v === undefined || isNaN(v) ? '—' : Number(v).toFixed(d).replace('.', ','));
const p3 = (p) => (p === null || isNaN(p) ? '—' : (p < 0.001 ? '<0,001' : n2(p, 3)));

/** Familias de modelo a las que aplica cada prueba. */
const LINEAL = ['regress'];
const BINARIO = ['logit', 'probit'];

export const PRUEBAS = [
// ═══════════════ ETAPA 1 — ANTES DE MODELAR ═══════════════
{
  n: 1, etapa: 'Antes de modelar', id: 'faltantes',
  nombre: 'Valores faltantes', comando: 'misstable summarize',
  aplicaA: 'siempre',
  mira: 'Cuántas celdas vacías tiene cada variable.',
  criterio: 'Menos del 10% en las variables del modelo. Y sobre todo: haber decidido qué hacer con ellas ANTES de modelar.',
  porqueImporta: 'Si cada modelo bota filas distintas, los R² dejan de ser comparables entre sí. Por eso la muestra se define una sola vez.',
  siFalla: 'Decide y documenta: <code>drop if missing(...)</code> con TODAS las variables de tus modelos, una sola vez y al principio.',
  gravedad: 'alta',
  evaluar: (ctx) => {
    const ds = ctx.ds;
    if (!ds.cargado) return null;
    const vars = ctx.fit ? [ctx.fit.depvar, ...(ctx.fit.xnames || []).filter((v) => v !== '_cons' && ds.existe(v))] : ds.nombres();
    const total = ds.n;
    const peor = vars.map((v) => ({ v, k: ds.existe(v) ? ds.contarFaltantes(v) : 0 }))
      .sort((a, b) => b.k - a.k)[0] || { v: '', k: 0 };
    const pct = total ? (peor.k / total) * 100 : 0;
    return {
      paso: pct < 10,
      valor: peor.k ? `${peor.k} vacíos en ${peor.v} (${n2(pct, 1)}%)` : 'ninguna variable con vacíos',
      texto: peor.k
        ? (pct < 10
          ? `La variable con más vacíos es <code>${peor.v}</code> con ${peor.k} (${n2(pct, 1)}%). Está por debajo del 10%: se puede trabajar, pero <strong>bótalos una sola vez</strong> al inicio.`
          : `<code>${peor.v}</code> tiene ${peor.k} vacíos (${n2(pct, 1)}%). Es bastante: pregúntate <strong>por qué</strong> faltan antes de borrarlos. Si faltan por una razón (los que más ganan no contestan), borrarlos sesga tu resultado y hay que decirlo.`)
        : 'Ninguna variable del modelo tiene vacíos. Puedes seguir tranquila.',
    };
  },
},
{
  n: 2, etapa: 'Antes de modelar', id: 'forma',
  nombre: 'Forma de la variable a explicar', comando: 'summarize ingreso, detail',
  aplicaA: 'siempre',
  mira: 'La media contra la mediana, y la asimetría.',
  criterio: 'Asimetría entre −1 y 1. Si pasa de ahí y la variable es siempre positiva, conviene el logaritmo.',
  porqueImporta: 'Una variable muy sesgada arrastra el modelo: unos pocos valores altos mandan sobre los coeficientes, y suele traer heterocedasticidad de regalo.',
  siFalla: 'Crea la versión en logaritmo: <code>gen lny = ln(y)</code>. De paso el coeficiente pasa a leerse en porcentaje.',
  gravedad: 'media',
  evaluar: (ctx) => {
    if (!ctx.fit || !ctx.fit.y) return null;
    const y = ctx.fit.y;
    const n = y.length;
    const m = y.reduce((a, b) => a + b, 0) / n;
    let m2 = 0, m3 = 0;
    for (const v of y) { const d = v - m; m2 += d * d; m3 += d * d * d; }
    m2 /= n; m3 /= n;
    const asim = m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
    const esLog = /^ln|^log/.test(ctx.fit.depvar || '');
    return {
      paso: Math.abs(asim) <= 1,
      valor: `asimetría = ${n2(asim, 2)}`,
      texto: Math.abs(asim) <= 1
        ? `La asimetría es ${n2(asim, 2)}, dentro de lo razonable.${esLog ? ' Se nota que ya estás usando el logaritmo: mira lo simétrica que quedó.' : ''}`
        : `La asimetría es ${n2(asim, 2)}: hay cola larga a la ${asim > 0 ? 'derecha' : 'izquierda'}. ${Math.min(...y) > 0 ? 'Como la variable es siempre positiva, prueba con <code>ln()</code> y compara.' : 'Tiene valores negativos o cero, así que el logaritmo no aplica directamente.'}`,
    };
  },
},
// ═══════════════ ETAPA 2 — SUPUESTOS, EN ORDEN DE GRAVEDAD ═══════════════
{
  n: 3, etapa: 'Supuestos del modelo', id: 'ovtest',
  nombre: 'Forma funcional (RESET de Ramsey)', comando: 'estat ovtest',
  aplicaA: LINEAL,
  mira: 'El valor p de la prueba F.',
  criterio: '<strong>p &gt; 0,05 para aprobar.</strong> La hipótesis nula es "el modelo está bien especificado", así que aquí un p alto es buena noticia.',
  porqueImporta: '<strong>Es el supuesto más grave de todos.</strong> Si falla, tus coeficientes están <u>sesgados</u>: el número que reportas no es el efecto real. Los demás supuestos solo afectan los valores p.',
  siFalla: 'Tres cosas, en este orden:<br>1. Pasar la dependiente a logaritmo (<code>gen lny = ln(y)</code>) — arregla la mayoría de modelos de ingreso.<br>2. Meter un término al cuadrado de la variable principal.<br>3. Pensar qué variable importante falta.',
  gravedad: 'alta',
  evaluar: (ctx) => {
    if (!ctx.fit || ctx.fit.link !== 'identity') return null;
    let r; try { r = M.resetTest(ctx.fit); } catch { return null; }
    if (r.error || isNaN(r.F)) return { paso: null, valor: 'no se pudo calcular', texto: 'Las potencias del valor ajustado salen casi idénticas, así que la prueba no se sostiene. Revisa la forma a ojo con <code>rvfplot</code>.' };
    return {
      paso: r.p > 0.05,
      valor: `F(${r.df1}, ${r.df2}) = ${n2(r.F)} · p = ${p3(r.p)}`,
      texto: r.p > 0.05
        ? `p = ${p3(r.p)}, por encima de 0,05: <strong>no se rechaza</strong>. No hay señal de que falte una variable clave ni de que la relación sea curva.`
        : `p = ${p3(r.p)}, por debajo de 0,05: <strong>se rechaza</strong>. Al modelo le falta algo — una variable o la forma correcta. Con muestras grandes esta prueba rechaza fácil, pero no la ignores: es la única que sesga los coeficientes.`,
    };
  },
},
{
  n: 4, etapa: 'Supuestos del modelo', id: 'vif',
  nombre: 'Multicolinealidad (VIF)', comando: 'estat vif',
  aplicaA: LINEAL,
  mira: 'El VIF más alto de la tabla.',
  criterio: '<strong>VIF &lt; 10 para aprobar.</strong> Menos de 5 está bien, entre 5 y 10 hay que mirarlo, más de 10 es problema.',
  porqueImporta: 'Un VIF alto quiere decir que esa variable es casi una copia de otras: el programa no logra separar el efecto de cada una y los coeficientes salen inestables, con errores estándar enormes.',
  siFalla: 'Quita una de las dos variables repetidas, o júntalas en un índice. <strong>Excepción:</strong> una variable y su cuadrado (<code>exper</code> y <code>exper2</code>) siempre dan VIF alto — es normal, se ignora a propósito y deben ir juntas.',
  gravedad: 'alta',
  evaluar: (ctx) => {
    if (!ctx.fit || ctx.fit.link !== 'identity') return null;
    let v; try { v = M.vif(ctx.fit.X, ctx.fit.names); } catch { return null; }
    if (!v.length) return null;
    const peor = v.reduce((a, b) => (b.vif > a.vif ? b : a), v[0]);
    // el par x / x2 no cuenta: siempre da alto por construcción
    const esCuadratico = v.some((o) => o !== peor && (peor.name === o.name + '2' || o.name === peor.name + '2'));
    return {
      paso: peor.vif < 10 || esCuadratico,
      valor: `VIF máximo = ${n2(peor.vif)} (${peor.name})`,
      texto: peor.vif < 10
        ? `El VIF más alto es ${n2(peor.vif)} en <code>${peor.name}</code>, por debajo de 10. Tus variables aportan información distinta cada una.`
        : (esCuadratico
          ? `El VIF más alto es ${n2(peor.vif)} en <code>${peor.name}</code>, pero es el par de una variable con su cuadrado: <strong>eso es normal y no se arregla</strong>. Están relacionadas por construcción y tienen que ir juntas. Se ignora a propósito.`
          : `El VIF de <code>${peor.name}</code> es ${n2(peor.vif)}, por encima de 10. Esa variable es casi una copia de otra del modelo. Quita una de las dos o júntalas.`),
    };
  },
},
{
  n: 5, etapa: 'Supuestos del modelo', id: 'hettest',
  nombre: 'Heterocedasticidad (Breusch-Pagan)', comando: 'estat hettest',
  aplicaA: LINEAL,
  mira: 'El valor p del chi-cuadrado.',
  criterio: '<strong>p &gt; 0,05 para aprobar.</strong> La nula es "la varianza del error es constante".',
  porqueImporta: 'Importante: la heterocedasticidad <strong>NO sesga tus coeficientes</strong>. Solo hace que los errores estándar (y con ellos los valores p) estén mal calculados. Por eso es menos grave que la forma funcional.',
  siFalla: 'Agrega <code>robust</code> al final del comando. Eso es todo. Los coeficientes no cambian ni un decimal; solo se corrigen los errores estándar. Con datos de encuesta se pone casi siempre.',
  gravedad: 'media',
  evaluar: (ctx) => {
    if (!ctx.fit || ctx.fit.link !== 'identity') return null;
    let r; try { r = M.breuschPagan(ctx.fit); } catch { return null; }
    const yaRobusto = ctx.fit.vce === 'robust' || ctx.fit.vce === 'cluster';
    return {
      paso: r.p > 0.05 || yaRobusto,
      valor: `chi2(${r.df}) = ${n2(r.chi2)} · p = ${p3(r.p)}`,
      texto: r.p > 0.05
        ? `p = ${p3(r.p)}: no hay evidencia de heterocedasticidad. Aun así, poner <code>robust</code> no hace daño.`
        : (yaRobusto
          ? `p = ${p3(r.p)}: sí hay heterocedasticidad, <strong>pero ya corriste el modelo con <code>robust</code></strong>, así que está corregida. Nada más que hacer.`
          : `p = ${p3(r.p)}: sí hay heterocedasticidad y <strong>tu modelo no lleva <code>robust</code></strong>. Vuelve a correrlo agregándolo: los coeficientes quedan igual, solo se arreglan los valores p.`),
    };
  },
},
{
  n: 6, etapa: 'Supuestos del modelo', id: 'normalidad',
  nombre: 'Normalidad de los residuos', comando: 'predict u, resid  →  sktest u',
  aplicaA: LINEAL,
  mira: 'El valor p de la prueba conjunta de asimetría y curtosis.',
  criterio: '<strong>p &gt; 0,05 para aprobar</strong> en muestras chicas. Con más de 200 observaciones, este supuesto <u>deja de importar</u> y se reporta sin más.',
  porqueImporta: 'Es <strong>el menos grave de los cuatro</strong>. Lo que hace confiables a tus valores p con muchas observaciones es el teorema central del límite, no que los residuos sean perfectamente normales.',
  siFalla: 'Con N grande: reportarlo y seguir. Con N chico: mirar <code>qnorm</code>, revisar valores atípicos, y probar la versión en logaritmos.',
  gravedad: 'baja',
  evaluar: (ctx) => {
    if (!ctx.fit || ctx.fit.link !== 'identity' || !ctx.fit.resid) return null;
    let r; try { r = M.sktest(ctx.fit.resid); } catch { return null; }
    if (r.error) return null;
    const grande = ctx.fit.N >= 200;
    return {
      paso: r.p > 0.05 || grande,
      valor: `chi2(2) = ${n2(r.chi2)} · p = ${p3(r.p)}`,
      texto: r.p > 0.05
        ? `p = ${p3(r.p)}: los residuos se comportan como una campana normal. Supuesto cubierto.`
        : (grande
          ? `p = ${p3(r.p)}: se rechaza la normalidad, <strong>pero tienes ${ctx.fit.N} observaciones</strong>. Con muestras así de grandes esta prueba rechaza casi siempre y <u>no es grave</u>: se menciona en el informe y se sigue.`
          : `p = ${p3(r.p)} con solo ${ctx.fit.N} observaciones. Aquí sí importa: mira <code>qnorm</code>, revisa atípicos y prueba con logaritmos.`),
    };
  },
},
{
  n: 7, etapa: 'Supuestos del modelo', id: 'linktest',
  nombre: 'Especificación (linktest)', comando: 'linktest',
  aplicaA: [...LINEAL, ...BINARIO],
  mira: 'Solo la fila <code>_hatsq</code>.',
  criterio: '<strong>p de <code>_hatsq</code> &gt; 0,05 para aprobar.</strong> La otra fila, <code>_hat</code>, sí debe ser significativa: eso solo confirma que el modelo predice algo.',
  porqueImporta: 'Es una segunda opinión sobre la forma del modelo, y sirve también en logit y probit, donde <code>estat ovtest</code> no existe.',
  siFalla: 'Lo mismo que con RESET: falta una variable o la forma es curva. Revisa términos al cuadrado, interacciones o logaritmos.',
  gravedad: 'media',
  evaluar: (ctx) => {
    if (!ctx.fit || !['identity', 'logit', 'probit'].includes(ctx.fit.link)) return null;
    let r; try { r = M.linktest(ctx.fit); } catch { return null; }
    return {
      paso: r.p_hatsq > 0.05,
      valor: `p(_hatsq) = ${p3(r.p_hatsq)}`,
      texto: r.p_hatsq > 0.05
        ? `<code>_hatsq</code> tiene p = ${p3(r.p_hatsq)}, no significativa: <strong>el modelo está bien especificado</strong>. Es justo lo que se busca.`
        : `<code>_hatsq</code> sale significativa (p = ${p3(r.p_hatsq)}): hay señal de mala especificación. Algo le falta al modelo o la relación no es de la forma que supusiste.`,
    };
  },
},
// ═══════════════ ETAPA 3 — CALIDAD DEL MODELO ═══════════════
{
  n: 8, etapa: 'Calidad del modelo', id: 'fglobal',
  nombre: 'Significancia global', comando: 'está en la tabla (Prob > F)',
  aplicaA: 'modelo',
  mira: 'El valor p de la F global (o del chi² en los modelos de máxima verosimilitud).',
  criterio: '<strong>p &lt; 0,05 para aprobar.</strong> Aquí sí queremos un p bajo: la nula es "todas las variables juntas no sirven para nada".',
  porqueImporta: 'Si no se rechaza, tu modelo entero no explica la dependiente mejor que no poner ninguna variable. Todo lo demás sobra.',
  siFalla: 'Revisa que las variables tengan sentido teórico para esa dependiente. Puede que estés modelando la variable equivocada.',
  gravedad: 'alta',
  evaluar: (ctx) => {
    if (!ctx.fit) return null;
    const p = ctx.fit.p_F !== undefined && !isNaN(ctx.fit.p_F) ? ctx.fit.p_F : ctx.fit.p_chi2;
    if (p === undefined || isNaN(p)) return null;
    return {
      paso: p < 0.05,
      valor: `p = ${p3(p)}`,
      texto: p < 0.05
        ? `p = ${p3(p)}: <strong>el modelo sirve</strong>. En conjunto tus variables sí explican ${ctx.fit.depvar}.`
        : `p = ${p3(p)}: <strong>en conjunto tus variables no explican ${ctx.fit.depvar}</strong>. No tiene sentido interpretar coeficientes sueltos hasta arreglar esto.`,
    };
  },
},
{
  n: 9, etapa: 'Calidad del modelo', id: 'r2',
  nombre: 'R² (poder explicativo)', comando: 'está en la tabla',
  aplicaA: LINEAL,
  mira: 'El R² y el R² ajustado.',
  criterio: 'En datos de corte transversal (encuestas), <strong>entre 0,10 y 0,50 es lo normal</strong>. No hay un mínimo obligatorio. Por encima de 0,95 hay que sospechar.',
  porqueImporta: 'Un R² bajo no invalida nada: significa que hay muchos factores que no mediste, lo cual es la regla en datos de personas. Un R² altísimo, en cambio, suele delatar que metiste una variable que ya contiene la respuesta.',
  siFalla: 'Si es sospechosamente alto, revisa que ninguna explicativa sea la dependiente disfrazada (por ejemplo, ingreso por hora para explicar el ingreso).',
  gravedad: 'baja',
  evaluar: (ctx) => {
    if (!ctx.fit || ctx.fit.r2 === undefined || isNaN(ctx.fit.r2)) return null;
    const r2 = ctx.fit.r2;
    return {
      paso: r2 < 0.95,
      valor: `R² = ${n2(r2 * 100, 1)}%`,
      texto: r2 > 0.95
        ? `R² de ${n2(r2 * 100, 1)}%: <strong>sospechosamente alto</strong> para datos de encuesta. Revisa que no hayas metido entre las explicativas algo que ya contenga la dependiente.`
        : (r2 < 0.05
          ? `R² de ${n2(r2 * 100, 1)}%: tus variables explican muy poquito. No es un error de cálculo, es que faltan factores importantes. Se reporta con honestidad.`
          : `R² de ${n2(r2 * 100, 1)}%: el modelo explica esa parte de por qué ${ctx.fit.depvar} varía. En datos de encuesta es un valor <strong>normal</strong>; no busques que suba a 90%.`),
    };
  },
},
// ═══════════════ ETAPA 4 — SOLO MODELOS DE SÍ/NO ═══════════════
{
  n: 10, etapa: 'Solo en logit y probit', id: 'margins',
  nombre: 'Traducir a puntos de probabilidad', comando: 'margins, dydx(*)',
  aplicaA: BINARIO,
  mira: 'Que lo hayas corrido.',
  criterio: '<strong>Es obligatorio.</strong> No es una prueba estadística: es que el coeficiente crudo del logit no se puede interpretar.',
  porqueImporta: 'Un coeficiente de 0,187 no significa "18,7%" de nada: está en escala de logaritmo de momios. El número que va en tu texto sale de <code>margins</code>.',
  siFalla: 'Corre <code>margins, dydx(*)</code> justo después del modelo.',
  gravedad: 'alta',
  evaluar: (ctx) => {
    if (!ctx.fit || !BINARIO.includes(ctx.fit.link)) return null;
    const corrido = !!ctx.ultimosMargins;
    return {
      paso: corrido,
      valor: corrido ? 'ya lo corriste' : 'todavía no',
      texto: corrido
        ? 'Ya tienes los efectos marginales. <strong>Esos son los números que van en el informe</strong>, no los coeficientes de arriba.'
        : 'Todavía no has corrido <code>margins, dydx(*)</code>. Sin eso no puedes interpretar nada de este modelo más allá del signo.',
    };
  },
},
{
  n: 11, etapa: 'Solo en logit y probit', id: 'auc',
  nombre: 'Capacidad de discriminar (AUC)', comando: 'lroc',
  aplicaA: BINARIO,
  mira: 'El área bajo la curva ROC.',
  criterio: '<strong>AUC &gt; 0,70 para un modelo aceptable.</strong> Menos de 0,60 malo · 0,60–0,70 pobre · 0,70–0,80 aceptable · 0,80–0,90 bueno · más de 0,90 excelente y sospechoso.',
  porqueImporta: 'El AUC resume el modelo <strong>en todos los puntos de corte a la vez</strong>, así que no depende de dónde pongas el corte. Por eso es la medida que se reporta.',
  siFalla: 'Si está cerca de 0,50 el modelo no distingue nada: faltan variables que de verdad expliquen el resultado.',
  gravedad: 'media',
  evaluar: (ctx) => {
    if (!ctx.fit || !BINARIO.includes(ctx.fit.link) || !ctx.fit.pred) return null;
    let r; try { r = M.rocPoints(ctx.fit.y, ctx.fit.pred); } catch { return null; }
    const a = r.auc;
    const cal = a < 0.6 ? 'malo' : a < 0.7 ? 'pobre' : a < 0.8 ? 'aceptable' : a < 0.9 ? 'bueno' : 'excelente';
    return {
      paso: a >= 0.7,
      valor: `AUC = ${n2(a, 4)}`,
      texto: `AUC de ${n2(a, 4)}, que se considera <strong>${cal}</strong>. Se lee así: si tomas al azar a alguien que sí y a alguien que no, es la probabilidad de que el modelo le dé mayor puntaje al que sí. ${
        a >= 0.9 ? 'Ojo: tan alto conviene revisarlo, a veces delata una variable que ya contiene la respuesta.'
          : a < 0.7 ? 'Por debajo de 0,70 el modelo discrimina poco: faltan variables explicativas.' : ''}`,
    };
  },
},
{
  n: 12, etapa: 'Solo en logit y probit', id: 'gof',
  nombre: 'Bondad de ajuste (Hosmer-Lemeshow)', comando: 'estat gof, group(10)',
  aplicaA: BINARIO,
  mira: 'El valor p del chi-cuadrado.',
  criterio: '<strong>p &gt; 0,05 para aprobar.</strong> Va al revés de lo que uno espera: aquí un p <u>alto</u> es buena noticia.',
  porqueImporta: 'Compara lo que el modelo predijo con lo que realmente pasó, por grupos. Si coinciden, el modelo está bien calibrado.',
  siFalla: 'Con muestras grandes rechaza con facilidad. Míralo junto con el AUC antes de concluir que el modelo está mal.',
  gravedad: 'baja',
  evaluar: (ctx) => {
    if (!ctx.fit || !BINARIO.includes(ctx.fit.link) || !ctx.fit.pred) return null;
    let r; try { r = M.hosmerLemeshow(ctx.fit.y, ctx.fit.pred, 10); } catch { return null; }
    return {
      paso: r.p > 0.05,
      valor: `chi2(${r.df}) = ${n2(r.chi2)} · p = ${p3(r.p)}`,
      texto: r.p > 0.05
        ? `p = ${p3(r.p)}: el ajuste es aceptable. Lo que el modelo predice se parece a lo que pasó.`
        : `p = ${p3(r.p)}: el ajuste no es bueno. Con ${ctx.fit.N} observaciones esta prueba rechaza fácil, así que mira también el AUC antes de descartar el modelo.`,
    };
  },
},
{
  n: 13, etapa: 'Solo en logit y probit', id: 'clasifica',
  nombre: 'Le gana a decir siempre lo mismo', comando: 'estat classification',
  aplicaA: BINARIO,
  mira: 'El % correctamente clasificado contra la categoría más frecuente.',
  criterio: '<strong>El modelo debe superar por un margen claro a la categoría más común.</strong> Si el 85% son "no", acertar 85% no es mérito.',
  porqueImporta: 'Es la trampa más común al reportar un logit: presumir un 85% de aciertos que se consigue diciendo siempre "no".',
  siFalla: 'Mira el AUC en vez del porcentaje de aciertos, y considera mover el punto de corte según qué error te cueste más.',
  gravedad: 'media',
  evaluar: (ctx) => {
    if (!ctx.fit || !BINARIO.includes(ctx.fit.link) || !ctx.fit.pred) return null;
    let t; try { t = M.classificationTable(ctx.fit.y, ctx.fit.pred, 0.5); } catch { return null; }
    const tasa = (t.tp + t.fn) / t.N;
    const mayoria = Math.max(tasa, 1 - tasa);
    return {
      paso: t.correct > mayoria + 0.02,
      valor: `acierta ${n2(t.correct * 100, 1)}% · mayoría ${n2(mayoria * 100, 1)}%`,
      texto: t.correct > mayoria + 0.02
        ? `El modelo acierta el ${n2(t.correct * 100, 1)}%, contra el ${n2(mayoria * 100, 1)}% que se lograría diciendo siempre la categoría más común. <strong>Sí aporta.</strong>`
        : `El modelo acierta ${n2(t.correct * 100, 1)}%, pero diciendo siempre la categoría más común se acertaría ${n2(mayoria * 100, 1)}%. <strong>No le está ganando.</strong> No reportes ese porcentaje como logro: usa el AUC.`,
    };
  },
},
];

/** Corre todas las que apliquen al modelo actual, en orden. */
export function evaluarTodas(ctx) {
  const salida = [];
  for (const pr of PRUEBAS) {
    let aplica = true;
    if (Array.isArray(pr.aplicaA)) {
      aplica = !!ctx.fit && pr.aplicaA.includes(ctx.fit.link === 'identity' ? 'regress' : ctx.fit.link);
    } else if (pr.aplicaA === 'modelo') {
      aplica = !!ctx.fit;
    }
    if (!aplica) continue;
    let res = null;
    try { res = pr.evaluar(ctx); } catch { res = null; }
    if (!res) continue;
    salida.push({ ...pr, resultado: res });
  }
  return salida;
}

export function resumen(evaluadas) {
  const con = evaluadas.filter((e) => e.resultado.paso !== null);
  const pasan = con.filter((e) => e.resultado.paso).length;
  const fallan = con.filter((e) => !e.resultado.paso);
  const graves = fallan.filter((e) => e.gravedad === 'alta');
  return {
    total: con.length, pasan, fallan: fallan.length,
    graves: graves.length, listaGraves: graves,
    nota: con.length ? Math.round((pasan / con.length) * 100) : 0,
  };
}

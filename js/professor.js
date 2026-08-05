// El profesor: convierte resultados en explicaciones en español sencillo.
// Es determinista (no necesita internet) y sigue el tono del documento
// "Econometría sin tecnicismos": cada palabra técnica se explica ahí mismo.

import { esNulo, miles } from './core/util.js';

const n2 = (v, d = 2) => (esNulo(v) || isNaN(v) ? '—' : Number(v).toFixed(d).replace('.', ','));
const pTxt = (p) => (esNulo(p) || isNaN(p) ? '—' : (p < 0.001 ? 'menor a 0,001' : n2(p, 3)));

function bloque(titulo, resumen, items = [], extras = {}) {
  return Object.assign({ titulo, resumen, items, filas: [], siguientes: [], frases: [] }, extras);
}

// ------------------------------------------------------------------ significancia

export function veredicto(p) {
  if (esNulo(p) || isNaN(p)) return { nivel: 'nd', etiqueta: 'Sin dato', tono: 'info' };
  if (p < 0.01) return { nivel: 1, etiqueta: 'Sí importa (al 1%)', tono: 'ok' };
  if (p < 0.05) return { nivel: 5, etiqueta: 'Sí importa (al 5%)', tono: 'ok' };
  if (p < 0.10) return { nivel: 10, etiqueta: 'Al límite (al 10%)', tono: 'ojo' };
  return { nivel: 0, etiqueta: 'No hay evidencia', tono: 'mal' };
}

function fraseSignificancia(p) {
  const v = veredicto(p);
  if (v.nivel === 1) return `El valor p es ${pTxt(p)}, mucho menor a 0,05: es prácticamente imposible que esto salga por casualidad.`;
  if (v.nivel === 5) return `El valor p es ${pTxt(p)}, menor a 0,05: hay evidencia de que el efecto es real.`;
  if (v.nivel === 10) return `El valor p es ${pTxt(p)}: pasa el límite del 10% pero <strong>no</strong> el del 5%. Se puede mencionar, siempre diciendo con qué límite estás trabajando.`;
  return `El valor p es ${pTxt(p)}, mayor a 0,05: con esta muestra no se puede afirmar que esta variable importe. Ojo, "no hay evidencia" <strong>no</strong> es lo mismo que "no hay efecto".`;
}

// ------------------------------------------------------------------ tipo de término

function tipoTermino(nombre, ds, depvar) {
  if (nombre === '_cons') return { tipo: 'cons' };
  if (nombre.includes('#')) return { tipo: 'interaccion' };
  const mf = nombre.match(/^(-?\d+)\.(.+)$/);
  if (mf) return { tipo: 'nivel', nivel: Number(mf[1]), variable: mf[2] };
  if (ds && ds.existe(nombre)) {
    if (ds.esBinaria(nombre)) return { tipo: 'dummy', variable: nombre };
    if (/^ln|^log/.test(nombre)) return { tipo: 'log', variable: nombre };
  }
  if (/^ln|^log/.test(nombre)) return { tipo: 'log', variable: nombre };
  if (/2$|_?sq$|cuad/.test(nombre)) return { tipo: 'cuadratico', variable: nombre };
  return { tipo: 'continua', variable: nombre };
}

function depEnLogs(depvar) { return /^ln|^log/.test(depvar || ''); }

/** Convierte un coeficiente de un modelo en logaritmos a porcentaje. */
function aPorcentaje(b) {
  const exacto = (Math.exp(b) - 1) * 100;
  const rapido = b * 100;
  return { exacto, rapido, difiere: Math.abs(b) > 0.1 };
}

// ------------------------------------------------------------------ un coeficiente

export function interpretarCoeficiente(nombre, b, p, ctx = {}) {
  const { ds, depvar, mediaDep, fit } = ctx;
  const t = tipoTermino(nombre, ds, depvar);
  const enLogs = depEnLogs(depvar);
  const etiqueta = ds && ds.existe(t.variable) ? (ds.meta(t.variable).label || t.variable) : (t.variable || nombre);
  const partes = [];

  if (t.tipo === 'cons') {
    return {
      nombre, veredicto: veredicto(p),
      texto: `Esta fila es la <strong>constante</strong> (también llamada intercepto): sería el valor de ${depvar || 'la dependiente'} cuando <em>todas</em> las variables valen cero a la vez. Ese caso casi nunca existe de verdad en los datos (nadie tiene cero años, cero horas y cero todo), así que <strong>esta fila normalmente no se interpreta</strong>. Que sea o no significativa da igual.`,
      noInterpretar: true,
    };
  }

  if (t.tipo === 'nivel') {
    const et = ds ? ds.etiquetaDe(t.variable, t.nivel) : null;
    const base = fit && fit.piezas ? (fit.piezas.find((x) => x.nombre === t.variable) || {}).base : null;
    const etBase = ds && base !== null && base !== undefined ? ds.etiquetaDe(t.variable, base) : null;
    const cuanto = enLogs
      ? `${n2(aPorcentaje(b).exacto)}%`
      : `${n2(b)} ${ctx.unidad || 'unidades'}`;
    partes.push(`Estás comparando <strong>${et || 'el nivel ' + t.nivel}</strong> contra <strong>${etBase || 'la categoría base'}</strong>, que es el grupo que Stata dejó fuera como punto de comparación.`);
    partes.push(`La diferencia es de <strong>${b > 0 ? '+' : ''}${cuanto}</strong>${b > 0 ? ' a favor' : ' en contra'} de ${et || 'este grupo'}, comparando personas iguales en todo lo demás que está en el modelo.`);
    partes.push('Este número <strong>no</strong> es el valor del grupo: es cuánto se aparta del grupo base. Si cambias la base, cambian todos estos números aunque el modelo sea el mismo.');
  } else if (t.tipo === 'dummy') {
    const cuanto = enLogs ? `${n2(aPorcentaje(b).exacto)}%` : `${n2(Math.abs(b))} ${ctx.unidad || 'unidades'}`;
    partes.push(`<code>${t.variable}</code> solo puede valer 0 o 1, así que el coeficiente <strong>no</strong> es "por cada unidad más": es directamente la <strong>diferencia entre los dos grupos</strong>.`);
    partes.push(`Quien tiene ${etiqueta.toLowerCase()} = 1 ${b > 0 ? 'está por encima' : 'está por debajo'} en <strong>${cuanto}</strong>, comparado con quien tiene 0 y es igual en todo lo demás del modelo.`);
  } else if (t.tipo === 'log') {
    partes.push(enLogs
      ? `Las dos variables están en logaritmo, así que este número es una <strong>elasticidad</strong>: si <code>${t.variable}</code> sube 1%, ${depvar} ${b > 0 ? 'sube' : 'baja'} <strong>${n2(Math.abs(b), 3)}%</strong>.`
      : `<code>${t.variable}</code> está en logaritmo pero la dependiente no. Se lee: si <code>${t.variable}</code> sube 1%, ${depvar} cambia en <strong>${n2(b / 100, 4)}</strong> unidades.`);
    if (enLogs && Math.abs(b) < 1 && b > 0) {
      partes.push(`Como el número es menor que 1, el crecimiento es <strong>menos que proporcional</strong>: duplicar ${t.variable} no duplica ${depvar}.`);
    }
  } else if (t.tipo === 'cuadratico') {
    partes.push(`Este es un término <strong>al cuadrado</strong>: su trabajo es "curvar" el efecto de la variable original en vez de dejarlo siempre igual.`);
    partes.push(b < 0
      ? 'Como es negativo, el efecto empieza fuerte y se va <strong>aplanando</strong>: sube, llega a un techo y después incluso puede bajar.'
      : 'Como es positivo, el efecto se va <strong>acelerando</strong> en vez de aplanarse.');
    const raiz = (nombre.match(/^(.+?)2$/) || [])[1];
    if (raiz && fit) {
      const j = fit.names.indexOf(raiz);
      if (j >= 0 && b !== 0) {
        const giro = -fit.b[j] / (2 * b);
        if (isFinite(giro) && giro > 0) {
          partes.push(`El punto de giro está en <strong>${n2(giro, 1)}</strong>: hasta ahí ${depvar} ${fit.b[j] > 0 ? 'sube' : 'baja'}, y a partir de ahí cambia de dirección. (Se calcula con −b₁ ÷ (2·b₂).)`);
        }
      }
    }
  } else if (t.tipo === 'interaccion') {
    partes.push('Este es un término de <strong>interacción</strong>: no mide un efecto por su cuenta, sino <strong>cuánto cambia el efecto de una variable según el valor de la otra</strong>.');
    partes.push('Nunca lo leas solo: hay que leerlo junto con los coeficientes de las dos variables que lo forman.');
  } else {
    const cuanto = enLogs
      ? `${b > 0 ? 'sube' : 'baja'} <strong>${n2(Math.abs(aPorcentaje(b).exacto))}%</strong>`
      : `${b > 0 ? 'sube' : 'baja'} <strong>${n2(Math.abs(b))} ${ctx.unidad || 'unidades'}</strong>`;
    partes.push(`Por cada unidad más de <code>${t.variable}</code>, ${depvar} ${cuanto}, <strong>manteniendo quietas</strong> las demás variables del modelo. Eso último es la clave: es como comparar dos personas idénticas en todo, menos en ${etiqueta.toLowerCase()}.`);
    if (enLogs) {
      const ap = aPorcentaje(b);
      if (ap.difiere) {
        partes.push(`Cuidado con la cuenta rápida: multiplicar por 100 daría ${n2(ap.rapido)}%, pero como el coeficiente pasa de 0,10 hay que usar la cuenta exacta <strong>(e^b − 1)×100 = ${n2(ap.exacto)}%</strong>. Un profesor exigente te marca esa diferencia.`);
      }
    }
  }

  partes.push(fraseSignificancia(p));

  // magnitud práctica
  if (mediaDep && !enLogs && ['continua', 'dummy', 'nivel'].includes(t.tipo) && veredicto(p).nivel !== 0) {
    const pct = Math.abs(b) / Math.abs(mediaDep) * 100;
    if (pct < 1) {
      partes.push(`En la práctica es <strong>chico</strong>: representa apenas un ${n2(pct)}% del promedio de ${depvar}. Que sea significativo no lo vuelve importante — con muchas observaciones hasta un efecto mínimo sale significativo.`);
    } else if (pct > 25) {
      partes.push(`En la práctica es <strong>grande</strong>: equivale a un ${n2(pct)}% del promedio de ${depvar}. Vale la pena destacarlo en tu conclusión.`);
    } else {
      partes.push(`Para dimensionarlo: equivale a un ${n2(pct)}% del promedio de ${depvar} (${miles(mediaDep, 2)}).`);
    }
  }

  return { nombre, veredicto: veredicto(p), texto: partes.join(' '), tipo: t.tipo };
}

// ------------------------------------------------------------------ regresión lineal

export function interpretarRegress(fit, ctx = {}) {
  const ds = ctx.ds;
  const media = fit.y.reduce((a, b) => a + b, 0) / fit.N;
  const enLogs = depEnLogs(fit.depvar);
  const items = [], siguientes = [], frases = [];

  const sig = fit.names.filter((nm, j) => nm !== '_cons' && fit.p[j] < 0.05);
  const noSig = fit.names.filter((nm, j) => nm !== '_cons' && fit.p[j] >= 0.05 && !fit.omitted.includes(nm));

  let resumen;
  if (isNaN(fit.p_F)) resumen = 'El modelo se estimó, pero no tiene variables explicativas que evaluar.';
  else if (fit.p_F < 0.05) {
    resumen = `El modelo sirve: en conjunto las variables sí explican ${fit.depvar} (prueba F con valor p ${pTxt(fit.p_F)}). ` +
      `De ${fit.names.length - 1} variables, <strong>${sig.length}</strong> ${sig.length === 1 ? 'resultó significativa' : 'resultaron significativas'} al 5%.`;
  } else {
    resumen = `Cuidado: la prueba F global da un valor p de ${pTxt(fit.p_F)}. Eso quiere decir que <strong>en conjunto</strong> tus variables no logran explicar ${fit.depvar} mejor que no poner ninguna.`;
  }

  // R²
  const r2pct = fit.r2 * 100;
  if (fit.r2 > 0.95) {
    items.push({ tono: 'mal', texto: `Un R² de ${n2(r2pct, 1)}% es <strong>sospechosamente alto</strong> para datos de encuesta. Revisa que no hayas metido entre las explicativas una variable que sea, en el fondo, la misma dependiente disfrazada (por ejemplo el ingreso por hora para explicar el ingreso).` });
  } else if (fit.r2 < 0.05) {
    items.push({ tono: 'ojo', texto: `El R² es ${n2(r2pct, 1)}%: tus variables explican muy poquito de ${fit.depvar}. No es un error de cálculo, es que faltan factores importantes. Vale la pena decirlo con honestidad en la conclusión.` });
  } else {
    items.push({ tono: 'info', texto: `El R² dice que el modelo explica el <strong>${n2(r2pct, 1)}%</strong> de por qué ${fit.depvar} sube o baja entre una persona y otra. El otro ${n2(100 - r2pct, 1)}% depende de cosas que no mediste (suerte, contactos, habilidad, el sector exacto...). En datos de encuesta un R² entre 20% y 40% es <strong>normal y aceptable</strong>: no busques que suba a 90%.` });
  }

  // robustez
  if (fit.vce === 'ols') {
    items.push({ tono: 'ojo', texto: 'Corriste el modelo <strong>sin</strong> <code>robust</code>. Con datos de encuesta casi siempre hace falta: no cambia los coeficientes, solo corrige cómo se calculan los valores p. Compruébalo con <code>estat hettest</code> y, si sale significativo, vuelve a correr agregando <code>, robust</code>.' });
    siguientes.push('estat hettest');
  } else if (fit.vce === 'robust') {
    items.push({ tono: 'ok', texto: 'Bien puesto el <code>robust</code>: los valores p ya están corregidos por si unas personas varían mucho más que otras. Recuerda que los coeficientes son exactamente los mismos, solo cambian los errores estándar.' });
  } else if (fit.vce === 'cluster') {
    items.push({ tono: 'ok', texto: `Errores agrupados en ${fit.nClusters} conglomerados. Se usa cuando las observaciones vienen "en paquetes" (personas del mismo hogar, empresas de la misma ciudad) y no son del todo independientes entre sí.` });
  }

  if (enLogs) {
    items.push({ tono: 'info', texto: `Como <code>${fit.depvar}</code> está en logaritmo, los coeficientes <strong>no</strong> se leen en unidades sino en <strong>porcentaje</strong>. Para números chicos (menores a 0,10) sirve multiplicar por 100; para los más grandes hay que usar la cuenta exacta (e^b − 1)×100.` });
  }

  if (noSig.length) {
    items.push({ tono: 'info', texto: `${noSig.length === 1 ? 'La variable' : 'Las variables'} ${noSig.map((n) => `<code>${n}</code>`).join(', ')} no ${noSig.length === 1 ? 'resultó significativa' : 'resultaron significativas'}. <strong>No las borres automáticamente</strong>: si son parte de tu pregunta o son controles que la teoría exige, se dejan y se reporta que no salieron significativas. Eso también es un resultado.` });
  }

  if (fit.N < 50) {
    items.push({ tono: 'mal', texto: `Solo ${fit.N} observaciones. Con tan pocos casos los valores p son poco confiables y basta un dato raro para cambiar todo. Interpreta con mucha prudencia.` });
  }

  // filas
  const filas = fit.names.map((nm, j) => {
    if (fit.omitted.includes(nm)) {
      return {
        nombre: nm, veredicto: { etiqueta: 'Omitida', tono: 'info' },
        texto: 'Stata sacó esta variable porque se puede calcular exactamente a partir de las otras (colinealidad perfecta). El caso más típico es meter todas las categorías de un grupo sin dejar una fuera como base: se llama "trampa de las dummies". No es un error tuyo grave, pero revisa qué variables estás metiendo.',
      };
    }
    return interpretarCoeficiente(nm, fit.b[j], fit.p[j], {
      ds, depvar: fit.depvar, mediaDep: media, fit,
      unidad: ctx.unidad || (fit.depvar === 'ingreso' ? 'dólares' : 'unidades'),
    });
  });

  siguientes.push('estat vif', 'estat ovtest', 'predict e, resid');

  // frases listas para el informe
  for (let j = 0; j < fit.names.length; j++) {
    const nm = fit.names[j];
    if (nm === '_cons' || fit.omitted.includes(nm)) continue;
    if (fit.p[j] >= 0.05) continue;
    const t = tipoTermino(nm, ds, fit.depvar);
    const cuanto = enLogs ? `${n2(aPorcentaje(fit.b[j]).exacto)}%` : `${n2(fit.b[j])} unidades`;
    frases.push(`Un aumento de una unidad en ${t.variable || nm} se asocia con un cambio de ${cuanto} en ${fit.depvar} (p = ${pTxt(fit.p[j])}), controlando por el resto de variables del modelo.`);
  }
  frases.push('Estos resultados muestran una relación entre las variables, controlando por lo demás incluido en el modelo. No prueban por sí solos que una cosa cause la otra.');

  return bloque('Qué dice esta regresión', resumen, items, { filas, siguientes, frases });
}

// ------------------------------------------------------------------ logit / probit

export function interpretarLogit(fit, ame, ctx = {}) {
  const ds = ctx.ds;
  const tipo = ctx.tipo || 'logit';
  const items = [], siguientes = [], frases = [];
  const tasa = fit.y.reduce((a, b) => a + b, 0) / fit.N;

  const resumen = `Este modelo predice un <strong>sí o no</strong> (${fit.depvar}), y en tus datos el ${n2(tasa * 100, 1)}% de los casos son "sí". ` +
    (fit.p_chi2 < 0.05
      ? `En conjunto las variables sí ayudan a predecirlo (valor p ${pTxt(fit.p_chi2)}).`
      : `Pero en conjunto las variables <strong>no</strong> logran predecirlo (valor p ${pTxt(fit.p_chi2)}).`);

  items.push({
    tono: 'ojo',
    texto: `<strong>Lo más importante de este modelo:</strong> los coeficientes de arriba <u>no</u> se pueden leer como probabilidad. Un 0,187 no significa "18,7%" de nada. De este número crudo solo puedes sacar dos cosas a simple vista: el <strong>signo</strong> (si ayuda o perjudica) y si es <strong>significativo</strong>. Para saber en cuántos puntos de probabilidad se traduce, hay que correr <code>margins, dydx(*)</code>.`,
  });

  if (ame) {
    const lineas = ame.names.map((nm, i) => {
      const v = veredicto(ame.p[i]);
      return `<code>${nm}</code>: ${ame.dydx[i] > 0 ? '+' : ''}${n2(ame.dydx[i] * 100)} puntos de probabilidad${v.nivel === 0 || v.nivel === 10 ? ' (pero no es significativo al 5%)' : ''}`;
    });
    items.push({ tono: 'ok', texto: `Ya traducido a puntos de probabilidad (esto es lo que se reporta en un trabajo):<br>${lineas.join('<br>')}` });
  }

  items.push({
    tono: 'info',
    texto: `El <strong>pseudo R²</strong> es ${n2(fit.r2_p, 4)}. Ojo: <u>no</u> se lee como el R² de una regresión normal, no es "el porcentaje explicado". En logit valores de 0,05 a 0,20 son perfectamente normales. No lo compares con el R² de un modelo lineal.`,
  });

  if (ctx.mostrarOR) {
    items.push({
      tono: 'ojo',
      texto: 'Estás viendo <strong>razones de momios</strong> (odds ratio). Aquí el valor que significa "no pasa nada" es el <strong>1</strong>, no el 0: mayor a 1 ayuda, menor a 1 perjudica. Y una razón de 1,21 significa "21% más momios", <strong>no</strong> "21% más probabilidad" — son cosas distintas.',
    });
  }

  if (tipo === 'probit') {
    items.push({ tono: 'info', texto: 'Probit y logit contestan lo mismo con una curva ligeramente distinta. Los coeficientes crudos <strong>no</strong> son comparables entre los dos modelos, pero los efectos marginales de <code>margins</code> sí, y casi siempre salen casi iguales.' });
  }

  const filas = fit.names.map((nm, j) => {
    if (nm === '_cons') {
      return { nombre: nm, veredicto: veredicto(fit.p[j]), noInterpretar: true,
        texto: 'La constante de un logit no se interpreta: sería el logaritmo de los momios de alguien con todas las variables en cero. No la comentes en el informe.' };
    }
    const t = tipoTermino(nm, ds, fit.depvar);
    const dir = fit.b[j] > 0 ? 'sube' : 'baja';
    let texto = `El signo es ${fit.b[j] > 0 ? 'positivo' : 'negativo'}: más ${t.variable || nm} ${dir} la probabilidad de ${fit.depvar}. `;
    if (ame) {
      const i = ame.names.indexOf(nm);
      if (i >= 0) texto += `Traducido: <strong>${ame.dydx[i] > 0 ? '+' : ''}${n2(ame.dydx[i] * 100)} puntos de probabilidad</strong>. `;
    }
    texto += `La razón de momios es ${n2(Math.exp(fit.b[j]), 3)} (los momios se <em>multiplican</em> por ese número; el 1 es el "no pasa nada"). `;
    texto += fraseSignificancia(fit.p[j]);
    return { nombre: nm, veredicto: veredicto(fit.p[j]), texto };
  });

  siguientes.push('margins, dydx(*)', 'estat classification', 'lroc', 'estat gof');

  if (ame) {
    ame.names.forEach((nm, i) => {
      if (ame.p[i] < 0.05) {
        frases.push(`Un aumento de una unidad en ${nm} se asocia con un cambio de ${n2(ame.dydx[i] * 100)} puntos porcentuales en la probabilidad de ${fit.depvar} (p = ${pTxt(ame.p[i])}).`);
      }
    });
  }

  return bloque(`Qué dice este ${tipo}`, resumen, items, { filas, siguientes, frases });
}

// ------------------------------------------------------------------ multinomial

export function interpretarMlogit(fit, ctx = {}) {
  const ds = ctx.ds;
  const etBase = ds ? ds.etiquetaDe(fit.depvar, fit.base) : null;
  const nombreBase = etBase || `categoría ${fit.base}`;
  const items = [], filas = [], frases = [];

  const resumen = `Aquí no hay un sí/no sino <strong>${fit.niveles.length} opciones</strong>. El modelo corre varias comparaciones a la vez, y <u>todas</u> son contra la misma referencia: <strong>${nombreBase}</strong>.`;

  items.push({
    tono: 'ojo',
    texto: `<strong>La regla de oro de este modelo:</strong> nunca digas solo "la educación reduce la informalidad". Di siempre <em>"la educación reduce la probabilidad de ser informal <u>comparado con ser ${nombreBase.toLowerCase()}</u>"</em>. Si te olvidas de la parte de "comparado con", la frase dice algo que el modelo nunca afirmó. Es el error más frecuente en este modelo.`,
  });
  items.push({
    tono: 'info',
    texto: 'Los coeficientes están en la misma escala rara del logit (logaritmo de momios). De ellos solo se leen el signo y la significancia. Un coeficiente grande <strong>no</strong> significa "probabilidad alta".',
  });
  if (ctx.esProbit) {
    items.push({ tono: 'info', texto: 'El probit multinomial contesta lo mismo con otra curva por debajo. Se usa sobre todo para <strong>comprobar que la conclusión no cambia</strong> según qué curva elijas. Si mlogit y mprobit cuentan la misma historia, tu resultado es sólido.' });
  } else {
    items.push({ tono: 'info', texto: 'Este modelo supone <strong>IIA</strong>: que agregar o quitar una opción no cambia cómo se comparan las demás. Si sospechas que no se cumple (por ejemplo, si dos opciones son casi lo mismo), existen versiones más flexibles como <code>nlogit</code> o <code>asmprobit</code>.' });
  }
  items.push({
    tono: 'ojo',
    texto: 'Si tus categorías <strong>sí tienen un orden</strong> (pobre / medio / rico, o triste / normal / feliz), este no es el modelo: usa <code>ologit</code> u <code>oprobit</code>, que aprovechan esa escalera y necesitan menos números para explicar lo mismo.',
  });

  for (const eq of fit.eqs) {
    const et = ds ? ds.etiquetaDe(fit.depvar, eq.nivel) : null;
    const nombreEq = et || `categoría ${eq.nivel}`;
    eq.names.forEach((nm, j) => {
      if (nm === '_cons') return;
      const v = veredicto(eq.p[j]);
      const dir = eq.b[j] > 0 ? 'más' : 'menos';
      filas.push({
        nombre: `${nombreEq} ← ${nm}`,
        veredicto: v,
        texto: `Signo ${eq.b[j] > 0 ? 'positivo' : 'negativo'}: más <code>${nm}</code> hace <strong>${dir} probable</strong> ser <strong>${nombreEq.toLowerCase()}</strong> en vez de <strong>${nombreBase.toLowerCase()}</strong>. ${fraseSignificancia(eq.p[j])}`,
      });
      if (v.nivel === 1 || v.nivel === 5) {
        frases.push(`Un aumento en ${nm} reduce o aumenta la probabilidad de ser ${nombreEq.toLowerCase()} frente a ${nombreBase.toLowerCase()} (coeficiente ${n2(eq.b[j], 3)}, p = ${pTxt(eq.p[j])}).`);
      }
    });
  }

  return bloque('Qué dice este modelo de varias opciones', resumen, items, {
    filas, frases,
    siguientes: [`mlogit ${fit.depvar} ..., base(${fit.niveles.find((v) => v !== fit.base)})`, 'mprobit ' + fit.depvar + ' ...'],
  });
}

// ------------------------------------------------------------------ ordenado

export function interpretarOlogit(fit, ctx = {}) {
  const items = [], filas = [];
  const resumen = `Tu variable tiene <strong>${fit.niveles.length} niveles con orden</strong> (del más bajo al más alto). Este modelo aprovecha ese orden: en vez de tratar cada categoría como una isla aparte, supone que hay una sola escala por debajo y unos "cortes" que dividen esa escala en tramos.`;

  items.push({ tono: 'info', texto: 'Un coeficiente <strong>positivo</strong> quiere decir que esa variable empuja hacia las categorías <strong>altas</strong>; uno negativo, hacia las bajas. Ese es el signo, y es lo primero que se lee.' });
  items.push({ tono: 'ojo', texto: 'Las filas <code>/cut1</code>, <code>/cut2</code>... <strong>no se interpretan</strong>. Son solo las fronteras internas entre un nivel y el siguiente. No las comentes en el informe.' });
  items.push({ tono: 'info', texto: 'Este modelo supone <strong>líneas paralelas</strong>: que el efecto de cada variable es el mismo para pasar del nivel 1 al 2 que del 4 al 5. Es un supuesto fuerte; conviene al menos mencionarlo.' });
  items.push({ tono: 'ojo', texto: 'Si tus categorías <strong>no</strong> tuvieran orden (asalariado / informal / cuenta propia), este modelo estaría mal usado: ahí va <code>mlogit</code>.' });

  fit.names.forEach((nm, j) => {
    const v = veredicto(fit.p[j]);
    filas.push({
      nombre: nm, veredicto: v,
      texto: `Signo ${fit.b[j] > 0 ? 'positivo: empuja hacia los niveles más altos' : 'negativo: empuja hacia los niveles más bajos'} de ${fit.depvar}. ${fraseSignificancia(fit.p[j])}`,
    });
  });

  return bloque('Qué dice este modelo ordenado', resumen, items, { filas });
}

// ------------------------------------------------------------------ Poisson

export function interpretarPoisson(fit, ctx = {}) {
  const ds = ctx.ds;
  const items = [], filas = [];
  const media = fit.y.reduce((a, b) => a + b, 0) / fit.N;
  const varianza = fit.y.reduce((a, b) => a + (b - media) ** 2, 0) / (fit.N - 1);

  const resumen = `Este modelo explica un <strong>conteo</strong> (${fit.depvar}: 0, 1, 2, 3…). ` +
    (fit.p_chi2 < 0.05
      ? `En conjunto las variables sí ayudan a explicarlo (valor p ${pTxt(fit.p_chi2)}).`
      : `Pero en conjunto las variables no logran explicarlo (valor p ${pTxt(fit.p_chi2)}).`);

  items.push({
    tono: 'ojo',
    texto: 'Los coeficientes de Poisson <strong>no se leen directo</strong>: están en escala de logaritmo. Para pasarlos a algo entendible se usa <strong>(e^b − 1) × 100</strong>, que da el cambio porcentual esperado en el conteo por cada unidad más de esa variable.',
  });

  // sobredispersión: el supuesto que más se rompe
  const razon = varianza / media;
  if (razon > 1.25) {
    items.push({
      tono: 'mal',
      texto: `<strong>Ojo con el supuesto principal.</strong> Poisson exige que la media y la varianza del conteo sean iguales. Aquí la media es ${n2(media)} y la varianza ${n2(varianza)}: la varianza es ${n2(razon)} veces la media. Eso se llama <strong>sobredispersión</strong>, y hace que los errores estándar salgan más chicos de lo que deberían (o sea, cosas que parecen significativas podrían no serlo). Lo correcto sería una binomial negativa (<code>nbreg</code>), que no está en este simulador. Menciónalo en tu informe.`,
    });
  } else {
    items.push({
      tono: 'ok',
      texto: `El supuesto principal se cumple razonablemente: la media del conteo es ${n2(media)} y la varianza ${n2(varianza)}, bastante parecidas. Poisson exige justamente eso.`,
    });
  }
  items.push({
    tono: 'info',
    texto: 'El pseudo R² de Poisson tampoco se lee como el R² de una regresión normal. No lo compares con el de un modelo lineal.',
  });

  fit.names.forEach((nm, j) => {
    if (nm === '_cons') {
      filas.push({ nombre: nm, veredicto: veredicto(fit.p[j]), noInterpretar: true,
        texto: 'La constante de un Poisson no se interpreta: sería el logaritmo del conteo esperado con todas las variables en cero.' });
      return;
    }
    const pct = (Math.exp(fit.b[j]) - 1) * 100;
    const t = tipoTermino(nm, ds, fit.depvar);
    filas.push({
      nombre: nm, veredicto: veredicto(fit.p[j]),
      texto: `Por cada unidad más de <code>${t.variable || nm}</code>, ${fit.depvar} ${pct > 0 ? 'sube' : 'baja'} un <strong>${n2(Math.abs(pct))}%</strong> en promedio, manteniendo lo demás constante. (Sale de (e^${n2(fit.b[j], 4)} − 1) × 100.) ${fraseSignificancia(fit.p[j])}`,
    });
  });

  return bloque('Qué dice este modelo de conteos', resumen, items, { filas });
}

// ------------------------------------------------------------------ ANOVA

export function interpretarAnova(a, ctx = {}) {
  const { ds, dep, factores } = ctx;
  const items = [];
  const p = a.model.p;
  const resumen = p < 0.05
    ? `Sí hay diferencias: al menos uno de los grupos de <strong>${factores.join(', ')}</strong> tiene un promedio de ${dep} distinto a los demás (valor p ${pTxt(p)}).`
    : `No hay evidencia de diferencias entre los grupos de <strong>${factores.join(', ')}</strong> en el promedio de ${dep} (valor p ${pTxt(p)}).`;

  items.push({ tono: 'info', texto: 'ANOVA <strong>no es un modelo aparte</strong>: es la misma regresión de mínimos cuadrados, pero con todas las variables convertidas en grupos. Si corres <code>reg ' + dep + ' i.' + factores[0] + '</code> obtienes exactamente el mismo resultado, solo presentado distinto.' });
  if (p < 0.05) {
    items.push({ tono: 'ojo', texto: `Esta prueba te dice <strong>que hay</strong> diferencia, pero no <strong>cuál</strong> grupo se separa ni de cuánto es. Para eso corre:<br><code>reg ${dep} i.${factores[0]}, robust</code><br>Ahí cada coeficiente es la diferencia contra el grupo que quedó de base.` });
  }
  items.push({ tono: 'info', texto: `El R² es ${n2(a.r2 * 100, 1)}%: eso es lo que el grupo por sí solo explica de ${dep}. Si es bajo, quiere decir que dentro de cada grupo la gente sigue siendo muy distinta entre sí.` });
  if (a.rows.length > 1) {
    items.push({ tono: 'info', texto: 'Con más de un factor, cada fila mide el aporte de ese factor <strong>una vez descontado el otro</strong>. Cuando mezclas grupos con variables continuas se le llama ANCOVA, pero por debajo sigue siendo lo mismo.' });
  }

  return bloque('Qué dice esta comparación de grupos', resumen, items, {
    siguientes: [`reg ${dep} i.${factores[0]}, robust`],
  });
}

// ------------------------------------------------------------------ margins

export function interpretarMargins(ame, ctx = {}) {
  const fit = ctx.fit || {};
  const items = [];
  const esProb = ['logit', 'probit'].includes(fit.link);
  const resumen = esProb
    ? 'Estos <strong>sí</strong> son los números que se reportan en un trabajo: ya están en puntos de probabilidad, listos para explicar en palabras normales.'
    : 'Efectos marginales promedio: el cambio esperado en la dependiente por una unidad más de cada variable.';

  if (esProb) {
    items.push({ tono: 'ok', texto: 'Un efecto de 0,0334 se lee como <strong>3,34 puntos de probabilidad</strong>: de cada 100 personas parecidas, unas 3 más pasarían a ser "sí" por cada unidad extra de esa variable.' });
    items.push({ tono: 'ojo', texto: '"Puntos de probabilidad" no es lo mismo que "por ciento más". Si la probabilidad pasa de 40% a 43,3%, subió <strong>3,3 puntos</strong>, no 3,3%. Esa distinción la piden mucho en las defensas de tesis.' });
    items.push({ tono: 'info', texto: 'Se llama efecto marginal <strong>promedio</strong> porque se calcula para cada persona de la muestra y después se promedia. Es lo estándar. La otra opción, <code>atmeans</code>, lo calcula para una "persona promedio" que muchas veces no existe.' });
  }
  const nada = ame.names.filter((nm, i) => ame.p[i] >= 0.05);
  if (nada.length) {
    items.push({ tono: 'info', texto: `${nada.map((n) => `<code>${n}</code>`).join(', ')} no ${nada.length === 1 ? 'llega' : 'llegan'} al 5%: su intervalo de confianza incluye el cero, así que no puedes afirmar que ${nada.length === 1 ? 'tenga' : 'tengan'} efecto.` });
  }

  return bloque('Cómo se leen los efectos marginales', resumen, items, {
    siguientes: ['marginsplot'],
  });
}

// ------------------------------------------------------------------ pruebas

export function interpretarPrueba(tipo, r, ctx = {}) {
  const fit = ctx.fit || {};
  const items = [];
  let titulo = 'Qué significa esta prueba', resumen = '';

  if (tipo === 'vif') {
    titulo = 'Multicolinealidad (VIF)';
    const peor = r.filas.reduce((a, b) => (b.vif > a.vif ? b : a), r.filas[0]);
    if (peor.vif > 10) {
      resumen = `Hay un problema: <code>${peor.name}</code> tiene un VIF de ${n2(peor.vif)}, muy por encima de 10.`;
      items.push({ tono: 'mal', texto: 'Un VIF alto quiere decir que esa variable es <strong>casi una copia</strong> de otras del modelo, y el programa no logra separar el efecto de cada una. Los coeficientes salen inestables y con errores estándar enormes.' });
      items.push({ tono: 'info', texto: `Qué hacer: quitar una de las dos variables repetidas, o juntarlas en un índice. Ojo: un VIF alto en <code>exper</code> y <code>exper2</code> es <strong>normal y no se arregla</strong> — están relacionadas por construcción y deben ir juntas.` });
    } else if (peor.vif > 5) {
      resumen = `Aceptable, pero mira <code>${peor.name}</code> (VIF ${n2(peor.vif)}).`;
      items.push({ tono: 'ojo', texto: 'Entre 5 y 10 es zona de atención: todavía se puede trabajar, pero si esa variable es la protagonista de tu pregunta, sus resultados hay que leerlos con cuidado.' });
    } else {
      resumen = `Todo bien: el VIF más alto es ${n2(peor.vif)}, muy por debajo de 10.`;
      items.push({ tono: 'ok', texto: 'No hay multicolinealidad preocupante. Tus variables aportan información distinta cada una.' });
    }
    items.push({ tono: 'info', texto: 'La regla que casi todos usan: <strong>menos de 5 está bien, entre 5 y 10 hay que mirarlo, más de 10 es problema</strong>.' });
    // caso clásico: x y x2 juntas siempre dan VIF alto y NO es un error
    const cuadraticas = r.filas.filter((f) =>
      r.filas.some((g2) => g2 !== f && (f.name === g2.name + '2' || f.name === g2.name + '_2')));
    if (cuadraticas.length) {
      items.push({ tono: 'info', texto: `Verás VIF altos en ${cuadraticas.map((f) => `<code>${f.name}</code>`).join(', ')} y en la variable de la que salen. Eso es <strong>normal y no se arregla</strong>: una variable y su cuadrado están relacionadas por construcción, y tienen que ir juntas para que la curva tenga sentido. Este caso se ignora a propósito.` });
    }
  }

  if (tipo === 'hettest' || tipo === 'white') {
    titulo = 'Heterocedasticidad';
    const hay = r.p < 0.05;
    resumen = hay
      ? `Sí hay heterocedasticidad (valor p ${pTxt(r.p)}).`
      : `No hay evidencia de heterocedasticidad (valor p ${pTxt(r.p)}).`;
    items.push({ tono: 'info', texto: 'Heterocedasticidad quiere decir que el "temblor" del error <strong>no es parejo</strong>: por ejemplo, los ingresos altos varían mucho más que los bajos. Es muy común en encuestas.' });
    if (hay) {
      items.push({ tono: 'ojo', texto: 'Qué hacer: <strong>nada complicado</strong>. Vuelve a correr tu regresión agregando <code>, robust</code> al final. Los coeficientes no cambian ni un poco; solo se corrigen los errores estándar y con ellos los valores p. Es la solución estándar y no cuesta nada.' });
      items.push({ tono: 'info', texto: 'Importante: la heterocedasticidad <strong>no</strong> sesga tus coeficientes. Solo hace que los valores p estén mal calculados. Por eso se arregla con robust y ya.' });
    } else {
      items.push({ tono: 'ok', texto: 'Aun así, poner <code>robust</code> no hace daño: si no hacía falta, los resultados quedan casi iguales.' });
    }
  }

  if (tipo === 'ovtest') {
    titulo = 'Forma funcional (RESET de Ramsey)';
    const mal = r.p < 0.05;
    resumen = mal
      ? `El modelo tiene un problema de forma (valor p ${pTxt(r.p)}).`
      : `La forma del modelo parece correcta (valor p ${pTxt(r.p)}).`;
    items.push({ tono: 'info', texto: 'Esta prueba revisa si te falta algo: una variable importante, o una relación que en realidad es curva y la estás forzando a ser recta.' });
    if (mal) {
      items.push({ tono: 'ojo', texto: 'Tres cosas para probar, en este orden:<br>1. Meter el término al cuadrado de la variable principal (<code>gen educ2 = educ^2</code>).<br>2. Pasar la dependiente a logaritmo (<code>gen lningreso = ln(ingreso)</code>) — casi siempre arregla los modelos de ingreso.<br>3. Pensar qué variable importante te falta.' });
      items.push({ tono: 'info', texto: 'Ojo: esta prueba rechaza con facilidad en muestras grandes. Si el resto del modelo tiene sentido, tampoco entres en pánico: menciónalo y prueba la versión en logaritmos.' });
    } else {
      items.push({ tono: 'ok', texto: 'No hay señal de que falte una variable clave ni de que la relación sea curva. Puedes seguir.' });
    }
  }

  if (tipo === 'linktest') {
    titulo = 'Prueba de especificación (linktest)';
    resumen = r.ok
      ? `El modelo está bien especificado (<code>_hatsq</code> tiene valor p ${pTxt(r.p_hatsq)}).`
      : `Hay señal de mala especificación (<code>_hatsq</code> tiene valor p ${pTxt(r.p_hatsq)}).`;
    items.push({ tono: 'info', texto: 'Solo se mira <strong>una fila</strong>: <code>_hatsq</code>. Si <u>no</u> es significativa, el modelo está bien armado. Si lo es, algo falta o la forma está mal.' });
    items.push({ tono: 'info', texto: '<code>_hat</code> en cambio <strong>debería</strong> ser significativa: eso solo confirma que tu modelo predice algo.' });
  }

  if (tipo === 'roc') {
    titulo = 'Capacidad de discriminar (curva ROC)';
    const a = r.auc;
    let cal;
    if (a < 0.6) cal = { tono: 'mal', txt: 'malo: apenas distingue mejor que lanzar una moneda' };
    else if (a < 0.7) cal = { tono: 'ojo', txt: 'pobre' };
    else if (a < 0.8) cal = { tono: 'ok', txt: 'aceptable' };
    else if (a < 0.9) cal = { tono: 'ok', txt: 'bueno' };
    else cal = { tono: 'ojo', txt: 'excelente... tan alto que conviene revisar que no hayas metido una variable que ya contenga la respuesta' };
    resumen = `El área bajo la curva es <strong>${n2(a, 4)}</strong>, lo que se considera <strong>${cal.txt}</strong>.`;
    items.push({ tono: 'info', texto: 'El área (AUC) se lee así: si tomas al azar una persona que <u>sí</u> y otra que <u>no</u>, es la probabilidad de que el modelo le dé mayor puntaje a la que sí. Un 0,50 es puro azar; un 1,00 es perfecto.' });
    items.push({ tono: cal.tono, texto: 'La escala que se usa: menos de 0,60 malo · 0,60 a 0,70 pobre · 0,70 a 0,80 aceptable · 0,80 a 0,90 bueno · más de 0,90 excelente (y sospechoso).' });
  }

  if (tipo === 'clasificacion') {
    titulo = 'Sensibilidad y especificidad';
    resumen = `Con el corte en ${r.cut}, el modelo acierta el <strong>${n2(r.correct * 100, 1)}%</strong> de los casos.`;
    items.push({ tono: 'info', texto: `<strong>Sensibilidad ${n2(r.sensitivity * 100, 1)}%</strong>: de todos los que en realidad <u>sí</u>, el modelo detecta ese porcentaje. <strong>Especificidad ${n2(r.specificity * 100, 1)}%</strong>: de todos los que en realidad <u>no</u>, acierta ese porcentaje.` });
    items.push({ tono: 'ojo', texto: 'Las dos se pelean entre sí: si bajas el punto de corte atrapas más casos positivos pero te equivocas más con los negativos. No existe un corte "correcto" — depende de qué error te sale más caro.' });
    const tasa = (r.tp + r.fn) / r.N;
    const mayoria = Math.max(tasa, 1 - tasa);
    if (r.correct < mayoria + 0.02) {
      items.push({ tono: 'mal', texto: `Ojo con el "porcentaje de aciertos": si dijeras siempre la categoría más común acertarías el ${n2(mayoria * 100, 1)}%, casi lo mismo que tu modelo. Es la trampa clásica cuando una categoría es mucho más frecuente que la otra. Mira mejor el AUC con <code>lroc</code>.` });
    }
  }

  if (tipo === 'gof') {
    titulo = 'Bondad de ajuste (Hosmer-Lemeshow)';
    resumen = r.p < 0.05
      ? `El ajuste no es bueno (valor p ${pTxt(r.p)}).`
      : `El ajuste es aceptable (valor p ${pTxt(r.p)}).`;
    items.push({ tono: 'ojo', texto: 'Esta prueba va <strong>al revés</strong> que las demás: aquí un valor p <u>alto</u> es buena noticia. Significa que lo que el modelo predice se parece a lo que realmente pasó.' });
    if (r.p < 0.05) items.push({ tono: 'info', texto: 'Con muestras grandes esta prueba rechaza con mucha facilidad. Míralo junto con el AUC antes de concluir que el modelo está mal.' });
  }

  if (tipo === 'test' || tipo === 'testparm') {
    titulo = 'Prueba de hipótesis conjunta';
    const p = r.p;
    resumen = p < 0.05
      ? `Se rechaza la hipótesis (valor p ${pTxt(p)}).`
      : `No se rechaza la hipótesis (valor p ${pTxt(p)}).`;
    if (tipo === 'testparm') {
      items.push({ tono: 'info', texto: `Esto prueba <strong>todas las categorías de ${r.grupo} a la vez</strong>. Sirve para contestar "¿el grupo importa, sí o no?" en una sola respuesta, en vez de mirar categoría por categoría.` });
      items.push({ tono: p < 0.05 ? 'ok' : 'ojo', texto: p < 0.05
        ? `Como se rechaza, <strong>${r.grupo} sí aporta</strong> al modelo en conjunto, aunque alguna categoría suelta no sea significativa por su cuenta.`
        : `Como no se rechaza, en conjunto <strong>${r.grupo} no aporta</strong>, aunque alguna categoría suelta parezca significativa.` });
    } else {
      items.push({ tono: 'info', texto: `La hipótesis que probaste fue: <code>${r.hipotesis}</code>. Un valor p menor a 0,05 quiere decir que los datos <strong>contradicen</strong> esa afirmación.` });
      items.push({ tono: 'info', texto: 'Uso típico: en una Cobb-Douglas, <code>test lnhoras + lnk = 1</code> pregunta si los rendimientos son constantes a escala (si duplicar todo duplica la producción). Si se rechaza y la suma es menor a 1, hay <strong>rendimientos decrecientes</strong>.' });
    }
  }

  if (tipo === 'normalidad') {
    titulo = `Normalidad (${r.prueba})`;
    const rechaza = r.p < 0.05;
    resumen = rechaza
      ? `Se rechaza la normalidad (valor p ${pTxt(r.p)}).`
      : `No se rechaza la normalidad (valor p ${pTxt(r.p)}).`;
    items.push({ tono: 'info', texto: 'Aquí la hipótesis nula es "los datos <strong>sí</strong> son normales". Un valor p bajo significa que <u>no</u> lo son.' });
    if (rechaza && r.N > 200) {
      items.push({ tono: 'ok', texto: `<strong>No te preocupes.</strong> Con ${r.N} observaciones, esta prueba rechaza casi siempre: detecta desviaciones minúsculas que no tienen ninguna importancia práctica. Lo que hace confiables a tus valores p en muestras grandes es <strong>tener muchas observaciones</strong>, no que los residuos sean perfectamente normales.` });
      items.push({ tono: 'info', texto: 'Qué hacer: reportarlo, mirar el gráfico <code>qnorm</code> para ver si la desviación es grave, y seguir. Si la variable es de dinero y está muy sesgada, pasar a logaritmos suele arreglarlo de paso.' });
    } else if (rechaza) {
      items.push({ tono: 'ojo', texto: `Con solo ${r.N} observaciones esto sí importa más: en muestras chicas los valores p dependen de que los residuos sean aproximadamente normales. Mira <code>qnorm</code> y considera trabajar en logaritmos.` });
    } else {
      items.push({ tono: 'ok', texto: 'Los residuos se comportan como una campana normal. Este supuesto está cubierto.' });
    }
    items.push({ tono: 'info', texto: 'De los cuatro supuestos, este es <strong>el menos grave</strong>. La heterocedasticidad y la forma funcional importan mucho más.' });
  }

  if (tipo === 'levene') {
    titulo = 'Igualdad de varianzas (Levene)';
    const rechaza = r.media.p < 0.05;
    resumen = rechaza
      ? `Las varianzas <strong>no</strong> son iguales entre grupos (valor p ${pTxt(r.media.p)}).`
      : `No hay evidencia de que las varianzas difieran entre grupos (valor p ${pTxt(r.media.p)}).`;
    items.push({ tono: 'info', texto: `Esta prueba no compara promedios sino <strong>dispersiones</strong>: pregunta si <code>${r.variable}</code> varía igual de mucho dentro de cada grupo de <code>${r.grupo}</code>.` });
    items.push({ tono: 'info', texto: 'Importa porque el ANOVA clásico supone que las varianzas son iguales. Si no lo son, su valor p puede estar mal calculado.' });
    if (rechaza) {
      items.push({ tono: 'ojo', texto: 'Qué hacer: en vez del ANOVA clásico, corre la regresión equivalente con <code>robust</code> (<code>reg y i.grupo, robust</code>). Eso corrige el problema sin complicarte.' });
      items.push({ tono: 'info', texto: `Mira también la línea <strong>W50</strong> (Brown-Forsythe, valor p ${pTxt(r.mediana.p)}): usa la mediana en vez de la media, así que aguanta mejor los valores atípicos. Si las dos coinciden, la conclusión es firme.` });
    } else {
      items.push({ tono: 'ok', texto: 'El supuesto del ANOVA se cumple, puedes usar sus resultados con tranquilidad.' });
    }
  }

  if (tipo === 'nlcom') {
    titulo = 'Combinación no lineal de coeficientes';
    resumen = `El resultado es <strong>${n2(r.est, 4)}</strong> (error estándar ${n2(r.se, 4)}, valor p ${pTxt(r.p)}).`;
    items.push({ tono: 'info', texto: `Calculaste <code>${r.expresion}</code> a partir de los coeficientes del modelo. Como es una fórmula no lineal, su error estándar se obtiene por el <strong>método delta</strong>: no basta con combinar los errores estándar a mano.` });
    if (/exp\s*\(/.test(r.expresion) && /-\s*1\s*\)\s*\*\s*100/.test(r.expresion)) {
      items.push({ tono: 'ok', texto: 'Esta es la <strong>corrección de Halvorsen-Palmquist</strong>: el efecto exacto en porcentaje de una variable 0/1 dentro de un modelo en logaritmos. Es lo correcto cuando el coeficiente pasa de 0,10 en valor absoluto, en vez de multiplicar por 100.' });
    }
    if (/\/\s*\(?\s*2\s*\*/.test(r.expresion)) {
      items.push({ tono: 'ok', texto: 'Este es el <strong>punto de giro</strong> de un término cuadrático: hasta ahí el efecto va en una dirección, y a partir de ahí cambia. Es el número que se reporta cuando metes una variable y su cuadrado.' });
    }
    items.push({ tono: r.p < 0.05 ? 'ok' : 'ojo', texto: r.p < 0.05
      ? 'El intervalo de confianza no incluye el cero: el resultado es estadísticamente distinto de cero.'
      : 'Ojo: el intervalo de confianza incluye el cero, así que no puedes afirmar que este valor sea distinto de cero.' });
  }

  if (tipo === 'pwcompare') {
    titulo = 'Comparaciones por pares';
    const sig = r.pares.filter((x) => x.p < 0.05);
    resumen = sig.length
      ? `De ${r.nComparaciones} comparaciones, <strong>${sig.length}</strong> siguen siendo significativas después de corregir.`
      : `Ninguna de las ${r.nComparaciones} comparaciones resulta significativa después de corregir.`;
    items.push({ tono: 'info', texto: `El ANOVA te dice que <u>hay</u> diferencia; esto te dice <u>entre cuáles</u>. Se comparan todos los grupos contra todos: ${r.nComparaciones} comparaciones en total.` });
    items.push({ tono: 'ojo', texto: `<strong>Por qué se corrige:</strong> al hacer ${r.nComparaciones} pruebas a la vez, la probabilidad de que alguna dé significativa por pura casualidad ya no es 5%, es mucho mayor. Bonferroni lo arregla multiplicando cada valor p por ${r.nComparaciones}.` });
    if (sig.length) {
      items.push({ tono: 'ok', texto: `Las diferencias que aguantan la corrección: ${sig.slice(0, 6).map((x) => `<strong>${x.b} vs ${x.a}</strong>`).join(', ')}${sig.length > 6 ? '…' : ''}. Esas son las que puedes afirmar con confianza.` });
    } else {
      items.push({ tono: 'info', texto: 'Que ninguna aguante la corrección no significa que no haya diferencias: significa que con esta muestra no se pueden distinguir con seguridad una vez que se toma en cuenta que hiciste muchas pruebas.' });
    }
  }

  if (tipo === 'iia') {
    titulo = 'Supuesto IIA (Hausman-McFadden)';
    resumen = r.rechaza
      ? 'Se rechaza el supuesto IIA en alguna categoría.'
      : 'No se rechaza el supuesto IIA: el modelo multinomial es adecuado.';
    items.push({ tono: 'info', texto: '<strong>Qué es IIA:</strong> que agregar o quitar una opción no cambie cómo se comparan las demás. El ejemplo clásico: si comparas "bus" y "carro" y agregas "bus azul", el modelo supone que eso no afecta la comparación bus-carro. Pero claro que la afecta, porque bus y bus azul son casi lo mismo.' });
    items.push({ tono: 'info', texto: 'Cómo funciona la prueba: se vuelve a estimar el modelo <strong>quitando una categoría</strong> y se compara si los demás coeficientes cambiaron. Si IIA se cumple, no deberían cambiar de forma sistemática.' });
    items.push({ tono: r.rechaza ? 'ojo' : 'ok', texto: r.rechaza
      ? 'Como se rechaza, tus categorías podrían ser sustitutas cercanas entre sí. Opciones: juntar las que se parecen, o usar <code>nlogit</code> / <code>asmprobit</code>, que no exigen IIA.'
      : 'Los valores p son altos: los coeficientes no cambian al quitar categorías. Puedes usar el mlogit y <strong>menciónalo en tu trabajo</strong>: probar IIA y reportarlo es de las cosas que más suman.' });
    if (r.algunNeg) {
      items.push({ tono: 'info', texto: 'Alguna fila salió con chi-cuadrado negativo. Eso pasa en muestras finitas y <strong>no es un error tuyo</strong>: por convención se interpreta como evidencia a favor de IIA.' });
    }
  }

  return bloque(titulo, resumen, items);
}

// ------------------------------------------------------------------ descriptivas

export function interpretarDescriptivas(filas, ctx = {}) {
  const ds = ctx.ds;
  const items = [];
  for (const f of filas) {
    if (!f.n) continue;
    const faltan = ctx.nTotal ? ctx.nTotal - f.n : 0;
    if (faltan > 0) {
      items.push({ tono: 'ojo', texto: `<code>${f.nombre}</code> tiene <strong>${faltan} valores faltantes</strong> (${n2((faltan / ctx.nTotal) * 100, 1)}% de la base). Decide qué hacer con ellos <u>antes</u> de correr modelos, no después.` });
    }
    if (f.sd > 0 && Math.abs(f.media) > 0) {
      const cv = f.sd / Math.abs(f.media);
      if (cv > 1.2) {
        items.push({ tono: 'info', texto: `<code>${f.nombre}</code> está muy dispersa (su desviación es mayor que su promedio) y el máximo (${miles(f.max, 0)}) queda lejos del promedio (${miles(f.media, 0)}). Eso suele indicar <strong>cola larga a la derecha</strong> o valores atípicos. Mírala con <code>histogram ${f.nombre}</code> y considera usar <code>ln(${f.nombre})</code>.` });
      }
    }
    if (ds && ds.pareceCategorica(f.nombre) && !ds.esBinaria(f.nombre)) {
      items.push({ tono: 'ojo', texto: `<code>${f.nombre}</code> parece una variable de <strong>categorías</strong>: su promedio no significa nada (¿qué querría decir "tamaño de empresa promedio = 1,9"?). Para estas variables usa <code>tab ${f.nombre}</code>, no <code>summarize</code>.` });
    }
  }
  if (!items.length) items.push({ tono: 'ok', texto: 'Nada raro a la vista: sin faltantes y con dispersiones razonables.' });
  return bloque('Lo que hay que mirar en estas descriptivas',
    'Antes de cualquier modelo, siempre se miran los promedios, los mínimos y los máximos. Ahí aparecen los errores de digitación y los códigos de no respuesta.',
    items);
}

export function interpretarCorrelacion(pares, ctx = {}) {
  const items = [];
  const fuertes = pares.filter((p) => Math.abs(p.r) > 0.8);
  const nada = pares.filter((p) => Math.abs(p.r) < 0.1);
  if (fuertes.length) {
    items.push({ tono: 'ojo', texto: `Correlaciones muy altas: ${fuertes.map((f) => `<code>${f.a}</code>–<code>${f.b}</code> (${n2(f.r)})`).join(', ')}. Si metes las dos en el mismo modelo vas a tener multicolinealidad. Elige una, o júntalas.` });
  }
  items.push({ tono: 'info', texto: 'La correlación mide solo relaciones <strong>en línea recta</strong> y entre <strong>dos</strong> variables a la vez. Dos variables pueden estar muy relacionadas en forma de U y dar correlación cero.' });
  items.push({ tono: 'ojo', texto: 'Correlación <strong>no</strong> es causalidad, y una correlación alta entre X e Y puede desaparecer por completo cuando metes una tercera variable en una regresión. Por eso la correlación se usa para explorar, no para concluir.' });
  if (nada.length && nada.length === pares.length) {
    items.push({ tono: 'info', texto: 'Todas las correlaciones son bajas. Eso no arruina nada: en una regresión múltiple lo que importa es el efecto controlando por el resto.' });
  }
  return bloque('Cómo leer estas correlaciones', 'Sirven para explorar antes de modelar y para detectar variables repetidas.', items);
}

// ------------------------------------------------------------------ calificación

export function calificarModelo(fit, pruebas = {}) {
  let nota = 50;
  const gano = [], perdio = [], insignias = [];

  if (fit.p_F !== undefined && fit.p_F < 0.05) { nota += 12; gano.push('el modelo es significativo en conjunto'); }
  else if (fit.p_chi2 !== undefined && fit.p_chi2 < 0.05) { nota += 12; gano.push('el modelo es significativo en conjunto'); }
  else perdio.push('el modelo no es significativo en conjunto');

  const sig = fit.names.filter((nm, j) => nm !== '_cons' && fit.p[j] < 0.05).length;
  const tot = fit.names.filter((nm) => nm !== '_cons').length;
  if (tot && sig / tot >= 0.5) { nota += 10; gano.push(`${sig} de ${tot} variables son significativas`); }

  if (fit.vce === 'robust' || fit.vce === 'cluster') { nota += 10; gano.push('usaste errores robustos'); insignias.push('robusto'); }
  else perdio.push('falta correr con <code>robust</code>');

  if (fit.N >= 100) { nota += 8; gano.push(`muestra de ${fit.N} observaciones`); }
  else perdio.push('la muestra es chica');

  if (!fit.omitted || !fit.omitted.length) { nota += 5; gano.push('sin variables omitidas por colinealidad'); }
  else perdio.push('hay variables omitidas por colinealidad');

  if (pruebas.hettest) { nota += 5; insignias.push('supuestos'); gano.push('revisaste heterocedasticidad'); }
  else perdio.push('falta <code>estat hettest</code>');
  if (pruebas.vif) { nota += 5; gano.push('revisaste multicolinealidad'); }
  else perdio.push('falta <code>estat vif</code>');
  if (pruebas.margins && ['logit', 'probit'].includes(fit.link)) { nota += 10; insignias.push('margins'); gano.push('tradujiste a puntos de probabilidad'); }
  else if (['logit', 'probit'].includes(fit.link)) perdio.push('falta <code>margins, dydx(*)</code> — sin eso los coeficientes no se pueden interpretar');

  nota = Math.max(0, Math.min(100, nota));
  return { nota, gano, perdio, insignias };
}

export function frasesParaInforme(fit, ctx = {}) {
  const b = interpretarRegress(fit, ctx);
  return b.frases;
}

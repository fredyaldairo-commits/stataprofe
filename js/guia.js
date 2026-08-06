// Modo guiado: "no sé por dónde empezar".
// Mira TUS datos, clasifica la variable que quieres explicar, te dice qué modelo
// va y por qué, y arma un do-file a la medida de lo que elegiste.
// Todo esto es determinista: no necesita internet ni clave de ninguna API.

import { esNulo } from './core/util.js';

/**
 * Mira una variable de verdad (sus valores, no su nombre) y decide qué es.
 * Devuelve el modelo que le corresponde y la razón, en palabras.
 */
export function clasificarY(ds, nombre) {
  const meta = ds.meta(nombre);
  if (!meta) return null;
  const col = ds.col(nombre);
  const conDato = col.filter((v) => !esNulo(v) && v !== '');
  const n = conDato.length;
  const faltan = ds.n - n;

  if (meta.type === 'string') {
    const distintos = new Set(conDato).size;
    return {
      tipo: 'texto', n, faltan, distintos,
      puedeSerY: false,
      titulo: 'Es una variable de texto',
      porque: `<code>${nombre}</code> guarda letras, no números. Ninguna variable de texto entra en un modelo tal como viene.`,
      arreglo: distintos <= 20
        ? { texto: `Como tiene solo ${distintos} valores distintos, son <strong>categorías</strong>: conviértela con <code>encode</code>.`,
            comando: `encode ${nombre}, gen(${nombre.replace(/_txt$/, '')}_n)` }
        : { texto: 'Si en realidad son números escritos como texto, conviértela con <code>destring</code>.',
            comando: `destring ${nombre}, gen(${nombre}_num) ignore(".,$ ") force` },
    };
  }

  const niveles = [...new Set(conDato)].sort((a, b) => a - b);
  const k = niveles.length;
  const todosEnteros = conDato.every((v) => Number.isInteger(v));
  const todosNoNeg = conDato.every((v) => v >= 0);
  const tieneEtiquetas = !!meta.vallab;

  // sí/no
  if (k === 2) {
    const esCero1 = niveles[0] === 0 && niveles[1] === 1;
    return {
      tipo: 'binaria', n, faltan, niveles, puedeSerY: true,
      modelo: 'logit', numeroModelo: 10,
      titulo: 'Es un sí / no',
      porque: `<code>${nombre}</code> solo toma dos valores (${niveles.join(' y ')}). Eso es una variable de sí/no, así que el modelo correcto es <strong>logit</strong> (o probit).`,
      alternativas: [
        { nombre: 'MPL (regresión normal)', n: 9, cuando: 'como referencia rápida, es la más fácil de leer' },
        { nombre: 'Probit', n: 11, cuando: 'para comprobar que la conclusión no cambia' },
      ],
      ojo: 'El coeficiente crudo del logit <strong>no</strong> es una probabilidad: después hay que correr <code>margins, dydx(*)</code>.',
      arreglo: esCero1 ? null : {
        texto: `Para el logit la variable tiene que valer <strong>0 y 1</strong>, y la tuya vale ${niveles.join(' y ')}.`,
        comando: `gen ${nombre}01 = (${nombre} == ${niveles[1]})`,
      },
    };
  }

  // conteo: se revisa ANTES que las categorías, porque un conteo también es
  // entero y con pocos valores. Lo que lo distingue: empieza en 0, no tiene
  // etiquetas de valor, y los valores son consecutivos desde el 0.
  const arrancaEnCero = niveles[0] === 0;
  const consecutivos = niveles.every((v, i) => v === i);
  // el tope de 12 niveles evita confundir un conteo real (hijos: 0..6) con una
  // cantidad que también es entera pero se comporta como continua (educ: 0..22)
  if (todosEnteros && todosNoNeg && arrancaEnCero && !tieneEtiquetas && consecutivos
      && k >= 3 && k <= 12) {
    const media = conDato.reduce((a, b) => a + b, 0) / n;
    const varianza = conDato.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1);
    return {
      tipo: 'conteo', n, faltan, niveles, puedeSerY: true,
      modelo: 'poisson', numeroModelo: 17,
      titulo: 'Es un conteo',
      porque: `<code>${nombre}</code> toma valores enteros consecutivos desde 0 (de ${niveles[0]} a ${niveles[k - 1]}) y no tiene etiquetas de categoría. Eso es un conteo: cuenta cuántas cosas hay. El modelo es <strong>poisson</strong>.`,
      alternativas: [{ nombre: 'Regresión normal', n: 2, cuando: 'si el conteo toma valores grandes, a veces alcanza y es más fácil de explicar' }],
      ojo: varianza / media > 1.25
        ? `Ojo: la varianza (${varianza.toFixed(2)}) es ${(varianza / media).toFixed(1)} veces la media (${media.toFixed(2)}). Eso es <strong>sobredispersión</strong> y hace que los errores estándar salgan más chicos de lo que deberían. Menciónalo en el informe.`
        : `La media (${media.toFixed(2)}) y la varianza (${varianza.toFixed(2)}) se parecen, que es justo lo que Poisson necesita.`,
      arreglo: null,
    };
  }

  // categorías
  if (todosEnteros && k >= 3 && k <= 12) {
    const ordenada = pareceOrdenada(ds, nombre, niveles);
    return {
      tipo: ordenada ? 'ordenada' : 'nominal',
      n, faltan, niveles, puedeSerY: true,
      modelo: ordenada ? 'ologit' : 'mlogit',
      numeroModelo: ordenada ? 13 : 15,
      titulo: ordenada ? `Son ${k} categorías CON orden` : `Son ${k} categorías SIN orden`,
      porque: ordenada
        ? `<code>${nombre}</code> tiene ${k} categorías que van de menos a más (${etiquetasDe(ds, nombre, niveles).slice(0, 3).join(' → ')}…). Como hay una escalera, el modelo que la aprovecha es <strong>ologit</strong>.`
        : `<code>${nombre}</code> tiene ${k} categorías y ninguna es "más" que otra (${etiquetasDe(ds, nombre, niveles).slice(0, 3).join(', ')}…). Sin orden, el modelo es <strong>mlogit</strong>.`,
      alternativas: ordenada
        ? [{ nombre: 'Oprobit', n: 14, cuando: 'para confirmar que da lo mismo' },
           { nombre: 'Mlogit', n: 15, cuando: 'si decides ignorar el orden (pierdes información)' }]
        : [{ nombre: 'Mprobit', n: 16, cuando: 'para confirmar que da lo mismo' }],
      ojo: ordenada
        ? 'Las filas <code>/cut1</code>, <code>/cut2</code>… no se interpretan.'
        : 'Todo se lee <strong>"comparado con la categoría base"</strong>. Si te olvidas de esa parte, la frase dice algo que el modelo no dijo.',
      arreglo: tieneEtiquetas ? null : {
        texto: 'No tiene etiquetas puestas, así que las tablas van a salir con números pelados.',
        comando: `label define lbl_${nombre} ${niveles.map((v) => `${v} "…"`).join(' ')}\nlabel values ${nombre} lbl_${nombre}`,
      },
    };
  }

  // continua
  const min = Math.min(...conDato);
  const media = conDato.reduce((a, b) => a + b, 0) / n;
  const ordenados = conDato.slice().sort((a, b) => a - b);
  const mediana = ordenados[Math.floor(n / 2)];
  // la asimetría real es mejor señal que comparar media contra mediana:
  // detecta la cola larga aunque la diferencia entre ambas sea pequeña
  let m2 = 0, m3 = 0;
  for (const v of conDato) { const d = v - media; m2 += d * d; m3 += d * d * d; }
  m2 /= n; m3 /= n;
  const asimetria = m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
  const sesgada = min > 0 && asimetria > 0.7;
  return {
    tipo: 'continua', n, faltan, niveles: null, puedeSerY: true,
    modelo: sesgada ? 'log-nivel' : 'mco-multiple',
    numeroModelo: sesgada ? 6 : 2,
    titulo: 'Es un número continuo',
    porque: `<code>${nombre}</code> toma muchos valores distintos (${k}), así que es una cantidad. El modelo base es la <strong>regresión múltiple</strong>.`,
    alternativas: [
      { nombre: 'Regresión simple', n: 1, cuando: 'para entender la mecánica con una sola variable' },
      { nombre: 'Log-log (elasticidades)', n: 8, cuando: 'si quieres comparar sensibilidades en porcentaje' },
    ],
    ojo: sesgada
      ? `Su asimetría es ${asimetria.toFixed(2)} y su promedio (${media.toFixed(0)}) está por encima de su mediana (${mediana.toFixed(0)}): tiene <strong>cola larga a la derecha</strong>. En variables de dinero eso es lo normal, y conviene trabajar con el logaritmo.`
      : `Su asimetría es ${asimetria.toFixed(2)}, o sea bastante simétrica: puedes trabajarla tal como viene.`,
    arreglo: sesgada && min > 0 ? {
      texto: 'Por la cola larga, casi siempre conviene la versión en logaritmo: el resultado se lee en porcentaje y de paso se corrige buena parte de la heterocedasticidad.',
      comando: `gen ln${nombre} = ln(${nombre})\nlabel variable ln${nombre} "Log de ${nombre}"`,
    } : null,
  };
}

/** Parte un texto en líneas de comentario que quepan en 74 caracteres. */
function envolverComentario(texto, ancho = 74) {
  const out = [];
  let linea = '*';
  for (const p of String(texto).split(/\s+/)) {
    if (linea !== '*' && (linea + ' ' + p).length > ancho) { out.push(linea); linea = '*'; }
    linea += ' ' + p;
  }
  if (linea !== '*') out.push(linea);
  return out;
}

function etiquetasDe(ds, nombre, niveles) {
  return niveles.map((v) => ds.etiquetaDe(nombre, v) || String(v));
}

/** Heurística para decidir si unas categorías tienen orden. */
function pareceOrdenada(ds, nombre, niveles) {
  // 1) consecutivas desde 1 o desde 0
  const consecutivas = niveles.every((v, i) => v === niveles[0] + i);
  if (!consecutivas) return false;
  // 2) las etiquetas suenan a escala
  const et = etiquetasDe(ds, nombre, niveles).join(' ').toLowerCase();
  const escalas = ['muy', 'nada', 'poco', 'bajo', 'medio', 'alto', 'triste', 'feliz',
    'malo', 'bueno', 'peor', 'mejor', 'satisf', 'insatisf', 'primaria', 'secundaria',
    'superior', 'nunca', 'siempre', 'menor', 'mayor', 'pobre', 'rico',
    // escalas de tamaño: micro < pequeña < mediana < grande
    'micro', 'pequeñ', 'median', 'grande', 'chico', 'pequeno'];
  if (escalas.some((p) => et.includes(p))) return true;
  // 3) nombres típicos de escala
  const nm = nombre.toLowerCase();
  return ['satisf', 'nivel', 'grado', 'escala', 'acuerdo', 'frecuencia'].some((p) => nm.includes(p));
}

/** Sugiere explicativas razonables entre las variables de la base. */
export function sugerirX(ds, y) {
  const fuera = new Set([y, 'id', 'hogar', 'empresa', 'marca']);
  return ds.vars
    .filter((v) => !fuera.has(v.name))
    .filter((v) => v.type !== 'string')
    .map((v) => {
      const c = clasificarY(ds, v.name);
      return {
        nombre: v.name,
        etiqueta: v.label || '',
        tipo: c ? c.tipo : 'continua',
        // los factores con 3+ categorías hay que meterlos con i.
        comoSeEscribe: c && (c.tipo === 'nominal' || c.tipo === 'ordenada') ? `i.${v.name}` : v.name,
        aviso: c && (c.tipo === 'nominal' || c.tipo === 'ordenada')
          ? `tiene ${c.niveles.length} categorías: va con <code>i.</code>` : null,
      };
    });
}

const CMD_DE = {
  'mco-multiple': (y, x) => `reg ${y} ${x}, robust`,
  'log-nivel': (y, x) => `reg ln${y} ${x}, robust`,
  logit: (y, x) => `logit ${y} ${x}`,
  mlogit: (y, x) => `mlogit ${y} ${x}, base(1)`,
  ologit: (y, x) => `ologit ${y} ${x}`,
  poisson: (y, x) => `poisson ${y} ${x}`,
};

const POST_DE = {
  'mco-multiple': ['estat vif', 'estat hettest', 'estat ovtest', 'predict u, resid', 'swilk u'],
  'log-nivel': ['estat vif', 'estat hettest', 'estat ovtest'],
  logit: ['margins, dydx(*)', 'estat classification', 'lroc', 'estat gof, group(10)'],
  mlogit: ['margins, dydx(*) predict(outcome(1))', 'mlogtest, hausman'],
  ologit: [],
  poisson: [],
};

/**
 * Arma un do-file a la medida: la base que ella tiene abierta, la Y que eligió
 * y las X que marcó. Devuelve secciones con el mismo formato que dofiles.js.
 */
export function armarPlan(ds, y, xs, clas) {
  const modelo = clas.modelo;
  const usaLog = modelo === 'log-nivel';
  const xTexto = xs.map((x) => x.comoSeEscribe).join(' ');
  const listaPlana = xs.map((x) => x.nombre);
  const secciones = [];

  secciones.push({
    t: 'Abrir la base y ver qué falta',
    porque: 'Siempre se empieza igual. misstable te dice cuántos vacíos hay y dónde, antes de tocar nada.',
    codigo: `clear all
set more off

use ${ds.nombre}, clear
describe ${y} ${listaPlana.join(' ')}
misstable summarize`,
  });

  secciones.push({
    t: 'Definir la muestra UNA sola vez',
    porque: 'Si cada modelo bota filas distintas, los R² dejan de ser comparables. Y ojo: en Stata el faltante vale más que cualquier número, por eso se pone explícito.',
    codigo: `drop if missing(${[y, ...listaPlana].join(', ')})${usaLog ? `\ndrop if ${y} <= 0   // el logaritmo solo existe para valores positivos` : ''}

count`,
  });

  // transformaciones
  const trans = [];
  if (usaLog) {
    trans.push(`capture drop ln${y}`);
    trans.push(`gen ln${y} = ln(${y})`);
    trans.push(`label variable ln${y} "Log de ${y}"`);
    trans.push('');
  }
  // si el modelo ya es en logaritmos, el "arreglo" sugerido es justo lo que
  // acabamos de escribir arriba: no hay que repetirlo o el gen falla
  if (!usaLog && clas.arreglo && clas.arreglo.comando) {
    for (const l of envolverComentario(clas.arreglo.texto.replace(/<[^>]+>/g, ''))) trans.push(l);
    trans.push(clas.arreglo.comando);
    trans.push('');
  }
  trans.push(`label variable ${y} "${(ds.meta(y).label || y).replace(/"/g, '')}"`);
  for (const x of xs) {
    trans.push(`label variable ${x.nombre} "${(x.etiqueta || x.nombre).replace(/"/g, '')}"`);
  }
  const factores = xs.filter((x) => x.tipo === 'nominal' || x.tipo === 'ordenada');
  if (factores.length) {
    trans.push('');
    trans.push('* estas van con i. porque son grupos, no cantidades:');
    for (const f of factores) trans.push(`*   i.${f.nombre}`);
  }
  secciones.push({
    t: 'Las variables de este modelo',
    porque: usaLog
      ? `Como ${y} tiene cola larga, se trabaja con su logaritmo: el coeficiente pasa a leerse en porcentaje. Además se etiqueta todo para que las salidas se lean solas.`
      : 'Aquí se crea lo que haga falta y se etiqueta todo, para que las tablas se entiendan sin explicaciones.',
    codigo: trans.join('\n'),
  });

  secciones.push({
    t: 'Mirar los datos antes de modelar',
    porque: 'Aquí aparecen los errores de digitación y los códigos de no respuesta que se te pasaron.',
    codigo: `summarize ${usaLog ? `${y} ln${y}` : y} ${xs.filter((x) => x.tipo === 'continua').map((x) => x.nombre).join(' ')}
${factores.map((f) => `tab ${f.nombre}`).join('\n')}
histogram ${usaLog ? `ln${y}` : y}, normal`.replace(/\n\n+/g, '\n'),
  });

  secciones.push({
    t: 'El modelo',
    porque: clas.porque.replace(/<[^>]+>/g, ''),
    codigo: (CMD_DE[modelo] || CMD_DE['mco-multiple'])(y, xTexto),
  });

  const post = POST_DE[modelo] || [];
  if (post.length) {
    secciones.push({
      t: modelo === 'logit' ? 'Lo que va DESPUÉS del logit' : 'Revisar los supuestos',
      porque: modelo === 'logit'
        ? 'El coeficiente crudo del logit no se interpreta. margins lo traduce a puntos de probabilidad: ese es el número que se reporta.'
        : 'Stata siempre te da una tabla bonita, esté bien o mal usado el modelo. Por eso se revisa.',
      codigo: post.join('\n'),
    });
  }
  if (factores.length) {
    secciones.push({
      t: 'Probar los grupos en conjunto',
      porque: 'Puede que unas categorías salgan significativas y otras no. Esto da una sola respuesta para todo el grupo.',
      codigo: factores.map((f) => `testparm i.${f.nombre}`).join('\n'),
    });
  }

  return {
    n: 0, id: 'guiado', nombre: `Tu modelo: ${y}`,
    familia: 'Hecho a tu medida', base: ds.nombre,
    y: usaLog ? `ln${y}` : y, x: xTexto,
    resumen: `${clas.titulo}. ${clas.porque.replace(/<[^>]+>/g, '')}`,
    secciones,
  };
}

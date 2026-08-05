// Analiza una línea de Stata: prefijos, comando, lista de variables, if / in / using,
// pesos y opciones. Además detecta los errores típicos de quien está aprendiendo y
// devuelve una sugerencia concreta de cómo debería escribirse.

import { ErrorStata } from './dataset.js';
import { masParecido, parecidos } from './util.js';

// n = nombre canónico, min = abreviatura mínima que Stata acepta
export const COMANDOS = [
  // --- datos ---
  { n: 'use', min: 3, cat: 'datos', ayuda: 'abre una base de datos' },
  { n: 'sysuse', min: 6, cat: 'datos', ayuda: 'abre una base de ejemplo' },
  { n: 'webuse', min: 6, cat: 'datos', ayuda: 'abre una base de ejemplo' },
  { n: 'clear', min: 3, cat: 'datos', ayuda: 'borra los datos de la memoria' },
  { n: 'save', min: 4, cat: 'datos', ayuda: 'guarda la base' },
  { n: 'describe', min: 1, cat: 'datos', ayuda: 'lista las variables y sus etiquetas' },
  { n: 'codebook', min: 4, cat: 'datos', ayuda: 'ficha detallada de cada variable' },
  { n: 'list', min: 1, cat: 'datos', ayuda: 'muestra observaciones' },
  { n: 'browse', min: 3, cat: 'datos', ayuda: 'abre la vista de tabla' },
  { n: 'edit', min: 2, cat: 'datos', ayuda: 'abre la vista de tabla' },
  { n: 'count', min: 4, cat: 'datos', ayuda: 'cuenta observaciones' },
  { n: 'generate', min: 1, cat: 'datos', ayuda: 'crea una variable nueva' },
  { n: 'egen', min: 4, cat: 'datos', ayuda: 'crea una variable con funciones de grupo' },
  { n: 'replace', min: 7, cat: 'datos', ayuda: 'cambia valores de una variable existente' },
  { n: 'drop', min: 4, cat: 'datos', ayuda: 'borra variables u observaciones' },
  { n: 'keep', min: 4, cat: 'datos', ayuda: 'conserva variables u observaciones' },
  { n: 'rename', min: 3, cat: 'datos', ayuda: 'cambia el nombre de una variable' },
  { n: 'order', min: 5, cat: 'datos', ayuda: 'cambia el orden de las columnas' },
  { n: 'sort', min: 4, cat: 'datos', ayuda: 'ordena las observaciones' },
  { n: 'gsort', min: 5, cat: 'datos', ayuda: 'ordena ascendente o descendente' },
  { n: 'recode', min: 6, cat: 'datos', ayuda: 'cambia códigos por otros' },
  { n: 'label', min: 3, cat: 'datos', ayuda: 'pone etiquetas' },
  { n: 'notes', min: 4, cat: 'datos', ayuda: 'notas de la base' },
  { n: 'encode', min: 6, cat: 'datos', ayuda: 'texto -> número con etiquetas' },
  { n: 'decode', min: 6, cat: 'datos', ayuda: 'número con etiquetas -> texto' },
  { n: 'destring', min: 8, cat: 'datos', ayuda: 'texto numérico -> número' },
  { n: 'tostring', min: 8, cat: 'datos', ayuda: 'número -> texto' },
  { n: 'duplicates', min: 10, cat: 'datos', ayuda: 'busca y borra filas repetidas' },
  { n: 'misstable', min: 5, cat: 'datos', ayuda: 'resume los valores faltantes' },
  { n: 'mvdecode', min: 8, cat: 'datos', ayuda: 'convierte códigos (99, 999) en faltante' },
  { n: 'mvencode', min: 8, cat: 'datos', ayuda: 'convierte faltantes en un código' },
  { n: 'assert', min: 6, cat: 'datos', ayuda: 'comprueba que algo se cumple' },
  { n: 'compress', min: 8, cat: 'datos', ayuda: 'optimiza el tamaño' },
  { n: 'preserve', min: 8, cat: 'datos', ayuda: 'guarda una copia temporal' },
  { n: 'restore', min: 7, cat: 'datos', ayuda: 'vuelve a la copia temporal' },
  { n: 'append', min: 6, cat: 'datos', ayuda: 'pega observaciones de otra base' },
  { n: 'merge', min: 5, cat: 'datos', ayuda: 'une bases por una llave' },
  { n: 'import', min: 6, cat: 'datos', ayuda: 'importa csv/excel' },
  { n: 'export', min: 6, cat: 'datos', ayuda: 'exporta a csv' },
  { n: 'input', min: 5, cat: 'datos', ayuda: 'escribe datos a mano' },
  { n: 'set', min: 3, cat: 'sistema', ayuda: 'configura el programa' },
  { n: 'display', min: 2, cat: 'sistema', ayuda: 'muestra un resultado en pantalla' },
  { n: 'help', min: 4, cat: 'sistema', ayuda: 'ayuda de un comando' },
  { n: 'ayuda', min: 5, cat: 'sistema', ayuda: 'ayuda en español' },
  { n: 'log', min: 3, cat: 'sistema', ayuda: 'guarda el registro de la sesión' },
  { n: 'doedit', min: 6, cat: 'sistema', ayuda: 'abre el editor de do-file' },
  { n: 'exit', min: 4, cat: 'sistema', ayuda: 'termina' },
  { n: 'capture', min: 3, cat: 'sistema', ayuda: 'ignora el error de un comando' },
  { n: 'quietly', min: 3, cat: 'sistema', ayuda: 'corre sin mostrar salida' },
  { n: 'noisily', min: 3, cat: 'sistema', ayuda: 'muestra la salida' },
  { n: 'by', min: 2, cat: 'sistema', ayuda: 'repite por grupos' },
  { n: 'bysort', min: 6, cat: 'sistema', ayuda: 'ordena y repite por grupos' },

  // --- descriptiva ---
  { n: 'summarize', min: 2, cat: 'desc', ayuda: 'promedio, desviación, mínimo y máximo' },
  { n: 'tabulate', min: 3, cat: 'desc', ayuda: 'tabla de frecuencias' },
  { n: 'tab1', min: 4, cat: 'desc', ayuda: 'varias tablas de una vía' },
  { n: 'tab2', min: 4, cat: 'desc', ayuda: 'todas las tablas cruzadas' },
  { n: 'tabstat', min: 7, cat: 'desc', ayuda: 'tabla de estadísticos a la medida' },
  { n: 'table', min: 5, cat: 'desc', ayuda: 'tabla cruzada con estadísticos' },
  { n: 'correlate', min: 3, cat: 'desc', ayuda: 'matriz de correlaciones' },
  { n: 'pwcorr', min: 6, cat: 'desc', ayuda: 'correlaciones con significancia' },
  { n: 'ttest', min: 5, cat: 'desc', ayuda: 'prueba t de medias' },
  { n: 'prtest', min: 6, cat: 'desc', ayuda: 'prueba de proporciones' },
  { n: 'sdtest', min: 6, cat: 'desc', ayuda: 'prueba de varianzas' },
  { n: 'oneway', min: 6, cat: 'desc', ayuda: 'ANOVA de una vía' },
  { n: 'ranksum', min: 7, cat: 'desc', ayuda: 'prueba de Mann-Whitney' },
  { n: 'inspect', min: 3, cat: 'desc', ayuda: 'inspección rápida de una variable' },
  { n: 'swilk', min: 5, cat: 'desc', ayuda: 'prueba de normalidad de Shapiro-Wilk' },
  { n: 'sktest', min: 6, cat: 'desc', ayuda: 'normalidad por asimetría y curtosis' },
  { n: 'robvar', min: 6, cat: 'desc', ayuda: 'prueba de Levene de igualdad de varianzas' },

  // --- gráficos ---
  { n: 'histogram', min: 4, cat: 'graf', ayuda: 'histograma' },
  { n: 'scatter', min: 2, cat: 'graf', ayuda: 'nube de puntos' },
  { n: 'twoway', min: 2, cat: 'graf', ayuda: 'gráficos combinados' },
  { n: 'graph', min: 2, cat: 'graf', ayuda: 'gráficos (box, bar)' },
  { n: 'kdensity', min: 4, cat: 'graf', ayuda: 'densidad suavizada' },
  { n: 'rvfplot', min: 3, cat: 'graf', ayuda: 'residuos contra ajustados' },
  { n: 'qnorm', min: 5, cat: 'graf', ayuda: 'gráfico de normalidad' },
  { n: 'pnorm', min: 5, cat: 'graf', ayuda: 'gráfico de normalidad' },
  { n: 'lroc', min: 4, cat: 'graf', ayuda: 'curva ROC' },
  { n: 'lsens', min: 5, cat: 'graf', ayuda: 'sensibilidad y especificidad' },
  { n: 'marginsplot', min: 11, cat: 'graf', ayuda: 'gráfico de efectos marginales' },
  { n: 'avplot', min: 6, cat: 'graf', ayuda: 'gráfico de variable añadida' },

  // --- modelos ---
  { n: 'regress', min: 3, cat: 'modelo', ayuda: 'regresión por mínimos cuadrados' },
  { n: 'anova', min: 5, cat: 'modelo', ayuda: 'análisis de varianza' },
  { n: 'logit', min: 5, cat: 'modelo', ayuda: 'modelo logit para sí/no' },
  { n: 'logistic', min: 6, cat: 'modelo', ayuda: 'logit mostrando razón de momios' },
  { n: 'probit', min: 6, cat: 'modelo', ayuda: 'modelo probit para sí/no' },
  { n: 'mlogit', min: 6, cat: 'modelo', ayuda: 'logit multinomial' },
  { n: 'mprobit', min: 7, cat: 'modelo', ayuda: 'probit multinomial' },
  { n: 'ologit', min: 6, cat: 'modelo', ayuda: 'logit ordenado' },
  { n: 'oprobit', min: 7, cat: 'modelo', ayuda: 'probit ordenado' },
  { n: 'poisson', min: 7, cat: 'modelo', ayuda: 'modelo de conteos' },

  // --- postestimación ---
  { n: 'predict', min: 7, cat: 'post', ayuda: 'guarda predicciones y residuos' },
  { n: 'margins', min: 7, cat: 'post', ayuda: 'efectos marginales' },
  { n: 'estat', min: 5, cat: 'post', ayuda: 'pruebas después del modelo' },
  { n: 'test', min: 4, cat: 'post', ayuda: 'prueba una hipótesis' },
  { n: 'testparm', min: 8, cat: 'post', ayuda: 'prueba conjunta de un grupo' },
  { n: 'lincom', min: 6, cat: 'post', ayuda: 'combinación lineal de coeficientes' },
  { n: 'nlcom', min: 5, cat: 'post', ayuda: 'combinación no lineal (método delta)' },
  { n: 'pwcompare', min: 6, cat: 'post', ayuda: 'comparaciones por pares entre grupos' },
  { n: 'mlogtest', min: 8, cat: 'post', ayuda: 'pruebas del supuesto IIA en mlogit' },
  { n: 'linktest', min: 8, cat: 'post', ayuda: 'prueba de forma funcional' },
  { n: 'estimates', min: 3, cat: 'post', ayuda: 'guarda y compara modelos' },
  { n: 'esttab', min: 6, cat: 'post', ayuda: 'tabla de varios modelos' },
  { n: 'vif', min: 3, cat: 'post', ayuda: 'atajo de estat vif' },
];

const NOMBRES = COMANDOS.map((c) => c.n);

// Opciones frecuentes: sirve para detectar la coma olvidada
export const OPCIONES_CONOCIDAS = new Set([
  'robust', 'detail', 'nolabel', 'clear', 'replace', 'noconstant', 'or', 'beta',
  'level', 'vce', 'cluster', 'base', 'baseoutcome', 'row', 'col', 'chi2', 'missing',
  'sig', 'star', 'dydx', 'atmeans', 'at', 'by', 'gen', 'generate', 'force', 'ignore',
  'percent', 'freq', 'normal', 'bin', 'width', 'over', 'stats', 'columns', 'nofreq',
  'nototals', 'all', 'noomitted', 'ml', 'exact', 'lr', 'group', 'rhs', 'iid', 'white',
  'label', 'string', 'float', 'long', 'double', 'byte', 'int', 'mv', 'unequal', 'welch',
  'sort', 'noheader', 'obs', 'quietly', 'fweight', 'aweight', 'pweight', 'yline', 'title',
  'legend', 'name', 'xtitle', 'ytitle', 'nodraw', 'coeflegend', 'post', 'noisily',
]);

// Palabras que solo pueden ser opciones: si aparecen sueltas antes de la coma,
// es casi seguro que se olvidó la coma. Se dejan fuera a propósito las que también
// pueden ser subcomandos o nombres normales (all, sort, label, group, by, obs...).
const SOLO_SON_OPCIONES = new Set([
  'robust', 'detail', 'nolabel', 'noconstant', 'beta', 'atmeans', 'nofreq',
  'nototals', 'noomitted', 'coeflegend', 'unequal', 'welch', 'percent',
  'noheader', 'nodraw', 'chi2', 'lr',
]);

/** Quita comentarios de una línea. */
export function quitarComentarios(linea) {
  let s = linea;
  // /* ... */
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // // comentario  (solo si va precedido de espacio o al inicio)
  let fuera = true, res = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') fuera = !fuera;
    if (fuera && s[i] === '/' && s[i + 1] === '/') break;
    res += s[i];
  }
  s = res;
  // * al comienzo = línea de comentario completa
  if (/^\s*\*/.test(s)) return '';
  return s.trim();
}

/** Corta por comas que estén fuera de paréntesis y comillas. */
function cortarPorComa(s) {
  let nivel = 0, dentro = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') dentro = !dentro;
    if (dentro) continue;
    if (c === '(') nivel++;
    else if (c === ')') nivel--;
    else if (c === ',' && nivel === 0) return [s.slice(0, i), s.slice(i + 1)];
  }
  return [s, ''];
}

/**
 * Busca una palabra clave suelta (if, in, using) fuera de paréntesis y comillas.
 * Recorre la cadena una sola vez marcando dónde empieza cada palabra, para que
 * "vif" nunca cuente como un "if" y "within" nunca como un "in".
 */
function buscarPalabra(s, palabra) {
  let nivel = 0, dentro = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { dentro = !dentro; continue; }
    if (dentro) continue;
    if (c === '(') { nivel++; continue; }
    if (c === ')') { nivel--; continue; }
    if (nivel !== 0) continue;
    // ¿empieza aquí una palabra completa?
    const antes = i === 0 ? '' : s[i - 1];
    if (antes && /[A-Za-z0-9_.]/.test(antes)) continue;
    if (s.slice(i, i + palabra.length) !== palabra) continue;
    const despues = s[i + palabra.length];
    if (despues !== undefined && /[A-Za-z0-9_.]/.test(despues)) continue;
    return i;
  }
  return -1;
}

/** Parsea las opciones: "robust vce(cluster id) level(90)" */
export function parsearOpciones(s) {
  const out = {};
  const orden = [];
  let i = 0;
  s = s.trim();
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    let nombre = '';
    while (i < s.length && /[A-Za-z0-9_]/.test(s[i])) { nombre += s[i]; i++; }
    if (!nombre) {
      i++;
      continue;
    }
    let valor = true;
    if (s[i] === '(') {
      let nivel = 1, j = i + 1, buf = '';
      while (j < s.length && nivel > 0) {
        if (s[j] === '(') nivel++;
        else if (s[j] === ')') { nivel--; if (!nivel) break; }
        buf += s[j]; j++;
      }
      if (nivel > 0) {
        throw new ErrorStata(`falta cerrar el paréntesis en la opción ${nombre}()`, 198,
          `Debería quedar así: <code>${nombre}(...)</code>.`);
      }
      valor = buf;
      i = j + 1;
    }
    out[nombre.toLowerCase()] = valor;
    orden.push(nombre.toLowerCase());
  }
  out.__orden = orden;
  return out;
}

/** Resuelve una abreviatura a su comando canónico. */
export function resolverComando(palabra) {
  if (!palabra) return null;
  const p = palabra.toLowerCase();
  // coincidencia exacta primero
  const exacto = COMANDOS.find((c) => c.n === p);
  if (exacto) return exacto;
  // atajos que Stata acepta explícitamente
  const atajos = { g: 'generate', gen: 'generate', d: 'describe', des: 'describe', l: 'list',
    su: 'summarize', sum: 'summarize', ta: 'tabulate', tab: 'tabulate', di: 'display',
    dis: 'display', reg: 'regress', ren: 'rename', bys: 'bysort', qui: 'quietly',
    cap: 'capture', noi: 'noisily', corr: 'correlate', sc: 'scatter', hist: 'histogram',
    tw: 'twoway', gr: 'graph', repl: 'replace', mi: 'misstable' };
  if (atajos[p]) return COMANDOS.find((c) => c.n === atajos[p]);
  const cands = COMANDOS.filter((c) => c.n.startsWith(p) && p.length >= c.min);
  if (cands.length === 1) return cands[0];
  if (cands.length > 1) {
    // el de abreviatura mínima más corta gana (como hace Stata)
    cands.sort((a, b) => a.min - b.min);
    return cands[0];
  }
  return null;
}

/**
 * Analiza una línea completa.
 * Devuelve { prefijos, cmd, cmdEscrito, resto, varlist, exp, ifExp, inRango, using, peso, opciones, aviso }
 */
export function parsear(lineaCruda, ds) {
  const linea = quitarComentarios(lineaCruda);
  if (!linea) return null;

  const prefijos = { by: null, bysort: false, quietly: false, capture: false, noisily: false };
  let s = linea;

  // prefijos encadenados
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const m = s.match(/^\s*(quietly|qui|noisily|noi|capture|cap)\s+/i);
    if (m) {
      const p = m[1].toLowerCase();
      if (p.startsWith('qui')) prefijos.quietly = true;
      else if (p.startsWith('noi')) prefijos.noisily = true;
      else prefijos.capture = true;
      s = s.slice(m[0].length);
      continue;
    }
    const mb = s.match(/^\s*(bysort|bys|by)\s+([^:]+):\s*/i);
    if (mb) {
      prefijos.by = mb[2].trim().replace(/\s*,\s*sort\s*$/i, '').split(/\s+/);
      prefijos.bysort = mb[1].toLowerCase() !== 'by';
      s = s.slice(mb[0].length);
      continue;
    }
    break;
  }

  s = s.trim();
  if (!s) return null;

  const mCmd = s.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
  if (!mCmd) {
    throw new ErrorStata(`no reconozco "${s.split(/\s+/)[0]}" como un comando`, 199,
      'Una línea de Stata siempre empieza con el nombre de un comando. Escribe <code>ayuda</code> para ver la lista de los que entiende este simulador.');
  }
  const escrito = mCmd[1];
  const info = resolverComando(escrito);
  if (!info) {
    const sug = masParecido(escrito, NOMBRES);
    const otros = parecidos(escrito, NOMBRES, 3);
    let ayuda;
    if (sug) {
      const c = COMANDOS.find((x) => x.n === sug);
      ayuda = `¿Quisiste escribir <code>${sug}</code>? (${c.ayuda})`;
    } else if (otros.length) {
      ayuda = `Comandos parecidos: ${otros.map((o) => `<code>${o}</code>`).join(', ')}.`;
    } else {
      ayuda = 'Escribe <code>ayuda</code> para ver todos los comandos que entiende este simulador.';
    }
    throw new ErrorStata(`comando ${escrito} desconocido`, 199, ayuda);
  }

  let resto = s.slice(escrito.length).trim();

  // opciones
  const [antes, opcionesTxt] = cortarPorComa(resto);
  let opciones = {};
  try {
    opciones = parsearOpciones(opcionesTxt);
  } catch (e) {
    throw e;
  }

  let cuerpo = antes.trim();
  let using = null, ifExp = null, inRango = null, peso = null;

  // using
  const pUsing = buscarPalabra(cuerpo, 'using');
  if (pUsing >= 0) {
    using = cuerpo.slice(pUsing + 5).trim().replace(/^"|"$/g, '');
    cuerpo = cuerpo.slice(0, pUsing).trim();
  }
  // in
  const pIn = buscarPalabra(cuerpo, 'in');
  if (pIn >= 0) {
    const r = cuerpo.slice(pIn + 2).trim();
    cuerpo = cuerpo.slice(0, pIn).trim();
    const m = r.match(/^(\S+)(?:\s*\/\s*(\S+))?$/);
    if (m) inRango = [m[1], m[2] || m[1]];
  }
  // if
  const pIf = buscarPalabra(cuerpo, 'if');
  if (pIf >= 0) {
    ifExp = cuerpo.slice(pIf + 2).trim();
    cuerpo = cuerpo.slice(0, pIf).trim();
    if (!ifExp) {
      throw new ErrorStata('falta la condición después de if', 198,
        'Después de <code>if</code> va una condición, por ejemplo <code>if edad >= 18</code>.');
    }
  }
  // pesos [aweight = x]
  const mW = cuerpo.match(/\[\s*(fweight|aweight|pweight|iweight)\s*=\s*([^\]]+)\]/i);
  if (mW) {
    peso = { tipo: mW[1].toLowerCase(), exp: mW[2].trim() };
    cuerpo = cuerpo.replace(mW[0], ' ').trim();
  }

  // separa "nuevaVar = expresión" para generate / replace / egen
  let exp = null, destino = null;
  if (['generate', 'replace', 'egen'].includes(info.n)) {
    const pEq = cuerpo.indexOf('=');
    if (pEq >= 0) {
      destino = cuerpo.slice(0, pEq).trim();
      exp = cuerpo.slice(pEq + 1).trim();
      cuerpo = destino;
    }
  }

  const tokens = cuerpo ? cuerpo.split(/\s+/).filter(Boolean) : [];

  const p = {
    linea: lineaCruda.trim(),
    prefijos, cmd: info.n, cmdEscrito: escrito, info,
    cuerpo, tokens, destino, exp, ifExp, inRango, using, peso,
    opciones, opcionesTxt: opcionesTxt.trim(),
    avisos: [],
  };

  revisarErroresComunes(p, ds);
  return p;
}

/** Detecta los tropiezos clásicos y los convierte en avisos o errores con solución. */
function revisarErroresComunes(p, ds) {
  const { cmd, tokens, opciones } = p;

  // 1) coma olvidada antes de las opciones.
  // Solo se revisa en comandos donde el primer argumento es una lista de variables:
  // en los que llevan subcomando (clear all, duplicates drop, label define...) palabras
  // como "all" o "drop" son parte legítima del comando, no opciones sueltas.
  const CON_SUBCOMANDO = new Set(['clear', 'estat', 'label', 'duplicates', 'misstable',
    'set', 'log', 'estimates', 'import', 'export', 'graph', 'notes', 'help', 'ayuda',
    'use', 'save', 'predict', 'margins', 'test', 'display', 'recode']);
  if (!p.opcionesTxt && !CON_SUBCOMANDO.has(cmd)) {
    for (const t of tokens) {
      const base = t.replace(/\(.*$/, '').toLowerCase();
      if (SOLO_SON_OPCIONES.has(base) && (!ds || !ds.existe(t))) {
        const nuevo = p.linea.replace(new RegExp(`\\s+${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), `, ${t}`);
        throw new ErrorStata(`"${t}" parece una opción, pero le falta la coma`, 198,
          `En Stata las opciones van <strong>después de una coma</strong>. Debería ser:<br><code>${nuevo}</code>`);
      }
    }
  }

  // 2) usar "=" donde no va
  if (['regress', 'logit', 'probit', 'mlogit', 'ologit', 'oprobit', 'mprobit', 'poisson', 'anova'].includes(cmd)) {
    if (p.cuerpo.includes('=')) {
      const limpio = p.cuerpo.replace(/\s*=\s*/g, ' ').replace(/\s+/g, ' ');
      throw new ErrorStata('en una regresión no se escribe "="', 198,
        `En Stata la variable dependiente va primero y las demás detrás, separadas solo por espacios:<br><code>${cmd} ${limpio}${p.opcionesTxt ? ', ' + p.opcionesTxt : ''}</code>`);
    }
    if (p.cuerpo.includes(',') === false && tokens.length === 1) {
      throw new ErrorStata(`${cmd} necesita al menos una variable explicativa`, 102,
        `Se escribe: <code>${cmd} ${tokens[0]} variable1 variable2</code>. La primera es la que quieres explicar.`);
    }
    if (!tokens.length) {
      throw new ErrorStata(`${cmd} necesita variables`, 100,
        `Se escribe: <code>${cmd} dependiente explicativa1 explicativa2, robust</code>`);
    }
  }

  // 3) generate sin "="
  if (cmd === 'generate' && !p.exp) {
    throw new ErrorStata('a generate le falta el "="', 198,
      'Se escribe: <code>generate nueva = expresión</code>. Por ejemplo <code>gen lningreso = ln(ingreso)</code>.');
  }
  if (cmd === 'replace' && !p.exp) {
    throw new ErrorStata('a replace le falta el "="', 198,
      'Se escribe: <code>replace variable = expresión if condición</code>.');
  }
  if (cmd === 'egen' && !p.exp) {
    throw new ErrorStata('a egen le falta el "="', 198,
      'Se escribe: <code>egen nueva = función(variable), by(grupo)</code>. Por ejemplo <code>egen media_ing = mean(ingreso), by(tamano)</code>.');
  }

  // 4) i. olvidado en variables categóricas
  if (['regress', 'logit', 'probit', 'poisson'].includes(cmd) && ds && ds.cargado) {
    for (let k = 1; k < tokens.length; k++) {
      const t = tokens[k];
      if (t.startsWith('i.') || t.startsWith('c.') || t.includes('#')) continue;
      if (!ds.existe(t)) continue;
      if (ds.esBinaria(t)) continue;
      if (ds.pareceCategorica(t) && !ds.esString(t)) {
        const niv = ds.niveles(t).length;
        p.avisos.push({
          tono: 'ojo',
          texto: `<code>${t}</code> parece una variable de categorías (tiene ${niv} valores distintos). Si es un grupo y no una cantidad, escríbela como <code>i.${t}</code>; si no, Stata la trata como si pasar de un grupo al siguiente valiera siempre lo mismo.`,
        });
      }
    }
  }

  // 5) variable de texto dentro de un modelo
  if (['regress', 'logit', 'probit', 'mlogit', 'ologit', 'oprobit', 'poisson', 'summarize', 'correlate'].includes(cmd) && ds && ds.cargado) {
    for (const t of tokens) {
      const limpio = t.replace(/^[ic]\./, '');
      if (ds.existe(limpio) && ds.esString(limpio)) {
        throw new ErrorStata(`${limpio} es una variable de texto y no entra en este comando`, 109,
          `Las variables alfanuméricas hay que convertirlas primero:<br>· si son categorías (Hombre/Mujer): <code>encode ${limpio}, gen(${limpio}_n)</code><br>· si son números escritos como texto: <code>destring ${limpio}, replace</code>`);
      }
    }
  }

  // 6) opción robust en comandos que no la aceptan
  if (opciones.robust && ['logistic', 'anova', 'tabulate', 'summarize'].includes(cmd)) {
    p.avisos.push({ tono: 'info', texto: `<code>${cmd}</code> no usa la opción <code>robust</code>; la voy a ignorar.` });
  }

  // 7) confusión típica logit/logistic
  if (cmd === 'logistic' && opciones.or) {
    p.avisos.push({ tono: 'info', texto: '<code>logistic</code> ya muestra la razón de momios; la opción <code>or</code> sobra.' });
  }
}

/** Convierte "1" o "l" o "-3" del rango in a un índice base 0. */
export function resolverIn(rango, n) {
  const conv = (x, porDefecto) => {
    if (x === 'l' || x === 'L') return n;
    if (x === 'f' || x === 'F') return 1;
    const v = parseInt(x, 10);
    return isNaN(v) ? porDefecto : (v < 0 ? n + v + 1 : v);
  };
  const a = conv(rango[0], 1), b = conv(rango[1], n);
  return [Math.max(1, a) - 1, Math.min(n, b) - 1];
}

export { NOMBRES as NOMBRES_COMANDOS };

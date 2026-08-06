// Memoria del profe: se acuerda de lo que preguntas y de en qué te trabas,
// y usa eso para explicarte distinto la próxima vez.
//
// Importante y honesto: el modelo de Google NO se reentrena desde aquí. Lo que
// aprende es esta capa: guarda tus preguntas, detecta tus temas flojos y tus
// errores repetidos, y se lo pasa al profe como contexto para que se adapte.
// Todo vive en TU navegador; nada se sube a ningún lado.

const K = {
  dudas: 'stataprofe.dudas',        // preguntas y respuestas del chat
  errores: 'stataprofe.errores',    // errores repetidos al escribir comandos
  perfil: 'stataprofe.perfil',      // lo que el profe ha aprendido de ti
};

const leer = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio */ } };

const MAX_DUDAS = 120;

// ─────────────────────────────────────────────── temas
// Cada tema tiene palabras que lo delatan y a dónde mandarte a repasar.
export const TEMAS = [
  { id: 'margins', nombre: 'efectos marginales', concepto: 'escalas', modelo: 10,
    claves: ['margins', 'marginal', 'punto de probabilidad', 'puntos de probabilidad', 'dydx'] },
  { id: 'odds', nombre: 'razón de momios', concepto: 'escalas', modelo: 12,
    claves: ['momio', 'odd', 'logistic', 'razon de riesgo', 'rrr'] },
  { id: 'logit', nombre: 'logit y probit', concepto: 'curvas', modelo: 10,
    claves: ['logit', 'probit', 'curva', 'logistica', 'sí/no', 'si o no', 'binaria'] },
  { id: 'corte', nombre: 'punto de corte', concepto: 'corte', modelo: 10,
    claves: ['corte', 'cutoff', 'lsens', 'youden', 'umbral'] },
  { id: 'clasificacion', nombre: 'clasificación y ROC', concepto: 'clasificacion', modelo: 10,
    // ojo con "roc" suelto: "heterocedasticidad" lo contiene. Va con contexto.
    claves: ['falso', 'positiv', 'negativ', 'sensibilidad', 'especificidad',
      'curva roc', 'lroc', ' roc', 'auc', 'clasific', 'matriz de confusion'] },
  { id: 'supuestos', nombre: 'supuestos del modelo', concepto: 'orden', modelo: 2,
    claves: ['supuesto', 'vif', 'hettest', 'heteroced', 'ovtest', 'multicolineal', 'normalidad', 'residuo', 'robust'] },
  { id: 'logaritmos', nombre: 'logaritmos y elasticidades', concepto: 'escalas', modelo: 8,
    claves: ['logaritmo', 'ln(', ' ln ', 'ln de', 'elasticidad', 'semielasticidad', 'cobb', 'porcentaje'] },
  { id: 'multinomial', nombre: 'multinomial y ordenado', concepto: 'multinomial', modelo: 15,
    claves: ['mlogit', 'mprobit', 'ologit', 'oprobit', 'multinomial', 'categoria base', 'iia', 'ordenado'] },
  { id: 'dummies', nombre: 'grupos y dummies', concepto: 'orden', modelo: 3,
    claves: ['dummy', 'dummies', 'i.', 'anova', 'grupo base', 'categoria', 'testparm'] },
  { id: 'depuracion', nombre: 'depurar la base', concepto: 'base', modelo: 18,
    claves: ['missing', 'faltante', 'vacio', 'duplicad', 'destring', 'encode', 'mvdecode',
      'recodific', 'recode', 'depurar', 'limpiar', 'de 5 a 3', 'juntar categoria'] },
  // las claves son trozos cortos a propósito: así siguen funcionando aunque la
  // pregunta venga con typos ("varible", "variblr", "etiquetar" a medio escribir)
  { id: 'variables', nombre: 'crear y etiquetar variables', concepto: 'base', modelo: 18,
    claves: ['gen ', 'generate', 'label', 'etiquet', 'replace',
      'crear una vari', 'crear otra vari', 'vari nueva', 'nueva vari', 'variable nueva',
      'como creo', 'como crear', 'como hago una vari'] },
  { id: 'significancia', nombre: 'significancia', concepto: 'escalas', modelo: 2,
    claves: ['valor p', 'p-valor', 'significativ', 'intervalo de confianza', 't calculado', 'hipotesis'] },
  { id: 'ajuste', nombre: 'qué tan bien ajusta el modelo', concepto: 'orden', modelo: 2,
    claves: ['r2', 'r cuadrado', 'r-cuadrado', 'pseudo r', 'ajusta', 'ajuste', 'explica poco', 'bajo el modelo'] },
];

function normalizar(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Detecta de qué tema es una pregunta. Puede dar varios. */
export function detectarTemas(texto) {
  const t = normalizar(texto);
  return TEMAS.filter((tema) => tema.claves.some((c) => t.includes(normalizar(c)))).map((x) => x.id);
}

// ─────────────────────────────────────────────── dudas del chat

export function guardarDuda(pregunta, respuesta) {
  const dudas = leer(K.dudas, []);
  dudas.push({
    id: 'd' + dudas.length + '_' + pregunta.slice(0, 12).replace(/\W/g, ''),
    p: pregunta, r: respuesta,
    temas: detectarTemas(pregunta + ' ' + respuesta),
    util: null,          // null = sin marcar, true = sirvió, false = no entendí
    n: dudas.length + 1,
  });
  while (dudas.length > MAX_DUDAS) dudas.shift();
  escribir(K.dudas, dudas);
  recalcularPerfil();
  return dudas[dudas.length - 1];
}

export function dudas() { return leer(K.dudas, []); }

export function marcarDuda(id, util) {
  const d = leer(K.dudas, []);
  const i = d.findIndex((x) => x.id === id);
  if (i < 0) return;
  d[i].util = util;
  escribir(K.dudas, d);
  recalcularPerfil();
}

export function borrarDudas() {
  escribir(K.dudas, []);
  escribir(K.perfil, null);
}

/** Las últimas N preguntas y respuestas, para que el chat tenga continuidad. */
export function historialReciente(n = 6) {
  return leer(K.dudas, []).slice(-n);
}

// ─────────────────────────────────────────────── errores al escribir comandos

export function registrarError(codigo, mensaje, linea) {
  const e = leer(K.errores, {});
  // se agrupa por el tipo de error, no por la línea exacta
  const clave = clasificarError(codigo, mensaje);
  if (!clave) return;
  if (!e[clave]) e[clave] = { n: 0, ejemplos: [] };
  e[clave].n++;
  if (e[clave].ejemplos.length < 3 && !e[clave].ejemplos.includes(linea)) e[clave].ejemplos.push(linea);
  escribir(K.errores, e);
  recalcularPerfil();
  return { clave, veces: e[clave].n };
}

function clasificarError(codigo, mensaje) {
  const m = normalizar(mensaje);
  if (m.includes('falta la coma')) return 'coma_olvidada';
  if (m.includes('no se escribe "="') || m.includes('operador =')) return 'igual_en_regresion';
  if (m.includes('dos') && m.includes('igual')) return 'un_solo_igual';
  if (m.includes('no encontrada')) return 'variable_inexistente';
  if (m.includes('desconocido')) return 'comando_mal_escrito';
  if (m.includes('ya existe')) return 'gen_sobre_existente';
  if (m.includes('texto') && (m.includes('modelo') || m.includes('entra'))) return 'texto_en_modelo';
  if (m.includes('necesita un modelo') || codigo === 301) return 'postestimacion_sin_modelo';
  if (m.includes('no hay datos')) return 'sin_base_abierta';
  if (m.includes('sí/no') || m.includes('si/no')) return 'dependiente_no_binaria';
  return null;
}

export const CONSEJO_ERROR = {
  coma_olvidada: { que: 'olvidar la coma antes de las opciones',
    consejo: 'En Stata TODO lo que va después de una coma son opciones. <code>reg y x, robust</code>, nunca <code>reg y x robust</code>.' },
  igual_en_regresion: { que: 'poner "=" en una regresión',
    consejo: 'En una regresión las variables van separadas solo por espacios: <code>reg ingreso educ</code>, sin signo igual.' },
  un_solo_igual: { que: 'usar un solo "=" al comparar',
    consejo: 'Para comparar van <strong>dos</strong>: <code>if mujer == 1</code>. Uno solo sirve únicamente para asignar en <code>gen</code> y <code>replace</code>.' },
  variable_inexistente: { que: 'escribir mal el nombre de una variable',
    consejo: 'Ten abierto el panel de <strong>Variables</strong> a la derecha: un clic pega el nombre exacto en la caja de comando.' },
  comando_mal_escrito: { que: 'escribir mal el comando',
    consejo: 'La caja de comando te va sugiriendo mientras escribes: dale <kbd>Tab</kbd> para completar.' },
  gen_sobre_existente: { que: 'usar gen sobre una variable que ya existe',
    consejo: '<code>gen</code> crea, <code>replace</code> cambia. Si vas a rehacerla: <code>capture drop x</code> y después <code>gen x = ...</code>' },
  texto_en_modelo: { que: 'meter una variable de texto en un modelo',
    consejo: 'Conviértela antes: <code>encode</code> si son categorías, <code>destring</code> si son números escritos como texto.' },
  postestimacion_sin_modelo: { que: 'correr postestimación sin un modelo antes',
    consejo: 'Comandos como <code>margins</code>, <code>estat</code> o <code>lroc</code> trabajan sobre el <strong>último</strong> modelo. Corre la regresión primero.' },
  sin_base_abierta: { que: 'correr comandos sin una base abierta',
    consejo: 'Empieza siempre con <code>use enemdu_eloro_2024, clear</code>.' },
  dependiente_no_binaria: { que: 'usar logit con una variable que no es 0/1',
    consejo: 'Con 3 o más categorías va <code>mlogit</code> (sin orden) u <code>ologit</code> (con orden).' },
};

export function errores() { return leer(K.errores, {}); }
export function borrarErrores() { escribir(K.errores, {}); recalcularPerfil(); }

// ─────────────────────────────────────────────── el perfil que va aprendiendo

function recalcularPerfil() {
  const d = leer(K.dudas, []);
  const e = leer(K.errores, {});

  const cuenta = {};
  for (const x of d) for (const t of x.temas || []) cuenta[t] = (cuenta[t] || 0) + 1;
  // lo que marcó como "no entendí" pesa doble: ahí es donde de verdad se traba
  for (const x of d) if (x.util === false) for (const t of x.temas || []) cuenta[t] = (cuenta[t] || 0) + 1;

  const temasFlojos = Object.entries(cuenta)
    .sort((a, b) => b[1] - a[1])
    .filter(([, n]) => n >= 2)
    .slice(0, 4)
    .map(([id, n]) => ({ ...TEMAS.find((t) => t.id === id), veces: n }));

  const erroresFrecuentes = Object.entries(e)
    .filter(([, v]) => v.n >= 2)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 4)
    .map(([clave, v]) => ({ clave, veces: v.n, ...CONSEJO_ERROR[clave] }));

  const noEntendio = d.filter((x) => x.util === false).length;
  const sirvio = d.filter((x) => x.util === true).length;

  const perfil = {
    preguntas: d.length, temasFlojos, erroresFrecuentes, noEntendio, sirvio,
    // si marca mucho "no entendí", el profe baja el nivel
    nivel: noEntendio > sirvio + 1 ? 'basico' : (d.length > 15 && sirvio > noEntendio ? 'avanzado' : 'normal'),
    actualizado: d.length,
  };
  escribir(K.perfil, perfil);
  return perfil;
}

export function perfil() {
  return leer(K.perfil, null) || recalcularPerfil();
}

/** Lo que se le cuenta al profe sobre ti, para que ajuste la explicación. */
export function resumenParaPrompt() {
  const p = perfil();
  // sirve aunque nunca haya usado el chat: los errores al escribir comandos
  // ya dicen bastante de dónde se traba
  if (!p || (!p.preguntas && !p.erroresFrecuentes.length)) return null;
  const partes = [];
  if (p.preguntas) partes.push(`Esta estudiante ya te ha hecho ${p.preguntas} preguntas.`);
  else partes.push('Es la primera vez que te pregunta, pero ya lleva rato usando el simulador.');
  if (p.temasFlojos.length) {
    partes.push(`Los temas que más le cuestan (por cuántas veces ha vuelto a preguntar): ${
      p.temasFlojos.map((t) => `${t.nombre} (${t.veces})`).join(', ')}.`);
    partes.push('Si la pregunta toca uno de esos temas, explícaselo desde más atrás y con otro ejemplo distinto al que ya le diste antes.');
  }
  if (p.erroresFrecuentes.length) {
    partes.push(`Errores que repite al escribir comandos: ${
      p.erroresFrecuentes.map((e) => `${e.que} (${e.veces} veces)`).join(', ')}. Si viene al caso, recuérdaselo de pasada, sin regañar.`);
  }
  if (p.nivel === 'basico') {
    partes.push('IMPORTANTE: ha marcado varias respuestas como "no entendí". Baja el nivel: frases más cortas, cero jerga, un ejemplo con números concretos antes que cualquier definición.');
  } else if (p.nivel === 'avanzado') {
    partes.push('Ya lleva bastante camino y entiende bien: puedes ir más directo y no repetirle lo básico.');
  }
  return partes.join(' ');
}

/** Sugerencia concreta de qué repasar, para mostrarla en la interfaz. */
export function queRepasar() {
  const p = perfil();
  if (!p || !p.temasFlojos || !p.temasFlojos.length) return null;
  const t = p.temasFlojos[0];
  return {
    tema: t.nombre, veces: t.veces, concepto: t.concepto, modelo: t.modelo,
    texto: `Has preguntado ${t.veces} veces sobre <strong>${t.nombre}</strong>. Te dejo el apartado donde está explicado a fondo.`,
  };
}

// Chat libre con Gemini. Es OPCIONAL: todas las interpretaciones de resultados
// las hace professor.js sin internet. Esto solo agrega preguntas en lenguaje libre.
//
// El nombre del modelo NO va fijo a propósito: Google los renombra y los retira
// cada pocos meses, y un nombre viejo devuelve 404. En vez de eso se le pide la
// lista de modelos disponibles y se elige el mejor que sirva.

const K_CLAVE = 'stataprofe.gemini';
const K_MODELO = 'stataprofe.geminiModelo';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Orden de preferencia. Se busca por trozos del nombre, no por coincidencia
// exacta, para que siga funcionando cuando cambien de versión.
const PREFERENCIAS = ['flash-latest', 'flash', 'pro-latest', 'pro'];

let hayProxy = null;

export function tieneClave() {
  return !!localStorage.getItem(K_CLAVE) || hayProxy === true;
}
export function guardarClave(v) {
  localStorage.setItem(K_CLAVE, v.trim());
  localStorage.removeItem(K_MODELO);   // al cambiar de clave, se vuelve a buscar modelo
}
export function borrarClave() {
  localStorage.removeItem(K_CLAVE);
  localStorage.removeItem(K_MODELO);
}
function laClave() { return localStorage.getItem(K_CLAVE) || ''; }
export function modeloElegido() { return localStorage.getItem(K_MODELO) || null; }

const SISTEMA = `Eres el profesor de econometría de "StataProfe", un simulador de Stata para
estudiantes de economía en Machala, Ecuador. Respondes SIEMPRE en español sencillo de Ecuador,
tuteando, sin tecnicismos sin explicar.

Reglas de estilo:
- Corto y directo. Máximo 5 párrafos. Nada de introducciones tipo "¡Qué buena pregunta!".
- Cada palabra técnica se explica en la misma frase donde aparece.
- Usa ejemplos concretos con los datos que la estudiante tenga abiertos.
- Si la respuesta implica un comando, escríbelo en su propia línea entre etiquetas <code></code>.
- Puedes usar <strong>, <em>, <code>, <br> y listas <ul><li>. Nada de markdown ni de bloques triples.

Reglas de contenido (importantes):
- Un coeficiente de logit/probit NO es una probabilidad. Siempre exige "margins, dydx(*)".
- En modelos multinomiales, toda interpretación va con "comparado con la categoría base".
- La razón de momios tiene como valor neutro el 1, no el 0.
- "Significativo" no es lo mismo que "importante en la vida real".
- Correlación no es causalidad.
- En modelos log, si |b| > 0.1 hay que usar (e^b - 1)*100, no multiplicar por 100.
- Si la heterocedasticidad da significativa, la solución es agregar "robust", nada más.
- Nunca inventes números: si no tienes el dato en el contexto, dile que corra el comando.`;

async function detectarProxy() {
  if (hayProxy !== null) return hayProxy;
  try {
    const r = await fetch('/api/gemini', { method: 'GET' });
    hayProxy = r.ok;
  } catch { hayProxy = false; }
  return hayProxy;
}

/** Traduce los errores de Google a algo que se entienda. */
function explicarError(estado, cuerpo) {
  const t = String(cuerpo || '');
  if (estado === 400 && /API[_ ]KEY[_ ]INVALID|API key not valid/i.test(t)) {
    return 'la clave no es válida (revísala, puede que le falte un pedazo al pegarla)';
  }
  if (estado === 400) return 'la petición fue rechazada: ' + (t.slice(0, 120) || 'sin detalle');
  if (estado === 401 || estado === 403) {
    if (/SERVICE_DISABLED|has not been used|disabled/i.test(t)) {
      return 'la clave existe pero la API de Gemini no está habilitada en ese proyecto de Google';
    }
    if (/restricted|referer|not authorized/i.test(t)) {
      return 'la clave tiene restricciones que bloquean este sitio (revisa las restricciones de la clave en Google)';
    }
    return 'la clave no tiene permiso para usar este servicio';
  }
  if (estado === 404) return 'ese modelo ya no existe en la API';
  if (estado === 429) return 'se acabó la cuota por ahora, prueba en un rato';
  if (estado >= 500) return 'el servicio de Google está fallando en este momento; prueba en unos minutos';
  return `el servicio respondió ${estado}`;
}

/** Pide a Google la lista de modelos y elige el mejor que sirva para conversar. */
export async function buscarModelo({ forzar = false } = {}) {
  const guardado = modeloElegido();
  if (guardado && !forzar) return guardado;

  const clave = laClave();
  if (!clave) throw new Error('no hay clave configurada');

  let resp;
  try {
    resp = await fetch(`${BASE}/models?key=${encodeURIComponent(clave)}&pageSize=200`);
  } catch {
    throw new Error('no hay conexión a internet, o la red bloquea el servicio');
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(explicarError(resp.status, t));
  }
  const j = await resp.json();
  const modelos = (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    // fuera los que no sirven para conversar
    .filter((n) => !/embed|aqa|imagen|veo|tts|image|audio|native-audio|live/i.test(n));

  if (!modelos.length) {
    throw new Error('la clave funciona, pero no tiene ningún modelo de texto disponible');
  }

  // se elige por preferencia, y entre los que empatan, el de nombre más corto
  // (los cortos suelen ser los alias estables, sin número de versión pegado)
  let elegido = null;
  for (const pref of PREFERENCIAS) {
    const cand = modelos.filter((n) => n.includes(pref));
    if (cand.length) {
      cand.sort((a, b) => a.length - b.length || a.localeCompare(b));
      elegido = cand[0];
      break;
    }
  }
  if (!elegido) { modelos.sort((a, b) => a.length - b.length); elegido = modelos[0]; }

  localStorage.setItem(K_MODELO, elegido);
  return elegido;
}

/** Lista completa, por si se quiere mostrar cuál se está usando. */
export async function listarModelos() {
  const clave = laClave();
  if (!clave) throw new Error('no hay clave configurada');
  const resp = await fetch(`${BASE}/models?key=${encodeURIComponent(clave)}&pageSize=200`);
  if (!resp.ok) throw new Error(explicarError(resp.status, await resp.text().catch(() => '')));
  const j = await resp.json();
  return (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, ''));
}

function armarPrompt(pregunta, ctx) {
  const partes = [];
  // lo que el profe ha aprendido de ella en conversaciones anteriores
  if (ctx && ctx.perfil) {
    partes.push('--- LO QUE YA SABES DE ESTA ESTUDIANTE ---');
    partes.push(ctx.perfil);
    partes.push('');
  }
  if (ctx && ctx.base) {
    partes.push(`Base abierta: ${ctx.base.nombre}, ${ctx.base.n} observaciones.`);
    partes.push(`Variables: ${ctx.base.variables.slice(0, 30).join('; ')}`);
  } else {
    partes.push('La estudiante no tiene ninguna base abierta todavía.');
  }
  if (ctx && ctx.ultimosComandos && ctx.ultimosComandos.length) {
    partes.push(`Últimos comandos que corrió: ${ctx.ultimosComandos.join(' | ')}`);
  }
  if (ctx && ctx.ultimoModelo) {
    const m = ctx.ultimoModelo;
    partes.push(`Último modelo: ${m.comando} con dependiente ${m.dependiente}, N=${m.N}${m.r2 !== undefined && !isNaN(m.r2) ? `, R2=${Number(m.r2).toFixed(4)}` : ''}.`);
    partes.push(`Coeficientes: ${m.coeficientes.join('; ')}`);
  }
  partes.push('');
  partes.push(`Pregunta de la estudiante: ${pregunta}`);
  return partes.join('\n');
}

export async function preguntarGemini(pregunta, ctx) {
  const usarProxy = await detectarProxy();
  // el historial va como turnos de verdad, para que la conversación tenga hilo
  const contents = [];
  for (const h of (ctx && ctx.historial) || []) {
    contents.push({ role: 'user', parts: [{ text: h.p }] });
    contents.push({ role: 'model', parts: [{ text: String(h.r || '').replace(/<[^>]+>/g, '').slice(0, 700) }] });
  }
  contents.push({ role: 'user', parts: [{ text: armarPrompt(pregunta, ctx) }] });

  // 900 se quedaba corto y cortaba las respuestas a media frase
  const cuerpo = {
    systemInstruction: { parts: [{ text: SISTEMA }] },
    contents,
    generationConfig: { temperature: 0.4, maxOutputTokens: 2600 },
  };

  if (usarProxy) {
    const resp = await fetch('/api/gemini', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
    if (!resp.ok) throw new Error(explicarError(resp.status, await resp.text().catch(() => '')));
    const rp = sacarTexto(await resp.json());
    return limpiar(rp.texto + (rp.truncado ? '\n\n*(la respuesta quedó a medias; pregúntame por la parte que falta)*' : ''));
  }

  const clave = laClave();
  if (!clave) throw new Error('no hay clave configurada');

  // se intenta con el modelo guardado; si ya no existe (404), se busca otro y se reintenta
  let modelo = await buscarModelo();
  let r = null;
  for (let intento = 0; intento < 2; intento++) {
    let resp;
    try {
      resp = await fetch(`${BASE}/models/${modelo}:generateContent?key=${encodeURIComponent(clave)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    } catch {
      throw new Error('no hay conexión a internet, o la red bloquea el servicio');
    }
    if (resp.ok) { r = sacarTexto(await resp.json()); break; }
    if (resp.status === 404 && intento === 0) {
      // el modelo guardado quedó obsoleto: se vuelve a buscar y se reintenta una vez
      modelo = await buscarModelo({ forzar: true });
      continue;
    }
    throw new Error(explicarError(resp.status, await resp.text().catch(() => '')));
  }
  if (!r) throw new Error('no se pudo obtener respuesta');

  // Si se cortó por el límite de tokens, se le pide que siga desde donde quedó
  // y se pega el resto. Hasta 2 veces, para no dispararse en consumo.
  let texto = r.texto;
  for (let seguir = 0; r.truncado && seguir < 2; seguir++) {
    const cont = {
      systemInstruction: cuerpo.systemInstruction,
      contents: [
        ...cuerpo.contents,
        { role: 'model', parts: [{ text: texto }] },
        { role: 'user', parts: [{ text: 'Se cortó. Continúa EXACTAMENTE desde donde quedaste, sin repetir nada de lo que ya dijiste y sin saludar de nuevo. Si ya habías terminado la idea, cierra en una frase.' }] },
      ],
      generationConfig: cuerpo.generationConfig,
    };
    let resp;
    try {
      resp = await fetch(`${BASE}/models/${modelo}:generateContent?key=${encodeURIComponent(clave)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cont) });
    } catch { break; }
    if (!resp.ok) break;
    let r2;
    try { r2 = sacarTexto(await resp.json()); } catch { break; }
    if (!r2.texto) break;
    texto = unir(texto, r2.texto);
    r = r2;
  }
  if (r.truncado) texto += '\n\n*(la respuesta quedó a medias; pregúntame por la parte que falta)*';
  return limpiar(texto);
}

/** Pega dos trozos sin duplicar el empalme ni comerse una palabra. */
function unir(a, b) {
  // OJO: si el segundo trozo empezaba con espacio, eso significa "palabra nueva".
  // Hay que mirarlo ANTES de recortar, o se pegan dos palabras distintas.
  const habiaEspacio = /^\s/.test(b) || /\s$/.test(a);
  const izq = a.replace(/\s+$/, '');
  const der = b.replace(/^\s+/, '');
  if (!izq) return der;
  if (!der) return izq;
  // si el modelo repitió el final del trozo anterior, se quita el solape
  for (let n = Math.min(120, izq.length, der.length); n > 12; n--) {
    if (izq.slice(-n) === der.slice(0, n)) return izq + der.slice(n);
  }
  // solo se pegan sin espacio si el corte partió una palabra por la mitad
  const partioPalabra = !habiaEspacio
    && /[A-Za-zÁÉÍÓÚÑáéíóúñ0-9]$/.test(izq)
    && /^[a-záéíóúñ0-9]/.test(der);
  return izq + (partioPalabra ? '' : ' ') + der;
}

function sacarTexto(j) {
  const c = j?.candidates?.[0];
  const texto = c?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
  const motivo = c?.finishReason || j?.promptFeedback?.blockReason;
  if (!texto) {
    if (motivo === 'SAFETY' || motivo === 'PROHIBITED_CONTENT') {
      throw new Error('el filtro de contenido de Google bloqueó la respuesta; prueba a preguntarlo de otra forma');
    }
    if (motivo === 'MAX_TOKENS') {
      throw new Error('el modelo gastó todo el presupuesto pensando y no alcanzó a escribir; prueba a preguntarlo más corto');
    }
    throw new Error('la respuesta vino vacía');
  }
  return { texto, truncado: motivo === 'MAX_TOKENS' };
}

/** Quita markdown por si el modelo lo usa igual, y deja solo el HTML permitido. */
function limpiar(t) {
  let s = t
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/^#{1,6}\s*/gm, '');
  // si la respuesta se cortó a mitad de un **negrita**, quedan asteriscos
  // sueltos a la vista: se cierran para que no se vea el markdown crudo
  if ((s.match(/\*\*/g) || []).length % 2 === 1) s = s.replace(/\*\*(?=[^*]*$)/, '<strong>') + '</strong>';
  s = s.replace(/`(?=[^`]*$)/, '');
  s = s.replace(/^\s*[-•]\s+(.+)$/gm, '<li>$1</li>');
  s = s.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
  s = s.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
  s = s.replace(/<(?!\/?(strong|em|code|br|ul|ol|li|b|i)\b)[^>]*>/gi, '');
  return s;
}

export async function probarClave() {
  try {
    const modelo = await buscarModelo({ forzar: true });
    const r = await preguntarGemini('Responde solo con la palabra: listo', { base: null });
    return { ok: true, modelo, muestra: r.replace(/<[^>]+>/g, '').slice(0, 60) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

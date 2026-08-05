// Chat libre con Gemini. Es OPCIONAL: todas las interpretaciones de resultados
// las hace professor.js sin internet. Esto solo agrega preguntas en lenguaje libre.
//
// Si la app está desplegada con la función /api/gemini, se usa esa (la clave vive
// en el servidor y no se expone). Si no, se usa la clave que la usuaria guardó
// en su propio navegador.

const K_CLAVE = 'stataprofe.gemini';
const MODELO = 'gemini-2.5-flash';

let hayProxy = null;   // se averigua la primera vez

export function tieneClave() {
  return !!localStorage.getItem(K_CLAVE) || hayProxy === true;
}
export function guardarClave(v) { localStorage.setItem(K_CLAVE, v.trim()); }
export function borrarClave() { localStorage.removeItem(K_CLAVE); }
function laClave() { return localStorage.getItem(K_CLAVE) || ''; }

const SISTEMA = `Eres el profesor de econometría de "StataProfe", un simulador de Stata para
estudiantes de economía en Machala, Ecuador. Respondes SIEMPRE en español sencillo de Ecuador,
tuteando, sin tecnicismos sin explicar.

Reglas de estilo:
- Corto y directo. Máximo 5 párrafos. Nada de introducciones tipo "¡Qué buena pregunta!".
- Cada palabra técnica se explica en la misma frase donde aparece.
- Usa ejemplos concretos con los datos que la estudiante tenga abiertos.
- Si la respuesta implica un comando, escríbelo en su propia línea entre etiquetas <code></code>.
- Puedes usar <strong>, <em>, <code>, <br> y listas <ul><li>. Nada de markdown ni de bloques \`\`\`.

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

function armarPrompt(pregunta, ctx) {
  const partes = [];
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
  const cuerpo = {
    systemInstruction: { parts: [{ text: SISTEMA }] },
    contents: [{ role: 'user', parts: [{ text: armarPrompt(pregunta, ctx) }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
  };

  let resp;
  if (usarProxy) {
    resp = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
  } else {
    const clave = laClave();
    if (!clave) throw new Error('no hay clave configurada');
    resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${encodeURIComponent(clave)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }
    );
  }

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    if (resp.status === 400 && /API key/i.test(t)) throw new Error('la clave no es válida');
    if (resp.status === 429) throw new Error('se acabó la cuota por ahora, prueba en un rato');
    throw new Error(`el servicio respondió ${resp.status}`);
  }
  const j = await resp.json();
  const texto = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!texto) throw new Error('la respuesta vino vacía');
  return limpiar(texto);
}

/** Quita markdown por si el modelo lo usa igual, y deja solo el HTML permitido. */
function limpiar(t) {
  let s = t
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/^#{1,6}\s*/gm, '');
  s = s.replace(/^\s*[-•]\s+(.+)$/gm, '<li>$1</li>');
  s = s.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
  s = s.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
  // deja pasar solo etiquetas seguras
  s = s.replace(/<(?!\/?(strong|em|code|br|ul|ol|li|b|i)\b)[^>]*>/gi, '');
  return s;
}

export async function probarClave() {
  try {
    const r = await preguntarGemini('Responde solo con la palabra: listo', { base: null });
    return { ok: true, muestra: r };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

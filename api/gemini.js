// Función serverless (Vercel) que hace de intermediaria con Gemini.
// Sirve para que la clave viva en el servidor y NO se exponga en el navegador.
// Es opcional: si no existe, la app usa la clave que la usuaria guarda en su dispositivo.
//
// Para activarla, en Vercel: Settings → Environment Variables → GEMINI_API_KEY

// El nombre del modelo no va fijo: Google los renombra y los retira cada pocos
// meses, y un nombre viejo devuelve 404. Se pide la lista y se elige uno vivo.
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const PREFERENCIAS = ['flash-latest', 'flash', 'pro-latest', 'pro'];
let modeloCache = null;

async function elegirModelo(clave) {
  if (modeloCache) return modeloCache;
  const r = await fetch(`${BASE}/models?key=${clave}&pageSize=200`);
  if (!r.ok) throw new Error('no se pudo consultar la lista de modelos');
  const j = await r.json();
  const modelos = (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    .filter((n) => !/embed|aqa|imagen|veo|tts|image|audio|native-audio|live/i.test(n));
  if (!modelos.length) throw new Error('no hay modelos de texto disponibles para esta clave');
  for (const pref of PREFERENCIAS) {
    const cand = modelos.filter((n) => n.includes(pref));
    if (cand.length) {
      cand.sort((a, b) => a.length - b.length || a.localeCompare(b));
      modeloCache = cand[0];
      return modeloCache;
    }
  }
  modelos.sort((a, b) => a.length - b.length);
  modeloCache = modelos[0];
  return modeloCache;
}

export default async function handler(req, res) {
  const clave = process.env.GEMINI_API_KEY;

  // GET sirve para que el navegador averigüe si la función existe y está configurada
  if (req.method === 'GET') {
    if (!clave) return res.status(404).json({ ok: false, motivo: 'sin clave configurada' });
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'método no permitido' });
  }
  if (!clave) return res.status(503).json({ error: 'el servidor no tiene GEMINI_API_KEY configurada' });

  try {
    const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // límite de tamaño para que nadie use esto como proxy general
    const texto = JSON.stringify(cuerpo || {});
    if (texto.length > 24000) return res.status(413).json({ error: 'la consulta es demasiado larga' });

    const modelo = await elegirModelo(clave);
    const r = await fetch(
      `${BASE}/models/${modelo}:generateContent?key=${clave}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: cuerpo.systemInstruction,
          contents: cuerpo.contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: Math.min(1200, cuerpo?.generationConfig?.maxOutputTokens || 900),
          },
        }),
      }
    );
    const datos = await r.json();
    return res.status(r.status).json(datos);
  } catch (e) {
    return res.status(500).json({ error: 'no se pudo consultar el servicio' });
  }
}

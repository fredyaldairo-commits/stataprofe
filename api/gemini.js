// Función serverless (Vercel) que hace de intermediaria con Gemini.
// Sirve para que la clave viva en el servidor y NO se exponga en el navegador.
// Es opcional: si no existe, la app usa la clave que la usuaria guarda en su dispositivo.
//
// Para activarla, en Vercel: Settings → Environment Variables → GEMINI_API_KEY

const MODELO = 'gemini-2.5-flash';

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

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${clave}`,
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

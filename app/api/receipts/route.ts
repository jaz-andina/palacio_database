// Recibe un receipt desde el navegador y lo reenvía al Apps Script que lo guarda
// en Google Drive. El secreto y la URL del script viven sólo en el servidor.
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const scriptUrl = process.env.DRIVE_APPS_SCRIPT_URL
  const secret = process.env.DRIVE_UPLOAD_SECRET
  if (!scriptUrl || !secret) {
    return Response.json(
      { ok: false, error: 'Drive no está configurado (faltan variables de entorno).' },
      { status: 500 }
    )
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: 'No se recibió ningún archivo.' }, { status: 400 })
  }

  const year = String(form.get('year') ?? '')
  const month = String(form.get('month') ?? '')
  const filename = String(form.get('filename') ?? file.name ?? 'receipt')
  const dataBase64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        year,
        month,
        filename,
        mimeType: file.type || 'application/octet-stream',
        dataBase64,
      }),
    })
    const out = await res
      .json()
      .catch(() => ({ ok: false, error: 'Respuesta inválida del script de Drive.' }))
    return Response.json(out, { status: res.ok && out.ok ? 200 : 502 })
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 502 })
  }
}

// Recibe los 4 totales del mes actual y se los reenvía al Apps Script, que los
// escribe en la columna del mes correspondiente del Google Sheet.
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const scriptUrl = process.env.DRIVE_APPS_SCRIPT_URL
  const secret = process.env.DRIVE_UPLOAD_SECRET
  if (!scriptUrl || !secret) {
    return Response.json(
      { ok: false, error: 'Integración no configurada (faltan variables de entorno).' },
      { status: 500 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'JSON inválido.' }, { status: 400 })
  }

  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'syncTotals',
        secret,
        month: body.month,
        utilities: body.utilities,
        mantenimiento: body.mantenimiento,
        adminImpuestos: body.adminImpuestos,
        realesTotales: body.realesTotales,
        agua: body.agua,
      }),
    })
    const out = await res
      .json()
      .catch(() => ({ ok: false, error: 'Respuesta inválida del script.' }))
    return Response.json(out, { status: res.ok && out.ok ? 200 : 502 })
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 502 })
  }
}

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email, ime, poi_naziv, zadatak, opis, rok } = await req.json()

  // Ovdje možeš dodati Resend ili drugi email servis
  // Za sada samo logira
  console.log(`Email obavijest za ${ime} (${email}): ${zadatak} @ ${poi_naziv}`)

  return NextResponse.json({ ok: true })
}

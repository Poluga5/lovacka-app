import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { email, ime, poi_naziv, zadatak, opis, rok } = await req.json()

  if (!email) return NextResponse.json({ ok: false, error: 'Nema emaila' })

  try {
    await resend.emails.send({
      from: 'Lovačka app <onboarding@resend.dev>',
      to: email,
      subject: `Novi zadatak: ${zadatak}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #247a4b;">Novi zadatak dodijeljen</h2>
          <p>Pozdrav <strong>${ime}</strong>,</p>
          <p>Dodijeljen vam je novi zadatak na lokaciji <strong>${poi_naziv}</strong>:</p>
          <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
            <h3 style="margin: 0 0 8px; color: #15803d;">${zadatak}</h3>
            ${opis ? `<p style="margin: 0; color: #374151;">${opis}</p>` : ''}
            ${rok ? `<p style="margin: 8px 0 0; font-size: 13px; color: #6b7280;">📅 Rok: ${rok}</p>` : ''}
          </div>
          <p style="color: #6b7280; font-size: 13px;">Lovačka aplikacija</p>
        </div>
      `
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Email error:', error)
    return NextResponse.json({ ok: false, error: 'Email nije poslan' })
  }
}

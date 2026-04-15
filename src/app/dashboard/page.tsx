'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, formatDistanceToNow } from 'date-fns'
import { hr } from 'date-fns/locale'

export default function NaslovnaPage() {
  const [stats, setStats] = useState({ clanovi: 0, poi: 0, rezervacije: 0, dnevnik: 0 })
  const [zadnjiOdstrjeli, setZadnjiOdstrjeli] = useState<any[]>([])
  const [zadnjeRezervacije, setZadnjeRezervacije] = useState<any[]>([])
  const [otvoreniZadaci, setOtvoreniZadaci] = useState<any[]>([])
  const [zadnjiDnevnik, setZadnjiDnevnik] = useState<any[]>([])
  const [groupId, setGroupId] = useState<string | null>(null)
  const [clubName, setClubName] = useState('Lovačka aplikacija')
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: member } = await supabase
      .from('group_members').select('group_id').eq('user_id', user.id).single()
    if (!member) return
    setGroupId(member.group_id)

    const { data: settings } = await supabase
      .from('app_settings').select('value').eq('key', 'club_name').single()
    if (settings) setClubName(settings.value)

    const [
      clanoviRes, poiRes, rezervacijeRes, dnevnikRes,
      odstrjeliRes, zadaciRes, sveDnevnikRes
    ] = await Promise.all([
      supabase.from('group_members').select('id', { count: 'exact' }).eq('group_id', member.group_id),
      supabase.from('poi').select('id', { count: 'exact' }).eq('group_id', member.group_id).eq('is_active', true),
      supabase.from('reservations').select('id', { count: 'exact' }).eq('group_id', member.group_id).eq('status', 'aktivna').gte('date_end', new Date().toISOString()),
      supabase.from('entries').select('id', { count: 'exact' }).eq('group_id', member.group_id),
      // Zadnji odstrjeli
      supabase.from('entries').select('*, profiles(full_name), poi(name)')
        .eq('group_id', member.group_id)
        .eq('type', 'odstrjel')
        .order('hunted_at', { ascending: false })
        .limit(5),
      // Otvoreni zadaci
      supabase.from('poi_zadaci').select('*, poi(name)')
        .eq('group_id', member.group_id)
        .eq('status', 'otvoreno')
        .order('created_at', { ascending: false })
        .limit(8),
      // Zadnje sve aktivnosti dnevnika
      supabase.from('entries').select('*, profiles(full_name), poi(name)')
        .eq('group_id', member.group_id)
        .order('hunted_at', { ascending: false })
        .limit(8),
    ])

    setStats({
      clanovi: clanoviRes.count ?? 0,
      poi: poiRes.count ?? 0,
      rezervacije: rezervacijeRes.count ?? 0,
      dnevnik: dnevnikRes.count ?? 0,
    })
    setZadnjiOdstrjeli(odstrjeliRes.data ?? [])
    setOtvoreniZadaci(zadaciRes.data ?? [])
    setZadnjiDnevnik(sveDnevnikRes.data ?? [])

    // Nadolazeće rezervacije
    const { data: rezervacije } = await supabase
      .from('reservations')
      .select('*, poi(name, type), profiles(full_name)')
      .eq('group_id', member.group_id)
      .eq('status', 'aktivna')
      .gte('date_end', new Date().toISOString())
      .order('date_start', { ascending: true })
      .limit(5)
    setZadnjeRezervacije(rezervacije ?? [])
  }

  const PRIORITET_COLOR: Record<string, { bg: string, text: string, label: string }> = {
    hitno:    { bg: '#fee2e2', text: '#dc2626', label: 'Hitno' },
    visoko:   { bg: '#ffedd5', text: '#ea580c', label: 'Visoko' },
    normalno: { bg: '#f3f4f6', text: '#6b7280', label: 'Normalno' },
    nisko:    { bg: '#eff6ff', text: '#2563eb', label: 'Nisko' },
  }

  const TYPE_ICON: Record<string, string> = {
    odstrjel: '🎯', opazanje: '👁', skupni_lov: '👥', rad: '🔨', ostalo: '📝'
  }
  const TYPE_COLOR: Record<string, string> = {
    odstrjel: '#DC2626', opazanje: '#2563EB', skupni_lov: '#7C3AED', rad: '#D97706', ostalo: '#6B7280'
  }
  const POI_ICONS: Record<string, string> = {
    ceka: '🎯', hraniliste: '🌾', soliste: '🧂', kaljuziste: '💧', prolaz: '🚶', kamera: '📷', ostalo: '📍'
  }

  const danas = format(new Date(), 'EEEE, dd. MMMM yyyy.', { locale: hr })

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', margin: 0 }}>Naslovna</h1>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 0' }}>{danas}</p>
      </div>

      {/* Stats kartice */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Članova', value: stats.clanovi, color: '#2563EB', bg: '#eff6ff', icon: '👤' },
          { label: 'Čeka / POI', value: stats.poi, color: '#16A34A', bg: '#f0fdf4', icon: '📍' },
          { label: 'Aktiv. rezerv.', value: stats.rezervacije, color: '#D97706', bg: '#fffbeb', icon: '📅' },
          { label: 'Unosa dnevnik', value: stats.dnevnik, color: '#7C3AED', bg: '#faf5ff', icon: '📋' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 16, padding: '20px 20px 16px', border: `1px solid ${s.color}20` }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 13, color: s.color, marginTop: 4, opacity: 0.8 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Glavni grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Zadnji odstrjeli */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>🎯 Zadnji odstrjeli</span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{zadnjiOdstrjeli.length} unosa</span>
          </div>
          {zadnjiOdstrjeli.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Nema odstrjela</div>
          ) : zadnjiOdstrjeli.map(e => (
            <div key={e.id} style={{ padding: '12px 20px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🎯</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13, color: '#111827' }}>
                  {e.species} {e.spol && e.spol !== 'Nepoznato' && `· ${e.spol}`}
                  {e.starost && e.starost !== 'Nepoznato' && ` · ${e.starost}`}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                  {(e.profiles as any)?.full_name}
                  {(e.poi as any)?.name && ` · 📍 ${(e.poi as any).name}`}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{format(new Date(e.hunted_at), 'dd.MM.yyyy', { locale: hr })}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{format(new Date(e.hunted_at), 'HH:mm')}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Nadolazeće rezervacije */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>📅 Nadolazeće rezervacije</span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{zadnjeRezervacije.length} aktivnih</span>
          </div>
          {zadnjeRezervacije.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Nema rezervacija</div>
          ) : zadnjeRezervacije.map(r => {
            const isToday = new Date(r.date_start).toDateString() === new Date().toDateString()
            return (
              <div key={r.id} style={{ padding: '12px 20px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: isToday ? '#fff7ed' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {POI_ICONS[(r.poi as any)?.type] ?? '📍'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: '#111827' }}>
                    {(r.poi as any)?.name}
                    {isToday && <span style={{ marginLeft: 6, fontSize: 10, background: '#fff7ed', color: '#ea580c', padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>DANAS</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{(r.profiles as any)?.full_name}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{format(new Date(r.date_start), 'dd.MM.yyyy', { locale: hr })}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    {format(new Date(r.date_start), 'HH:mm')} – {format(new Date(r.date_end), 'HH:mm')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Otvoreni zadaci */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>📋 Otvoreni zadaci</span>
            <span style={{ fontSize: 12, background: otvoreniZadaci.length > 0 ? '#fee2e2' : '#f3f4f6', color: otvoreniZadaci.length > 0 ? '#dc2626' : '#9ca3af', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
              {otvoreniZadaci.length}
            </span>
          </div>
          {otvoreniZadaci.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>✓ Svi zadaci su završeni!</div>
          ) : otvoreniZadaci.map(z => {
            const pr = PRIORITET_COLOR[z.prioritet] ?? PRIORITET_COLOR.normalno
            const prekoracen = z.rok && new Date(z.rok) < new Date()
            return (
              <div key={z.id} style={{ padding: '12px 20px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: pr.text, marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: '#111827' }}>{z.naslov}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                    📍 {(z.poi as any)?.name}
                    {z.rok && (
                      <span style={{ marginLeft: 6, color: prekoracen ? '#dc2626' : '#9ca3af' }}>
                        · 📅 {format(new Date(z.rok), 'dd.MM.yyyy')}
                        {prekoracen && ' ⚠️'}
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: 10, background: pr.bg, color: pr.text, padding: '2px 8px', borderRadius: 10, fontWeight: 600, flexShrink: 0 }}>
                  {pr.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Zadnje aktivnosti dnevnika */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>📖 Aktivnosti dnevnika</span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>zadnjih {zadnjiDnevnik.length}</span>
          </div>
          {zadnjiDnevnik.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Nema aktivnosti</div>
          ) : zadnjiDnevnik.map(e => (
            <div key={e.id} style={{ padding: '10px 20px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{TYPE_ICON[e.type] ?? '📝'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 500, fontSize: 13, color: '#111827' }}>
                    {e.type === 'rad' || e.type === 'ostalo' ? (e.type === 'rad' ? 'Rad' : 'Ostalo') : e.species}
                  </span>
                  {e.quantity > 1 && e.type !== 'rad' && (
                    <span style={{ fontSize: 10, background: '#f3f4f6', color: '#6b7280', padding: '1px 6px', borderRadius: 10 }}>×{e.quantity}</span>
                  )}
                  <span style={{ fontSize: 10, background: TYPE_COLOR[e.type] + '20', color: TYPE_COLOR[e.type], padding: '1px 6px', borderRadius: 10, fontWeight: 500 }}>
                    {e.type === 'odstrjel' ? 'Odstrjel' : e.type === 'opazanje' ? 'Opažanje' : e.type === 'skupni_lov' ? 'Skupni lov' : e.type === 'rad' ? 'Rad' : 'Ostalo'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                  {(e.profiles as any)?.full_name}
                  {(e.poi as any)?.name && ` · 📍 ${(e.poi as any).name}`}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{format(new Date(e.hunted_at), 'dd.MM.', { locale: hr })}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{format(new Date(e.hunted_at), 'HH:mm')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function ProfilPage() {
  const [profile, setProfile] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [selectedMember, setSelectedMember] = useState<any>(null)
  const [view, setView] = useState<'list' | 'form'>('form')
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', address: '',
    li_broj: '', ol_brojevi: '', date_of_birth: '', member_since: '', notes: ''
  })
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: member } = await supabase
      .from('group_members').select('group_id, role').eq('user_id', user.id).single()
    if (!member) return

    const admin = member.role === 'admin'
    setIsAdmin(admin)

    const { data: prof } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()
    if (prof) { setProfile(prof); fillForm(prof) }

    if (admin) {
      // Dohvati group_members pa za svaki dohvati profile
      const { data: gms } = await supabase
        .from('group_members')
        .select('role, user_id')
        .eq('group_id', member.group_id)

      if (gms && gms.length > 0) {
        const userIds = gms.map(g => g.user_id)
        const { data: profs } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds)

        const combined = gms.map(g => ({
          role: g.role,
          profiles: profs?.find(p => p.id === g.user_id) ?? null
        }))
        setMembers(combined)
      }
      setView('list')
    }
  }

  function fillForm(prof: any) {
    setForm({
      full_name: prof.full_name ?? '',
      phone: prof.phone ?? '',
      email: prof.email ?? '',
      address: prof.address ?? '',
      li_broj: prof.li_broj ?? '',
      ol_brojevi: (prof.ol_brojevi ?? []).join(', '),
      date_of_birth: prof.date_of_birth ?? '',
      member_since: prof.member_since ?? '',
      notes: prof.notes ?? '',
    })
  }

  async function saveProfile() {
    const id = selectedMember?.profiles?.id ?? profile?.id
    if (!id) return
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name,
      phone: form.phone,
      address: form.address,
      li_broj: form.li_broj,
      ol_brojevi: form.ol_brojevi.split(',').map((s: string) => s.trim()).filter(Boolean),
      date_of_birth: form.date_of_birth || null,
      member_since: form.member_since || null,
      notes: form.notes,
    }).eq('id', id)
    if (error) { toast.error('Greška pri spremanju'); return }
    toast.success('Podaci spremljeni!')
    if (isAdmin) { setView('list'); setSelectedMember(null); load() }
  }

  function openMember(m: any) {
    setSelectedMember(m)
    fillForm(m.profiles)
    setView('form')
  }

  const ROLE_COLOR: Record<string, string> = {
    admin: '#DC2626', clan: '#16A34A', gost: '#6B7280'
  }

  const fields = [
    { key: 'full_name', label: 'Ime i prezime', type: 'text' },
    { key: 'email', label: 'Email', type: 'email', disabled: true },
    { key: 'phone', label: 'Mobitel', type: 'tel' },
    { key: 'address', label: 'Adresa', type: 'text' },
    { key: 'li_broj', label: 'LI broj (lovačka iskaznica)', type: 'text' },
    { key: 'ol_brojevi', label: 'OL brojevi (odvojeni zarezom)', type: 'text' },
    { key: 'date_of_birth', label: 'Datum rođenja', type: 'date' },
    { key: 'member_since', label: 'Član od', type: 'date' },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        {isAdmin && view === 'form' && (
          <button onClick={() => { setView('list'); setSelectedMember(null) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#6b7280' }}>‹</button>
        )}
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
          {view === 'list' ? 'Članovi lovišta' : selectedMember ? selectedMember.profiles?.full_name : 'Moj profil'}
        </h1>
        {isAdmin && view === 'list' && (
          <button onClick={() => { setSelectedMember(null); fillForm(profile); setView('form') }}
            style={{ marginLeft: 'auto', padding: '6px 16px', background: '#247a4b', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
            Moj profil
          </button>
        )}
      </div>

      {isAdmin && view === 'list' && (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          {members.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Učitavam članove...</div>
          )}
          {members.map((m, i) => {
            const prof = m.profiles
            return (
              <div key={i} onClick={() => openMember(m)}
                style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E8F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#16A34A', fontSize: 16 }}>
                    {prof?.full_name?.charAt(0) ?? '?'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{prof?.full_name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{prof?.email}</div>
                    {prof?.li_broj && <div style={{ fontSize: 12, color: '#6b7280' }}>LI: {prof.li_broj}</div>}
                    {prof?.phone && <div style={{ fontSize: 12, color: '#6b7280' }}>📱 {prof.phone}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, background: ROLE_COLOR[m.role] + '20', color: ROLE_COLOR[m.role], padding: '2px 10px', borderRadius: 20, fontWeight: 500 }}>
                    {m.role}
                  </span>
                  <span style={{ color: '#9ca3af', fontSize: 18 }}>›</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {view === 'form' && (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {fields.map(field => (
              <div key={field.key}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>
                  {field.label}
                </label>
                <input
                  type={field.type}
                  value={(form as any)[field.key]}
                  onChange={e => setForm(f => ({...f, [field.key]: e.target.value}))}
                  disabled={(field as any).disabled}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box', background: (field as any).disabled ? '#f9fafb' : 'white' }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Napomena</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box', resize: 'none' }}
              rows={3} />
          </div>
          <button onClick={saveProfile}
            style={{ marginTop: 20, background: '#247a4b', color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>
            Spremi podatke
          </button>
        </div>
      )}
    </div>
  )
}

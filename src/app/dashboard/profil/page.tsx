'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function ProfilPage() {
  const [profile, setProfile] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [editing, setEditing] = useState(false)
  const [selectedMember, setSelectedMember] = useState<any>(null)
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
    setIsAdmin(member.role === 'admin')

    const { data: prof } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()
    if (prof) {
      setProfile(prof)
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

    if (member.role === 'admin') {
      const { data: allMembers } = await supabase
        .from('group_members')
        .select('role, profiles(*)')
        .eq('group_id', member.group_id)
      setMembers(allMembers ?? [])
    }
  }

  async function saveProfile(profileId?: string) {
    const id = profileId ?? profile?.id
    if (!id) return
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name,
      phone: form.phone,
      address: form.address,
      li_broj: form.li_broj,
      ol_brojevi: form.ol_brojevi.split(',').map(s => s.trim()).filter(Boolean),
      date_of_birth: form.date_of_birth || null,
      member_since: form.member_since || null,
      notes: form.notes,
    }).eq('id', id)
    if (error) { toast.error('Greška pri spremanju'); return }
    toast.success('Podaci spremljeni!')
    setEditing(false)
    setSelectedMember(null)
    load()
  }

  function openMember(member: any) {
    const prof = member.profiles
    setSelectedMember({ ...member, id: prof.id })
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
    setEditing(true)
  }

  const ROLE_COLOR: Record<string, string> = {
    admin: '#DC2626', clan: '#16A34A', gost: '#6B7280'
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>
        {isAdmin ? 'Članovi lovišta' : 'Moj profil'}
      </h1>

      {/* Admin — lista članova */}
      {isAdmin && !editing && (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: 14 }}>
            Svi članovi ({members.length})
          </div>
          {members.map((m, i) => {
            const prof = m.profiles
            return (
              <div key={i} style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => openMember(m)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E8F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#16A34A', fontSize: 16 }}>
                    {prof?.full_name?.charAt(0) ?? '?'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{prof?.full_name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{prof?.email}</div>
                    {prof?.li_broj && <div style={{ fontSize: 12, color: '#6b7280' }}>LI: {prof.li_broj}</div>}
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

      {/* Form — moj profil ili uređivanje člana */}
      {(!isAdmin || editing) && (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: 24 }}>
          {editing && selectedMember && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
              <button onClick={() => { setEditing(false); setSelectedMember(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>‹</button>
              <span style={{ fontWeight: 600 }}>{form.full_name}</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { key: 'full_name', label: 'Ime i prezime', type: 'text' },
              { key: 'email', label: 'Email', type: 'email', disabled: true },
              { key: 'phone', label: 'Mobitel', type: 'tel' },
              { key: 'address', label: 'Adresa', type: 'text' },
              { key: 'li_broj', label: 'LI broj (lovačka iskaznica)', type: 'text' },
              { key: 'ol_brojevi', label: 'OL brojevi (odvojeni zarezom)', type: 'text' },
              { key: 'date_of_birth', label: 'Datum rođenja', type: 'date' },
              { key: 'member_since', label: 'Član od', type: 'date' },
            ].map(field => (
              <div key={field.key}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>
                  {field.label}
                </label>
                <input
                  type={field.type}
                  value={(form as any)[field.key]}
                  onChange={e => setForm(f => ({...f, [field.key]: e.target.value}))}
                  disabled={field.disabled}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box', background: field.disabled ? '#f9fafb' : 'white' }}
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

          <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
            <button onClick={() => saveProfile(selectedMember?.id)}
              style={{ background: '#247a4b', color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>
              Spremi
            </button>
            {!isAdmin && !editing && (
              <button onClick={() => setEditing(false)}
                style={{ background: 'white', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}>
                Odustani
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

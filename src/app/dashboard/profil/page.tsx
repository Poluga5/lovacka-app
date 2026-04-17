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
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', spol: '',
    address: '', li_broj: '', ol_brojevi: '',
    date_of_birth: '', member_since: '', member_until: '', notes: ''
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
    if (prof) {
      setProfile(prof)
      if (!admin) fillForm(prof)
    }

    if (admin) {
      const { data: gms } = await supabase
        .from('group_members')
        .select('id, role, user_id')
        .eq('group_id', member.group_id)

      if (gms && gms.length > 0) {
        const userIds = gms.map(g => g.user_id)
        const { data: profs } = await supabase
          .from('profiles').select('*').in('id', userIds)

        const combined = gms.map(g => ({
          id: g.id,
          role: g.role,
          user_id: g.user_id,
          profiles: profs?.find(p => p.id === g.user_id) ?? null
        }))
        setMembers(combined)
      }
      setView('list')
    }
    setLoading(false)
  }

  function fillForm(prof: any) {
    setForm({
      full_name: prof.full_name ?? '',
      phone: prof.phone ?? '',
      email: prof.email ?? '',
      spol: prof.spol ?? '',
      address: prof.address ?? '',
      li_broj: prof.li_broj ?? '',
      ol_brojevi: (prof.ol_brojevi ?? []).join(', '),
      date_of_birth: prof.date_of_birth ?? '',
      member_since: prof.member_since ?? '',
      member_until: prof.member_until ?? '',
      notes: prof.notes ?? '',
    })
  }

  async function saveProfile() {
    const id = selectedMember?.user_id ?? profile?.id
    if (!id) return
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name,
      phone: form.phone || null,
      spol: form.spol || null,
      address: form.address || null,
      li_broj: form.li_broj || null,
      ol_brojevi: form.ol_brojevi.split(',').map((s: string) => s.trim()).filter(Boolean),
      date_of_birth: form.date_of_birth || null,
      member_since: form.member_since || null,
      member_until: form.member_until || null,
      notes: form.notes || null,
    }).eq('id', id)
    if (error) { toast.error('Greška pri spremanju'); return }
    toast.success('Podaci spremljeni!')
    if (isAdmin) {
      setView('list')
      setSelectedMember(null)
      load()
    }
  }

  function openMember(m: any) {
    setSelectedMember(m)
    fillForm(m.profiles ?? {})
    setView('form')
  }

  const ROLE_COLOR: Record<string, { bg: string, text: string }> = {
    admin: { bg: '#fee2e2', text: '#dc2626' },
    clan:  { bg: '#d1fae5', text: '#065f46' },
    gost:  { bg: '#f3f4f6', text: '#6b7280' },
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
  const labelCls = "text-sm font-medium text-gray-700 mb-1 block"

  if (loading) return <div className="p-6 text-center text-gray-400">Učitavam...</div>

  return (
    <div className="p-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {isAdmin && view === 'form' && (
          <button onClick={() => { setView('list'); setSelectedMember(null) }}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none">‹</button>
        )}
        <h1 className="text-2xl font-bold text-gray-900 flex-1">
          {view === 'list' ? 'Članovi lovišta' : selectedMember ? (selectedMember.profiles?.full_name ?? 'Član') : 'Moj profil'}
        </h1>
        {isAdmin && view === 'list' && (
          <button onClick={() => { setSelectedMember(null); fillForm(profile); setView('form') }}
            className="bg-forest-600 hover:bg-forest-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            Moj profil
          </button>
        )}
      </div>

      {/* Lista članova */}
      {isAdmin && view === 'list' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-100 text-xs text-gray-400 font-medium">
            {members.length} članova
          </div>
          {members.map(m => {
            const prof = m.profiles
            const roleColor = ROLE_COLOR[m.role] ?? ROLE_COLOR.gost
            return (
              <div key={m.id} onClick={() => openMember(m)}
                className="px-6 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                <div className="w-11 h-11 rounded-full bg-forest-100 flex items-center justify-center font-bold text-forest-700 text-base flex-shrink-0">
                  {prof?.full_name?.charAt(0) ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-800">{prof?.full_name ?? 'Nepoznato'}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{prof?.email}</div>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-400">
                    {prof?.spol && <span>⚥ {prof.spol}</span>}
                    {prof?.li_broj && <span>LI: {prof.li_broj}</span>}
                    {prof?.phone && <span>📱 {prof.phone}</span>}
                    {prof?.address && <span>📍 {prof.address}</span>}
                    {prof?.member_since && <span>Član od: {prof.member_since}</span>}
                    {prof?.member_until && <span>Član do: {prof.member_until}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: roleColor.bg, color: roleColor.text }}>
                    {m.role}
                  </span>
                  <span className="text-gray-300 text-lg">›</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Forma */}
      {view === 'form' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Avatar header */}
          <div className="px-6 py-6 border-b border-gray-100 flex items-center gap-4 bg-gradient-to-r from-forest-50 to-white">
            <div className="w-16 h-16 rounded-full bg-forest-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
              {form.full_name?.charAt(0) ?? '?'}
            </div>
            <div>
              <div className="font-semibold text-gray-800 text-lg">{form.full_name || 'Novi profil'}</div>
              <div className="text-sm text-gray-400">{form.email}</div>
              {selectedMember && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block"
                  style={{ background: ROLE_COLOR[selectedMember.role]?.bg, color: ROLE_COLOR[selectedMember.role]?.text }}>
                  {selectedMember.role}
                </span>
              )}
            </div>
          </div>

          <div className="p-6 space-y-4">

            {/* Osobni podaci */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Osobni podaci</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className={labelCls}>Ime i prezime</label>
                  <input type="text" value={form.full_name}
                    onChange={e => setForm(f => ({...f, full_name: e.target.value}))}
                    className={inputCls} placeholder="npr. Pero Perić" />
                </div>
                <div>
                  <label className={labelCls}>Spol</label>
                  <select value={form.spol} onChange={e => setForm(f => ({...f, spol: e.target.value}))} className={inputCls}>
                    <option value="">Odaberi...</option>
                    <option value="Muško">Muško</option>
                    <option value="Žensko">Žensko</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Datum rođenja</label>
                  <input type="date" value={form.date_of_birth}
                    onChange={e => setForm(f => ({...f, date_of_birth: e.target.value}))}
                    className={inputCls} />
                </div>
                <div className="md:col-span-2">
                  <label className={labelCls}>Email</label>
                  <input type="email" value={form.email} disabled
                    className={`${inputCls} bg-gray-50 text-gray-400 cursor-not-allowed`} />
                </div>
                <div>
                  <label className={labelCls}>Mobitel</label>
                  <input type="tel" value={form.phone}
                    onChange={e => setForm(f => ({...f, phone: e.target.value}))}
                    className={inputCls} placeholder="npr. 099 123 4567" />
                </div>
                <div className="md:col-span-2">
                  <label className={labelCls}>Adresa stanovanja</label>
                  <input type="text" value={form.address}
                    onChange={e => setForm(f => ({...f, address: e.target.value}))}
                    className={inputCls} placeholder="npr. Ulica 1, 10000 Zagreb" />
                </div>
              </div>
            </div>

            {/* Lovački podaci */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Lovački podaci</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>LI broj — Lovačka iskaznica</label>
                  <input type="text" value={form.li_broj}
                    onChange={e => setForm(f => ({...f, li_broj: e.target.value}))}
                    className={inputCls} placeholder="npr. 123456" />
                </div>
                <div>
                  <label className={labelCls}>OL brojevi — Oružni listovi (zarezom)</label>
                  <input type="text" value={form.ol_brojevi}
                    onChange={e => setForm(f => ({...f, ol_brojevi: e.target.value}))}
                    className={inputCls} placeholder="npr. OL-123, OL-456" />
                </div>
                <div>
                  <label className={labelCls}>Član od</label>
                  <input type="date" value={form.member_since}
                    onChange={e => setForm(f => ({...f, member_since: e.target.value}))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Član do</label>
                  <input type="date" value={form.member_until}
                    onChange={e => setForm(f => ({...f, member_until: e.target.value}))}
                    className={inputCls} />
                </div>
              </div>
            </div>

            {/* Napomena */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Napomena</h3>
              <textarea value={form.notes}
                onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                className={inputCls} rows={3}
                placeholder="Npr. počasni član od 2010., bivši predsjednik..." />
            </div>

            {/* Gumbi */}
            <div className="flex gap-3 pt-2">
              <button onClick={saveProfile}
                className="bg-forest-600 hover:bg-forest-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">
                Spremi podatke
              </button>
              {isAdmin && (
                <button onClick={() => { setView('list'); setSelectedMember(null) }}
                  className="border border-gray-200 hover:bg-gray-50 text-gray-700 px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">
                  Odustani
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

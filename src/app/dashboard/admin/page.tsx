'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function AdminPage() {
  const [clubName, setClubName] = useState('')
  const [members, setMembers] = useState<any[]>([])
  const [stats, setStats] = useState({ clanovi: 0, rezervacije: 0, dnevnik: 0, lovci: 0, zadaci: 0 })
  const [inviteEmail, setInviteEmail] = useState('')
  const [groupId, setGroupId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: member } = await supabase
      .from('group_members').select('group_id, role').eq('user_id', user.id).single()
    if (!member || member.role !== 'admin') { setIsAdmin(false); setLoading(false); return }
    setIsAdmin(true)
    setGroupId(member.group_id)

    const { data: settings } = await supabase
      .from('app_settings').select('value').eq('key', 'club_name').single()
    if (settings) setClubName(settings.value)

    const { data: allMembers } = await supabase
      .from('group_members')
      .select('id, role, user_id, profiles(full_name, email, avatar_url)')
      .eq('group_id', member.group_id)
    setMembers(allMembers ?? [])

    const [resCount, dnevnikCount, lovciCount, zadaciCount] = await Promise.all([
      supabase.from('reservations').select('id', { count: 'exact' }).eq('group_id', member.group_id).eq('status', 'aktivna'),
      supabase.from('entries').select('id', { count: 'exact' }).eq('group_id', member.group_id),
      supabase.from('lovci').select('id', { count: 'exact' }).eq('group_id', member.group_id),
      supabase.from('poi_zadaci').select('id', { count: 'exact' }).eq('group_id', member.group_id).eq('status', 'otvoreno'),
    ])

    setStats({
      clanovi: allMembers?.length ?? 0,
      rezervacije: resCount.count ?? 0,
      dnevnik: dnevnikCount.count ?? 0,
      lovci: lovciCount.count ?? 0,
      zadaci: zadaciCount.count ?? 0,
    })
    setLoading(false)
  }

  async function saveClubName() {
    if (!clubName.trim()) return
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'club_name', value: clubName.trim() }, { onConflict: 'key' })
    if (error) { toast.error('Greška'); return }
    toast.success('Naziv kluba spremljen!')
  }

  async function changeRole(memberId: string, newRole: string) {
    const { error } = await supabase.from('group_members')
      .update({ role: newRole }).eq('id', memberId)
    if (error) { toast.error('Greška'); return }
    toast.success('Rola promijenjena!')
    setMembers(m => m.map(mem => mem.id === memberId ? { ...mem, role: newRole } : mem))
  }

  async function removeMember(memberId: string, name: string) {
    if (!confirm(`Ukloni ${name} iz grupe?`)) return
    const { error } = await supabase.from('group_members').delete().eq('id', memberId)
    if (error) { toast.error('Greška'); return }
    toast.success(`${name} uklonjen iz grupe!`)
    setMembers(m => m.filter(mem => mem.id !== memberId))
    setStats(s => ({ ...s, clanovi: s.clanovi - 1 }))
  }

  async function sendInvite() {
    if (!inviteEmail.trim() || !groupId) return
    await fetch('/api/posalji-obavijest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        ime: 'Lovač',
        tip: 'pozivnica',
        club_name: clubName,
        group_id: groupId,
      })
    })
    toast.success(`Pozivnica poslana na ${inviteEmail}!`)
    setInviteEmail('')
  }

  const ROLE_COLOR: Record<string, { bg: string, text: string }> = {
    admin: { bg: '#fee2e2', text: '#dc2626' },
    clan:  { bg: '#d1fae5', text: '#065f46' },
    gost:  { bg: '#f3f4f6', text: '#6b7280' },
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Učitavam...</div>

  if (!isAdmin) return (
    <div className="p-6 text-center">
      <div className="text-4xl mb-4">🔒</div>
      <p className="text-gray-500">Nemate pristup admin panelu.</p>
    </div>
  )

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Admin panel</h1>

      {/* Statistike */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Članova',      value: stats.clanovi,    color: '#2563EB', bg: '#eff6ff' },
          { label: 'Rezervacije',  value: stats.rezervacije, color: '#D97706', bg: '#fffbeb' },
          { label: 'Dnevnik',      value: stats.dnevnik,    color: '#DC2626', bg: '#fef2f2' },
          { label: 'Lovci',        value: stats.lovci,      color: '#16A34A', bg: '#f0fdf4' },
          { label: 'Otv. zadaci',  value: stats.zadaci,     color: '#7C3AED', bg: '#faf5ff' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}20` }}
            className="rounded-2xl p-4">
            <div style={{ color: s.color }} className="text-2xl font-bold">{s.value}</div>
            <div style={{ color: s.color }} className="text-xs mt-1 opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Postavke kluba */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">⚙️ Postavke kluba</h2>
        </div>
        <div className="p-6">
          <label className="text-sm font-medium text-gray-700 mb-2 block">Naziv lovačkog društva</label>
          <div className="flex gap-3">
            <input value={clubName} onChange={e => setClubName(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              placeholder="npr. LD Kuna Osekovo" />
            <button onClick={saveClubName}
              className="bg-forest-600 hover:bg-forest-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">
              Spremi
            </button>
          </div>
        </div>
      </div>

      {/* Upravljanje članovima */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">👥 Upravljanje članovima ({members.length})</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {members.map(m => {
            const prof = m.profiles as any
            const roleColor = ROLE_COLOR[m.role] ?? ROLE_COLOR.gost
            return (
              <div key={m.id} className="px-6 py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-forest-100 flex items-center justify-center font-bold text-forest-700 text-sm flex-shrink-0">
                  {prof?.full_name?.charAt(0) ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-800">{prof?.full_name ?? 'Nepoznato'}</div>
                  <div className="text-xs text-gray-400">{prof?.email}</div>
                </div>
                <select
                  value={m.role}
                  onChange={e => changeRole(m.id, e.target.value)}
                  style={{ background: roleColor.bg, color: roleColor.text }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-forest-500">
                  <option value="admin">Admin</option>
                  <option value="clan">Član</option>
                  <option value="gost">Gost</option>
                </select>
                <button onClick={() => removeMember(m.id, prof?.full_name ?? 'člana')}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm">
                  🗑
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pozivnice */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">✉️ Pošalji pozivnicu</h2>
          <p className="text-xs text-gray-400 mt-1">Novi lovač će dobiti email s uputama za registraciju</p>
        </div>
        <div className="p-6">
          <div className="flex gap-3">
            <input
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendInvite()}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              placeholder="email@primjer.hr"
              type="email"
            />
            <button onClick={sendInvite}
              disabled={!inviteEmail.trim()}
              className="bg-forest-600 hover:bg-forest-700 disabled:bg-gray-200 disabled:text-gray-400 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">
              Pošalji
            </button>
          </div>
        </div>
      </div>

      {/* Opasna zona */}
      <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-red-100">
          <h2 className="font-semibold text-red-700">⚠️ Opasna zona</h2>
        </div>
        <div className="p-6 space-y-3">
          <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl">
            <div>
              <div className="text-sm font-medium text-gray-800">Obriši sve rezervacije</div>
              <div className="text-xs text-gray-400">Briše sve otkazane rezervacije starije od 30 dana</div>
            </div>
            <button onClick={async () => {
              if (!confirm('Jesi li siguran? Ovo se ne može poništiti!')) return
              const cutoff = new Date()
              cutoff.setDate(cutoff.getDate() - 30)
              await supabase.from('reservations').delete()
                .eq('group_id', groupId!).eq('status', 'otkazana')
                .lt('created_at', cutoff.toISOString())
              toast.success('Stare rezervacije obrisane!')
            }}
              className="text-sm text-red-600 hover:bg-red-100 px-4 py-2 rounded-lg transition-colors font-medium">
              Očisti
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

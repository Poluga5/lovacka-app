'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function AdminPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [members, setMembers] = useState<any[]>([])
  const [inviteLink, setInviteLink] = useState('')
  const [groupId, setGroupId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeTab, setActiveTab] = useState<'settings'|'members'|'invite'>('settings')
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: member } = await supabase
      .from('group_members').select('group_id, role').eq('user_id', user.id).single()
    if (!member) return
    setGroupId(member.group_id)
    setIsAdmin(member.role === 'admin')

    const [settingsRes, membersRes] = await Promise.all([
      supabase.from('app_settings').select('key, value'),
      supabase.from('group_members')
        .select('*, profiles(full_name, email)')
        .eq('group_id', member.group_id)
    ])

    const settingsMap: Record<string, string> = {}
    settingsRes.data?.forEach(s => { settingsMap[s.key] = s.value })
    setSettings(settingsMap)
    setMembers(membersRes.data ?? [])
  }

  async function saveSettings() {
    const updates = Object.entries(settings).map(([key, value]) =>
      supabase.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key)
    )
    await Promise.all(updates)
    toast.success('Postavke spremljene!')
  }

  async function generateInvite(role: string) {
    if (!groupId || !userId) return
    const { data, error } = await supabase.from('invitations').insert({
      group_id: groupId,
      role,
      created_by: userId,
    }).select('token').single()

    if (error || !data) { toast.error('Greška'); return }
    const link = `${window.location.origin}/register?token=${data.token}`
    setInviteLink(link)
  }

  async function changeRole(memberId: string, newRole: string) {
    await supabase.from('group_members').update({ role: newRole }).eq('id', memberId)
    toast.success('Uloga promijenjena')
    load()
  }

  async function removeMember(memberId: string, memberUserId: string) {
    if (memberUserId === userId) { toast.error('Ne možeš ukloniti sebe'); return }
    if (!confirm('Jesi li siguran?')) return
    await supabase.from('group_members').delete().eq('id', memberId)
    toast.success('Član uklonjen')
    load()
  }

  const TABS = [
    { key: 'settings', label: 'Postavke kluba' },
    { key: 'members', label: `Članovi (${members.length})` },
    { key: 'invite', label: 'Pozivnice' },
  ]

  const ROLE_BADGE: Record<string, string> = {
    admin: 'bg-red-100 text-red-700',
    clan: 'bg-forest-100 text-forest-700',
    gost: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Administracija</h1>

      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-6">
          <p className="text-amber-800 text-sm">Neke opcije dostupne su samo administratorima.</p>
        </div>
      )}

      <div className="flex border-b border-gray-200 mb-6 gap-0">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-forest-600 text-forest-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'settings' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          {[
            { key: 'club_name', label: 'Naziv kluba' },
            { key: 'club_subtitle', label: 'Podnaziv' },
            { key: 'club_location', label: 'Lokacija' },
          ].map(field => (
            <div key={field.key}>
              <label className="text-sm font-medium text-gray-700 mb-1 block">{field.label}</label>
              <input
                value={settings[field.key] ?? ''}
                onChange={e => setSettings(s => ({...s, [field.key]: e.target.value}))}
                disabled={!isAdmin}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 disabled:bg-gray-50"
              />
            </div>
          ))}
          {isAdmin && (
            <button onClick={saveSettings}
              className="bg-forest-600 hover:bg-forest-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">
              Spremi postavke
            </button>
          )}
        </div>
      )}

      {activeTab === 'members' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="divide-y divide-gray-50">
            {members.map(member => (
              <div key={member.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-forest-100 rounded-full flex items-center justify-center text-forest-700 font-bold text-sm">
                    {member.profiles?.full_name?.charAt(0) ?? '?'}
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-800">{member.profiles?.full_name}</p>
                    <p className="text-xs text-gray-400">{member.profiles?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_BADGE[member.role]}`}>
                    {member.role}
                  </span>
                  {isAdmin && member.user_id !== userId && (
                    <div className="flex gap-2">
                      <select value={member.role}
                        onChange={e => changeRole(member.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1">
                        <option value="admin">admin</option>
                        <option value="clan">clan</option>
                        <option value="gost">gost</option>
                      </select>
                      <button onClick={() => removeMember(member.id, member.user_id)}
                        className="text-xs text-red-500 hover:text-red-700">Ukloni</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'invite' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <p className="text-sm text-gray-600 mb-4">
            Generiraj pozivni link koji vrijedi 7 dana. Pošalji ga novom članu.
          </p>
          <div className="flex gap-3 mb-4">
            <button onClick={() => generateInvite('clan')} disabled={!isAdmin}
              className="bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
              Pozivnica za člana
            </button>
            <button onClick={() => generateInvite('gost')} disabled={!isAdmin}
              className="border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
              Pozivnica za gosta
            </button>
          </div>

          {inviteLink && (
            <div className="bg-forest-50 rounded-xl p-4">
              <p className="text-xs font-medium text-forest-700 mb-2">Pozivni link:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-forest-800 break-all flex-1">{inviteLink}</code>
                <button onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success('Link kopiran!') }}
                  className="text-xs bg-forest-600 text-white px-3 py-1.5 rounded-lg flex-shrink-0">
                  Kopiraj
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

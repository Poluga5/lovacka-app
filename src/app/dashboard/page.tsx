'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { hr } from 'date-fns/locale'
import type { Activity } from '@/types'

const ACTION_LABELS: Record<string, string> = {
  'reservation.created': 'rezervirao čeku',
  'reservation.cancelled': 'otkazao rezervaciju',
  'entry.created': 'dodao unos u dnevnik',
  'poi.created': 'dodao novi POI',
  'poi.updated': 'uredio POI',
  'member.invited': 'pozvao novog člana',
}

export default function DashboardPage() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [stats, setStats] = useState({ members: 0, pois: 0, reservations: 0, entries: 0 })
  const [loading, setLoading] = useState(true)
  const [groupId, setGroupId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from('group_members').select('group_id').eq('user_id', user.id).single()
      if (!member) return
      setGroupId(member.group_id)

      const [actRes, memRes, poiRes, resRes, entRes] = await Promise.all([
        supabase.from('activity').select('*, profiles(full_name)')
          .eq('group_id', member.group_id).order('created_at', { ascending: false }).limit(20),
        supabase.from('group_members').select('id', { count: 'exact' }).eq('group_id', member.group_id),
        supabase.from('poi').select('id', { count: 'exact' }).eq('group_id', member.group_id),
        supabase.from('reservations').select('id', { count: 'exact' }).eq('group_id', member.group_id).eq('status', 'aktivna'),
        supabase.from('entries').select('id', { count: 'exact' }).eq('group_id', member.group_id),
      ])

      setActivities(actRes.data ?? [])
      setStats({
        members: memRes.count ?? 0,
        pois: poiRes.count ?? 0,
        reservations: resRes.count ?? 0,
        entries: entRes.count ?? 0,
      })
      setLoading(false)
    }
    load()
  }, [])

  const STATS = [
    { label: 'Članova', value: stats.members, color: 'bg-blue-50 text-blue-700' },
    { label: 'Čeka/POI', value: stats.pois, color: 'bg-forest-50 text-forest-700' },
    { label: 'Aktiv. rezerv.', value: stats.reservations, color: 'bg-amber-50 text-amber-700' },
    { label: 'Unosa dnevnik', value: stats.entries, color: 'bg-purple-50 text-purple-700' },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Pregled</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {STATS.map(s => (
          <div key={s.label} className={`rounded-2xl p-4 ${s.color}`}>
            <p className="text-3xl font-bold">{loading ? '–' : s.value}</p>
            <p className="text-sm font-medium mt-1 opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Nedavne aktivnosti</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {loading && (
            <div className="px-6 py-8 text-center text-gray-400">Učitavam...</div>
          )}
          {!loading && activities.length === 0 && (
            <div className="px-6 py-8 text-center text-gray-400">Nema još aktivnosti</div>
          )}
          {activities.map(act => (
            <div key={act.id} className="px-6 py-4 flex items-start gap-3">
              <div className="w-8 h-8 bg-forest-100 rounded-full flex items-center justify-center text-forest-700 text-xs font-bold flex-shrink-0 mt-0.5">
                {(act.profiles as any)?.full_name?.charAt(0) ?? '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800">
                  <span className="font-medium">{(act.profiles as any)?.full_name ?? 'Korisnik'}</span>
                  {' '}{ACTION_LABELS[act.action] ?? act.action}
                  {act.meta && (act.meta as any).name && (
                    <span className="font-medium text-forest-700"> — {(act.meta as any).name}</span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {format(new Date(act.created_at), 'dd. MMM yyyy, HH:mm', { locale: hr })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

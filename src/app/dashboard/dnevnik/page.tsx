'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { hr } from 'date-fns/locale'
import toast from 'react-hot-toast'
import type { Entry } from '@/types'

const VRSTE_DIVLJACI = [
  'Srna','Jelen','Divlja svinja','Zec','Fazan','Patka','Lisica',
  'Jazavac','Kuna','Tvor','Vrana','Svraka','Šojka','Ostalo'
]

export default function DnevnikPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [showForm, setShowForm] = useState(false)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [form, setForm] = useState({
    type: 'odstrjel', species: '', quantity: 1,
    notes: '', hunted_at: new Date().toISOString().slice(0,16)
  })
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data: member } = await supabase
      .from('group_members').select('group_id').eq('user_id', user.id).single()
    if (!member) return
    setGroupId(member.group_id)

    const { data } = await supabase
      .from('entries').select('*, profiles(full_name)')
      .eq('group_id', member.group_id)
      .order('hunted_at', { ascending: false })
    setEntries(data ?? [])
  }

  async function saveEntry() {
    if (!form.species || !groupId || !userId) return
    const { error } = await supabase.from('entries').insert({
      group_id: groupId,
      user_id: userId,
      type: form.type,
      species: form.species,
      quantity: form.quantity,
      notes: form.notes,
      hunted_at: new Date(form.hunted_at).toISOString(),
    })
    if (error) { toast.error('Greška pri unosu'); return }
    toast.success('Unos dodan!')
    setShowForm(false)
    setForm({ type: 'odstrjel', species: '', quantity: 1, notes: '', hunted_at: new Date().toISOString().slice(0,16) })
    load()
  }

  async function exportCSV() {
    const headers = ['Datum','Vrsta unosa','Vrsta divljači','Količina','Korisnik','Bilješka']
    const rows = entries.map(e => [
      format(new Date(e.hunted_at), 'dd.MM.yyyy HH:mm'),
      e.type, e.species, e.quantity,
      (e.profiles as any)?.full_name ?? '',
      e.notes ?? ''
    ])
    const csv = [headers, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `dnevnik-lova-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    toast.success('CSV preuzet!')
  }

  const TYPE_BADGE: Record<string, string> = {
    odstrjel: 'bg-red-100 text-red-700',
    opazanje: 'bg-blue-100 text-blue-700',
    rad: 'bg-amber-100 text-amber-700',
    ostalo: 'bg-gray-100 text-gray-600',
  }
  const TYPE_ICON: Record<string, string> = {
    odstrjel: '🎯', opazanje: '👁', rad: '🔨', ostalo: '📝'
  }

  const filtered = entries.filter(e =>
    !filter || e.species.toLowerCase().includes(filter.toLowerCase()) ||
    (e.profiles as any)?.full_name?.toLowerCase().includes(filter.toLowerCase())
  )

  const totalOdstrjel = entries.filter(e => e.type === 'odstrjel').reduce((a, e) => a + e.quantity, 0)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dnevnik lova</h1>
        <div className="flex gap-2">
          <button onClick={exportCSV}
            className="border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            Izvoz CSV
          </button>
          <button onClick={() => setShowForm(true)}
            className="bg-forest-600 hover:bg-forest-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            + Novi unos
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-red-50 rounded-2xl p-4">
          <p className="text-2xl font-bold text-red-700">{totalOdstrjel}</p>
          <p className="text-sm text-red-600 mt-1">Ukupno odstrjeljeno</p>
        </div>
        <div className="bg-blue-50 rounded-2xl p-4">
          <p className="text-2xl font-bold text-blue-700">{entries.filter(e => e.type === 'opazanje').length}</p>
          <p className="text-sm text-blue-600 mt-1">Opažanja</p>
        </div>
        <div className="bg-forest-50 rounded-2xl p-4">
          <p className="text-2xl font-bold text-forest-700">{entries.length}</p>
          <p className="text-sm text-forest-600 mt-1">Ukupno unosa</p>
        </div>
      </div>

      {/* Filter */}
      <input value={filter} onChange={e => setFilter(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-forest-500"
        placeholder="Pretraži po vrsti ili lovcu..." />

      {/* Entries */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400">Nema unosa</div>
          ) : filtered.map(entry => (
            <div key={entry.id} className="px-6 py-4 flex items-start gap-4">
              <span className="text-2xl mt-0.5">{TYPE_ICON[entry.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800">{entry.species}</span>
                  {entry.quantity > 1 && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">×{entry.quantity}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[entry.type]}`}>
                    {entry.type}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {format(new Date(entry.hunted_at), 'dd. MMM yyyy, HH:mm', { locale: hr })}
                  {' · '}{(entry.profiles as any)?.full_name}
                </p>
                {entry.notes && <p className="text-sm text-gray-600 mt-1">{entry.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* New entry modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-800 text-lg">Novi unos</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Vrsta unosa</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(TYPE_ICON).map(([t, icon]) => (
                    <button key={t} onClick={() => setForm(f => ({...f, type: t}))}
                      className={`py-2 rounded-xl text-sm border transition-colors ${
                        form.type === t ? 'bg-forest-600 text-white border-forest-600' : 'border-gray-200 hover:border-forest-300'
                      }`}>
                      <span className="block text-lg">{icon}</span>
                      <span className="text-xs">{t}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Vrsta divljači</label>
                <select value={form.species} onChange={e => setForm(f => ({...f, species: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500">
                  <option value="">Odaberi vrstu...</option>
                  {VRSTE_DIVLJACI.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Količina</label>
                  <input type="number" min="1" value={form.quantity}
                    onChange={e => setForm(f => ({...f, quantity: parseInt(e.target.value)}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Datum i vrijeme</label>
                  <input type="datetime-local" value={form.hunted_at}
                    onChange={e => setForm(f => ({...f, hunted_at: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Bilješka</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  rows={2} placeholder="Npr. lijepo jutro, jugozapadni vjetar..." />
              </div>
              <button onClick={saveEntry}
                className="w-full bg-forest-600 hover:bg-forest-700 text-white font-medium py-3 rounded-xl transition-colors">
                Spremi unos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

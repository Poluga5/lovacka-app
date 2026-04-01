'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { hr } from 'date-fns/locale'
import toast from 'react-hot-toast'

const VRSTE_DIVLJACI = [
  'Srna', 'Jelen', 'Divlja svinja', 'Zec', 'Fazan', 'Patka', 'Divlja guska',
  'Lisica', 'Jazavac', 'Kuna', 'Tvor', 'Vrana', 'Svraka', 'Šojka',
  'Golub divlji', 'Prepelica', 'Šljuka', 'Bekasina', 'Ostalo'
]
const TROFEJNE_VRSTE = ['Jelen', 'Srna', 'Divlja svinja']
const NACIN_LOVA = ['Čeka', 'Prikrada', 'Potjera', 'Izgon', 'Skupni lov', 'Hrt', 'Ostalo']
const VJETAR = ['Bez vjetra', 'Slab', 'Umjeren', 'Jak']
const VIDLJIVOST = ['Odlična', 'Dobra', 'Slaba', 'Magla']
const SPOL = ['Muško', 'Žensko', 'Nepoznato']
const STAROST = ['Odraslo', 'Podmladak', 'Nepoznato']

type EntryType = 'odstrjel' | 'opazanje' | 'skupni_lov' | 'rad' | 'ostalo'

const TYPES: { key: EntryType, icon: string, label: string, color: string }[] = [
  { key: 'odstrjel', icon: '🎯', label: 'Odstrjel', color: '#DC2626' },
  { key: 'opazanje', icon: '👁', label: 'Opažanje', color: '#2563EB' },
  { key: 'skupni_lov', icon: '👥', label: 'Skupni lov', color: '#7C3AED' },
  { key: 'rad', icon: '🔨', label: 'Rad', color: '#D97706' },
  { key: 'ostalo', icon: '📝', label: 'Ostalo', color: '#6B7280' },
]

export default function DnevnikPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [pois, setPois] = useState<any[]>([])
  const [lovci, setLovci] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [filterType, setFilterType] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [entryType, setEntryType] = useState<EntryType>('odstrjel')

  const [form, setForm] = useState({
    species: '', quantity: 1, spol: 'Nepoznato', starost: 'Odraslo',
    nacin_lova: 'Čeka', oruzje: '', municija: '',
    masa_trupla: '', trofej_duzina: '', trofej_masa: '', trofej_cic: '',
    temperatura: '', vjetar: 'Bez vjetra', vidljivost: 'Odlična',
    poi_id: '', notes: '',
    hunted_at: new Date().toISOString().slice(0, 16),
    sudionici: [] as string[],
  })

  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data: member } = await supabase.from('group_members').select('group_id').eq('user_id', user.id).single()
    if (!member) return
    setGroupId(member.group_id)

    const [entriesRes, poisRes, lovciRes] = await Promise.all([
      supabase.from('entries').select('*, profiles(full_name), poi(name)')
        .eq('group_id', member.group_id).order('hunted_at', { ascending: false }),
      supabase.from('poi').select('id, name, type').eq('group_id', member.group_id).eq('is_active', true),
      supabase.from('lovci').select('id, full_name').eq('group_id', member.group_id).eq('status', 'aktivan').order('full_name'),
    ])
    setEntries(entriesRes.data ?? [])
    setPois(poisRes.data ?? [])
    setLovci(lovciRes.data ?? [])
  }

  function resetForm() {
    setForm({
      species: '', quantity: 1, spol: 'Nepoznato', starost: 'Odraslo',
      nacin_lova: 'Čeka', oruzje: '', municija: '',
      masa_trupla: '', trofej_duzina: '', trofej_masa: '', trofej_cic: '',
      temperatura: '', vjetar: 'Bez vjetra', vidljivost: 'Odlična',
      poi_id: '', notes: '', hunted_at: new Date().toISOString().slice(0, 16),
      sudionici: [],
    })
    setEntryType('odstrjel')
  }

  async function saveEntry() {
    if (entryType !== 'rad' && entryType !== 'ostalo' && !form.species) {
      toast.error('Vrsta divljači je obavezna!')
      return
    }
    if (!groupId || !userId) return

    const { error } = await supabase.from('entries').insert({
      group_id: groupId, user_id: userId,
      type: entryType,
      species: form.species || '-',
      quantity: form.quantity,
      spol: form.spol,
      starost: form.starost,
      nacin_lova: form.nacin_lova,
      oruzje: form.oruzje || null,
      municija: form.municija || null,
      masa_trupla: form.masa_trupla ? parseFloat(form.masa_trupla) : null,
      trofej_duzina: form.trofej_duzina ? parseFloat(form.trofej_duzina) : null,
      trofej_masa: form.trofej_masa ? parseFloat(form.trofej_masa) : null,
      trofej_cic: form.trofej_cic ? parseFloat(form.trofej_cic) : null,
      temperatura: form.temperatura ? parseFloat(form.temperatura) : null,
      vjetar: form.vjetar,
      vidljivost: form.vidljivost,
      poi_id: form.poi_id || null,
      notes: form.notes || null,
      hunted_at: new Date(form.hunted_at).toISOString(),
      sudionici: form.sudionici,
    })
    if (error) { toast.error('Greška pri unosu'); console.error(error); return }
    toast.success('Unos dodan!')
    setShowForm(false)
    resetForm()
    load()
  }

  async function exportCSV() {
    const headers = ['Datum', 'Tip', 'Vrsta', 'Količina', 'Spol', 'Starost', 'Način lova',
      'Lokacija', 'Oružje', 'Municija', 'Masa (kg)', 'Trofej dužina', 'Trofej masa', 'CIC',
      'Temp (°C)', 'Vjetar', 'Vidljivost', 'Lovac', 'Bilješka']
    const rows = entries.map(e => [
      format(new Date(e.hunted_at), 'dd.MM.yyyy HH:mm'),
      e.type, e.species, e.quantity, e.spol ?? '', e.starost ?? '', e.nacin_lova ?? '',
      (e.poi as any)?.name ?? '', e.oruzje ?? '', e.municija ?? '',
      e.masa_trupla ?? '', e.trofej_duzina ?? '', e.trofej_masa ?? '', e.trofej_cic ?? '',
      e.temperatura ?? '', e.vjetar ?? '', e.vidljivost ?? '',
      (e.profiles as any)?.full_name ?? '', e.notes ?? ''
    ])
    const csv = [headers, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dnevnik-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    toast.success('CSV preuzet!')
  }

  const showTrofej = TROFEJNE_VRSTE.some(v => form.species.startsWith(v)) && entryType === 'odstrjel'
  const filtered = entries.filter(e =>
    (!filter || e.species?.toLowerCase().includes(filter.toLowerCase()) || (e.profiles as any)?.full_name?.toLowerCase().includes(filter.toLowerCase())) &&
    (!filterType || e.type === filterType)
  )

  const statsByType = TYPES.reduce((acc, t) => {
    acc[t.key] = entries.filter(e => e.type === t.key).length
    return acc
  }, {} as Record<string, number>)

  const totalOdstrjel = entries.filter(e => e.type === 'odstrjel').reduce((a, e) => a + (e.quantity || 0), 0)

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
  const labelCls = "text-sm font-medium text-gray-700 mb-1 block"

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dnevnik lova</h1>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium">
            📊 Izvoz CSV
          </button>
          <button onClick={() => setShowForm(true)} className="bg-forest-600 hover:bg-forest-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
            + Novi unos
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-red-50 rounded-2xl p-4">
          <p className="text-2xl font-bold text-red-700">{totalOdstrjel}</p>
          <p className="text-sm text-red-600">Odstrjeljeno</p>
        </div>
        <div className="bg-blue-50 rounded-2xl p-4">
          <p className="text-2xl font-bold text-blue-700">{statsByType.opazanje || 0}</p>
          <p className="text-sm text-blue-600">Opažanja</p>
        </div>
        <div className="bg-purple-50 rounded-2xl p-4">
          <p className="text-2xl font-bold text-purple-700">{statsByType.skupni_lov || 0}</p>
          <p className="text-sm text-purple-600">Skupni lovovi</p>
        </div>
        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="text-2xl font-bold text-gray-700">{entries.length}</p>
          <p className="text-sm text-gray-600">Ukupno unosa</p>
        </div>
      </div>

      {/* Filteri */}
      <div className="flex gap-3 mb-4">
        <input value={filter} onChange={e => setFilter(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
          placeholder="Pretraži..." />
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500">
          <option value="">Svi tipovi</option>
          {TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400">Nema unosa</div>
          ) : filtered.map(entry => {
            const t = TYPES.find(t => t.key === entry.type) ?? TYPES[4]
            return (
              <div key={entry.id}>
                <div className="px-6 py-4 flex items-start gap-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                  <span className="text-2xl mt-0.5">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">
                        {entry.type === 'rad' || entry.type === 'ostalo' ? t.label : entry.species}
                      </span>
                      {entry.quantity > 1 && entry.type !== 'rad' && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">×{entry.quantity}</span>
                      )}
                      {entry.spol && entry.spol !== 'Nepoznato' && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{entry.spol}</span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white" style={{ background: t.color }}>
                        {t.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(entry.hunted_at), 'dd. MMM yyyy, HH:mm', { locale: hr })}
                      {' · '}{(entry.profiles as any)?.full_name}
                      {(entry.poi as any)?.name && ` · 📍 ${(entry.poi as any).name}`}
                    </p>
                    {entry.notes && <p className="text-xs text-gray-600 mt-1 truncate">{entry.notes}</p>}
                  </div>
                  <span className="text-gray-400 text-xs">{expandedId === entry.id ? '▲' : '▼'}</span>
                </div>

                {expandedId === entry.id && (
                  <div className="px-6 pb-4 pl-16">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                      {entry.nacin_lova && <div><span className="text-gray-400">Način:</span> {entry.nacin_lova}</div>}
                      {entry.oruzje && <div><span className="text-gray-400">Oružje:</span> {entry.oruzje}</div>}
                      {entry.municija && <div><span className="text-gray-400">Municija:</span> {entry.municija}</div>}
                      {entry.masa_trupla && <div><span className="text-gray-400">Masa:</span> {entry.masa_trupla} kg</div>}
                      {entry.trofej_duzina && <div><span className="text-gray-400">Dužina:</span> {entry.trofej_duzina} cm</div>}
                      {entry.trofej_masa && <div><span className="text-gray-400">Trofej masa:</span> {entry.trofej_masa} kg</div>}
                      {entry.trofej_cic && <div><span className="text-gray-400">CIC:</span> {entry.trofej_cic} bod.</div>}
                      {entry.temperatura && <div><span className="text-gray-400">Temp:</span> {entry.temperatura}°C</div>}
                      {entry.vjetar && <div><span className="text-gray-400">Vjetar:</span> {entry.vjetar}</div>}
                      {entry.vidljivost && <div><span className="text-gray-400">Vidljivost:</span> {entry.vidljivost}</div>}
                      {entry.starost && entry.starost !== 'Nepoznato' && <div><span className="text-gray-400">Starost:</span> {entry.starost}</div>}
                    </div>
                    {entry.sudionici?.length > 0 && (
                      <div className="mt-2 text-sm"><span className="text-gray-400">Sudionici:</span> {entry.sudionici.join(', ')}</div>
                    )}
                    {entry.notes && (
                      <div className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-2">{entry.notes}</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-800 text-lg">Novi unos</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Odabir tipa */}
            <div className="grid grid-cols-5 gap-2 mb-5">
              {TYPES.map(t => (
                <button key={t.key} onClick={() => setEntryType(t.key)}
                  className={`py-2 rounded-xl text-center border transition-all ${entryType === t.key ? 'text-white border-transparent' : 'border-gray-200 hover:border-gray-300'}`}
                  style={{ background: entryType === t.key ? t.color : undefined }}>
                  <div className="text-xl">{t.icon}</div>
                  <div className="text-xs mt-0.5">{t.label}</div>
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {/* ODSTRJEL */}
              {entryType === 'odstrjel' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Vrsta divljači *</label>
                      <select value={form.species} onChange={e => setForm(f => ({...f, species: e.target.value}))} className={inputCls}>
                        <option value="">Odaberi...</option>
                        {VRSTE_DIVLJACI.map(v => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Količina</label>
                      <input type="number" min="1" value={form.quantity}
                        onChange={e => setForm(f => ({...f, quantity: parseInt(e.target.value) || 1}))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Spol</label>
                      <select value={form.spol} onChange={e => setForm(f => ({...f, spol: e.target.value}))} className={inputCls}>
                        {SPOL.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Starost</label>
                      <select value={form.starost} onChange={e => setForm(f => ({...f, starost: e.target.value}))} className={inputCls}>
                        {STAROST.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Način lova</label>
                      <select value={form.nacin_lova} onChange={e => setForm(f => ({...f, nacin_lova: e.target.value}))} className={inputCls}>
                        {NACIN_LOVA.filter(n => n !== 'Skupni lov').map(n => <option key={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Čeka / Lokacija</label>
                      <select value={form.poi_id} onChange={e => setForm(f => ({...f, poi_id: e.target.value}))} className={inputCls}>
                        <option value="">Odaberi...</option>
                        {pois.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>Datum i vrijeme</label>
                      <input type="datetime-local" value={form.hunted_at}
                        onChange={e => setForm(f => ({...f, hunted_at: e.target.value}))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Oružje</label>
                      <input value={form.oruzje} onChange={e => setForm(f => ({...f, oruzje: e.target.value}))}
                        className={inputCls} placeholder="npr. Sauer 202 .308" />
                    </div>
                    <div>
                      <label className={labelCls}>Municija</label>
                      <input value={form.municija} onChange={e => setForm(f => ({...f, municija: e.target.value}))}
                        className={inputCls} placeholder="npr. RWS 165gr" />
                    </div>
                    <div>
                      <label className={labelCls}>Masa trupla (kg)</label>
                      <input type="number" step="0.1" value={form.masa_trupla}
                        onChange={e => setForm(f => ({...f, masa_trupla: e.target.value}))} className={inputCls} placeholder="0.0" />
                    </div>
                    <div>
                      <label className={labelCls}>Temperatura (°C)</label>
                      <input type="number" step="0.1" value={form.temperatura}
                        onChange={e => setForm(f => ({...f, temperatura: e.target.value}))} className={inputCls} placeholder="0.0" />
                    </div>
                    <div>
                      <label className={labelCls}>Vjetar</label>
                      <select value={form.vjetar} onChange={e => setForm(f => ({...f, vjetar: e.target.value}))} className={inputCls}>
                        {VJETAR.map(v => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Vidljivost</label>
                      <select value={form.vidljivost} onChange={e => setForm(f => ({...f, vidljivost: e.target.value}))} className={inputCls}>
                        {VIDLJIVOST.map(v => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>

                  {showTrofej && (
                    <div className="bg-amber-50 rounded-xl p-4">
                      <p className="text-sm font-semibold text-amber-800 mb-3">🏆 Trofejni podaci</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Dužina rogovlja (cm)</label>
                          <input type="number" step="0.1" value={form.trofej_duzina}
                            onChange={e => setForm(f => ({...f, trofej_duzina: e.target.value}))}
                            className="w-full border border-amber-200 rounded-lg px-2 py-2 text-sm focus:outline-none" placeholder="0.0" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Masa rogovlja (kg)</label>
                          <input type="number" step="0.01" value={form.trofej_masa}
                            onChange={e => setForm(f => ({...f, trofej_masa: e.target.value}))}
                            className="w-full border border-amber-200 rounded-lg px-2 py-2 text-sm focus:outline-none" placeholder="0.0" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">CIC bodovi</label>
                          <input type="number" step="0.01" value={form.trofej_cic}
                            onChange={e => setForm(f => ({...f, trofej_cic: e.target.value}))}
                            className="w-full border border-amber-200 rounded-lg px-2 py-2 text-sm focus:outline-none" placeholder="0.00" />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* OPAŽANJE */}
              {entryType === 'opazanje' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Vrsta divljači *</label>
                    <select value={form.species} onChange={e => setForm(f => ({...f, species: e.target.value}))} className={inputCls}>
                      <option value="">Odaberi...</option>
                      {VRSTE_DIVLJACI.map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Broj primjeraka</label>
                    <input type="number" min="1" value={form.quantity}
                      onChange={e => setForm(f => ({...f, quantity: parseInt(e.target.value) || 1}))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Spol (ako vidljivo)</label>
                    <select value={form.spol} onChange={e => setForm(f => ({...f, spol: e.target.value}))} className={inputCls}>
                      {SPOL.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Starost (ako vidljivo)</label>
                    <select value={form.starost} onChange={e => setForm(f => ({...f, starost: e.target.value}))} className={inputCls}>
                      {STAROST.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Lokacija / Čeka</label>
                    <select value={form.poi_id} onChange={e => setForm(f => ({...f, poi_id: e.target.value}))} className={inputCls}>
                      <option value="">Odaberi...</option>
                      {pois.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Datum i vrijeme</label>
                    <input type="datetime-local" value={form.hunted_at}
                      onChange={e => setForm(f => ({...f, hunted_at: e.target.value}))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Vjetar</label>
                    <select value={form.vjetar} onChange={e => setForm(f => ({...f, vjetar: e.target.value}))} className={inputCls}>
                      {VJETAR.map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Vidljivost</label>
                    <select value={form.vidljivost} onChange={e => setForm(f => ({...f, vidljivost: e.target.value}))} className={inputCls}>
                      {VIDLJIVOST.map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* SKUPNI LOV */}
              {entryType === 'skupni_lov' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Vrsta divljači *</label>
                      <select value={form.species} onChange={e => setForm(f => ({...f, species: e.target.value}))} className={inputCls}>
                        <option value="">Odaberi...</option>
                        {VRSTE_DIVLJACI.map(v => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Ukupan odstrel</label>
                      <input type="number" min="0" value={form.quantity}
                        onChange={e => setForm(f => ({...f, quantity: parseInt(e.target.value) || 0}))} className={inputCls} />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>Datum i vrijeme</label>
                      <input type="datetime-local" value={form.hunted_at}
                        onChange={e => setForm(f => ({...f, hunted_at: e.target.value}))} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Sudionici lova</label>
                    <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-xl p-3">
                      {lovci.map(l => (
                        <label key={l.id} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-gray-50 rounded px-1">
                          <input type="checkbox"
                            checked={form.sudionici.includes(l.full_name)}
                            onChange={() => setForm(f => ({
                              ...f, sudionici: f.sudionici.includes(l.full_name)
                                ? f.sudionici.filter(s => s !== l.full_name)
                                : [...f.sudionici, l.full_name]
                            }))} />
                          <span className="text-sm">{l.full_name}</span>
                        </label>
                      ))}
                    </div>
                    {form.sudionici.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">{form.sudionici.length} sudionika odabrano</p>
                    )}
                  </div>
                </div>
              )}

              {/* RAD */}
              {entryType === 'rad' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Lokacija / Objekt</label>
                      <select value={form.poi_id} onChange={e => setForm(f => ({...f, poi_id: e.target.value}))} className={inputCls}>
                        <option value="">Odaberi...</option>
                        {pois.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Datum i vrijeme</label>
                      <input type="datetime-local" value={form.hunted_at}
                        onChange={e => setForm(f => ({...f, hunted_at: e.target.value}))} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Sudionici</label>
                    <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-xl p-3">
                      {lovci.map(l => (
                        <label key={l.id} className="flex items-center gap-2 py-1 cursor-pointer">
                          <input type="checkbox"
                            checked={form.sudionici.includes(l.full_name)}
                            onChange={() => setForm(f => ({
                              ...f, sudionici: f.sudionici.includes(l.full_name)
                                ? f.sudionici.filter(s => s !== l.full_name)
                                : [...f.sudionici, l.full_name]
                            }))} />
                          <span className="text-sm">{l.full_name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* OSTALO */}
              {entryType === 'ostalo' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Lokacija</label>
                    <select value={form.poi_id} onChange={e => setForm(f => ({...f, poi_id: e.target.value}))} className={inputCls}>
                      <option value="">Odaberi...</option>
                      {pois.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Datum i vrijeme</label>
                    <input type="datetime-local" value={form.hunted_at}
                      onChange={e => setForm(f => ({...f, hunted_at: e.target.value}))} className={inputCls} />
                  </div>
                </div>
              )}

              {/* Bilješka — uvijek */}
              <div>
                <label className={labelCls}>
                  {entryType === 'rad' ? 'Opis radova *' : entryType === 'ostalo' ? 'Opis *' : 'Bilješka'}
                </label>
                <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                  className={inputCls} rows={3}
                  placeholder={
                    entryType === 'rad' ? 'Opišite što je urađeno...' :
                    entryType === 'ostalo' ? 'Opišite događaj...' :
                    'Dodatne napomene...'
                  } />
              </div>

              <button onClick={saveEntry}
                className="w-full text-white font-medium py-3 rounded-xl transition-colors"
                style={{ background: TYPES.find(t => t.key === entryType)?.color }}>
                Spremi unos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

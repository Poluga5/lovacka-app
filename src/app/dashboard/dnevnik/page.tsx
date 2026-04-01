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

const NACIN_LOVA = ['Čeka', 'Potjera', 'Skupni lov', 'Izgon', 'Hrt', 'Prikrada', 'Ostalo']
const VJETAR = ['Bez vjetra', 'Slab', 'Umjeren', 'Jak', 'Olujni']
const VIDLJIVOST = ['Odlična', 'Dobra', 'Slaba', 'Magla']
const SPOL = ['Muško', 'Žensko', 'Nepoznato']
const STAROST = ['Odraslo', 'Podmladak', 'Nepoznato']

const TROFEJNE_VRSTE = ['Jelen', 'Srna', 'Divlja svinja', 'Zec', 'Fazan']

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
  const [form, setForm] = useState({
    type: 'odstrjel',
    species: '',
    quantity: 1,
    spol: 'Nepoznato',
    starost: 'Odraslo',
    nacin_lova: 'Čeka',
    oruzje: '',
    municija: '',
    masa_trupla: '',
    trofej_duzina: '',
    trofej_masa: '',
    trofej_cic: '',
    temperatura: '',
    vjetar: 'Bez vjetra',
    vidljivost: 'Odlična',
    poi_id: '',
    notes: '',
    hunted_at: new Date().toISOString().slice(0, 16),
    sudionici: [] as string[],
    photos: [] as string[],
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

    const [entriesRes, poisRes, lovciRes] = await Promise.all([
      supabase.from('entries').select('*, profiles(full_name), poi(name)')
        .eq('group_id', member.group_id)
        .order('hunted_at', { ascending: false }),
      supabase.from('poi').select('id, name, type').eq('group_id', member.group_id).eq('is_active', true),
      supabase.from('lovci').select('id, full_name').eq('group_id', member.group_id).eq('status', 'aktivan').order('full_name'),
    ])
    setEntries(entriesRes.data ?? [])
    setPois(poisRes.data ?? [])
    setLovci(lovciRes.data ?? [])
  }

  async function saveEntry() {
    if (!form.species || !groupId || !userId) { toast.error('Vrsta divljači je obavezna!'); return }
    const { error } = await supabase.from('entries').insert({
      group_id: groupId,
      user_id: userId,
      type: form.type,
      species: form.species,
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

  function resetForm() {
    setForm({
      type: 'odstrjel', species: '', quantity: 1, spol: 'Nepoznato', starost: 'Odraslo',
      nacin_lova: 'Čeka', oruzje: '', municija: '', masa_trupla: '', trofej_duzina: '',
      trofej_masa: '', trofej_cic: '', temperatura: '', vjetar: 'Bez vjetra',
      vidljivost: 'Odlična', poi_id: '', notes: '', hunted_at: new Date().toISOString().slice(0, 16),
      sudionici: [], photos: [],
    })
  }

  async function exportCSV() {
    const headers = ['Datum', 'Vrsta unosa', 'Vrsta divljači', 'Količina', 'Spol', 'Starost',
      'Način lova', 'Čeka/Lokacija', 'Oružje', 'Municija', 'Masa trupla (kg)',
      'Trofej dužina (cm)', 'Trofej masa (kg)', 'Trofej CIC', 'Temperatura (°C)',
      'Vjetar', 'Vidljivost', 'Lovac', 'Bilješka']
    const rows = entries.map(e => [
      format(new Date(e.hunted_at), 'dd.MM.yyyy HH:mm'),
      e.type, e.species, e.quantity, e.spol ?? '', e.starost ?? '',
      e.nacin_lova ?? '', (e.poi as any)?.name ?? '',
      e.oruzje ?? '', e.municija ?? '',
      e.masa_trupla ?? '', e.trofej_duzina ?? '', e.trofej_masa ?? '', e.trofej_cic ?? '',
      e.temperatura ?? '', e.vjetar ?? '', e.vidljivost ?? '',
      (e.profiles as any)?.full_name ?? '', e.notes ?? ''
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
  const TYPE_ICON: Record<string, string> = { odstrjel: '🎯', opazanje: '👁', rad: '🔨', ostalo: '📝' }

  const filtered = entries.filter(e =>
    (!filter || e.species.toLowerCase().includes(filter.toLowerCase()) ||
      (e.profiles as any)?.full_name?.toLowerCase().includes(filter.toLowerCase())) &&
    (!filterType || e.type === filterType)
  )

  const totalOdstrjel = entries.filter(e => e.type === 'odstrjel').reduce((a, e) => a + e.quantity, 0)
  const showTrofej = TROFEJNE_VRSTE.some(v => form.species.includes(v)) && form.type === 'odstrjel'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dnevnik lova</h1>
        <div className="flex gap-2">
          <button onClick={exportCSV}
            className="border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            📊 Izvoz CSV
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

      {/* Filteri */}
      <div className="flex gap-3 mb-4">
        <input value={filter} onChange={e => setFilter(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
          placeholder="Pretraži po vrsti ili lovcu..." />
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500">
          <option value="">Svi tipovi</option>
          <option value="odstrjel">Odstrjel</option>
          <option value="opazanje">Opažanje</option>
          <option value="rad">Rad</option>
          <option value="ostalo">Ostalo</option>
        </select>
      </div>

      {/* Lista unosa */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400">Nema unosa</div>
          ) : filtered.map(entry => (
            <div key={entry.id}>
              <div className="px-6 py-4 flex items-start gap-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                <span className="text-2xl mt-0.5">{TYPE_ICON[entry.type]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800">{entry.species}</span>
                    {entry.quantity > 1 && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">×{entry.quantity}</span>
                    )}
                    {entry.spol && entry.spol !== 'Nepoznato' && (
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{entry.spol}</span>
                    )}
                    {entry.starost && entry.starost !== 'Nepoznato' && (
                      <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{entry.starost}</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[entry.type]}`}>
                      {entry.type}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {format(new Date(entry.hunted_at), 'dd. MMM yyyy, HH:mm', { locale: hr })}
                    {' · '}{(entry.profiles as any)?.full_name}
                    {(entry.poi as any)?.name && ` · 📍 ${(entry.poi as any).name}`}
                    {entry.nacin_lova && ` · ${entry.nacin_lova}`}
                  </p>
                </div>
                <span className="text-gray-400 text-sm">{expandedId === entry.id ? '▲' : '▼'}</span>
              </div>

              {/* Expanded detalji */}
              {expandedId === entry.id && (
                <div className="px-6 pb-4 pl-16 grid grid-cols-2 gap-2 text-sm">
                  {entry.oruzje && <div><span className="text-gray-500">Oružje:</span> {entry.oruzje}</div>}
                  {entry.municija && <div><span className="text-gray-500">Municija:</span> {entry.municija}</div>}
                  {entry.masa_trupla && <div><span className="text-gray-500">Masa trupla:</span> {entry.masa_trupla} kg</div>}
                  {entry.trofej_duzina && <div><span className="text-gray-500">Trofej dužina:</span> {entry.trofej_duzina} cm</div>}
                  {entry.trofej_masa && <div><span className="text-gray-500">Trofej masa:</span> {entry.trofej_masa} kg</div>}
                  {entry.trofej_cic && <div><span className="text-gray-500">CIC bodovi:</span> {entry.trofej_cic}</div>}
                  {entry.temperatura && <div><span className="text-gray-500">Temperatura:</span> {entry.temperatura}°C</div>}
                  {entry.vjetar && <div><span className="text-gray-500">Vjetar:</span> {entry.vjetar}</div>}
                  {entry.vidljivost && <div><span className="text-gray-500">Vidljivost:</span> {entry.vidljivost}</div>}
                  {entry.notes && <div className="col-span-2"><span className="text-gray-500">Bilješka:</span> {entry.notes}</div>}
                  {entry.sudionici?.length > 0 && (
                    <div className="col-span-2"><span className="text-gray-500">Sudionici:</span> {entry.sudionici.join(', ')}</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal za novi unos */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-800 text-lg">Novi unos u dnevnik</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="space-y-4">
              {/* Tip unosa */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Vrsta unosa</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(TYPE_ICON).map(([t, icon]) => (
                    <button key={t} onClick={() => setForm(f => ({...f, type: t}))}
                      className={`py-2 rounded-xl text-sm border transition-colors ${form.type === t ? 'bg-forest-600 text-white border-forest-600' : 'border-gray-200 hover:border-forest-300'}`}>
                      <span className="block text-lg">{icon}</span>
                      <span className="text-xs">{t}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Vrsta divljači */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Vrsta divljači *</label>
                  <select value={form.species} onChange={e => setForm(f => ({...f, species: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500">
                    <option value="">Odaberi vrstu...</option>
                    {VRSTE_DIVLJACI.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                {/* Količina */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Količina</label>
                  <input type="number" min="1" value={form.quantity}
                    onChange={e => setForm(f => ({...f, quantity: parseInt(e.target.value) || 1}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500" />
                </div>

                {/* Spol */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Spol</label>
                  <select value={form.spol} onChange={e => setForm(f => ({...f, spol: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500">
                    {SPOL.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Starost */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Starost</label>
                  <select value={form.starost} onChange={e => setForm(f => ({...f, starost: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500">
                    {STAROST.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Način lova */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Način lova</label>
                  <select value={form.nacin_lova} onChange={e => setForm(f => ({...f, nacin_lova: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500">
                    {NACIN_LOVA.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>

                {/* Čeka/Lokacija */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Čeka / Lokacija</label>
                  <select value={form.poi_id} onChange={e => setForm(f => ({...f, poi_id: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500">
                    <option value="">Odaberi lokaciju...</option>
                    {pois.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                {/* Datum i vrijeme */}
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Datum i vrijeme</label>
                  <input type="datetime-local" value={form.hunted_at}
                    onChange={e => setForm(f => ({...f, hunted_at: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500" />
                </div>

                {/* Oružje */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Oružje</label>
                  <input value={form.oruzje} onChange={e => setForm(f => ({...f, oruzje: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                    placeholder="npr. Sauer 202 .308" />
                </div>

                {/* Municija */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Municija</label>
                  <input value={form.municija} onChange={e => setForm(f => ({...f, municija: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                    placeholder="npr. RWS 165gr" />
                </div>

                {/* Masa trupla */}
                {form.type === 'odstrjel' && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Masa trupla (kg)</label>
                    <input type="number" step="0.1" value={form.masa_trupla}
                      onChange={e => setForm(f => ({...f, masa_trupla: e.target.value}))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                      placeholder="npr. 24.5" />
                  </div>
                )}

                {/* Temperatura */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Temperatura (°C)</label>
                  <input type="number" step="0.1" value={form.temperatura}
                    onChange={e => setForm(f => ({...f, temperatura: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                    placeholder="npr. 8.5" />
                </div>

                {/* Vjetar */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Vjetar</label>
                  <select value={form.vjetar} onChange={e => setForm(f => ({...f, vjetar: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500">
                    {VJETAR.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                {/* Vidljivost */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Vidljivost</label>
                  <select value={form.vidljivost} onChange={e => setForm(f => ({...f, vidljivost: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500">
                    {VIDLJIVOST.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>

              {/* Trofejni podaci */}
              {showTrofej && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">🏆 Trofejni podaci</label>
                  <div className="grid grid-cols-3 gap-3 bg-amber-50 p-3 rounded-xl">
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Dužina (cm)</label>
                      <input type="number" step="0.1" value={form.trofej_duzina}
                        onChange={e => setForm(f => ({...f, trofej_duzina: e.target.value}))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Masa (kg)</label>
                      <input type="number" step="0.01" value={form.trofej_masa}
                        onChange={e => setForm(f => ({...f, trofej_masa: e.target.value}))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">CIC bodovi</label>
                      <input type="number" step="0.01" value={form.trofej_cic}
                        onChange={e => setForm(f => ({...f, trofej_cic: e.target.value}))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none" />
                    </div>
                  </div>
                </div>
              )}

              {/* Sudionici skupnog lova */}
              {form.nacin_lova === 'Skupni lov' && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Sudionici skupnog lova</label>
                  <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-xl p-3">
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
              )}

              {/* Bilješka */}
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

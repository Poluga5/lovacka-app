'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { hr } from 'date-fns/locale'
import toast from 'react-hot-toast'

const VRSTE_DIVLJACI = [
  'Srna obična', 'Jelen obični', 'Divlja svinja', 'Jelen lopatar', 'Muflon', 'Divokoza',
  'Smeđi medvjed', 'Jelen aksis', 'Zec', 'Fazan', 'Patka', 'Divlja guska',
  'Lisica', 'Jazavac', 'Kuna', 'Tvor', 'Vrana', 'Svraka', 'Šojka',
  'Golub divlji', 'Prepelica', 'Šljuka', 'Bekasina', 'Ostalo'
]

const MARKICE: Record<string, { boja: string, kratica: string, bg: string, text: string }> = {
  'Jelen obični':   { boja: 'Plava',      kratica: 'JO', bg: '#2563EB', text: 'white' },
  'Srna obična':    { boja: 'Crvena',     kratica: 'SO', bg: '#DC2626', text: 'white' },
  'Divlja svinja':  { boja: 'Bijela',     kratica: 'DS', bg: '#e5e7eb', text: '#1f2937' },
  'Smeđi medvjed': { boja: 'Zelena',     kratica: 'SM', bg: '#16A34A', text: 'white' },
  'Jelen lopatar':  { boja: 'Ljubičasta', kratica: 'JL', bg: '#7C3AED', text: 'white' },
  'Muflon':         { boja: 'Žuta',       kratica: 'MF', bg: '#CA8A04', text: 'white' },
  'Divokoza':       { boja: 'Narančasta', kratica: 'DI', bg: '#EA580C', text: 'white' },
  'Jelen aksis':    { boja: 'Smeđa',      kratica: 'JA', bg: '#92400E', text: 'white' },
}

const NACIN_LOVA = ['Čeka', 'Prikrada', 'Potjera', 'Izgon', 'Hrt', 'Ostalo']
const VJETAR = ['Bez vjetra', 'Slab', 'Umjeren', 'Jak']
const VIDLJIVOST = ['Odlična', 'Dobra', 'Slaba', 'Magla']
const SPOL = ['Muško', 'Žensko', 'Nepoznato']
const STAROST = ['Odraslo', 'Podmladak', 'Nepoznato']

type EntryType = 'odstrjel' | 'opazanje' | 'skupni_lov' | 'rad' | 'ostalo'

const TYPES: { key: EntryType, icon: string, label: string, color: string }[] = [
  { key: 'odstrjel',   icon: '🎯', label: 'Odstrjel',  color: '#DC2626' },
  { key: 'opazanje',   icon: '👁',  label: 'Opažanje',  color: '#2563EB' },
  { key: 'skupni_lov', icon: '👥', label: 'Skupni lov', color: '#7C3AED' },
  { key: 'rad',        icon: '🔨', label: 'Rad',        color: '#D97706' },
  { key: 'ostalo',     icon: '📝', label: 'Ostalo',     color: '#6B7280' },
]

const timeOptions: string[] = []
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    timeOptions.push(`${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`)
  }
}

function getlovnaGodina(): number {
  const d = new Date()
  return d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear()
}
const lovnaGodina = getlovnaGodina()

// Stavka odstrjela u skupnom lovu
type SkupniStavka = {
  id: string
  species: string
  spol: string
  starost: string
  strijelac_id: string
  markica_broj: string
  markica_dodijeljena: boolean
  markica_datum: string
  masa_trupla: string
}

const novaSkupnaStavka = (): SkupniStavka => ({
  id: Math.random().toString(36).slice(2),
  species: '',
  spol: 'Nepoznato',
  starost: 'Odraslo',
  strijelac_id: '',
  markica_broj: '',
  markica_dodijeljena: false,
  markica_datum: new Date().toISOString().slice(0, 10),
  masa_trupla: '',
})

const emptyForm = () => {
  const now = new Date()
  const mins = Math.round(now.getMinutes() / 30) * 30
  return {
    species: '', quantity: 1, spol: 'Nepoznato', starost: 'Odraslo',
    nacin_lova: 'Čeka', oruzje: '', municija: '',
    masa_trupla: '', temperatura: '', vjetar: 'Bez vjetra', vidljivost: 'Odlična',
    poi_id: '', notes: '',
    datum: now.toISOString().slice(0, 10),
    vrijeme: `${now.getHours().toString().padStart(2,'0')}:${mins === 60 ? '00' : mins.toString().padStart(2,'0')}`,
    sudionici: [] as string[],
    markica_broj: '',
    markica_dodijeljena: false,
    markica_datum: now.toISOString().slice(0, 10),
    skupni_stavke: [novaSkupnaStavka()] as SkupniStavka[],
  }
}

export default function DnevnikPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [pois, setPois] = useState<any[]>([])
  const [lovci, setLovci] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [filter, setFilter] = useState('')
  const [filterType, setFilterType] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [entryType, setEntryType] = useState<EntryType>('odstrjel')
  const [editingEntry, setEditingEntry] = useState<any | null>(null)
  const [form, setForm] = useState(emptyForm())
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data: member } = await supabase.from('group_members').select('group_id, role').eq('user_id', user.id).single()
    if (!member) return
    setGroupId(member.group_id)
    setIsAdmin(member.role === 'admin')

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

  function handleSpeciesChange(species: string) {
    const markica = MARKICE[species]
    const prefix = markica ? `RH-${markica.kratica}-${lovnaGodina}-` : ''
    setForm(f => ({ ...f, species, markica_broj: prefix }))
  }

  function handleSkupniSpeciesChange(id: string, species: string) {
    const markica = MARKICE[species]
    const prefix = markica ? `RH-${markica.kratica}-${lovnaGodina}-` : ''
    setForm(f => ({
      ...f,
      skupni_stavke: f.skupni_stavke.map(s =>
        s.id === id ? { ...s, species, markica_broj: prefix } : s
      )
    }))
  }

  function openNew() {
    setEditingEntry(null)
    setForm(emptyForm())
    setEntryType('odstrjel')
    setShowForm(true)
  }

  function openEdit(entry: any) {
    setEditingEntry(entry)
    const d = new Date(entry.hunted_at)
    const mins = Math.round(d.getMinutes() / 30) * 30
    setForm({
      species: entry.species === '-' ? '' : entry.species ?? '',
      quantity: entry.quantity ?? 1,
      spol: entry.spol ?? 'Nepoznato',
      starost: entry.starost ?? 'Odraslo',
      nacin_lova: entry.nacin_lova ?? 'Čeka',
      oruzje: entry.oruzje ?? '',
      municija: entry.municija ?? '',
      masa_trupla: entry.masa_trupla?.toString() ?? '',
      temperatura: entry.temperatura?.toString() ?? '',
      vjetar: entry.vjetar ?? 'Bez vjetra',
      vidljivost: entry.vidljivost ?? 'Odlična',
      poi_id: entry.poi_id ?? '',
      notes: entry.notes ?? '',
      datum: d.toISOString().slice(0, 10),
      vrijeme: `${d.getHours().toString().padStart(2,'0')}:${(mins === 60 ? 0 : mins).toString().padStart(2,'0')}`,
      sudionici: entry.sudionici ?? [],
      markica_broj: entry.markica_broj ?? '',
      markica_dodijeljena: entry.markica_dodijeljena ?? false,
      markica_datum: entry.markica_datum ? new Date(entry.markica_datum).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      skupni_stavke: entry.skupni_stavke ?? [novaSkupnaStavka()],
    })
    setEntryType(entry.type as EntryType)
    setShowForm(true)
  }

  async function deleteEntry(id: string) {
    if (!confirm('Obriši ovaj unos?')) return
    const { error } = await supabase.from('entries').delete().eq('id', id)
    if (error) { toast.error('Greška pri brisanju'); return }
    toast.success('Unos obrisan!')
    setEntries(e => e.filter(e => e.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  async function saveEntry() {
    if (entryType !== 'rad' && entryType !== 'ostalo' && entryType !== 'skupni_lov' && !form.species) {
      toast.error('Vrsta divljači je obavezna!')
      return
    }
    if (entryType === 'skupni_lov' && form.skupni_stavke.some(s => !s.species)) {
      toast.error('Svaka stavka mora imati vrstu divljači!')
      return
    }
    if (!groupId || !userId) return

    const hunted_at = new Date(`${form.datum}T${form.vrijeme}:00`).toISOString()
    const payload: any = {
      type: entryType,
      species: entryType === 'skupni_lov'
        ? form.skupni_stavke.map(s => s.species).join(', ')
        : form.species || '-',
      quantity: entryType === 'skupni_lov' ? form.skupni_stavke.length : form.quantity,
      spol: form.spol, starost: form.starost,
      nacin_lova: form.nacin_lova,
      oruzje: form.oruzje || null,
      municija: form.municija || null,
      masa_trupla: form.masa_trupla ? parseFloat(form.masa_trupla) : null,
      temperatura: form.temperatura ? parseFloat(form.temperatura) : null,
      vjetar: form.vjetar, vidljivost: form.vidljivost,
      poi_id: form.poi_id || null,
      notes: form.notes || null,
      hunted_at,
      sudionici: entryType === 'skupni_lov'
        ? form.skupni_stavke.map(s => lovci.find(l => l.id === s.strijelac_id)?.full_name).filter(Boolean)
        : form.sudionici,
      markica_broj: form.markica_broj || null,
      markica_dodijeljena: form.markica_dodijeljena,
      markica_datum: form.markica_datum ? new Date(form.markica_datum).toISOString() : null,
      skupni_stavke: entryType === 'skupni_lov' ? form.skupni_stavke : null,
    }

    if (editingEntry) {
      const { error } = await supabase.from('entries').update(payload).eq('id', editingEntry.id)
      if (error) { toast.error('Greška'); console.error(error); return }
      toast.success('Unos ažuriran!')
    } else {
      const { error } = await supabase.from('entries').insert({ ...payload, group_id: groupId, user_id: userId })
      if (error) { toast.error('Greška'); console.error(error); return }
      toast.success('Unos dodan!')
    }

    setShowForm(false)
    setEditingEntry(null)
    setForm(emptyForm())
    load()
  }

  async function exportCSV() {
    const headers = ['Datum', 'Vrijeme', 'Tip', 'Vrsta', 'Količina', 'Spol', 'Starost',
      'Način lova', 'Lokacija', 'Oružje', 'Municija', 'Masa (kg)',
      'Temp (°C)', 'Vjetar', 'Vidljivost', 'Markica br.', 'Markica dodijeljena',
      'Datum markice', 'Lovac/Sudionici', 'Bilješka']
    const rows = entries.map(e => [
      format(new Date(e.hunted_at), 'dd.MM.yyyy'),
      format(new Date(e.hunted_at), 'HH:mm'),
      e.type, e.species, e.quantity, e.spol ?? '', e.starost ?? '',
      e.nacin_lova ?? '', (e.poi as any)?.name ?? '',
      e.oruzje ?? '', e.municija ?? '', e.masa_trupla ?? '',
      e.temperatura ?? '', e.vjetar ?? '', e.vidljivost ?? '',
      e.markica_broj ?? '', e.markica_dodijeljena ? 'Da' : 'Ne',
      e.markica_datum ? format(new Date(e.markica_datum), 'dd.MM.yyyy') : '',
      (e.profiles as any)?.full_name ?? '',
      e.notes ?? ''
    ])
    const csv = [headers, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dnevnik-${format(new Date(), 'dd-MM-yyyy')}.csv`
    a.click()
    toast.success('CSV preuzet!')
  }

  const markicaInfo = MARKICE[form.species]
  const showMarkica = entryType === 'odstrjel' && !!markicaInfo

  const filtered = entries.filter(e =>
    (!filter || e.species?.toLowerCase().includes(filter.toLowerCase()) ||
      (e.profiles as any)?.full_name?.toLowerCase().includes(filter.toLowerCase())) &&
    (!filterType || e.type === filterType)
  )
  const totalOdstrjel = entries.filter(e => e.type === 'odstrjel').reduce((a, e) => a + (e.quantity || 0), 0)

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
  const labelCls = "text-sm font-medium text-gray-700 mb-1 block"

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-4 pb-1 border-b border-gray-100">
      {children}
    </div>
  )

  const DateTimeFields = () => (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className={labelCls}>Datum</label>
        <input type="date" value={form.datum} onChange={e => setForm(f => ({...f, datum: e.target.value}))} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Vrijeme</label>
        <select value={form.vrijeme} onChange={e => setForm(f => ({...f, vrijeme: e.target.value}))} className={inputCls}>
          {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>
  )

  const MarkicaBlock = ({ species, markicaBroj, markicaDodijeljena, markicaDatum, onChange }: {
    species: string
    markicaBroj: string
    markicaDodijeljena: boolean
    markicaDatum: string
    onChange: (key: string, val: any) => void
  }) => {
    const info = MARKICE[species]
    if (!info) return null
    return (
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-blue-900">🏷️ Evidencijska markica</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: info.bg, color: info.text }}>
              {info.boja} · {info.kratica}
            </span>
            <span className="text-xs text-gray-400">lovna god. {lovnaGodina}/{lovnaGodina+1}</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs text-blue-700 font-medium">Dodijeljena</span>
            <div onClick={() => onChange('markica_dodijeljena', !markicaDodijeljena)}
              className={`w-11 h-6 rounded-full transition-colors cursor-pointer flex items-center px-1 ${markicaDodijeljena ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${markicaDodijeljena ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Serijski broj markice</label>
            <input value={markicaBroj} onChange={e => onChange('markica_broj', e.target.value)}
              className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder={`RH-${info.kratica}-${lovnaGodina}-000000`} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Datum dodjele</label>
            <input type="date" value={markicaDatum} onChange={e => onChange('markica_datum', e.target.value)}
              className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
        </div>
        {!markicaDodijeljena && (
          <div className="mt-2 text-xs text-amber-700 bg-amber-100 rounded-lg p-2 flex items-start gap-1">
            <span>⚠️</span>
            <span>Krupna divljač mora biti označena markicom odmah nakon odstrela, prije pomicanja s mjesta! (Pravilnik o potvrdi o podrijetlu divljači, NN)</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dnevnik lova</h1>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium">
            📊 Izvoz CSV
          </button>
          <button onClick={openNew} className="bg-forest-600 hover:bg-forest-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
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
          <p className="text-2xl font-bold text-blue-700">{entries.filter(e => e.type === 'opazanje').length}</p>
          <p className="text-sm text-blue-600">Opažanja</p>
        </div>
        <div className="bg-purple-50 rounded-2xl p-4">
          <p className="text-2xl font-bold text-purple-700">{entries.filter(e => e.type === 'skupni_lov').length}</p>
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
            const canEdit = isAdmin || entry.user_id === userId
            const markica = MARKICE[entry.species]
            const trebaMarciku = entry.type === 'odstrjel' && !!markica
            return (
              <div key={entry.id}>
                <div className="px-6 py-4 flex items-start gap-4">
                  <span className="text-2xl mt-0.5 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                    {t.icon}
                  </span>
                  <div className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">
                        {entry.type === 'rad' || entry.type === 'ostalo' ? t.label : entry.species}
                      </span>
                      {entry.quantity > 1 && entry.type !== 'rad' && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">×{entry.quantity}</span>
                      )}
                      {entry.spol && entry.spol !== 'Nepoznato' && entry.type === 'odstrjel' && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{entry.spol}</span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white" style={{ background: t.color }}>
                        {t.label}
                      </span>
                      {trebaMarciku && (
                        entry.markica_dodijeljena
                          ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">🏷️ {entry.markica_broj || '✓'}</span>
                          : <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">⚠️ Bez markice</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(entry.hunted_at), 'dd.MM.yyyy', { locale: hr })} u {format(new Date(entry.hunted_at), 'HH:mm')}
                      {' · '}{(entry.profiles as any)?.full_name}
                      {(entry.poi as any)?.name && ` · 📍 ${(entry.poi as any).name}`}
                    </p>
                    {entry.type === 'skupni_lov' && entry.sudionici?.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">👥 {entry.sudionici.join(', ')}</p>
                    )}
                    {entry.notes && <p className="text-xs text-gray-600 mt-1 truncate">{entry.notes}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(entry)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">✏️</button>
                      <button onClick={() => deleteEntry(entry.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">🗑</button>
                    </div>
                  )}
                  <span className="text-gray-400 text-xs cursor-pointer"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                    {expandedId === entry.id ? '▲' : '▼'}
                  </span>
                </div>

                {expandedId === entry.id && (
                  <div className="px-6 pb-4 pl-16">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                      {entry.nacin_lova && <div><span className="text-gray-400">Način:</span> {entry.nacin_lova}</div>}
                      {entry.oruzje && <div><span className="text-gray-400">Oružje:</span> {entry.oruzje}</div>}
                      {entry.municija && <div><span className="text-gray-400">Municija:</span> {entry.municija}</div>}
                      {entry.masa_trupla && <div><span className="text-gray-400">Masa:</span> {entry.masa_trupla} kg</div>}
                      {entry.temperatura && <div><span className="text-gray-400">Temp:</span> {entry.temperatura}°C</div>}
                      {entry.vjetar && <div><span className="text-gray-400">Vjetar:</span> {entry.vjetar}</div>}
                      {entry.vidljivost && <div><span className="text-gray-400">Vidljivost:</span> {entry.vidljivost}</div>}
                      {entry.starost && entry.starost !== 'Nepoznato' && entry.type === 'odstrjel' && (
                        <div><span className="text-gray-400">Starost:</span> {entry.starost}</div>
                      )}
                    </div>

                    {/* Skupne stavke */}
                    {entry.type === 'skupni_lov' && entry.skupni_stavke?.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {entry.skupni_stavke.map((s: SkupniStavka, i: number) => {
                          const mk = MARKICE[s.species]
                          return (
                            <div key={i} className="bg-purple-50 rounded-lg p-3 text-sm">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{i+1}. {s.species}</span>
                                {s.spol !== 'Nepoznato' && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{s.spol}</span>}
                                {s.starost !== 'Odraslo' && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s.starost}</span>}
                                {s.strijelac_id && <span className="text-xs text-gray-500">· {lovci.find(l => l.id === s.strijelac_id)?.full_name}</span>}
                                {mk && (s.markica_dodijeljena
                                  ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">🏷️ {s.markica_broj || '✓'}</span>
                                  : <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">⚠️ Bez markice</span>
                                )}
                                {s.masa_trupla && <span className="text-xs text-gray-500">· {s.masa_trupla} kg</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {trebaMarciku && (
                      <div className={`mt-3 p-3 rounded-xl text-sm ${entry.markica_dodijeljena ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>🏷️</span>
                          <span className="font-semibold" style={{ color: markica.bg }}>
                            Markica {markica.boja} · {markica.kratica}
                          </span>
                          {entry.markica_dodijeljena
                            ? <span className="text-green-700 text-xs font-medium">✓ Dodijeljena</span>
                            : <span className="text-red-700 text-xs font-bold">⚠️ NIJE DODIJELJENA!</span>
                          }
                          {entry.markica_broj && <span className="text-gray-600 text-xs">· {entry.markica_broj}</span>}
                          {entry.markica_datum && <span className="text-gray-400 text-xs">· {format(new Date(entry.markica_datum), 'dd.MM.yyyy')}</span>}
                        </div>
                      </div>
                    )}
                    {entry.notes && <div className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-2">{entry.notes}</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal — 2xl širina */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-800 text-lg">{editingEntry ? 'Uredi unos' : 'Novi unos'}</h3>
              <button onClick={() => { setShowForm(false); setEditingEntry(null) }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Tip */}
            <div className="grid grid-cols-5 gap-2 mb-5">
              {TYPES.map(t => (
                <button key={t.key} onClick={() => setEntryType(t.key)}
                  className={`py-2.5 rounded-xl text-center border transition-all ${entryType === t.key ? 'text-white border-transparent' : 'border-gray-200 hover:border-gray-300'}`}
                  style={{ background: entryType === t.key ? t.color : undefined }}>
                  <div className="text-2xl">{t.icon}</div>
                  <div className="text-xs mt-0.5">{t.label}</div>
                </button>
              ))}
            </div>

            <div className="space-y-4">

              {/* ===== ODSTRJEL ===== */}
              {entryType === 'odstrjel' && (
                <>
                  <SectionTitle>Divljač</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Vrsta divljači *</label>
                      <select value={form.species} onChange={e => handleSpeciesChange(e.target.value)} className={inputCls}>
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
                  </div>

                  {showMarkica && (
                    <MarkicaBlock
                      species={form.species}
                      markicaBroj={form.markica_broj}
                      markicaDodijeljena={form.markica_dodijeljena}
                      markicaDatum={form.markica_datum}
                      onChange={(key, val) => setForm(f => ({...f, [key]: val}))}
                    />
                  )}

                  <SectionTitle>Lov</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Način lova</label>
                      <select value={form.nacin_lova} onChange={e => setForm(f => ({...f, nacin_lova: e.target.value}))} className={inputCls}>
                        {NACIN_LOVA.map(n => <option key={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Čeka / Lokacija</label>
                      <select value={form.poi_id} onChange={e => setForm(f => ({...f, poi_id: e.target.value}))} className={inputCls}>
                        <option value="">Odaberi...</option>
                        {pois.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <DateTimeFields />

                  <SectionTitle>Oružje i odstrjel</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Oružje</label>
                      <input value={form.oruzje} onChange={e => setForm(f => ({...f, oruzje: e.target.value}))}
                        className={inputCls} placeholder="npr. Browning Bar .308" />
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
                </>
              )}

              {/* ===== OPAŽANJE ===== */}
              {entryType === 'opazanje' && (
                <>
                  <SectionTitle>Divljač</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
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
                  </div>

                  <SectionTitle>Lokacija i uvjeti</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Lokacija / Čeka</label>
                      <select value={form.poi_id} onChange={e => setForm(f => ({...f, poi_id: e.target.value}))} className={inputCls}>
                        <option value="">Odaberi...</option>
                        {pois.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Vjetar</label>
                      <select value={form.vjetar} onChange={e => setForm(f => ({...f, vjetar: e.target.value}))} className={inputCls}>
                        {VJETAR.map(v => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  <DateTimeFields />
                </>
              )}

              {/* ===== SKUPNI LOV ===== */}
              {entryType === 'skupni_lov' && (
                <>
                  <SectionTitle>Osnovni podaci</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Čeka / Lokacija</label>
                      <select value={form.poi_id} onChange={e => setForm(f => ({...f, poi_id: e.target.value}))} className={inputCls}>
                        <option value="">Odaberi...</option>
                        {pois.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Vjetar</label>
                      <select value={form.vjetar} onChange={e => setForm(f => ({...f, vjetar: e.target.value}))} className={inputCls}>
                        {VJETAR.map(v => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  <DateTimeFields />

                  <SectionTitle>Odstrjel — stavke</SectionTitle>
                  <div className="space-y-3">
                    {form.skupni_stavke.map((stavka, idx) => {
                      const mk = MARKICE[stavka.species]
                      return (
                        <div key={stavka.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-gray-700">Stavka {idx + 1}</span>
                            {form.skupni_stavke.length > 1 && (
                              <button onClick={() => setForm(f => ({
                                ...f, skupni_stavke: f.skupni_stavke.filter(s => s.id !== stavka.id)
                              }))} className="text-xs text-red-500 hover:text-red-700">Ukloni</button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Vrsta divljači *</label>
                              <select value={stavka.species}
                                onChange={e => handleSkupniSpeciesChange(stavka.id, e.target.value)}
                                className={inputCls}>
                                <option value="">Odaberi...</option>
                                {VRSTE_DIVLJACI.map(v => <option key={v}>{v}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Strijelac</label>
                              <select value={stavka.strijelac_id}
                                onChange={e => setForm(f => ({
                                  ...f, skupni_stavke: f.skupni_stavke.map(s =>
                                    s.id === stavka.id ? { ...s, strijelac_id: e.target.value } : s
                                  )
                                }))} className={inputCls}>
                                <option value="">Odaberi lovca...</option>
                                {lovci.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Spol</label>
                              <select value={stavka.spol}
                                onChange={e => setForm(f => ({
                                  ...f, skupni_stavke: f.skupni_stavke.map(s =>
                                    s.id === stavka.id ? { ...s, spol: e.target.value } : s
                                  )
                                }))} className={inputCls}>
                                {SPOL.map(s => <option key={s}>{s}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Starost</label>
                              <select value={stavka.starost}
                                onChange={e => setForm(f => ({
                                  ...f, skupni_stavke: f.skupni_stavke.map(s =>
                                    s.id === stavka.id ? { ...s, starost: e.target.value } : s
                                  )
                                }))} className={inputCls}>
                                {STAROST.map(s => <option key={s}>{s}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Masa trupla (kg)</label>
                              <input type="number" step="0.1" value={stavka.masa_trupla}
                                onChange={e => setForm(f => ({
                                  ...f, skupni_stavke: f.skupni_stavke.map(s =>
                                    s.id === stavka.id ? { ...s, masa_trupla: e.target.value } : s
                                  )
                                }))} className={inputCls} placeholder="0.0" />
                            </div>
                          </div>

                          {mk && (
                            <MarkicaBlock
                              species={stavka.species}
                              markicaBroj={stavka.markica_broj}
                              markicaDodijeljena={stavka.markica_dodijeljena}
                              markicaDatum={stavka.markica_datum}
                              onChange={(key, val) => setForm(f => ({
                                ...f, skupni_stavke: f.skupni_stavke.map(s =>
                                  s.id === stavka.id ? { ...s, [key]: val } : s
                                )
                              }))}
                            />
                          )}
                        </div>
                      )
                    })}

                    <button onClick={() => setForm(f => ({
                      ...f, skupni_stavke: [...f.skupni_stavke, novaSkupnaStavka()]
                    }))}
                      className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-forest-400 hover:text-forest-600 transition-colors">
                      + Dodaj stavku odstrjela
                    </button>
                  </div>
                </>
              )}

              {/* ===== RAD ===== */}
              {entryType === 'rad' && (
                <>
                  <SectionTitle>Lokacija i vrijeme</SectionTitle>
                  <div>
                    <label className={labelCls}>Lokacija / Objekt</label>
                    <select value={form.poi_id} onChange={e => setForm(f => ({...f, poi_id: e.target.value}))} className={inputCls}>
                      <option value="">Odaberi...</option>
                      {pois.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <DateTimeFields />

                  <SectionTitle>Sudionici</SectionTitle>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-3">
                    {lovci.length === 0
                      ? <div className="text-sm text-gray-400 text-center py-2">Nema lovaca u registru</div>
                      : lovci.map(l => (
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
                      ))
                    }
                  </div>
                </>
              )}

              {/* ===== OSTALO ===== */}
              {entryType === 'ostalo' && (
                <>
                  <SectionTitle>Lokacija i vrijeme</SectionTitle>
                  <div>
                    <label className={labelCls}>Lokacija</label>
                    <select value={form.poi_id} onChange={e => setForm(f => ({...f, poi_id: e.target.value}))} className={inputCls}>
                      <option value="">Odaberi...</option>
                      {pois.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <DateTimeFields />
                </>
              )}

              {/* Bilješka uvijek */}
              <div>
                <label className={labelCls}>
                  {entryType === 'rad' ? 'Opis radova *' : entryType === 'ostalo' ? 'Opis *' : 'Bilješka'}
                </label>
                <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                  className={inputCls} rows={3}
                  placeholder={
                    entryType === 'rad' ? 'Opišite što je urađeno...' :
                    entryType === 'ostalo' ? 'Opišite događaj...' : 'Dodatne napomene...'
                  } />
              </div>

              <button onClick={saveEntry}
                className="w-full text-white font-medium py-3 rounded-xl transition-colors text-base"
                style={{ background: TYPES.find(t => t.key === entryType)?.color }}>
                {editingEntry ? 'Spremi izmjene' : 'Spremi unos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

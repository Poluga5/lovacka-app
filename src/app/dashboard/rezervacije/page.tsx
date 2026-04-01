'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns'
import { hr } from 'date-fns/locale'
import toast from 'react-hot-toast'

export default function RezervacijePage() {
  const [reservations, setReservations] = useState<any[]>([])
  const [pois, setPois] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showForm, setShowForm] = useState(false)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState({
    poi_id: '',
    datum_od: '',
    vrijeme_od: '06:00',
    datum_do: '',
    vrijeme_do: '12:00',
    notes: ''
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

    const [resData, poisData] = await Promise.all([
      supabase.from('reservations').select('*, poi(name,type), profiles(full_name)')
        .eq('group_id', member.group_id).eq('status', 'aktivna')
        .order('date_start', { ascending: true }),
      supabase.from('poi').select('*').eq('group_id', member.group_id)
        .eq('is_active', true),
    ])
    setReservations(resData.data ?? [])
    setPois(poisData.data ?? [])
  }

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })

  function getDayReservations(day: Date) {
    return reservations.filter(r =>
      isSameDay(parseISO(r.date_start), day) || isSameDay(parseISO(r.date_end), day)
    )
  }

  async function createReservation() {
    if (!form.poi_id || !form.datum_od || !form.datum_do || !groupId || !userId) {
      toast.error('Ispuni sva obavezna polja!')
      return
    }

    const date_start = new Date(`${form.datum_od}T${form.vrijeme_od}:00`)
    const date_end = new Date(`${form.datum_do}T${form.vrijeme_do}:00`)

    if (date_end <= date_start) {
      toast.error('Kraj mora biti nakon početka!')
      return
    }

    const { error } = await supabase.from('reservations').insert({
      poi_id: form.poi_id,
      group_id: groupId,
      user_id: userId,
      date_start: date_start.toISOString(),
      date_end: date_end.toISOString(),
      notes: form.notes,
    })

    if (error) {
      if (error.code === '23505') toast.error('Ta čeka je već rezervirana u tom terminu!')
      else toast.error('Greška pri rezervaciji')
      return
    }
    toast.success('Rezervacija uspješno kreirana!')
    setShowForm(false)
    setForm({ poi_id: '', datum_od: '', vrijeme_od: '06:00', datum_do: '', vrijeme_do: '12:00', notes: '' })
    load()
  }

  async function cancelReservation(id: string) {
    await supabase.from('reservations').update({ status: 'otkazana' }).eq('id', id)
    toast.success('Rezervacija otkazana')
    load()
  }

  const selectedDayRes = getDayReservations(selectedDate)

  const POI_ICONS: Record<string, string> = {
    ceka: '🎯', hraniliste: '🌾', soliste: '🧂',
    kaljuziste: '💧', prolaz: '🚶', kamera: '📷', ostalo: '📍'
  }

  // Generiraj opcije za sate (0-23)
  const timeOptions = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hStr = h.toString().padStart(2, '0')
      const mStr = m.toString().padStart(2, '0')
      timeOptions.push(`${hStr}:${mStr}`)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rezervacije čeka</h1>
        <button onClick={() => setShowForm(true)}
          className="bg-forest-600 hover:bg-forest-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          + Nova rezervacija
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Kalendar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">
              {format(currentMonth, 'MMMM yyyy', { locale: hr })}
            </h2>
            <div className="flex gap-2">
              <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth()-1))}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-lg">‹</button>
              <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth()+1))}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-lg">›</button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Po','Ut','Sr','Če','Pe','Su','Ne'].map(d => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: (days[0].getDay() + 6) % 7 }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {days.map(day => {
              const dayRes = getDayReservations(day)
              const isSelected = isSameDay(day, selectedDate)
              const isToday = isSameDay(day, new Date())
              return (
                <button key={day.toISOString()} onClick={() => setSelectedDate(day)}
                  className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors
                    ${isSelected ? 'bg-forest-600 text-white' : isToday ? 'bg-forest-50 text-forest-700' : 'hover:bg-gray-50 text-gray-700'}`}>
                  {day.getDate()}
                  {dayRes.length > 0 && (
                    <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full
                      ${isSelected ? 'bg-white' : 'bg-forest-500'}`} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Odabrani dan */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">
              {format(selectedDate, 'EEEE, dd. MMMM yyyy.', { locale: hr })}
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {selectedDayRes.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">Nema rezervacija ovaj dan</div>
            ) : selectedDayRes.map(res => (
              <div key={res.id} className="px-5 py-4 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span>{POI_ICONS[(res.poi as any)?.type] ?? '📍'}</span>
                    <span className="font-medium text-sm text-gray-800">{(res.poi as any)?.name ?? 'Čeka'}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {format(parseISO(res.date_start), 'dd.MM.yyyy')} u {format(parseISO(res.date_start), 'HH:mm')}
                    {' – '}
                    {format(parseISO(res.date_end), 'dd.MM.yyyy')} u {format(parseISO(res.date_end), 'HH:mm')}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{(res.profiles as any)?.full_name}</p>
                  {res.notes && <p className="text-xs text-gray-500 mt-0.5 italic">{res.notes}</p>}
                </div>
                {res.user_id === userId && (
                  <button onClick={() => cancelReservation(res.id)}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors ml-2">
                    Otkaži
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sve aktivne rezervacije */}
      <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Sve aktivne rezervacije ({reservations.length})</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {reservations.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400">Nema aktivnih rezervacija</div>
          ) : reservations.map(res => (
            <div key={res.id} className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">{POI_ICONS[(res.poi as any)?.type] ?? '📍'}</span>
                <div>
                  <p className="font-medium text-sm text-gray-800">{(res.poi as any)?.name}</p>
                  <p className="text-xs text-gray-500">
                    {format(parseISO(res.date_start), 'dd.MM.yyyy')} u {format(parseISO(res.date_start), 'HH:mm')}
                    {' – '}
                    {format(parseISO(res.date_end), 'dd.MM.yyyy')} u {format(parseISO(res.date_end), 'HH:mm')}
                  </p>
                  <p className="text-xs text-gray-400">{(res.profiles as any)?.full_name}</p>
                </div>
              </div>
              {res.user_id === userId && (
                <button onClick={() => cancelReservation(res.id)}
                  className="text-xs text-red-500 hover:text-red-700">Otkaži</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal nova rezervacija */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-800 text-lg">Nova rezervacija</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="space-y-4">
              {/* Čeka */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Čeka / objekt</label>
                <select value={form.poi_id} onChange={e => setForm(f => ({...f, poi_id: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500">
                  <option value="">Odaberi čeku...</option>
                  {pois.map(p => <option key={p.id} value={p.id}>{POI_ICONS[p.type]} {p.name}</option>)}
                </select>
              </div>

              {/* Od — datum i vrijeme odvojeno */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Od</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Datum</label>
                    <input type="date" value={form.datum_od}
                      onChange={e => setForm(f => ({...f, datum_od: e.target.value}))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Vrijeme</label>
                    <select value={form.vrijeme_od}
                      onChange={e => setForm(f => ({...f, vrijeme_od: e.target.value}))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500">
                      {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Do — datum i vrijeme odvojeno */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Do</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Datum</label>
                    <input type="date" value={form.datum_do}
                      onChange={e => setForm(f => ({...f, datum_do: e.target.value}))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Vrijeme</label>
                    <select value={form.vrijeme_do}
                      onChange={e => setForm(f => ({...f, vrijeme_do: e.target.value}))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500">
                      {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Napomena */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Napomena</label>
                <input value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  placeholder="npr. Večernji izlaz na srne" />
              </div>

              <button onClick={createReservation}
                className="w-full bg-forest-600 hover:bg-forest-700 text-white font-medium py-3 rounded-xl transition-colors">
                Rezerviraj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

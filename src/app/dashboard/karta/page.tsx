'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import type { POI } from '@/types'

const POI_ICONS: Record<string, string> = {
  ceka: '🎯', hraniliste: '🌾', soliste: '🧂',
  kaljuziste: '💧', prolaz: '🚶', kamera: '📷', ostalo: '📍'
}

export default function KartaPage() {
  const [pois, setPois] = useState<POI[]>([])
  const [areas, setAreas] = useState<any[]>([])
  const [groupId, setGroupId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newPOI, setNewPOI] = useState({ name: '', type: 'ceka', description: '', lat: '', lng: '' })
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: member } = await supabase
      .from('group_members').select('group_id').eq('user_id', user.id).single()
    if (!member) return
    setGroupId(member.group_id)
    const [poisRes, areasRes] = await Promise.all([
      supabase.from('poi').select('*').eq('group_id', member.group_id).eq('is_active', true),
      supabase.from('areas').select('*').eq('group_id', member.group_id),
    ])
    setPois(poisRes.data ?? [])
    setAreas(areasRes.data ?? [])
  }

  async function savePOI() {
    if (!newPOI.name || !newPOI.lat || !newPOI.lng || !groupId) {
      toast.error('Ispuni sve podatke!')
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from('poi').insert({
      group_id: groupId,
      type: newPOI.type,
      name: newPOI.name,
      description: newPOI.description,
      geom: `POINT(${newPOI.lng} ${newPOI.lat})`,
      created_by: user.id,
    }).select().single()
    if (error) { toast.error('Greška'); return }
    toast.success(`${newPOI.name} dodano!`)
    setPois(p => [...p, data])
    setShowAdd(false)
    setNewPOI({ name: '', type: 'ceka', description: '', lat: '', lng: '' })
  }

  const mapCenter = pois.length > 0
    ? `${pois[0].geom?.coordinates?.[1]},${pois[0].geom?.coordinates?.[0]}`
    : '45.568,16.625'

  const markers = pois.map(p => {
    const c = p.geom?.coordinates ?? [16.625, 45.568]
    return `${c[1]},${c[0]}`
  }).join('|')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      {/* Toolbar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Karta lovišta</span>
        <button onClick={() => setShowAdd(true)}
          style={{ padding: '6px 12px', background: '#247a4b', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer', marginLeft: 8 }}>
          + Dodaj čeku/POI
        </button>
        <a href={`https://www.google.com/maps/@${mapCenter},13z`} target="_blank"
          style={{ padding: '6px 12px', background: '#1d4ed8', color: 'white', borderRadius: 8, fontSize: 12, textDecoration: 'none' }}>
          🗺 Otvori u Google Maps
        </a>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>{pois.length} POI</span>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Map iframe */}
        <div style={{ flex: 1, position: 'relative' }}>
          <iframe
            src={`https://maps.google.com/maps?q=${mapCenter}&z=12&output=embed`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allowFullScreen
          />
        </div>

        {/* POI lista */}
        <div style={{ width: 260, background: 'white', borderLeft: '1px solid #e5e7eb', overflowY: 'auto' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: 13 }}>
            Čeke i POI ({pois.length})
          </div>
          {pois.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              Nema još POI-eva.<br/>Dodaj prvu čeku!
            </div>
          )}
          {pois.map(poi => {
            const c = poi.geom?.coordinates ?? [16.625, 45.568]
            return (
              <div key={poi.id} onClick={() => setSelectedPOI(poi)}
                style={{ padding: '10px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: selectedPOI?.id === poi.id ? '#f0fdf4' : 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{POI_ICONS[poi.type]}</span>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{poi.name}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{poi.type} · {c[1].toFixed(4)}, {c[0].toFixed(4)}</div>
                  </div>
                </div>
                {selectedPOI?.id === poi.id && poi.description && (
                  <div style={{ fontSize: 12, color: '#4b5563', marginTop: 6 }}>{poi.description}</div>
                )}
                {selectedPOI?.id === poi.id && (
                  <a href={`https://maps.google.com/?q=${c[1]},${c[0]}`} target="_blank"
                    style={{ fontSize: 11, color: '#1d4ed8', display: 'block', marginTop: 4 }}>
                    Otvori u Google Maps →
                  </a>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Add POI modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Dodaj čeku / POI</span>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Naziv</label>
              <input value={newPOI.name} onChange={e => setNewPOI(p => ({...p, name: e.target.value}))}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' }}
                placeholder="npr. Čeka kod hrasta" autoFocus />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Vrsta</label>
              <select value={newPOI.type} onChange={e => setNewPOI(p => ({...p, type: e.target.value}))}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}>
                {Object.entries(POI_ICONS).map(([t, icon]) => (
                  <option key={t} value={t}>{icon} {t}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Latitude (npr. 45.5680)</label>
                <input value={newPOI.lat} onChange={e => setNewPOI(p => ({...p, lat: e.target.value}))}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' }}
                  placeholder="45.5680" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Longitude (npr. 16.6250)</label>
                <input value={newPOI.lng} onChange={e => setNewPOI(p => ({...p, lng: e.target.value}))}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' }}
                  placeholder="16.6250" />
              </div>
            </div>
            <div style={{ marginBottom: 4, fontSize: 11, color: '#6b7280' }}>
              💡 Koordinate možeš dobiti desnim klikom u Google Maps → "What's here?"
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Opis</label>
              <textarea value={newPOI.description} onChange={e => setNewPOI(p => ({...p, description: e.target.value}))}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box', resize: 'none' }}
                rows={2} placeholder="Kratki opis..." />
            </div>
            <button onClick={savePOI}
              style={{ width: '100%', background: '#247a4b', color: 'white', border: 'none', borderRadius: 8, padding: 12, fontSize: 15, cursor: 'pointer', fontWeight: 600 }}>
              Spremi
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

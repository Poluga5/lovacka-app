'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import type { POI } from '@/types'

const POI_ICONS: Record<string, string> = {
  ceka: '🎯', hraniliste: '🌾', soliste: '🧂',
  kaljuziste: '💧', prolaz: '🚶', kamera: '📷', ostalo: '📍'
}
const POI_COLORS: Record<string, string> = {
  ceka: '#DC2626', hraniliste: '#16A34A', soliste: '#D97706',
  kaljuziste: '#2563EB', prolaz: '#7C3AED', kamera: '#0891B2', ostalo: '#6B7280'
}

export default function KartaPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [pois, setPois] = useState<POI[]>([])
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [clickedCoords, setClickedCoords] = useState<[number, number] | null>(null)
  const [newPOI, setNewPOI] = useState({ name: '', type: 'ceka', description: '' })
  const [groupId, setGroupId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function initMap() {
      const maplibre = await import('maplibre-gl')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from('group_members').select('group_id').eq('user_id', user.id).single()
      if (!member) return
      setGroupId(member.group_id)

      const { data: poisData } = await supabase
        .from('poi').select('*').eq('group_id', member.group_id).eq('is_active', true)
      setPois(poisData ?? [])

      if (!mapContainer.current) return

      const map = new maplibre.default.Map({
        container: mapContainer.current,
        style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
        center: [16.45, 45.55],
        zoom: 10,
      })
      mapRef.current = map

      map.on('load', () => {
        poisData?.forEach(poi => addMarker(map, maplibre.default, poi))
      })

      map.on('click', (e) => {
        setClickedCoords([e.lngLat.lng, e.lngLat.lat])
        setShowAddForm(true)
      })
    }
    initMap()
    return () => mapRef.current?.remove()
  }, [])

  function addMarker(map: any, maplibre: any, poi: POI) {
    const el = document.createElement('div')
    el.className = 'cursor-pointer select-none'
    el.style.cssText = `
      background: ${POI_COLORS[poi.type]};
      color: white; border-radius: 50%;
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; border: 2px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      transition: transform 0.15s;
    `
    el.textContent = POI_ICONS[poi.type]
    el.addEventListener('mouseenter', () => el.style.transform = 'scale(1.2)')
    el.addEventListener('mouseleave', () => el.style.transform = 'scale(1)')
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      setSelectedPOI(poi)
      setShowAddForm(false)
    })

    const coords = poi.geom?.coordinates ?? [16.45, 45.55]
    new maplibre.Marker({ element: el })
      .setLngLat(coords)
      .addTo(map)
  }

  async function savePOI() {
    if (!clickedCoords || !groupId || !newPOI.name) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase.from('poi').insert({
      group_id: groupId,
      type: newPOI.type,
      name: newPOI.name,
      description: newPOI.description,
      geom: `POINT(${clickedCoords[0]} ${clickedCoords[1]})`,
      created_by: user.id,
    }).select().single()

    if (error) { toast.error('Greška pri spremanju'); return }
    toast.success('POI dodan!')
    setPois(p => [...p, data])
    setShowAddForm(false)
    setNewPOI({ name: '', type: 'ceka', description: '' })

    if (mapRef.current) {
      const maplibre = await import('maplibre-gl')
      addMarker(mapRef.current, maplibre.default, data)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <h1 className="font-semibold text-gray-800">Karta lovišta</h1>
        <p className="text-sm text-gray-500">Klikni na kartu za dodavanje čeke/POI-a</p>
      </div>

      <div className="flex-1 relative">
        <div ref={mapContainer} className="absolute inset-0" />

        {/* POI legend */}
        <div className="absolute top-4 left-4 bg-white rounded-xl shadow-md p-3 text-xs space-y-1">
          {Object.entries(POI_ICONS).map(([type, icon]) => (
            <div key={type} className="flex items-center gap-2">
              <span>{icon}</span>
              <span className="text-gray-600 capitalize">{type}</span>
            </div>
          ))}
        </div>

        {/* Add POI form */}
        {showAddForm && clickedCoords && (
          <div className="absolute top-4 right-4 bg-white rounded-2xl shadow-xl p-5 w-72 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Novi POI</h3>
              <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Naziv</label>
                <input value={newPOI.name} onChange={e => setNewPOI(p => ({...p, name: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  placeholder="npr. Čeka na hrastu" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Vrsta</label>
                <select value={newPOI.type} onChange={e => setNewPOI(p => ({...p, type: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500">
                  {Object.entries(POI_ICONS).map(([t, icon]) => (
                    <option key={t} value={t}>{icon} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Opis (opcionalno)</label>
                <textarea value={newPOI.description} onChange={e => setNewPOI(p => ({...p, description: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  rows={2} placeholder="Kratki opis..." />
              </div>
              <p className="text-xs text-gray-400">
                Lokacija: {clickedCoords[1].toFixed(5)}, {clickedCoords[0].toFixed(5)}
              </p>
              <button onClick={savePOI}
                className="w-full bg-forest-600 hover:bg-forest-700 text-white font-medium py-2 rounded-lg text-sm transition-colors">
                Spremi POI
              </button>
            </div>
          </div>
        )}

        {/* Selected POI detail */}
        {selectedPOI && (
          <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-72 bg-white rounded-2xl shadow-xl p-5 z-10">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{POI_ICONS[selectedPOI.type]}</span>
                <div>
                  <h3 className="font-semibold text-gray-800">{selectedPOI.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full text-white"
                    style={{ background: POI_COLORS[selectedPOI.type] }}>
                    {selectedPOI.type}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedPOI(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            {selectedPOI.description && (
              <p className="text-sm text-gray-600 mt-3">{selectedPOI.description}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

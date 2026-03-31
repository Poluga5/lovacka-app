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

type Mode = 'view' | 'draw_boundary' | 'add_poi'

export default function KartaPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const [pois, setPois] = useState<POI[]>([])
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null)
  const [mode, setMode] = useState<Mode>('view')
  const [boundaryPoints, setBoundaryPoints] = useState<[number, number][]>([])
  const [clickedCoords, setClickedCoords] = useState<[number, number] | null>(null)
  const [newPOI, setNewPOI] = useState({ name: '', type: 'ceka', description: '' })
  const [groupId, setGroupId] = useState<string | null>(null)
  const [areas, setAreas] = useState<any[]>([])
  const [mapLoaded, setMapLoaded] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function initMap() {
      const maplibre = await import('maplibre-gl')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !mapContainer.current) return

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

      const map = new maplibre.default.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors',
              maxzoom: 19,
            }
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
        },
        center: [16.625, 45.568],
        zoom: 11,
      })
      mapRef.current = map

      map.on('load', () => {
        setMapLoaded(true)
        poisRes.data?.forEach(poi => addMarker(map, maplibre.default, poi))
        areasRes.data?.forEach(area => drawArea(map, area))
      })
    }
    initMap()
    return () => mapRef.current?.remove()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    const handler = (e: any) => {
      const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      if (mode === 'add_poi') {
        setClickedCoords(coords)
      } else if (mode === 'draw_boundary') {
        setBoundaryPoints(prev => {
          const pts = [...prev, coords]
          updatePreview(map, pts)
          return pts
        })
      }
    }

    if (mode !== 'view') {
      map.on('click', handler)
      map.getCanvas().style.cursor = 'crosshair'
    } else {
      map.getCanvas().style.cursor = ''
    }
    return () => map.off('click', handler)
  }, [mode, mapLoaded])

  function updatePreview(map: any, points: [number, number][]) {
    const geojson = {
      type: 'Feature' as const,
      geometry: {
        type: points.length >= 3 ? 'Polygon' : 'LineString',
        coordinates: points.length >= 3 ? [[...points, points[0]]] : points
      }
    }
    if (map.getSource('preview')) {
      ;(map.getSource('preview') as any).setData(geojson)
    } else {
      map.addSource('preview', { type: 'geojson', data: geojson })
      map.addLayer({ id: 'preview-fill', type: 'fill', source: 'preview', paint: { 'fill-color': '#22C55E', 'fill-opacity': 0.15 } })
      map.addLayer({ id: 'preview-line', type: 'line', source: 'preview', paint: { 'line-color': '#EC4899', 'line-width': 2.5, 'line-dasharray': [3, 2] } })
    }
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    points.forEach(p => {
      const el = document.createElement('div')
      el.style.cssText = 'width:10px;height:10px;background:#EC4899;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);'
      const { default: ml } = require('maplibre-gl')
      markersRef.current.push(new ml.Marker({ element: el }).setLngLat(p).addTo(map))
    })
  }

  function drawArea(map: any, area: any) {
    const id = `area-${area.id}`
    if (map.getSource(id)) return
    const coords = area.geom?.coordinates ?? area.geom
    if (!coords) return
    map.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: coords } } })
    map.addLayer({ id: `${id}-fill`, type: 'fill', source: id, paint: { 'fill-color': '#22C55E', 'fill-opacity': 0.12 } })
    map.addLayer({ id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': '#16A34A', 'line-width': 2.5 } })
  }

  function addMarker(map: any, maplibre: any, poi: POI) {
    const el = document.createElement('div')
    el.style.cssText = `background:${POI_COLORS[poi.type]};border-radius:50%;width:32px;height:32px;
      display:flex;align-items:center;justify-content:center;font-size:14px;
      border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;`
    el.textContent = POI_ICONS[poi.type]
    el.onclick = (e) => { e.stopPropagation(); setSelectedPOI(poi) }
    const coords = poi.geom?.coordinates ?? [16.625, 45.568]
    new maplibre.Marker({ element: el }).setLngLat(coords).addTo(map)
  }

  async function saveBoundary() {
    if (boundaryPoints.length < 3 || !groupId) { toast.error('Min. 3 točke!'); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const closed = [...boundaryPoints, boundaryPoints[0]]
    const wkt = `POLYGON((${closed.map(p => `${p[0]} ${p[1]}`).join(',')}))`
    const { data, error } = await supabase.from('areas').insert({
      group_id: groupId, name: 'III/108 Popovača',
      geom: wkt, created_by: user.id,
    }).select().single()
    if (error) { toast.error('Greška'); return }
    toast.success('Granica spremljena!')
    cancelMode()
    if (mapRef.current && data) drawArea(mapRef.current, { ...data, geom: { coordinates: [closed] } })
  }

  async function savePOI() {
    if (!clickedCoords || !groupId || !newPOI.name) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from('poi').insert({
      group_id: groupId, type: newPOI.type, name: newPOI.name,
      description: newPOI.description,
      geom: `POINT(${clickedCoords[0]} ${clickedCoords[1]})`,
      created_by: user.id,
    }).select().single()
    if (error) { toast.error('Greška'); return }
    toast.success('POI dodan!')
    setPois(p => [...p, data])
    setClickedCoords(null)
    setNewPOI({ name: '', type: 'ceka', description: '' })
    if (mapRef.current) {
      const ml = await import('maplibre-gl')
      addMarker(mapRef.current, ml.default, data)
    }
  }

  function cancelMode() {
    setMode('view')
    setBoundaryPoints([])
    setClickedCoords(null)
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    const map = mapRef.current
    if (!map) return
    if (map.getLayer('preview-fill')) map.removeLayer('preview-fill')
    if (map.getLayer('preview-line')) map.removeLayer('preview-line')
    if (map.getSource('preview')) map.removeSource('preview')
  }

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 flex-wrap">
        <h1 className="font-semibold text-gray-800 mr-2">Karta lovišta</h1>
        {mode === 'view' ? (
          <>
            <button onClick={() => setMode('draw_boundary')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium">
              ✏️ Crtaj granicu
            </button>
            <button onClick={() => setMode('add_poi')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 hover:bg-forest-700 text-white rounded-lg text-xs font-medium">
              + Dodaj čeku/POI
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            {mode === 'draw_boundary' && (
              <>
                <span className="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg border border-green-200">
                  Klikaj rubove lovišta · {boundaryPoints.length} točaka
                </span>
                {boundaryPoints.length >= 3 && (
                  <button onClick={saveBoundary}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium">
                    ✓ Zatvori i spremi
                  </button>
                )}
              </>
            )}
            {mode === 'add_poi' && (
              <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-200">
                Klikni na kartu za lokaciju
              </span>
            )}
            <button onClick={cancelMode}
              className="px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-lg text-xs">
              Odustani
            </button>
          </div>
        )}
        <div className="ml-auto text-xs text-gray-400">{pois.length} POI · {areas.length} granica</div>
      </div>

      <div className="flex-1 relative">
        <div ref={mapContainer} className="absolute inset-0" />

        {!mapLoaded && (
          <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
            <div className="text-gray-500">Učitavam kartu...</div>
          </div>
        )}

        <div className="absolute top-4 left-4 bg-white/95 rounded-xl shadow-md p-3 text-xs space-y-1">
          {Object.entries(POI_ICONS).map(([t, icon]) => (
            <div key={t} className="flex items-center gap-2">
              <span>{icon}</span><span className="text-gray-600 capitalize">{t}</span>
            </div>
          ))}
          <div className="border-t pt-1 mt-1 flex items-center gap-2">
            <span className="w-4 h-0.5 bg-green-600 inline-block rounded" />
            <span className="text-gray-600">Granica</span>
          </div>
        </div>

        {mode === 'add_poi' && clickedCoords && (
          <div className="absolute top-4 right-4 bg-white rounded-2xl shadow-xl p-5 w-72 z-10">
            <div className="flex justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Novi POI</h3>
              <button onClick={() => setClickedCoords(null)} className="text-gray-400">✕</button>
            </div>
            <div className="space-y-3">
              <input value={newPOI.name} onChange={e => setNewPOI(p => ({...p, name: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                placeholder="Naziv čeke..." autoFocus />
              <div className="grid grid-cols-4 gap-1">
                {Object.entries(POI_ICONS).map(([t, icon]) => (
                  <button key={t} onClick={() => setNewPOI(p => ({...p, type: t}))}
                    className={`py-1.5 rounded-lg text-center border text-xs transition-colors ${newPOI.type === t ? 'bg-forest-600 text-white border-forest-600' : 'border-gray-200'}`}>
                    <span className="block text-base">{icon}</span>{t}
                  </button>
                ))}
              </div>
              <textarea value={newPOI.description} onChange={e => setNewPOI(p => ({...p, description: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                rows={2} placeholder="Opis (opcionalno)" />
              <button onClick={savePOI}
                className="w-full bg-forest-600 hover:bg-forest-700 text-white font-medium py-2 rounded-lg text-sm">
                Spremi
              </button>
            </div>
          </div>
        )}

        {selectedPOI && (
          <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-72 bg-white rounded-2xl shadow-xl p-5 z-10">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{POI_ICONS[selectedPOI.type]}</span>
                <div>
                  <h3 className="font-semibold text-gray-800">{selectedPOI.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: POI_COLORS[selectedPOI.type] }}>
                    {selectedPOI.type}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedPOI(null)} className="text-gray-400">✕</button>
            </div>
            {selectedPOI.description && <p className="text-sm text-gray-600 mt-3">{selectedPOI.description}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

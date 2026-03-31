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

const MAP_STYLES = {
  karta: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  satelit: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  teren: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
}

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
  const [mapStyle, setMapStyle] = useState<keyof typeof MAP_STYLES>('karta')
  const [areas, setAreas] = useState<any[]>([])
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

      const [poisRes, areasRes] = await Promise.all([
        supabase.from('poi').select('*').eq('group_id', member.group_id).eq('is_active', true),
        supabase.from('areas').select('*').eq('group_id', member.group_id),
      ])
      setPois(poisRes.data ?? [])
      setAreas(areasRes.data ?? [])

      if (!mapContainer.current) return

      // Centrirano na Popovača
      const map = new maplibre.default.Map({
        container: mapContainer.current,
        style: MAP_STYLES.karta,
        center: [16.625, 45.568],
        zoom: 11,
      })
      mapRef.current = map

      map.on('load', () => {
        // Dodaj POI markere
        poisRes.data?.forEach(poi => addMarker(map, maplibre.default, poi))

        // Dodaj granice ako postoje
        areasRes.data?.forEach(area => {
          if (area.geom) drawAreaOnMap(map, area)
        })
      })

      map.on('click', (e: any) => {
        const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat]

        if (mode === 'add_poi') {
          setClickedCoords(coords)
        } else if (mode === 'draw_boundary') {
          setBoundaryPoints(prev => {
            const newPoints = [...prev, coords]
            updateBoundaryPreview(map, newPoints)
            return newPoints
          })
        }
      })
    }
    initMap()
    return () => mapRef.current?.remove()
  }, [])

  // Update map style
  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.setStyle(MAP_STYLES[mapStyle])
    mapRef.current.once('styledata', () => {
      pois.forEach(async poi => {
        const maplibre = await import('maplibre-gl')
        addMarker(mapRef.current, maplibre.default, poi)
      })
      areas.forEach(area => {
        if (area.geom) drawAreaOnMap(mapRef.current, area)
      })
    })
  }, [mapStyle])

  // Update click handler when mode changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const handler = (e: any) => {
      const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      if (mode === 'add_poi') {
        setClickedCoords(coords)
      } else if (mode === 'draw_boundary') {
        setBoundaryPoints(prev => {
          const newPoints = [...prev, coords]
          updateBoundaryPreview(map, newPoints)
          return newPoints
        })
      }
    }

    map.off('click', handler)
    if (mode !== 'view') {
      map.on('click', handler)
      map.getCanvas().style.cursor = 'crosshair'
    } else {
      map.getCanvas().style.cursor = ''
    }

    return () => { map.off('click', handler) }
  }, [mode])

  function updateBoundaryPreview(map: any, points: [number, number][]) {
    if (points.length < 2) return
    const coords = points.length >= 3
      ? [...points, points[0]]
      : points

    if (map.getSource('boundary-preview')) {
      map.getSource('boundary-preview').setData({
        type: 'Feature',
        geometry: { type: points.length >= 3 ? 'Polygon' : 'LineString', coordinates: points.length >= 3 ? [coords] : coords }
      })
    } else {
      map.addSource('boundary-preview', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: points }
        }
      })
      map.addLayer({
        id: 'boundary-preview-line',
        type: 'line',
        source: 'boundary-preview',
        paint: { 'line-color': '#EC4899', 'line-width': 2, 'line-dasharray': [2, 2] }
      })
    }

    // Dodaj točke kao markere
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    points.forEach(p => {
      const el = document.createElement('div')
      el.style.cssText = 'width:8px;height:8px;background:#EC4899;border-radius:50%;border:2px solid white;'
      const { default: maplibre } = require('maplibre-gl')
      const m = new maplibre.Marker({ element: el }).setLngLat(p).addTo(map)
      markersRef.current.push(m)
    })
  }

  function drawAreaOnMap(map: any, area: any) {
    const sourceId = `area-${area.id}`
    if (map.getSource(sourceId)) return

    const coords = area.geom?.coordinates ?? area.geom
    map.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: coords } }
    })
    map.addLayer({
      id: `${sourceId}-fill`,
      type: 'fill',
      source: sourceId,
      paint: { 'fill-color': '#22C55E', 'fill-opacity': 0.1 }
    })
    map.addLayer({
      id: `${sourceId}-line`,
      type: 'line',
      source: sourceId,
      paint: { 'line-color': '#16A34A', 'line-width': 2.5 }
    })
  }

  function addMarker(map: any, maplibre: any, poi: POI) {
    const el = document.createElement('div')
    el.style.cssText = `background:${POI_COLORS[poi.type]};color:white;border-radius:50%;
      width:32px;height:32px;display:flex;align-items:center;justify-content:center;
      font-size:14px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);
      cursor:pointer;transition:transform 0.15s;`
    el.textContent = POI_ICONS[poi.type]
    el.addEventListener('mouseenter', () => el.style.transform = 'scale(1.2)')
    el.addEventListener('mouseleave', () => el.style.transform = 'scale(1)')
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      setSelectedPOI(poi)
    })
    const coords = poi.geom?.coordinates ?? [16.625, 45.568]
    new maplibre.Marker({ element: el }).setLngLat(coords).addTo(map)
  }

  async function saveBoundary() {
    if (boundaryPoints.length < 3 || !groupId) {
      toast.error('Trebaš minimalno 3 točke za granicu!')
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const closed = [...boundaryPoints, boundaryPoints[0]]
    const wkt = `POLYGON((${closed.map(p => `${p[0]} ${p[1]}`).join(',')}))`

    const { data, error } = await supabase.from('areas').insert({
      group_id: groupId,
      name: 'III/108 Popovača',
      geom: wkt,
      created_by: user.id,
    }).select().single()

    if (error) { toast.error('Greška pri spremanju granice'); console.error(error); return }

    toast.success('Granica lovišta spremljena!')
    setMode('view')
    setBoundaryPoints([])
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (mapRef.current && data) {
      setAreas(prev => [...prev, data])
      drawAreaOnMap(mapRef.current, { ...data, geom: { coordinates: [closed] } })
    }
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
    setClickedCoords(null)
    setNewPOI({ name: '', type: 'ceka', description: '' })

    if (mapRef.current) {
      const maplibre = await import('maplibre-gl')
      addMarker(mapRef.current, maplibre.default, data)
    }
  }

  function cancelMode() {
    setMode('view')
    setBoundaryPoints([])
    setClickedCoords(null)
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    if (mapRef.current?.getLayer('boundary-preview-line')) {
      mapRef.current.removeLayer('boundary-preview-line')
      mapRef.current.removeSource('boundary-preview')
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 flex-wrap">
        <h1 className="font-semibold text-gray-800 mr-2">Karta lovišta</h1>

        {/* Map style */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {(Object.keys(MAP_STYLES) as (keyof typeof MAP_STYLES)[]).map(s => (
            <button key={s} onClick={() => setMapStyle(s)}
              className={`px-3 py-1.5 capitalize transition-colors ${mapStyle === s ? 'bg-forest-600 text-white' : 'hover:bg-gray-50 text-gray-600'}`}>
              {s}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-gray-200" />

        {/* Mode buttons */}
        {mode === 'view' ? (
          <>
            <button onClick={() => setMode('draw_boundary')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Crtaj granicu
            </button>
            <button onClick={() => setMode('add_poi')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 hover:bg-forest-700 text-white rounded-lg text-xs font-medium transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Dodaj čeku/POI
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            {mode === 'draw_boundary' && (
              <>
                <span className="text-xs text-gray-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                  Klikaj rubove lovišta ({boundaryPoints.length} točaka)
                </span>
                {boundaryPoints.length >= 3 && (
                  <button onClick={saveBoundary}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium">
                    Zatvori i spremi
                  </button>
                )}
              </>
            )}
            {mode === 'add_poi' && (
              <span className="text-xs text-gray-600 bg-forest-50 px-3 py-1.5 rounded-lg border border-forest-200">
                Klikni na kartu za lokaciju POI-a
              </span>
            )}
            <button onClick={cancelMode}
              className="px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-lg text-xs">
              Odustani
            </button>
          </div>
        )}

        {/* POI count */}
        <div className="ml-auto text-xs text-gray-400">
          {pois.length} POI · {areas.length} granica
        </div>
      </div>

      <div className="flex-1 relative">
        <div ref={mapContainer} className="absolute inset-0" />

        {/* Legend */}
        <div className="absolute top-4 left-4 bg-white/95 rounded-xl shadow-md p-3 text-xs space-y-1 backdrop-blur-sm">
          {Object.entries(POI_ICONS).map(([type, icon]) => (
            <div key={type} className="flex items-center gap-2">
              <span>{icon}</span>
              <span className="text-gray-600 capitalize">{type}</span>
            </div>
          ))}
          <div className="border-t border-gray-100 pt-1 mt-1">
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-green-600 inline-block" />
              <span className="text-gray-600">Granica lovišta</span>
            </div>
          </div>
        </div>

        {/* Add POI panel */}
        {mode === 'add_poi' && clickedCoords && (
          <div className="absolute top-4 right-4 bg-white rounded-2xl shadow-xl p-5 w-72 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Novi POI</h3>
              <button onClick={() => setClickedCoords(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Naziv</label>
                <input value={newPOI.name} onChange={e => setNewPOI(p => ({...p, name: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  placeholder="npr. Čeka kod hrasta" autoFocus />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Vrsta</label>
                <div className="grid grid-cols-4 gap-1">
                  {Object.entries(POI_ICONS).map(([t, icon]) => (
                    <button key={t} onClick={() => setNewPOI(p => ({...p, type: t}))}
                      className={`py-1.5 rounded-lg text-center border text-xs transition-colors ${
                        newPOI.type === t ? 'bg-forest-600 text-white border-forest-600' : 'border-gray-200 hover:border-forest-300'
                      }`}>
                      <span className="block text-base">{icon}</span>
                      <span className="leading-tight">{t}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Opis</label>
                <textarea value={newPOI.description} onChange={e => setNewPOI(p => ({...p, description: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  rows={2} placeholder="Kratki opis..." />
              </div>
              <p className="text-xs text-gray-400">
                📍 {clickedCoords[1].toFixed(5)}, {clickedCoords[0].toFixed(5)}
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

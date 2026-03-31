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

const TILE_LAYERS = {
  karta: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors'
  },
  satelit: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, Maxar, Earthstar Geographics'
  },
  teren: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenTopoMap contributors'
  }
}

export default function KartaPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const boundaryLayerRef = useRef<any>(null)
  const [pois, setPois] = useState<POI[]>([])
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null)
  const [mode, setMode] = useState<Mode>('view')
  const [boundaryPoints, setBoundaryPoints] = useState<[number, number][]>([])
  const [clickedCoords, setClickedCoords] = useState<[number, number] | null>(null)
  const [newPOI, setNewPOI] = useState({ name: '', type: 'ceka', description: '' })
  const [groupId, setGroupId] = useState<string | null>(null)
  const [mapStyle, setMapStyle] = useState<keyof typeof TILE_LAYERS>('karta')
  const [areas, setAreas] = useState<any[]>([])
  const modeRef = useRef<Mode>('view')
  const boundaryPointsRef = useRef<[number, number][]>([])
  const previewPolyRef = useRef<any>(null)
  const tempMarkersRef = useRef<any[]>([])
  const supabase = createClient()

  useEffect(() => {
    async function initMap() {
      if (!mapContainer.current) return
      const L = (await import('leaflet')).default

      // Fix Leaflet default icons
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapContainer.current, {
        center: [45.568, 16.625],
        zoom: 11,
        zoomControl: true,
      })
      mapRef.current = map

      const tileLayer = L.tileLayer(TILE_LAYERS.karta.url, {
        attribution: TILE_LAYERS.karta.attribution,
        maxZoom: 19,
      }).addTo(map)
      tileLayerRef.current = tileLayer

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

      poisRes.data?.forEach(poi => addPOIMarker(L, map, poi))
      areasRes.data?.forEach(area => drawArea(L, map, area))

      map.on('click', (e: any) => {
        const coords: [number, number] = [e.latlng.lng, e.latlng.lat]
        const currentMode = modeRef.current

        if (currentMode === 'add_poi') {
          setClickedCoords(coords)
        } else if (currentMode === 'draw_boundary') {
          const latLng: [number, number] = [e.latlng.lat, e.latlng.lng]
          
          // Add temp marker
          const marker = L.circleMarker(latLng, {
            radius: 5, color: '#EC4899', fillColor: '#EC4899', fillOpacity: 1, weight: 2
          }).addTo(map)
          tempMarkersRef.current.push(marker)

          boundaryPointsRef.current = [...boundaryPointsRef.current, coords]
          setBoundaryPoints([...boundaryPointsRef.current])

          // Update preview polygon
          if (previewPolyRef.current) {
            map.removeLayer(previewPolyRef.current)
          }
          if (boundaryPointsRef.current.length >= 3) {
            const latLngs = boundaryPointsRef.current.map(p => [p[1], p[0]] as [number, number])
            previewPolyRef.current = L.polygon(latLngs, {
              color: '#EC4899', weight: 2, dashArray: '6,4',
              fillColor: '#22C55E', fillOpacity: 0.1
            }).addTo(map)
          }
        }
      })
    }
    initMap()
    return () => { mapRef.current?.remove() }
  }, [])

  // Switch tile layer
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return
    const loadLeaflet = async () => {
      const L = (await import('leaflet')).default
      mapRef.current.removeLayer(tileLayerRef.current)
      const newLayer = L.tileLayer(TILE_LAYERS[mapStyle].url, {
        attribution: TILE_LAYERS[mapStyle].attribution,
        maxZoom: 19,
      }).addTo(mapRef.current)
      tileLayerRef.current = newLayer
    }
    loadLeaflet()
  }, [mapStyle])

  // Sync mode to ref
  useEffect(() => {
    modeRef.current = mode
    if (mapRef.current) {
      mapRef.current.getContainer().style.cursor = mode !== 'view' ? 'crosshair' : ''
    }
  }, [mode])

  function addPOIMarker(L: any, map: any, poi: POI) {
    const icon = L.divIcon({
      html: `<div style="background:${POI_COLORS[poi.type]};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;">${POI_ICONS[poi.type]}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      className: ''
    })
    const coords = poi.geom?.coordinates ?? [16.625, 45.568]
    const marker = L.marker([coords[1], coords[0]], { icon })
      .addTo(map)
      .on('click', (e: any) => {
        e.originalEvent.stopPropagation()
        setSelectedPOI(poi)
      })
    return marker
  }

  function drawArea(L: any, map: any, area: any) {
    try {
      const coords = area.geom?.coordinates?.[0] ?? area.geom?.[0]
      if (!coords) return
      const latLngs = coords.map((p: number[]) => [p[1], p[0]])
      L.polygon(latLngs, {
        color: '#16A34A', weight: 2.5,
        fillColor: '#22C55E', fillOpacity: 0.1
      }).addTo(map)
    } catch (e) { console.error('Area draw error', e) }
  }

  async function saveBoundary() {
    if (boundaryPointsRef.current.length < 3 || !groupId) {
      toast.error('Min. 3 točke!')
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const closed = [...boundaryPointsRef.current, boundaryPointsRef.current[0]]
    const wkt = `POLYGON((${closed.map(p => `${p[0]} ${p[1]}`).join(',')}))`
    const { data, error } = await supabase.from('areas').insert({
      group_id: groupId, name: 'Granica lovišta',
      geom: wkt, created_by: user.id,
    }).select().single()
    if (error) { toast.error('Greška pri spremanju'); return }
    toast.success('Granica lovišta spremljena!')
    cancelMode()
    if (mapRef.current && data) {
      const L = (await import('leaflet')).default
      setAreas(prev => [...prev, data])
      drawArea(L, mapRef.current, { ...data, geom: { coordinates: [closed] } })
    }
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
    toast.success(`${newPOI.name} dodano!`)
    setPois(p => [...p, data])
    setClickedCoords(null)
    setNewPOI({ name: '', type: 'ceka', description: '' })
    if (mapRef.current) {
      const L = (await import('leaflet')).default
      addPOIMarker(L, mapRef.current, data)
    }
  }

  function cancelMode() {
    setMode('view')
    setBoundaryPoints([])
    boundaryPointsRef.current = []
    setClickedCoords(null)
    tempMarkersRef.current.forEach(m => mapRef.current?.removeLayer(m))
    tempMarkersRef.current = []
    if (previewPolyRef.current) {
      mapRef.current?.removeLayer(previewPolyRef.current)
      previewPolyRef.current = null
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 flex-wrap z-10">
        <h1 className="font-semibold text-gray-800 mr-2">Karta lovišta</h1>

        {/* Stil karte */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {(Object.keys(TILE_LAYERS) as (keyof typeof TILE_LAYERS)[]).map(s => (
            <button key={s} onClick={() => setMapStyle(s)}
              className={`px-3 py-1.5 capitalize transition-colors ${mapStyle === s ? 'bg-forest-600 text-white' : 'hover:bg-gray-50 text-gray-600'}`}>
              {s === 'karta' ? '🗺 Karta' : s === 'satelit' ? '🛰 Satelit' : '⛰ Teren'}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {mode === 'view' ? (
          <>
            <button onClick={() => setMode('draw_boundary')}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium">
              ✏️ Crtaj granicu
            </button>
            <button onClick={() => setMode('add_poi')}
              className="px-3 py-1.5 bg-forest-600 hover:bg-forest-700 text-white rounded-lg text-xs font-medium">
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
        <div ref={mapContainer} className="absolute inset-0" style={{ zIndex: 0 }} />

        {/* Legenda */}
        <div className="absolute top-4 left-4 bg-white/95 rounded-xl shadow-md p-3 text-xs space-y-1" style={{ zIndex: 1000 }}>
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

        {/* Add POI panel */}
        {mode === 'add_poi' && clickedCoords && (
          <div className="absolute top-4 right-4 bg-white rounded-2xl shadow-xl p-5 w-72" style={{ zIndex: 1000 }}>
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
                    className={`py-1.5 rounded-lg text-center border text-xs transition-colors ${newPOI.type === t ? 'bg-forest-600 text-white border-forest-600' : 'border-gray-200 hover:border-forest-300'}`}>
                    <span className="block text-base">{icon}</span>{t}
                  </button>
                ))}
              </div>
              <textarea value={newPOI.description} onChange={e => setNewPOI(p => ({...p, description: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                rows={2} placeholder="Opis (opcionalno)" />
              <p className="text-xs text-gray-400">📍 {clickedCoords[1].toFixed(5)}, {clickedCoords[0].toFixed(5)}</p>
              <button onClick={savePOI}
                className="w-full bg-forest-600 hover:bg-forest-700 text-white font-medium py-2 rounded-lg text-sm">
                Spremi
              </button>
            </div>
          </div>
        )}

        {/* Selected POI */}
        {selectedPOI && (
          <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-72 bg-white rounded-2xl shadow-xl p-5" style={{ zIndex: 1000 }}>
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

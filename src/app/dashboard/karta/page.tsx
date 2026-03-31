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
  const tileLayerRef = useRef<any>(null)
  const [pois, setPois] = useState<POI[]>([])
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null)
  const [mode, setMode] = useState<Mode>('view')
  const [boundaryPoints, setBoundaryPoints] = useState<[number, number][]>([])
  const [clickedCoords, setClickedCoords] = useState<[number, number] | null>(null)
  const [newPOI, setNewPOI] = useState({ name: '', type: 'ceka', description: '' })
  const [groupId, setGroupId] = useState<string | null>(null)
  const [mapStyle, setMapStyle] = useState('karta')
  const [areas, setAreas] = useState<any[]>([])
  const modeRef = useRef<Mode>('view')
  const boundaryPointsRef = useRef<[number, number][]>([])
  const previewPolyRef = useRef<any>(null)
  const tempMarkersRef = useRef<any[]>([])
  const supabase = createClient()

  const TILES: Record<string, {url: string, attr: string}> = {
    karta: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap' },
    satelit: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '© Esri' },
    teren: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '© OpenTopoMap' },
  }

  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    async function initMap() {
      await new Promise(r => setTimeout(r, 500))
      if (!mapContainer.current || mapRef.current) return
      const L = (await import('leaflet')).default
      delete (L.Icon.Default.prototype as any)._getIconUrl

      const map = L.map(mapContainer.current, { center: [45.568, 16.625], zoom: 11 })
      mapRef.current = map

      tileLayerRef.current = L.tileLayer(TILES.karta.url, { attribution: TILES.karta.attr, maxZoom: 19 }).addTo(map)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('group_members').select('group_id').eq('user_id', user.id).single()
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
        if (modeRef.current === 'add_poi') {
          setClickedCoords(coords)
        } else if (modeRef.current === 'draw_boundary') {
          const ll: [number, number] = [e.latlng.lat, e.latlng.lng]
          tempMarkersRef.current.push(
            L.circleMarker(ll, { radius: 5, color: '#EC4899', fillColor: '#EC4899', fillOpacity: 1 }).addTo(map)
          )
          boundaryPointsRef.current = [...boundaryPointsRef.current, coords]
          setBoundaryPoints([...boundaryPointsRef.current])
          if (previewPolyRef.current) map.removeLayer(previewPolyRef.current)
          if (boundaryPointsRef.current.length >= 3) {
            previewPolyRef.current = L.polygon(
              boundaryPointsRef.current.map(p => [p[1], p[0]] as [number,number]),
              { color: '#EC4899', weight: 2, dashArray: '6,4', fillColor: '#22C55E', fillOpacity: 0.1 }
            ).addTo(map)
          }
        }
      })
    }
    initMap()
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }
  }, [])

  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return
    async function sw() {
      const L = (await import('leaflet')).default
      mapRef.current.removeLayer(tileLayerRef.current)
      tileLayerRef.current = L.tileLayer(TILES[mapStyle].url, { attribution: TILES[mapStyle].attr, maxZoom: 19 }).addTo(mapRef.current)
    }
    sw()
  }, [mapStyle])

  useEffect(() => {
    modeRef.current = mode
    if (mapRef.current) mapRef.current.getContainer().style.cursor = mode !== 'view' ? 'crosshair' : ''
  }, [mode])

  function addPOIMarker(L: any, map: any, poi: POI) {
    const icon = L.divIcon({
      html: `<div style="background:${POI_COLORS[poi.type]};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${POI_ICONS[poi.type]}</div>`,
      iconSize: [32, 32], iconAnchor: [16, 16], className: ''
    })
    const c = poi.geom?.coordinates ?? [16.625, 45.568]
    L.marker([c[1], c[0]], { icon }).addTo(map)
      .on('click', (e: any) => { e.originalEvent?.stopPropagation(); setSelectedPOI(poi) })
  }

  function drawArea(L: any, map: any, area: any) {
    try {
      const coords = area.geom?.coordinates?.[0] ?? area.geom?.[0]
      if (!coords) return
      L.polygon(coords.map((p: number[]) => [p[1], p[0]]), {
        color: '#16A34A', weight: 2.5, fillColor: '#22C55E', fillOpacity: 0.1
      }).addTo(map)
    } catch (e) {}
  }

  async function saveBoundary() {
    if (boundaryPointsRef.current.length < 3 || !groupId) { toast.error('Min. 3 točke!'); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const closed = [...boundaryPointsRef.current, boundaryPointsRef.current[0]]
    const { data, error } = await supabase.from('areas').insert({
      group_id: groupId, name: 'Granica lovišta',
      geom: `POLYGON((${closed.map(p => `${p[0]} ${p[1]}`).join(',')}))`,
      created_by: user.id,
    }).select().single()
    if (error) { toast.error('Greška'); return }
    toast.success('Granica spremljena!')
    cancelMode()
    if (mapRef.current && data) {
      const L = (await import('leaflet')).default
      setAreas(a => [...a, data])
      drawArea(L, mapRef.current, { geom: { coordinates: [closed] } })
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
    if (mapRef.current) { const L = (await import('leaflet')).default; addPOIMarker(L, mapRef.current, data) }
  }

  function cancelMode() {
    setMode('view'); setBoundaryPoints([]); boundaryPointsRef.current = []; setClickedCoords(null)
    tempMarkersRef.current.forEach(m => mapRef.current?.removeLayer(m)); tempMarkersRef.current = []
    if (previewPolyRef.current) { mapRef.current?.removeLayer(previewPolyRef.current); previewPolyRef.current = null }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0, zIndex: 1000 }}>
        <span style={{ fontWeight: 600, fontSize: 14, marginRight: 8 }}>Karta lovišta</span>
        <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', fontSize: 12 }}>
          {Object.keys(TILES).map(s => (
            <button key={s} onClick={() => setMapStyle(s)} style={{ padding: '6px 12px', background: mapStyle === s ? '#247a4b' : 'white', color: mapStyle === s ? 'white' : '#4b5563', border: 'none', cursor: 'pointer' }}>
              {s === 'karta' ? '🗺 Karta' : s === 'satelit' ? '🛰 Satelit' : '⛰ Teren'}
            </button>
          ))}
        </div>
        {mode === 'view' ? (
          <>
            <button onClick={() => setMode('draw_boundary')} style={{ padding: '6px 12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>✏️ Crtaj granicu</button>
            <button onClick={() => setMode('add_poi')} style={{ padding: '6px 12px', background: '#247a4b', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>+ Dodaj čeku/POI</button>
          </>
        ) : (
          <>
            {mode === 'draw_boundary' && <span style={{ fontSize: 12, background: '#f0fdf4', color: '#15803d', padding: '6px 12px', borderRadius: 8, border: '1px solid #bbf7d0' }}>Klikaj rubove · {boundaryPoints.length} točaka</span>}
            {boundaryPoints.length >= 3 && <button onClick={saveBoundary} style={{ padding: '6px 12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>✓ Spremi</button>}
            {mode === 'add_poi' && <span style={{ fontSize: 12, background: '#eff6ff', color: '#1d4ed8', padding: '6px 12px', borderRadius: 8 }}>Klikni na kartu</span>}
            <button onClick={cancelMode} style={{ padding: '6px 12px', background: 'white', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Odustani</button>
          </>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>{pois.length} POI · {areas.length} granica</span>
      </div>

      <div style={{ position: 'relative', flex: 1 }}>
        <div ref={mapContainer} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

        <div style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(255,255,255,0.95)', borderRadius: 12, padding: 12, fontSize: 12, zIndex: 1000, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          {Object.entries(POI_ICONS).map(([t, icon]) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span>{icon}</span><span style={{ color: '#4b5563' }}>{t}</span>
            </div>
          ))}
        </div>

        {mode === 'add_poi' && clickedCoords && (
          <div style={{ position: 'absolute', top: 16, right: 16, background: 'white', borderRadius: 16, padding: 20, width: 280, zIndex: 1000, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontWeight: 600 }}>Novi POI</span>
              <button onClick={() => setClickedCoords(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <input value={newPOI.name} onChange={e => setNewPOI(p => ({...p, name: e.target.value}))}
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }}
              placeholder="Naziv čeke..." autoFocus />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 10 }}>
              {Object.entries(POI_ICONS).map(([t, icon]) => (
                <button key={t} onClick={() => setNewPOI(p => ({...p, type: t}))}
                  style={{ padding: '6px 2px', borderRadius: 8, border: newPOI.type === t ? '2px solid #247a4b' : '1px solid #e5e7eb', background: newPOI.type === t ? '#247a4b' : 'white', color: newPOI.type === t ? 'white' : '#374151', cursor: 'pointer', fontSize: 11, textAlign: 'center' }}>
                  <div style={{ fontSize: 18 }}>{icon}</div>{t}
                </button>
              ))}
            </div>
            <textarea value={newPOI.description} onChange={e => setNewPOI(p => ({...p, description: e.target.value}))}
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, marginBottom: 8, boxSizing: 'border-box', resize: 'none' }}
              rows={2} placeholder="Opis..." />
            <button onClick={savePOI} style={{ width: '100%', background: '#247a4b', color: 'white', border: 'none', borderRadius: 8, padding: 10, fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>Spremi</button>
          </div>
        )}

        {selectedPOI && (
          <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'white', borderRadius: 16, padding: 20, minWidth: 250, zIndex: 1000, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 28 }}>{POI_ICONS[selectedPOI.type]}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{selectedPOI.name}</div>
                  <span style={{ fontSize: 11, background: POI_COLORS[selectedPOI.type], color: 'white', padding: '2px 8px', borderRadius: 20 }}>{selectedPOI.type}</span>
                </div>
              </div>
              <button onClick={() => setSelectedPOI(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            {selectedPOI.description && <p style={{ fontSize: 13, color: '#4b5563', marginTop: 10 }}>{selectedPOI.description}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

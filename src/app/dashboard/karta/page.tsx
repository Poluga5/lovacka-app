'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { hr } from 'date-fns/locale'
import type { POI } from '@/types'

const POI_ICONS: Record<string, string> = {
  ceka: '🎯', hraniliste: '🌾', soliste: '🧂',
  kaljuziste: '💧', prolaz: '🚶', kamera: '📷', ostalo: '📍'
}
const POI_COLORS: Record<string, string> = {
  ceka: '#DC2626', hraniliste: '#16A34A', soliste: '#D97706',
  kaljuziste: '#2563EB', prolaz: '#7C3AED', kamera: '#0891B2', ostalo: '#6B7280'
}

type Mode = 'view' | 'draw_boundary' | 'add_poi' | 'edit_poi'

export default function KartaPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const [pois, setPois] = useState<POI[]>([])
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null)
  const [poiReservations, setPoiReservations] = useState<any[]>([])
  const [mode, setMode] = useState<Mode>('view')
  const [boundaryPoints, setBoundaryPoints] = useState<[number, number][]>([])
  const [clickedCoords, setClickedCoords] = useState<[number, number] | null>(null)
  const [newPOI, setNewPOI] = useState({ name: '', type: 'ceka', description: '' })
  const [editPOI, setEditPOI] = useState({ name: '', type: 'ceka', description: '' })
  const [groupId, setGroupId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [mapStyle, setMapStyle] = useState('karta')
  const [areas, setAreas] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [showNewRes, setShowNewRes] = useState(false)
  const [newRes, setNewRes] = useState({ date_start: '', date_end: '', notes: '' })
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
      setUserId(user.id)
      const { data: member } = await supabase.from('group_members').select('group_id, role').eq('user_id', user.id).single()
      if (!member) return
      setGroupId(member.group_id)
      setIsAdmin(member.role === 'admin' || member.role === 'clan')

      const [poisRes, areasRes] = await Promise.all([
        supabase.from('poi').select('*').eq('group_id', member.group_id).eq('is_active', true),
        supabase.from('areas').select('id, name, geojson_cache').eq('group_id', member.group_id),
      ])

      setPois(poisRes.data ?? [])
      setAreas(areasRes.data ?? [])
      poisRes.data?.forEach(poi => addPOIMarker(L, map, poi))
      areasRes.data?.forEach((area: any) => drawArea(L, map, area))

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
        } else {
          setSelectedPOI(null)
          setPoiReservations([])
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

  async function selectPOI(poi: POI) {
    setSelectedPOI(poi)
    setShowNewRes(false)
    setMode('view')
    const { data } = await supabase
      .from('reservations')
      .select('*, profiles(full_name)')
      .eq('poi_id', poi.id)
      .eq('status', 'aktivna')
      .gte('date_end', new Date().toISOString())
      .order('date_start')
    setPoiReservations(data ?? [])
  }

  function addPOIMarker(L: any, map: any, poi: POI) {
    const icon = L.divIcon({
      html: `<div style="background:${POI_COLORS[poi.type]};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${POI_ICONS[poi.type]}</div>`,
      iconSize: [32, 32], iconAnchor: [16, 16], className: ''
    })
    const c = poi.geom?.coordinates ?? [16.625, 45.568]
    const marker = L.marker([c[1], c[0]], { icon }).addTo(map)
      .on('click', (e: any) => { e.originalEvent?.stopPropagation(); selectPOI(poi) })
    markersRef.current.set(poi.id, marker)
    return marker
  }

  function drawArea(L: any, map: any, area: any) {
    try {
      const geo = typeof area.geojson_cache === 'string' ? JSON.parse(area.geojson_cache) : area.geojson_cache
      if (!geo?.coordinates) return
      const coords = geo.coordinates[0].map((p: number[]) => [p[1], p[0]])
      L.polygon(coords, { color: '#EC0000', weight: 3, fillColor: '#22C55E', fillOpacity: 0.1 }).addTo(map)
    } catch (e) { console.error(e) }
  }

  async function saveBoundary() {
    if (boundaryPointsRef.current.length < 3 || !groupId) { toast.error('Min. 3 točke!'); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const closed = [...boundaryPointsRef.current, boundaryPointsRef.current[0]]
    const geojson = JSON.stringify({ type: 'Polygon', coordinates: [closed] })
    const { error } = await supabase.from('areas').insert({
      group_id: groupId, name: 'Granica lovišta',
      geom: `POLYGON((${closed.map(p => `${p[0]} ${p[1]}`).join(',')}))`,
      geojson_cache: geojson, created_by: user.id,
    })
    if (error) { toast.error('Greška'); return }
    toast.success('Granica spremljena!')
    cancelMode()
    window.location.reload()
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

  async function updatePOI() {
    if (!selectedPOI || !editPOI.name) return
    const { error } = await supabase.from('poi').update({
      name: editPOI.name, type: editPOI.type, description: editPOI.description,
      updated_at: new Date().toISOString()
    }).eq('id', selectedPOI.id)
    if (error) { toast.error('Greška'); return }
    toast.success('POI ažuriran!')
    setPois(p => p.map(poi => poi.id === selectedPOI.id ? { ...poi, ...editPOI } : poi))
    setSelectedPOI({ ...selectedPOI, ...editPOI } as POI)
    setMode('view')
  }

  async function deletePOI(poi: POI) {
    if (!confirm(`Obriši "${poi.name}"?`)) return
    await supabase.from('poi').update({ is_active: false }).eq('id', poi.id)
    toast.success('POI obrisan')
    setPois(p => p.filter(p => p.id !== poi.id))
    const marker = markersRef.current.get(poi.id)
    if (marker && mapRef.current) mapRef.current.removeLayer(marker)
    markersRef.current.delete(poi.id)
    setSelectedPOI(null)
    setPoiReservations([])
  }

  async function createReservation() {
    if (!newRes.date_start || !newRes.date_end || !selectedPOI || !groupId || !userId) return
    const { error } = await supabase.from('reservations').insert({
      poi_id: selectedPOI.id,
      group_id: groupId,
      user_id: userId,
      date_start: new Date(newRes.date_start).toISOString(),
      date_end: new Date(newRes.date_end).toISOString(),
      notes: newRes.notes,
    })
    if (error) {
      if (error.code === '23505') toast.error('Ta čeka je već rezervirana u tom terminu!')
      else toast.error('Greška')
      return
    }
    toast.success('Rezervacija kreirana!')
    setShowNewRes(false)
    setNewRes({ date_start: '', date_end: '', notes: '' })
    selectPOI(selectedPOI)
  }

  async function cancelReservation(id: string) {
    await supabase.from('reservations').update({ status: 'otkazana' }).eq('id', id)
    toast.success('Rezervacija otkazana')
    if (selectedPOI) selectPOI(selectedPOI)
  }

  function cancelMode() {
    setMode('view'); setBoundaryPoints([]); boundaryPointsRef.current = []; setClickedCoords(null)
    tempMarkersRef.current.forEach(m => mapRef.current?.removeLayer(m)); tempMarkersRef.current = []
    if (previewPolyRef.current) { mapRef.current?.removeLayer(previewPolyRef.current); previewPolyRef.current = null }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0, zIndex: 1000 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Karta lovišta</span>
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
            {boundaryPoints.length >= 3 && <button onClick={saveBoundary} style={{ padding: '6px 12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>✓ Spremi granicu</button>}
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
          <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 4, paddingTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 3, background: '#EC0000', display: 'inline-block' }} />
            <span style={{ color: '#4b5563' }}>Granica</span>
          </div>
        </div>

        {/* Add POI */}
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

        {/* Selected POI panel */}
        {selectedPOI && mode === 'view' && (
          <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'white', borderRadius: 16, padding: 20, width: 300, zIndex: 1000, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 28 }}>{POI_ICONS[selectedPOI.type]}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{selectedPOI.name}</div>
                  <span style={{ fontSize: 11, background: POI_COLORS[selectedPOI.type], color: 'white', padding: '2px 8px', borderRadius: 20 }}>{selectedPOI.type}</span>
                </div>
              </div>
              <button onClick={() => { setSelectedPOI(null); setPoiReservations([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af' }}>✕</button>
            </div>

            {selectedPOI.description && <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 12 }}>{selectedPOI.description}</p>}

            {/* Rezervacije */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  Rezervacije ({poiReservations.length})
                </span>
                {selectedPOI.type === 'ceka' && (
                  <button onClick={() => setShowNewRes(!showNewRes)}
                    style={{ fontSize: 11, padding: '4px 10px', background: '#247a4b', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                    + Nova
                  </button>
                )}
              </div>

              {poiReservations.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>
                  Nema aktivnih rezervacija
                </div>
              ) : (
                poiReservations.map(res => (
                  <div key={res.id} style={{ background: '#f0fdf4', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#15803d' }}>
                      {(res.profiles as any)?.full_name}
                    </div>
                    <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>
                      {format(parseISO(res.date_start), 'dd.MM.yyyy HH:mm', { locale: hr })} →{' '}
                      {format(parseISO(res.date_end), 'HH:mm', { locale: hr })}
                    </div>
                    {res.notes && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{res.notes}</div>}
                    {res.user_id === userId && (
                      <button onClick={() => cancelReservation(res.id)}
                        style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 }}>
                        Otkaži
                      </button>
                    )}
                  </div>
                ))
              )}

              {/* Nova rezervacija forma */}
              {showNewRes && (
                <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12, marginTop: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 2 }}>Od</label>
                      <input type="datetime-local" value={newRes.date_start}
                        onChange={e => setNewRes(r => ({...r, date_start: e.target.value}))}
                        style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 8px', fontSize: 11, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 2 }}>Do</label>
                      <input type="datetime-local" value={newRes.date_end}
                        onChange={e => setNewRes(r => ({...r, date_end: e.target.value}))}
                        style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 8px', fontSize: 11, boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <input value={newRes.notes} onChange={e => setNewRes(r => ({...r, notes: e.target.value}))}
                    style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 8px', fontSize: 11, marginBottom: 6, boxSizing: 'border-box' }}
                    placeholder="Napomena..." />
                  <button onClick={createReservation}
                    style={{ width: '100%', background: '#247a4b', color: 'white', border: 'none', borderRadius: 6, padding: '7px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
                    Rezerviraj
                  </button>
                </div>
              )}
            </div>

            {/* Edit/Delete */}
            {isAdmin && (
              <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                <button onClick={() => {
                  setEditPOI({ name: selectedPOI.name, type: selectedPOI.type, description: selectedPOI.description ?? '' })
                  setMode('edit_poi')
                }} style={{ flex: 1, padding: '7px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                  ✏️ Uredi
                </button>
                <button onClick={() => deletePOI(selectedPOI)}
                  style={{ flex: 1, padding: '7px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                  🗑 Obriši
                </button>
              </div>
            )}
          </div>
        )}

        {/* Edit POI */}
        {selectedPOI && mode === 'edit_poi' && (
          <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'white', borderRadius: 16, padding: 20, width: 300, zIndex: 1000, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontWeight: 600 }}>Uredi POI</span>
              <button onClick={() => setMode('view')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af' }}>✕</button>
            </div>
            <input value={editPOI.name} onChange={e => setEditPOI(p => ({...p, name: e.target.value}))}
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 10 }}>
              {Object.entries(POI_ICONS).map(([t, icon]) => (
                <button key={t} onClick={() => setEditPOI(p => ({...p, type: t}))}
                  style={{ padding: '6px 2px', borderRadius: 8, border: editPOI.type === t ? '2px solid #247a4b' : '1px solid #e5e7eb', background: editPOI.type === t ? '#247a4b' : 'white', color: editPOI.type === t ? 'white' : '#374151', cursor: 'pointer', fontSize: 11, textAlign: 'center' }}>
                  <div style={{ fontSize: 18 }}>{icon}</div>{t}
                </button>
              ))}
            </div>
            <textarea value={editPOI.description} onChange={e => setEditPOI(p => ({...p, description: e.target.value}))}
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, marginBottom: 8, boxSizing: 'border-box', resize: 'none' }}
              rows={2} placeholder="Opis..." />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={updatePOI} style={{ flex: 1, background: '#247a4b', color: 'white', border: 'none', borderRadius: 8, padding: 10, fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>Spremi</button>
              <button onClick={() => setMode('view')} style={{ flex: 1, background: 'white', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, fontSize: 14, cursor: 'pointer' }}>Odustani</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

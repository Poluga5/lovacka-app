'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { format, parseISO, isToday } from 'date-fns'
import { hr } from 'date-fns/locale'
import type { POI } from '@/types'

const POI_ICONS: Record<string, string> = {
  ceka: '🎯', hraniliste: '🌾', soliste: '🧂',
  kaljuziste: '💧', prolaz: '🚶', kamera: '📷', ostalo: '📍'
}

type Mode = 'view' | 'draw_boundary' | 'add_poi' | 'edit_poi'
type Tab = 'info' | 'rezervacije' | 'zadaci' | 'novi_zadatak'

export default function KartaPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const [pois, setPois] = useState<POI[]>([])
  const [allReservations, setAllReservations] = useState<any[]>([])
  const [selectedPOI, setSelectedPOI] = useState<any | null>(null)
  const [poiReservations, setPoiReservations] = useState<any[]>([])
  const [poiZadaci, setPoiZadaci] = useState<any[]>([])
  const [lovci, setLovci] = useState<any[]>([])
  const [mode, setMode] = useState<Mode>('view')
  const [tab, setTab] = useState<Tab>('info')
  const [boundaryPoints, setBoundaryPoints] = useState<[number, number][]>([])
  const [clickedCoords, setClickedCoords] = useState<[number, number] | null>(null)
  const [newPOI, setNewPOI] = useState({ name: '', type: 'ceka', description: '' })
  const [editPOI, setEditPOI] = useState({ name: '', type: 'ceka', description: '', zaduzeni_ids: [] as string[], zapazanja: '' })
  const [groupId, setGroupId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [mapStyle, setMapStyle] = useState('karta')
  const [areas, setAreas] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [showNewRes, setShowNewRes] = useState(false)
  const [newRes, setNewRes] = useState({ date_start: '', date_end: '', notes: '' })
  const [noviZadatak, setNoviZadatak] = useState({ naslov: '', opis: '', zaduzeni_ids: [] as string[], prioritet: 'normalno', rok: '' })
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

  function getMarkerColor(poiId: string, type: string, reservations: any[]): string {
    const todayRes = reservations.filter(r => r.poi_id === poiId && r.status === 'aktivna' && isToday(parseISO(r.date_start)))
    const futureRes = reservations.filter(r => r.poi_id === poiId && r.status === 'aktivna')
    if (todayRes.length > 0) return '#F97316'
    if (futureRes.length > 0) return '#EAB308'
    const colors: Record<string, string> = { ceka: '#DC2626', hraniliste: '#16A34A', soliste: '#D97706', kaljuziste: '#2563EB', prolaz: '#7C3AED', kamera: '#0891B2', ostalo: '#6B7280' }
    return colors[type] ?? '#6B7280'
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

      const [poisRes, areasRes, resRes, lovciRes] = await Promise.all([
        supabase.from('poi').select('*').eq('group_id', member.group_id).eq('is_active', true),
        supabase.from('areas').select('id, name, geojson_cache').eq('group_id', member.group_id),
        supabase.from('reservations').select('*, profiles(full_name)').eq('group_id', member.group_id).eq('status', 'aktivna').gte('date_end', new Date().toISOString()),
        supabase.from('lovci').select('id, full_name, phone, email').eq('group_id', member.group_id).eq('status', 'aktivan').order('full_name'),
      ])

      const reservations = resRes.data ?? []
      setPois(poisRes.data ?? [])
      setAllReservations(reservations)
      setAreas(areasRes.data ?? [])
      setLovci(lovciRes.data ?? [])
      poisRes.data?.forEach(poi => addPOIMarker(L, map, poi, reservations))
      areasRes.data?.forEach((area: any) => drawArea(L, map, area))

      map.on('click', (e: any) => {
        if (modeRef.current === 'add_poi') {
          setClickedCoords([e.latlng.lng, e.latlng.lat])
        } else if (modeRef.current === 'draw_boundary') {
          const ll: [number, number] = [e.latlng.lat, e.latlng.lng]
          tempMarkersRef.current.push(L.circleMarker(ll, { radius: 5, color: '#EC4899', fillColor: '#EC4899', fillOpacity: 1 }).addTo(map))
          boundaryPointsRef.current = [...boundaryPointsRef.current, [e.latlng.lng, e.latlng.lat]]
          setBoundaryPoints([...boundaryPointsRef.current])
          if (previewPolyRef.current) map.removeLayer(previewPolyRef.current)
          if (boundaryPointsRef.current.length >= 3) {
            previewPolyRef.current = L.polygon(boundaryPointsRef.current.map(p => [p[1], p[0]] as [number,number]), { color: '#EC4899', weight: 2, dashArray: '6,4', fillColor: '#22C55E', fillOpacity: 0.1 }).addTo(map)
          }
        } else {
          setSelectedPOI(null)
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

  function addPOIMarker(L: any, map: any, poi: any, reservations: any[]) {
    const color = getMarkerColor(poi.id, poi.type, reservations)
    const icon = L.divIcon({
      html: `<div style="background:${color};width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);">${POI_ICONS[poi.type]}</div>`,
      iconSize: [34, 34], iconAnchor: [17, 17], className: ''
    })
    const marker = L.marker([poi.geom?.coordinates?.[1] ?? 45.568, poi.geom?.coordinates?.[0] ?? 16.625], { icon })
      .addTo(map).on('click', (e: any) => { e.originalEvent?.stopPropagation(); selectPOI(poi) })
    markersRef.current.set(poi.id, marker)
  }

  function updateMarkerColor(poi: any, reservations: any[]) {
    const marker = markersRef.current.get(poi.id)
    if (!marker) return
    const el = marker.getElement()
    if (el) { const div = el.querySelector('div'); if (div) div.style.background = getMarkerColor(poi.id, poi.type, reservations) }
  }

  function drawArea(L: any, map: any, area: any) {
    try {
      const geo = typeof area.geojson_cache === 'string' ? JSON.parse(area.geojson_cache) : area.geojson_cache
      if (!geo?.coordinates) return
      L.polygon(geo.coordinates[0].map((p: number[]) => [p[1], p[0]]), { color: '#EC0000', weight: 3, fillColor: '#22C55E', fillOpacity: 0.1 }).addTo(map)
    } catch (e) {}
  }

  async function selectPOI(poi: any) {
    setSelectedPOI(poi)
    setShowNewRes(false)
    setMode('view')
    setTab('info')
    const [resData, zadaciData] = await Promise.all([
      supabase.from('reservations').select('*, profiles(full_name)').eq('poi_id', poi.id).eq('status', 'aktivna').gte('date_end', new Date().toISOString()).order('date_start'),
      supabase.from('poi_zadaci').select('*').eq('poi_id', poi.id).order('created_at', { ascending: false }),
    ])
    setPoiReservations(resData.data ?? [])
    setPoiZadaci(zadaciData.data ?? [])
  }

  function getLovacById(id: string) { return lovci.find(l => l.id === id) }

  function toggleZaduzeni(id: string, arr: string[], setArr: (a: string[]) => void) {
    setArr(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])
  }

  async function savePOI() {
    if (!clickedCoords || !groupId || !newPOI.name) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from('poi').insert({
      group_id: groupId, type: newPOI.type, name: newPOI.name,
      description: newPOI.description, geom: `POINT(${clickedCoords[0]} ${clickedCoords[1]})`, created_by: user.id,
    }).select().single()
    if (error) { toast.error('Greška'); return }
    toast.success(`${newPOI.name} dodano!`)
    setPois(p => [...p, data])
    setClickedCoords(null)
    setNewPOI({ name: '', type: 'ceka', description: '' })
    if (mapRef.current) { const L = (await import('leaflet')).default; addPOIMarker(L, mapRef.current, data, allReservations) }
  }

  async function updatePOI() {
    if (!selectedPOI) return
    const { error } = await supabase.from('poi').update({
      name: editPOI.name, type: editPOI.type, description: editPOI.description,
      zaduzeni_ids: editPOI.zaduzeni_ids, zapazanja: editPOI.zapazanja,
      updated_at: new Date().toISOString()
    }).eq('id', selectedPOI.id)
    if (error) { toast.error('Greška'); return }
    toast.success('POI ažuriran!')
    const updated = { ...selectedPOI, ...editPOI }
    setPois(p => p.map(poi => poi.id === selectedPOI.id ? updated : poi))
    setSelectedPOI(updated)
    setMode('view')
  }

  async function deletePOI(poi: any) {
    if (!confirm(`Obriši "${poi.name}"?`)) return
    await supabase.from('poi').update({ is_active: false }).eq('id', poi.id)
    toast.success('POI obrisan')
    setPois(p => p.filter(p => p.id !== poi.id))
    const marker = markersRef.current.get(poi.id)
    if (marker && mapRef.current) mapRef.current.removeLayer(marker)
    markersRef.current.delete(poi.id)
    setSelectedPOI(null)
  }

  async function createReservation() {
    if (!newRes.date_start || !newRes.date_end || !selectedPOI || !groupId || !userId) return
    const { error } = await supabase.from('reservations').insert({
      poi_id: selectedPOI.id, group_id: groupId, user_id: userId,
      date_start: new Date(newRes.date_start).toISOString(),
      date_end: new Date(newRes.date_end).toISOString(), notes: newRes.notes,
    })
    if (error) { toast.error(error.code === '23505' ? 'Već rezervirano!' : 'Greška'); return }
    toast.success('Rezervacija kreirana!')
    setShowNewRes(false)
    setNewRes({ date_start: '', date_end: '', notes: '' })
    const { data } = await supabase.from('reservations').select('*, profiles(full_name)').eq('poi_id', selectedPOI.id).eq('status', 'aktivna').gte('date_end', new Date().toISOString()).order('date_start')
    setPoiReservations(data ?? [])
    const updatedAll = [...allReservations, ...(data ?? [])]
    setAllReservations(updatedAll)
    updateMarkerColor(selectedPOI, updatedAll)
  }

  async function cancelReservation(id: string) {
    await supabase.from('reservations').update({ status: 'otkazana' }).eq('id', id)
    toast.success('Rezervacija otkazana')
    const newAll = allReservations.filter(r => r.id !== id)
    setAllReservations(newAll)
    if (selectedPOI) {
      setPoiReservations(p => p.filter(r => r.id !== id))
      updateMarkerColor(selectedPOI, newAll)
    }
  }

  async function kreirajZadatak() {
    if (!noviZadatak.naslov || !selectedPOI || !groupId || !userId) { toast.error('Naslov je obavezan!'); return }
    const { error } = await supabase.from('poi_zadaci').insert({
      poi_id: selectedPOI.id, group_id: groupId,
      naslov: noviZadatak.naslov, opis: noviZadatak.opis,
      zaduzeni_ids: noviZadatak.zaduzeni_ids,
      prioritet: noviZadatak.prioritet,
      rok: noviZadatak.rok || null,
      kreirao: userId,
    })
    if (error) { toast.error('Greška'); return }

    // Pošalji email obavijest zaduženim lovcima
    const zaduzeniLovci = lovci.filter(l => noviZadatak.zaduzeni_ids.includes(l.id))
    for (const lovac of zaduzeniLovci) {
      if (lovac.email) {
        await fetch('/api/posalji-obavijest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: lovac.email,
            ime: lovac.full_name,
            poi_naziv: selectedPOI.name,
            zadatak: noviZadatak.naslov,
            opis: noviZadatak.opis,
            rok: noviZadatak.rok,
          })
        }).catch(() => {}) // ne blokiraj ako email ne uspije
      }
    }

    toast.success('Zadatak kreiran!' + (zaduzeniLovci.filter(l => l.email).length > 0 ? ' Email obavijest poslana.' : ''))
    setNoviZadatak({ naslov: '', opis: '', zaduzeni_ids: [], prioritet: 'normalno', rok: '' })
    setTab('zadaci')
    const { data } = await supabase.from('poi_zadaci').select('*').eq('poi_id', selectedPOI.id).order('created_at', { ascending: false })
    setPoiZadaci(data ?? [])
  }

  async function zatvoriZadatak(id: string, komentar: string) {
    await supabase.from('poi_zadaci').update({
      status: 'zatvoreno', zatvorio: userId, zatvoreno_at: new Date().toISOString(), komentar_zatvaranja: komentar
    }).eq('id', id)
    toast.success('Zadatak zatvoren!')
    const { data } = await supabase.from('poi_zadaci').select('*').eq('poi_id', selectedPOI?.id).order('created_at', { ascending: false })
    setPoiZadaci(data ?? [])
  }

  async function saveBoundary() {
    if (boundaryPointsRef.current.length < 3 || !groupId) { toast.error('Min. 3 točke!'); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const closed = [...boundaryPointsRef.current, boundaryPointsRef.current[0]]
    const { error } = await supabase.from('areas').insert({
      group_id: groupId, name: 'Granica lovišta',
      geom: `POLYGON((${closed.map(p => `${p[0]} ${p[1]}`).join(',')}))`,
      geojson_cache: JSON.stringify({ type: 'Polygon', coordinates: [closed] }), created_by: user.id,
    })
    if (error) { toast.error('Greška'); return }
    toast.success('Granica spremljena!')
    cancelMode()
    window.location.reload()
  }

  function cancelMode() {
    setMode('view'); setBoundaryPoints([]); boundaryPointsRef.current = []; setClickedCoords(null)
    tempMarkersRef.current.forEach(m => mapRef.current?.removeLayer(m)); tempMarkersRef.current = []
    if (previewPolyRef.current) { mapRef.current?.removeLayer(previewPolyRef.current); previewPolyRef.current = null }
  }

  const PRIORITET_COLOR: Record<string, string> = { hitno: '#DC2626', visoko: '#F97316', normalno: '#6B7280', nisko: '#9CA3AF' }
  const tabBtn = (t: Tab, label: string) => (
    <button onClick={() => setTab(t)} style={{ padding: '5px 10px', fontSize: 11, border: 'none', cursor: 'pointer', borderRadius: 6, background: tab === t ? '#247a4b' : '#f3f4f6', color: tab === t ? 'white' : '#374151', fontWeight: tab === t ? 600 : 400 }}>
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      {/* Toolbar */}
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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#6b7280' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#DC2626', display: 'inline-block' }} /> Slobodna
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F97316', display: 'inline-block' }} /> Danas
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EAB308', display: 'inline-block' }} /> Rezervirana
        </div>
      </div>

      <div style={{ position: 'relative', flex: 1 }}>
        <div ref={mapContainer} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

        {/* Legenda */}
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
              placeholder="Naziv..." autoFocus />
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

        {/* POI Panel */}
        {selectedPOI && mode === 'view' && (
          <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'white', borderRadius: 16, width: 320, zIndex: 1000, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', maxHeight: '78vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 26 }}>{POI_ICONS[selectedPOI.type]}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedPOI.name}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: getMarkerColor(selectedPOI.id, selectedPOI.type, allReservations) }}>
                      {allReservations.filter(r => r.poi_id === selectedPOI.id && isToday(parseISO(r.date_start))).length > 0 ? '🟠 Rezervirano danas' :
                       allReservations.filter(r => r.poi_id === selectedPOI.id).length > 0 ? '🟡 Ima rezervacije' : '🟢 Slobodna'}
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedPOI(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af' }}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {tabBtn('info', 'Info')}
                {tabBtn('rezervacije', `Rezervacije${poiReservations.length > 0 ? ` (${poiReservations.length})` : ''}`)}
                {tabBtn('zadaci', `Zadaci${poiZadaci.filter(z => z.status === 'otvoreno').length > 0 ? ` (${poiZadaci.filter(z => z.status === 'otvoreno').length})` : ''}`)}
                {tabBtn('novi_zadatak', '+ Zadatak')}
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '12px 18px', overflowY: 'auto', flex: 1 }}>

              {/* INFO */}
              {tab === 'info' && (
                <div>
                  {selectedPOI.description && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>OPIS</div>
                      <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>{selectedPOI.description}</p>
                    </div>
                  )}
                  {selectedPOI.zaduzeni_ids?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>ZADUŽENI LOVCI</div>
                      {selectedPOI.zaduzeni_ids.map((id: string) => {
                        const l = getLovacById(id)
                        return l ? (
                          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #f3f4f6' }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>
                              {l.full_name.charAt(0)}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{l.full_name}</div>
                              <div style={{ fontSize: 11, color: '#6b7280' }}>{l.phone && `📱 ${l.phone}`}{l.phone && l.email && ' · '}{l.email && `✉ ${l.email}`}</div>
                            </div>
                          </div>
                        ) : null
                      })}
                    </div>
                  )}
                  {selectedPOI.zapazanja && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>ZAPAŽANJA</div>
                      <p style={{ fontSize: 13, color: '#374151', margin: 0, background: '#fffbeb', padding: '8px 10px', borderRadius: 8 }}>{selectedPOI.zapazanja}</p>
                    </div>
                  )}
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={() => {
                        setEditPOI({ name: selectedPOI.name, type: selectedPOI.type, description: selectedPOI.description ?? '', zaduzeni_ids: selectedPOI.zaduzeni_ids ?? [], zapazanja: selectedPOI.zapazanja ?? '' })
                        setMode('edit_poi')
                      }} style={{ flex: 1, padding: '7px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>✏️ Uredi</button>
                      <button onClick={() => deletePOI(selectedPOI)} style={{ flex: 1, padding: '7px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>🗑 Obriši</button>
                    </div>
                  )}
                </div>
              )}

              {/* REZERVACIJE */}
              {tab === 'rezervacije' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                    <button onClick={() => setShowNewRes(!showNewRes)} style={{ fontSize: 12, padding: '5px 12px', background: '#247a4b', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                      {showNewRes ? 'Zatvori' : '+ Nova rezervacija'}
                    </button>
                  </div>
                  {showNewRes && (
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                        <div>
                          <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 2 }}>Od</label>
                          <input type="datetime-local" value={newRes.date_start} onChange={e => setNewRes(r => ({...r, date_start: e.target.value}))}
                            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 8px', fontSize: 11, boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 2 }}>Do</label>
                          <input type="datetime-local" value={newRes.date_end} onChange={e => setNewRes(r => ({...r, date_end: e.target.value}))}
                            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 8px', fontSize: 11, boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <input value={newRes.notes} onChange={e => setNewRes(r => ({...r, notes: e.target.value}))}
                        style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 8px', fontSize: 11, marginBottom: 6, boxSizing: 'border-box' }}
                        placeholder="Napomena..." />
                      <button onClick={createReservation} style={{ width: '100%', background: '#247a4b', color: 'white', border: 'none', borderRadius: 6, padding: '7px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>Rezerviraj</button>
                    </div>
                  )}
                  {poiReservations.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '16px 0' }}>Nema aktivnih rezervacija</div>
                  ) : poiReservations.map(res => (
                    <div key={res.id} style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>{(res.profiles as any)?.full_name}</div>
                          <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>
                            {format(parseISO(res.date_start), 'dd.MM.yyyy HH:mm', { locale: hr })} → {format(parseISO(res.date_end), 'HH:mm dd.MM', { locale: hr })}
                          </div>
                          {res.notes && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{res.notes}</div>}
                        </div>
                        {(res.user_id === userId || isAdmin) && (
                          <button onClick={() => cancelReservation(res.id)} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>Otkaži</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ZADACI */}
              {tab === 'zadaci' && (
                <div>
                  {poiZadaci.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '16px 0' }}>Nema zadataka</div>
                  ) : poiZadaci.map(z => (
                    <ZadatakKartica key={z.id} zadatak={z} lovci={lovci} userId={userId} isAdmin={isAdmin} onZatvori={zatvoriZadatak} />
                  ))}
                </div>
              )}

              {/* NOVI ZADATAK */}
              {tab === 'novi_zadatak' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>Naslov zadatka *</label>
                    <input value={noviZadatak.naslov} onChange={e => setNoviZadatak(n => ({...n, naslov: e.target.value}))}
                      style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box' }}
                      placeholder="npr. Napuniti hranilište" autoFocus />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>Opis</label>
                    <textarea value={noviZadatak.opis} onChange={e => setNoviZadatak(n => ({...n, opis: e.target.value}))}
                      style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box', resize: 'none' }}
                      rows={2} placeholder="Detalji zadatka..." />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>Zaduženi lovci</label>
                    <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
                      {lovci.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: 8 }}>Nema lovaca u registru</div>
                      ) : lovci.map(l => (
                        <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', cursor: 'pointer', borderRadius: 6 }}>
                          <input type="checkbox" checked={noviZadatak.zaduzeni_ids.includes(l.id)}
                            onChange={() => toggleZaduzeni(l.id, noviZadatak.zaduzeni_ids, ids => setNoviZadatak(n => ({...n, zaduzeni_ids: ids})))} />
                          <div>
                            <div style={{ fontSize: 13 }}>{l.full_name}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>{l.phone}{l.phone && l.email && ' · '}{l.email}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    {noviZadatak.zaduzeni_ids.filter(id => lovci.find(l => l.id === id)?.email).length > 0 && (
                      <div style={{ fontSize: 11, color: '#247a4b', marginTop: 4 }}>
                        ✉ Email obavijest bit će poslana {noviZadatak.zaduzeni_ids.filter(id => lovci.find(l => l.id === id)?.email).length} lovc{noviZadatak.zaduzeni_ids.filter(id => lovci.find(l => l.id === id)?.email).length === 1 ? 'u' : 'ima'}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>Prioritet</label>
                      <select value={noviZadatak.prioritet} onChange={e => setNoviZadatak(n => ({...n, prioritet: e.target.value}))}
                        style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
                        <option value="hitno">🔴 Hitno</option>
                        <option value="visoko">🟠 Visoko</option>
                        <option value="normalno">⚪ Normalno</option>
                        <option value="nisko">🔵 Nisko</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>Rok</label>
                      <input type="date" value={noviZadatak.rok} onChange={e => setNoviZadatak(n => ({...n, rok: e.target.value}))}
                        style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <button onClick={kreirajZadatak} style={{ background: '#247a4b', color: 'white', border: 'none', borderRadius: 8, padding: '10px', fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>
                    Kreiraj zadatak i pošalji obavijest
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit POI */}
        {selectedPOI && mode === 'edit_poi' && (
          <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'white', borderRadius: 16, padding: 20, width: 320, zIndex: 1000, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', maxHeight: '78vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontWeight: 600 }}>Uredi: {selectedPOI.name}</span>
              <button onClick={() => setMode('view')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={editPOI.name} onChange={e => setEditPOI(p => ({...p, name: e.target.value}))}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                {Object.entries(POI_ICONS).map(([t, icon]) => (
                  <button key={t} onClick={() => setEditPOI(p => ({...p, type: t}))}
                    style={{ padding: '6px 2px', borderRadius: 8, border: editPOI.type === t ? '2px solid #247a4b' : '1px solid #e5e7eb', background: editPOI.type === t ? '#247a4b' : 'white', color: editPOI.type === t ? 'white' : '#374151', cursor: 'pointer', fontSize: 11, textAlign: 'center' }}>
                    <div style={{ fontSize: 18 }}>{icon}</div>{t}
                  </button>
                ))}
              </div>
              <textarea value={editPOI.description} onChange={e => setEditPOI(p => ({...p, description: e.target.value}))}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box', resize: 'none' }}
                rows={2} placeholder="Opis..." />
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>Zaduženi lovci</label>
                <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
                  {lovci.map(l => (
                    <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={editPOI.zaduzeni_ids.includes(l.id)}
                        onChange={() => toggleZaduzeni(l.id, editPOI.zaduzeni_ids, ids => setEditPOI(p => ({...p, zaduzeni_ids: ids})))} />
                      <span style={{ fontSize: 13 }}>{l.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <textarea value={editPOI.zapazanja} onChange={e => setEditPOI(p => ({...p, zapazanja: e.target.value}))}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box', resize: 'none' }}
                rows={2} placeholder="Zapažanja..." />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={updatePOI} style={{ flex: 1, background: '#247a4b', color: 'white', border: 'none', borderRadius: 8, padding: 10, fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>Spremi</button>
                <button onClick={() => setMode('view')} style={{ flex: 1, background: 'white', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, fontSize: 14, cursor: 'pointer' }}>Odustani</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ZadatakKartica({ zadatak, lovci, userId, isAdmin, onZatvori }: any) {
  const [showKomentar, setShowKomentar] = useState(false)
  const [komentar, setKomentar] = useState('')
  const PRIORITET_COLOR: Record<string, string> = { hitno: '#DC2626', visoko: '#F97316', normalno: '#6B7280', nisko: '#9CA3AF' }

  return (
    <div style={{ border: `1px solid ${zadatak.status === 'zatvoreno' ? '#d1fae5' : '#e5e7eb'}`, borderRadius: 10, padding: '10px 12px', marginBottom: 10, background: zadatak.status === 'zatvoreno' ? '#f0fdf4' : 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{zadatak.naslov}</div>
        <span style={{ fontSize: 10, color: PRIORITET_COLOR[zadatak.prioritet], fontWeight: 600, marginLeft: 8, flexShrink: 0 }}>
          {zadatak.prioritet.toUpperCase()}
        </span>
      </div>
      {zadatak.opis && <p style={{ fontSize: 12, color: '#4b5563', margin: '4px 0' }}>{zadatak.opis}</p>}
      {zadatak.rok && <div style={{ fontSize: 11, color: '#6b7280' }}>📅 Rok: {format(parseISO(zadatak.rok), 'dd.MM.yyyy')}</div>}
      {zadatak.zaduzeni_ids?.length > 0 && (
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
          👤 {zadatak.zaduzeni_ids.map((id: string) => lovci.find((l: any) => l.id === id)?.full_name).filter(Boolean).join(', ')}
        </div>
      )}
      {zadatak.status === 'zatvoreno' ? (
        <div style={{ fontSize: 11, color: '#15803d', marginTop: 6, background: '#dcfce7', padding: '4px 8px', borderRadius: 6 }}>
          ✓ Zatvoreno {zadatak.komentar_zatvaranja && `— ${zadatak.komentar_zatvaranja}`}
        </div>
      ) : (isAdmin || zadatak.zaduzeni_ids?.includes(userId)) && (
        <div style={{ marginTop: 8 }}>
          {!showKomentar ? (
            <button onClick={() => setShowKomentar(true)}
              style={{ fontSize: 11, padding: '4px 10px', background: '#dcfce7', color: '#15803d', border: 'none', borderRadius: 6, cursor: 'pointer', width: '100%' }}>
              ✓ Označi kao završeno
            </button>
          ) : (
            <div>
              <input value={komentar} onChange={e => setKomentar(e.target.value)}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 8px', fontSize: 11, marginBottom: 4, boxSizing: 'border-box' }}
                placeholder="Komentar (opcionalno)..." autoFocus />
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => onZatvori(zadatak.id, komentar)}
                  style={{ flex: 1, fontSize: 11, padding: '5px', background: '#15803d', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                  Potvrdi
                </button>
                <button onClick={() => setShowKomentar(false)}
                  style={{ flex: 1, fontSize: 11, padding: '5px', background: '#f3f4f6', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                  Odustani
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

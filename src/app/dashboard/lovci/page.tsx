'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function LovciPage() {
  const [lovci, setLovci] = useState<any[]>([])
  const [groupId, setGroupId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [view, setView] = useState<'list' | 'form'>('list')
  const [selected, setSelected] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    full_name: '', li_broj: '', ol_brojevi: '',
    phone: '', email: '', address: '',
    date_of_birth: '', member_since: '', member_until: '',
    status: 'aktivan', notes: ''
  })
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: member } = await supabase
      .from('group_members').select('group_id, role').eq('user_id', user.id).single()
    if (!member) return
    setGroupId(member.group_id)
    setIsAdmin(member.role === 'admin')
    const { data } = await supabase
      .from('lovci').select('*')
      .eq('group_id', member.group_id)
      .order('full_name')
    setLovci(data ?? [])
  }

  function openNew() {
    setSelected(null)
    setForm({ full_name: '', li_broj: '', ol_brojevi: '', phone: '', email: '', address: '', date_of_birth: '', member_since: '', member_until: '', status: 'aktivan', notes: '' })
    setView('form')
  }

  function openEdit(lovac: any) {
    setSelected(lovac)
    setForm({
      full_name: lovac.full_name ?? '',
      li_broj: lovac.li_broj ?? '',
      ol_brojevi: (lovac.ol_brojevi ?? []).join(', '),
      phone: lovac.phone ?? '',
      email: lovac.email ?? '',
      address: lovac.address ?? '',
      date_of_birth: lovac.date_of_birth ?? '',
      member_since: lovac.member_since ?? '',
      member_until: lovac.member_until ?? '',
      status: lovac.status ?? 'aktivan',
      notes: lovac.notes ?? ''
    })
    setView('form')
  }

  async function save() {
    if (!form.full_name || !groupId) { toast.error('Ime je obavezno!'); return }
    const payload = {
      group_id: groupId,
      full_name: form.full_name,
      li_broj: form.li_broj || null,
      ol_brojevi: form.ol_brojevi.split(',').map(s => s.trim()).filter(Boolean),
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      date_of_birth: form.date_of_birth || null,
      member_since: form.member_since || null,
      member_until: form.member_until || null,
      status: form.status,
      notes: form.notes || null,
    }
    if (selected) {
      const { error } = await supabase.from('lovci').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', selected.id)
      if (error) { toast.error('Greška'); return }
      toast.success('Lovac ažuriran!')
    } else {
      const { error } = await supabase.from('lovci').insert(payload)
      if (error) { toast.error('Greška'); return }
      toast.success('Lovac dodan!')
    }
    setView('list')
    load()
  }

  async function deleteLovac(id: string) {
    if (!confirm('Jesi li siguran?')) return
    await supabase.from('lovci').delete().eq('id', id)
    toast.success('Lovac obrisan')
    load()
  }

  const STATUS_COLOR: Record<string, string> = {
    aktivan: '#16A34A', neaktivan: '#6B7280', pocasni: '#D97706'
  }

  const filtered = lovci.filter(l =>
    !search || l.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    l.li_broj?.includes(search) || l.phone?.includes(search)
  )

  const fields = [
    { key: 'full_name', label: 'Ime i prezime *', type: 'text', full: true },
    { key: 'li_broj', label: 'LI broj (lovačka iskaznica)', type: 'text' },
    { key: 'ol_brojevi', label: 'OL brojevi (odvojeni zarezom)', type: 'text' },
    { key: 'phone', label: 'Mobitel', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'address', label: 'Adresa', type: 'text', full: true },
    { key: 'date_of_birth', label: 'Datum rođenja', type: 'date' },
    { key: 'member_since', label: 'Član od', type: 'date' },
    { key: 'member_until', label: 'Član do', type: 'date' },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        {view === 'form' && (
          <button onClick={() => setView('list')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#6b7280' }}>‹</button>
        )}
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
          {view === 'list' ? `Registar lovaca (${lovci.length})` : selected ? 'Uredi lovca' : 'Novi lovac'}
        </h1>
        {view === 'list' && isAdmin && (
          <button onClick={openNew}
            style={{ marginLeft: 'auto', padding: '8px 20px', background: '#247a4b', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>
            + Dodaj lovca
          </button>
        )}
      </div>

      {/* Lista */}
      {view === 'list' && (
        <>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Pretraži po imenu, LI broju, mobitelu..."
            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 16px', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }} />

          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            {filtered.length === 0 && (
              <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>
                {search ? 'Nema rezultata' : 'Nema lovaca. Dodaj prvog!'}
              </div>
            )}
            {filtered.map((lovac, i) => (
              <div key={lovac.id} style={{ padding: '14px 20px', borderBottom: i < filtered.length-1 ? '1px solid #f3f4f6' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#16A34A', fontSize: 18, flexShrink: 0 }}>
                    {lovac.full_name?.charAt(0) ?? '?'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{lovac.full_name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      {lovac.li_broj && <span>LI: {lovac.li_broj}</span>}
                      {lovac.li_broj && lovac.phone && <span> · </span>}
                      {lovac.phone && <span>📱 {lovac.phone}</span>}
                      {lovac.ol_brojevi?.length > 0 && <span> · OL: {lovac.ol_brojevi.join(', ')}</span>}
                    </div>
                    {lovac.address && <div style={{ fontSize: 12, color: '#9ca3af' }}>📍 {lovac.address}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, background: STATUS_COLOR[lovac.status] + '20', color: STATUS_COLOR[lovac.status], padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>
                    {lovac.status}
                  </span>
                  {isAdmin && (
                    <>
                      <button onClick={() => openEdit(lovac)}
                        style={{ padding: '5px 12px', background: '#f3f4f6', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                        Uredi
                      </button>
                      <button onClick={() => deleteLovac(lovac.id)}
                        style={{ padding: '5px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                        Obriši
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Form */}
      {view === 'form' && (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {fields.map(field => (
              <div key={field.key} style={{ gridColumn: (field as any).full ? '1 / -1' : 'auto' }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>
                  {field.label}
                </label>
                <input type={field.type} value={(form as any)[field.key]}
                  onChange={e => setForm(f => ({...f, [field.key]: e.target.value}))}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Status</label>
              <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}>
                <option value="aktivan">Aktivan</option>
                <option value="neaktivan">Neaktivan</option>
                <option value="pocasni">Počasni</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Napomena</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box', resize: 'none' }}
              rows={3} />
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
            <button onClick={save}
              style={{ background: '#247a4b', color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>
              {selected ? 'Spremi izmjene' : 'Dodaj lovca'}
            </button>
            <button onClick={() => setView('list')}
              style={{ background: 'white', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}>
              Odustani
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { hr } from 'date-fns/locale'

export default function ChatPage() {
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [groupId, setGroupId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: member } = await supabase
      .from('group_members').select('group_id').eq('user_id', user.id).single()
    if (!member) return
    setGroupId(member.group_id)

    await fetchMessages(member.group_id)

    supabase.channel('chat')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_messages',
        filter: `group_id=eq.${member.group_id}`
      }, () => { fetchMessages(member.group_id) })
      .subscribe()
  }

  async function fetchMessages(gid: string) {
    const { data } = await supabase
      .from('chat_messages')
      .select('*, profiles(full_name)')
      .eq('group_id', gid)
      .order('created_at', { ascending: true })
    setMessages(data ?? [])
  }

  async function sendMessage() {
    if (!newMessage.trim() || !groupId || !userId) return
    const content = newMessage.trim()
    setNewMessage('')
    await supabase.from('chat_messages').insert({ group_id: groupId, user_id: userId, content })
  }

  async function deleteMessage(id: string) {
    if (!confirm('Obriši poruku?')) return
    await supabase.from('chat_messages').delete().eq('id', id)
    setMessages(m => m.filter(msg => msg.id !== id))
  }

  async function saveEdit(id: string) {
    if (!editContent.trim()) return
    await supabase.from('chat_messages').update({ content: editContent.trim() }).eq('id', id)
    setMessages(m => m.map(msg => msg.id === id ? { ...msg, content: editContent.trim() } : msg))
    setEditingId(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  function handleEditKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(id) }
    if (e.key === 'Escape') setEditingId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '14px 20px', flexShrink: 0 }}>
        <h1 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>Grupni chat</h1>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>Poruke se isporučuju u stvarnom vremenu</p>
      </div>

      {/* Poruke */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
            <p>Nema još poruka. Budi prvi!</p>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.user_id === userId
          const isEditing = editingId === msg.id
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
              {!isMe && (
                <span style={{ fontSize: 11, color: '#6b7280', marginBottom: 2, marginLeft: 4 }}>
                  {(msg.profiles as any)?.full_name}
                </span>
              )}
              <div style={{ maxWidth: '70%', position: 'relative' }}>
                {isEditing ? (
                  <div style={{ background: 'white', borderRadius: 12, padding: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', minWidth: 200 }}>
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      onKeyDown={e => handleEditKeyDown(e, msg.id)}
                      autoFocus
                      rows={2}
                      style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 14, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button onClick={() => saveEdit(msg.id)}
                        style={{ flex: 1, background: '#247a4b', color: 'white', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                        Spremi
                      </button>
                      <button onClick={() => setEditingId(null)}
                        style={{ flex: 1, background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                        Odustani
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      background: isMe ? '#247a4b' : 'white',
                      color: isMe ? 'white' : '#1f2937',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                      fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                    }}>
                      {msg.content}
                    </div>
                    {isMe && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                        <button
                          onClick={() => { setEditingId(msg.id); setEditContent(msg.content) }}
                          title="Uredi"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#9ca3af', padding: '2px 4px', lineHeight: 1 }}>
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteMessage(msg.id)}
                          title="Obriši"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#9ca3af', padding: '2px 4px', lineHeight: 1 }}>
                          🗑
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, marginLeft: isMe ? 0 : 4, marginRight: isMe ? 4 : 0 }}>
                {format(new Date(msg.created_at), 'dd.MM.yyyy HH:mm', { locale: hr })}
              </span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ background: 'white', borderTop: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-end', flexShrink: 0 }}>
        <textarea
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Napiši poruku... (Enter = pošalji, Shift+Enter = novi red)"
          rows={1}
          style={{
            flex: 1, border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px',
            fontSize: 14, resize: 'none', outline: 'none', fontFamily: 'inherit',
            maxHeight: 120, lineHeight: 1.5
          }}
          onInput={e => {
            const el = e.target as HTMLTextAreaElement
            el.style.height = 'auto'
            el.style.height = Math.min(el.scrollHeight, 120) + 'px'
          }}
        />
        <button onClick={sendMessage}
          disabled={!newMessage.trim()}
          style={{
            background: newMessage.trim() ? '#247a4b' : '#e5e7eb',
            color: newMessage.trim() ? 'white' : '#9ca3af',
            border: 'none', borderRadius: 12, padding: '10px 20px',
            fontSize: 14, cursor: newMessage.trim() ? 'pointer' : 'default',
            fontWeight: 500, flexShrink: 0
          }}>
          Pošalji
        </button>
      </div>
    </div>
  )
}

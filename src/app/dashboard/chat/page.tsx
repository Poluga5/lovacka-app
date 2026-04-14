'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { hr } from 'date-fns/locale'

type Thread = {
  id: string
  name: string
  is_group: boolean
  participants: string[]
  last_message?: string
  last_at?: string
  unread?: number
}

export default function ChatPage() {
  const [members, setMembers] = useState<any[]>([])
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeThread, setActiveThread] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [groupId, setGroupId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [newChatName, setNewChatName] = useState('')
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

    // Dohvati sve članove
    const { data: allMembers } = await supabase
      .from('group_members')
      .select('user_id, profiles(full_name, email)')
      .eq('group_id', member.group_id)
    setMembers(allMembers?.filter(m => m.user_id !== user.id) ?? [])

    // Dohvati threadove
    await loadThreads(member.group_id, user.id)

    // Realtime
    supabase.channel('chat-messages')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'chat_messages'
      }, () => {
        loadThreads(member.group_id, user.id)
        if (activeThread) loadMessages(activeThread)
      })
      .subscribe()
  }

  async function loadThreads(gid: string, uid: string) {
    // Grupni chat uvijek postoji
    const groupThread: Thread = {
      id: 'group',
      name: 'Svi članovi',
      is_group: true,
      participants: [],
    }

    // Dohvati zadnje poruke za grupni chat
    const { data: lastGroup } = await supabase
      .from('chat_messages')
      .select('content, created_at')
      .eq('group_id', gid)
      .is('thread_id', null)
      .order('created_at', { ascending: false })
      .limit(1)

    if (lastGroup?.[0]) {
      groupThread.last_message = lastGroup[0].content
      groupThread.last_at = lastGroup[0].created_at
    }

    // Dohvati privatne threadove
    const { data: privateThreads } = await supabase
      .from('chat_threads')
      .select('*')
      .eq('group_id', gid)
      .contains('participants', [uid])
      .order('updated_at', { ascending: false })

    const threadList: Thread[] = [groupThread]

    for (const t of privateThreads ?? []) {
      const { data: lastMsg } = await supabase
        .from('chat_messages')
        .select('content, created_at')
        .eq('thread_id', t.id)
        .order('created_at', { ascending: false })
        .limit(1)

      threadList.push({
        id: t.id,
        name: t.name,
        is_group: t.is_group,
        participants: t.participants,
        last_message: lastMsg?.[0]?.content,
        last_at: lastMsg?.[0]?.created_at,
      })
    }

    setThreads(threadList)
    if (!activeThread) setActiveThread('group')
  }

  async function loadMessages(threadId: string) {
    let query = supabase
      .from('chat_messages')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: true })

    if (threadId === 'group') {
      query = query.eq('group_id', groupId!).is('thread_id', null)
    } else {
      query = query.eq('thread_id', threadId)
    }

    const { data } = await query
    setMessages(data ?? [])
  }

  useEffect(() => {
    if (activeThread && groupId) loadMessages(activeThread)
  }, [activeThread, groupId])

  async function sendMessage() {
    if (!newMessage.trim() || !groupId || !userId) return
    const content = newMessage.trim()
    setNewMessage('')

    if (activeThread === 'group') {
      await supabase.from('chat_messages').insert({
        group_id: groupId, user_id: userId, content
      })
    } else {
      await supabase.from('chat_messages').insert({
        group_id: groupId, user_id: userId, content, thread_id: activeThread
      })
      await supabase.from('chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', activeThread)
    }
    await loadMessages(activeThread!)
  }

  async function createThread() {
    if (selectedMembers.length === 0 || !groupId || !userId) return
    const participants = [userId, ...selectedMembers]
    const name = newChatName || (selectedMembers.length === 1
      ? members.find(m => m.user_id === selectedMembers[0])?.profiles?.full_name ?? 'Chat'
      : `Grupa (${participants.length})`)

    const { data, error } = await supabase.from('chat_threads').insert({
      group_id: groupId,
      name,
      is_group: selectedMembers.length > 1,
      participants,
      created_by: userId,
    }).select().single()

    if (error) { console.error(error); return }
    setShowNewChat(false)
    setSelectedMembers([])
    setNewChatName('')
    await loadThreads(groupId, userId)
    setActiveThread(data.id)
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

  const activeThreadData = threads.find(t => t.id === activeThread)

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>

      {/* Sidebar — lista threadova */}
      <div style={{ width: 260, borderRight: '1px solid #e5e7eb', background: 'white', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Poruke</span>
          <button onClick={() => setShowNewChat(!showNewChat)}
            style={{ background: '#247a4b', color: 'white', border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
            + Novi chat
          </button>
        </div>

        {/* Nova chat forma */}
        {showNewChat && (
          <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Odaberi članove:</div>
            <div style={{ maxHeight: 150, overflowY: 'auto', marginBottom: 8 }}>
              {members.map(m => (
                <label key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox"
                    checked={selectedMembers.includes(m.user_id)}
                    onChange={() => setSelectedMembers(prev =>
                      prev.includes(m.user_id) ? prev.filter(x => x !== m.user_id) : [...prev, m.user_id]
                    )} />
                  {(m.profiles as any)?.full_name}
                </label>
              ))}
            </div>
            {selectedMembers.length > 1 && (
              <input value={newChatName} onChange={e => setNewChatName(e.target.value)}
                placeholder="Naziv grupe (opcionalno)"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 8px', fontSize: 12, marginBottom: 6, boxSizing: 'border-box' }} />
            )}
            <button onClick={createThread}
              disabled={selectedMembers.length === 0}
              style={{ width: '100%', background: selectedMembers.length > 0 ? '#247a4b' : '#e5e7eb', color: selectedMembers.length > 0 ? 'white' : '#9ca3af', border: 'none', borderRadius: 6, padding: '6px', fontSize: 12, cursor: selectedMembers.length > 0 ? 'pointer' : 'default', fontWeight: 500 }}>
              Kreiraj chat
            </button>
          </div>
        )}

        {/* Lista threadova */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {threads.map(t => (
            <div key={t.id} onClick={() => setActiveThread(t.id)}
              style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', background: activeThread === t.id ? '#f0fdf4' : 'white', borderLeft: activeThread === t.id ? '3px solid #247a4b' : '3px solid transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.id === 'group' ? '#247a4b' : '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                  {t.id === 'group' ? '👥' : t.is_group ? '👥' : t.name.charAt(0)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                  {t.last_message && (
                    <div style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                      {t.last_message}
                    </div>
                  )}
                  {t.last_at && (
                    <div style={{ fontSize: 10, color: '#d1d5db', marginTop: 1 }}>
                      {format(new Date(t.last_at), 'dd.MM. HH:mm', { locale: hr })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat prozor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
        {/* Header */}
        <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '14px 20px', flexShrink: 0 }}>
          <h2 style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>{activeThreadData?.name ?? 'Chat'}</h2>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>
            {activeThread === 'group' ? 'Grupni chat — svi članovi' : activeThreadData?.is_group ? 'Grupni privatni chat' : 'Privatni razgovor'}
          </p>
        </div>

        {/* Poruke */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
              <p>Nema poruka. Pošalji prvu!</p>
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
                <div style={{ maxWidth: '70%' }}>
                  {isEditing ? (
                    <div style={{ background: 'white', borderRadius: 12, padding: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', minWidth: 200 }}>
                      <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(msg.id) } if (e.key === 'Escape') setEditingId(null) }}
                        autoFocus rows={2}
                        style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 14, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <button onClick={() => saveEdit(msg.id)} style={{ flex: 1, background: '#247a4b', color: 'white', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>Spremi</button>
                        <button onClick={() => setEditingId(null)} style={{ flex: 1, background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>Odustani</button>
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#9ca3af', padding: '2px 4px' }}>✏️</button>
                          <button onClick={() => deleteMessage(msg.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#9ca3af', padding: '2px 4px' }}>🗑</button>
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
          <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Napiši poruku... (Enter = pošalji, Shift+Enter = novi red)"
            rows={1}
            style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px', fontSize: 14, resize: 'none', outline: 'none', fontFamily: 'inherit', maxHeight: 120, lineHeight: 1.5 }}
            onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }} />
          <button onClick={sendMessage} disabled={!newMessage.trim()}
            style={{ background: newMessage.trim() ? '#247a4b' : '#e5e7eb', color: newMessage.trim() ? 'white' : '#9ca3af', border: 'none', borderRadius: 12, padding: '10px 20px', fontSize: 14, cursor: newMessage.trim() ? 'pointer' : 'default', fontWeight: 500, flexShrink: 0 }}>
            Pošalji
          </button>
        </div>
      </div>
    </div>
  )
}

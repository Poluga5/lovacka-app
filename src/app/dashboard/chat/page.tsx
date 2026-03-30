'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { Message } from '@/types'

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [groupId, setGroupId] = useState<string | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      setUserName(profile?.full_name ?? '')

      const { data: member } = await supabase
        .from('group_members').select('group_id').eq('user_id', user.id).single()
      if (!member) return
      setGroupId(member.group_id)

      let { data: thread } = await supabase
        .from('threads').select('id').eq('group_id', member.group_id).eq('scope', 'group').single()

      if (!thread) {
        const { data: newThread } = await supabase
          .from('threads').insert({ group_id: member.group_id, scope: 'group', title: 'Grupni chat' })
          .select().single()
        thread = newThread
      }
      if (!thread) return
      setThreadId(thread.id)

      const { data: msgs } = await supabase
        .from('messages').select('*, profiles(full_name)')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: true })
      setMessages(msgs ?? [])

      // Realtime subscription
      supabase.channel(`chat-${thread.id}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'messages',
          filter: `thread_id=eq.${thread.id}`
        }, async (payload) => {
          const { data: msg } = await supabase
            .from('messages').select('*, profiles(full_name)').eq('id', payload.new.id).single()
          if (msg) setMessages(m => [...m, msg])
        })
        .subscribe()
    }
    init()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!newMessage.trim() || !groupId || !threadId || !userId) return
    const text = newMessage.trim()
    setNewMessage('')

    await supabase.from('messages').insert({
      thread_id: threadId,
      group_id: groupId,
      author_id: userId,
      body: text,
    })
  }

  function groupedMessages() {
    const groups: { date: string; messages: Message[] }[] = []
    messages.forEach(msg => {
      const date = format(new Date(msg.created_at), 'dd.MM.yyyy')
      const last = groups[groups.length - 1]
      if (last && last.date === date) last.messages.push(msg)
      else groups.push({ date, messages: [msg] })
    })
    return groups
  }

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="font-semibold text-gray-800">Grupni chat</h1>
        <p className="text-xs text-gray-400">Poruke se isporučuju u stvarnom vremenu</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 py-12">
            <p className="text-4xl mb-3">💬</p>
            <p>Nema još poruka. Budi prvi!</p>
          </div>
        )}

        {groupedMessages().map(group => (
          <div key={group.date}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium">{group.date}</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div className="space-y-3">
              {group.messages.map((msg, idx) => {
                const isOwn = msg.author_id === userId
                const prevMsg = group.messages[idx - 1]
                const showName = !prevMsg || prevMsg.author_id !== msg.author_id

                return (
                  <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                      {showName && !isOwn && (
                        <span className="text-xs text-gray-500 font-medium mb-1 ml-1">
                          {(msg.profiles as any)?.full_name}
                        </span>
                      )}
                      <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                        isOwn
                          ? 'bg-forest-600 text-white rounded-tr-sm'
                          : 'bg-white text-gray-800 border border-gray-100 shadow-sm rounded-tl-sm'
                      }`}>
                        {msg.body}
                      </div>
                      <span className="text-xs text-gray-400 mt-1 mx-1">
                        {format(new Date(msg.created_at), 'HH:mm')}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="bg-white border-t border-gray-200 p-4">
        <form onSubmit={sendMessage} className="flex gap-3">
          <input
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
            placeholder="Napiši poruku..."
          />
          <button type="submit" disabled={!newMessage.trim()}
            className="bg-forest-600 hover:bg-forest-700 disabled:opacity-40 text-white px-5 py-2.5 rounded-2xl text-sm font-medium transition-colors">
            Pošalji
          </button>
        </form>
      </div>
    </div>
  )
}

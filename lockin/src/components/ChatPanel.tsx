import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Maximize2, Minimize2, Send, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  fetchDirectMessages,
  markDirectMessagesRead,
  sendDirectMessage,
} from '../lib/api'
import type { DirectMessage, Profile } from '../lib/types'

type ChatPanelProps = {
  userId: string
  friend: Profile
  onClose: () => void
}

export default function ChatPanel({ userId, friend, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Mark messages as read when panel opens
  useEffect(() => {
    markDirectMessagesRead(userId, friend.id)
    // Optimistically update local state immediately
    setMessages((prev) => prev.map((m) =>
      m.receiver_id === userId && !m.read_at
        ? { ...m, read_at: new Date().toISOString() }
        : m
    ))
  }, [userId, friend.id])

  // Load conversation history
  useEffect(() => {
    async function load() {
      const { data } = await fetchDirectMessages(userId, friend.id)
      if (data) setMessages(data)
    }
    load()
  }, [userId, friend.id])

  // Realtime subscription for new messages and read receipt updates
  useEffect(() => {
    const channel = supabase
      .channel(`dm-${userId}-${friend.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          console.log('[ChatPanel] new message received:', payload)
          const msg = payload.new as DirectMessage
          // Only add if it's from the friend we're chatting with
          if (msg.sender_id === friend.id && msg.receiver_id === userId) {
            // Add the new message
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
            // Optimistically mark as read and update database
            markDirectMessagesRead(userId, friend.id)
            setMessages((prev) => prev.map((m) =>
              m.receiver_id === userId && !m.read_at
                ? { ...m, read_at: new Date().toISOString() }
                : m
            ))
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'direct_messages',
          filter: `sender_id=eq.${userId}`,
        },
        (payload) => {
          console.log('[ChatPanel] message updated (read receipt):', payload)
          const updated = payload.new as DirectMessage
          // Update local state with the new read_at value
          setMessages((prev) => prev.map((m) => m.id === updated.id ? updated : m))
        },
      )
      .subscribe((status) => {
        console.log('[ChatPanel] subscription status:', status)
      })

    return () => {
      console.log('[ChatPanel] cleaning up channel')
      supabase.removeChannel(channel)
    }
  }, [userId, friend.id])

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    setSending(true)
    setError(null)

    const content = input
    // Optimistically add a placeholder message
    const tempId = `temp-${Date.now()}`
    const optimisticMsg: DirectMessage = {
      id: tempId,
      sender_id: userId,
      receiver_id: friend.id,
      content: content.trim(),
      created_at: new Date().toISOString(),
      read_at: null,
    }
    setMessages((prev) => [...prev, optimisticMsg])
    setInput('')

    const { data, error: err } = await sendDirectMessage(userId, friend.id, content)
    setSending(false)

    if (err) {
      console.error('[ChatPanel] send failed:', err.message, err)
      setError(err.message)
      // Remove the optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      return
    }

    if (data) {
      // Replace optimistic message with real one
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)))
    }
  }

  const panelClass = fullscreen
    ? 'fixed inset-0 z-50 flex flex-col bg-surface'
    : 'fixed bottom-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl sm:h-3/4 sm:bottom-4 sm:right-4 sm:max-h-[600px] sm:rounded-xl sm:border'

  return (
    <div className={panelClass}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted text-sm font-bold text-accent">
            {(friend.username ?? '?')[0].toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-text">@{friend.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFullscreen(!fullscreen)}
            className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text"
            aria-label={fullscreen ? 'Collapse chat' : 'Expand chat'}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text"
            aria-label="Close chat"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-text-muted">
            No messages yet. Say hello!
          </p>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => {
              const isMine = m.sender_id === userId
              const isTemp = m.id.startsWith('temp-')
              return (
                <div
                  key={m.id}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 ${
                      isMine
                        ? 'bg-accent text-white'
                        : 'bg-surface-overlay text-text'
                    } ${isTemp ? 'opacity-60' : ''}`}
                  >
                    <p className="text-sm">{m.content}</p>
                    <p
                      className={`mt-1 text-[10px] ${
                        isMine ? 'text-white/70' : 'text-text-muted'
                      }`}
                    >
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {isTemp && <span className="ml-1">· Sending…</span>}
                      {isMine && !isTemp && m.read_at && (
                        <span className="ml-1">· Read</span>
                      )}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>
        )}

        {error && (
          <p className="mt-2 text-center text-xs text-danger">{error}</p>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="border-t border-border-subtle p-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            maxLength={2000}
            className="flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text placeholder:text-text-muted"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="flex items-center justify-center rounded-lg bg-accent px-3 py-2 text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  )
}
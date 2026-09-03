'use client'

import { useEffect, useRef } from 'react'
import type { MessageWithMeta } from '@/lib/supabase/types'
import MediaMessage from './MediaMessage'

interface Props {
  messages: MessageWithMeta[]
  sessionId: string
  currentUsername: string
  adminView?: boolean
  onDeleteMessage?: (messageId: string) => void
}

function CheckIcon({ seen }: { seen: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      fill="none"
      viewBox="0 0 24 24"
      style={{ color: seen ? '#38bdf8' : 'var(--text-secondary)', display: 'inline' }}
      aria-label={seen ? 'Seen' : 'Sent'}
    >
      {seen ? (
        <>
          <path d="M1.5 12.5l4.5 4.5L14.5 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7.5 12.5l4.5 4.5L20.5 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <path d="M4.5 12.5l4.5 4.5L18.5 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageList({
  messages,
  sessionId,
  currentUsername,
  adminView = false,
  onDeleteMessage,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Filter out messages soft-deleted by user unless in admin view
  const visibleMessages = adminView
    ? messages
    : messages.filter((m) => !m.content?.startsWith('__DELETED_BY_USER__'))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleMessages.length])

  if (!visibleMessages.length) return (
    <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-secondary)' }}>
      <p className="text-sm">No messages yet. Say hi!</p>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 px-4 py-4"
      role="log" aria-label="Chat messages" aria-live="polite">
      {visibleMessages.map((msg, i) => {
        // Use sender_session_id — the real DB column name
        const isOwn    = msg.sender_session_id === sessionId
        const prev     = i > 0 ? visibleMessages[i - 1] : null
        const showName = !isOwn && (!prev || prev.sender_session_id !== msg.sender_session_id)
        // seen_at is a timestamp (non-null = seen); derive boolean for the check icon
        const seen     = !!msg.seen_at

        return (
          <div key={msg.id}
            className={`group relative flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${
              prev?.sender_session_id === msg.sender_session_id ? 'mt-0.5' : 'mt-3'
            }`}>

            {showName && (
              <span className="text-xs mb-1 px-1 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                {adminView ? (msg.sender_session_id?.slice(0, 8) || 'User') : currentUsername}
              </span>
            )}

            <div className="relative flex items-center gap-1 group">
              {/* Sender Delete Button (hover action) */}
              {isOwn && !adminView && onDeleteMessage && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Delete this message for everyone in chat?')) {
                      onDeleteMessage(msg.id)
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10 text-xs"
                  style={{ color: 'var(--danger)' }}
                  title="Delete message"
                  aria-label="Delete message"
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}

              <div
                className={`max-w-[82%] min-w-[72px] text-sm leading-relaxed ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'} ${
                  msg.message_type === 'image'
                    ? 'p-1.5 rounded-2xl'
                    : msg.message_type === 'voice'
                    ? 'px-3 py-2 rounded-2xl'
                    : 'px-3.5 py-2.5 rounded-2xl'
                }`}
                style={{
                  background: isOwn ? 'var(--bubble-own)' : 'var(--bubble-other)',
                  color: 'var(--text-primary)', wordBreak: 'break-word',
                }}
              >
                {msg.message_type === 'text' && <span>{msg.content}</span>}

                {(msg.message_type === 'image' || msg.message_type === 'voice') && (
                  <MediaMessage
                    messageId={msg.id}
                    storagePath={msg.storage_path}
                    messageType={msg.message_type}
                    sessionId={sessionId}
                    isOwn={isOwn}
                    oneTimeView={msg.one_time_view ?? false}
                    viewedAt={msg.viewed_at ?? null}
                    expiresAt={msg.expires_at ?? null}
                    adminView={adminView}
                  />
                )}

                <div className={`flex items-center gap-1 shrink-0 whitespace-nowrap select-none ${msg.message_type === 'image' ? 'px-1 pt-1' : 'mt-1'} ${isOwn ? 'justify-end' : 'justify-start'}`}
                  style={{ color: 'var(--text-secondary)' }}>
                  <span className="text-[10px] opacity-80 whitespace-nowrap">{fmtTime(msg.created_at)}</span>
                  {isOwn && <CheckIcon seen={seen} />}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}


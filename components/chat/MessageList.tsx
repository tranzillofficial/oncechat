'use client'

import { useEffect, useRef } from 'react'
import type { MessageWithMeta } from '@/lib/supabase/types'
import MediaMessage from './MediaMessage'

interface Props {
  messages: MessageWithMeta[]
  sessionId: string
  currentUsername: string
  adminView?: boolean
}

function CheckIcon({ seen }: { seen: boolean }) {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24"
      style={{ color: seen ? 'var(--accent-light)' : 'var(--text-secondary)', display: 'inline' }}>
      {seen ? (
        <>
          <path d="M1.5 12.5l5 5 9-11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 17.5l9-11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <path d="M5 12l5 5 9-11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageList({ messages, sessionId, currentUsername, adminView = false }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (!messages.length) return (
    <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-secondary)' }}>
      <p className="text-sm">No messages yet. Say hi!</p>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 px-4 py-4"
      role="log" aria-label="Chat messages" aria-live="polite">
      {messages.map((msg, i) => {
        // Use sender_session_id — the real DB column name
        const isOwn    = msg.sender_session_id === sessionId
        const prev     = i > 0 ? messages[i - 1] : null
        const showName = !isOwn && (!prev || prev.sender_session_id !== msg.sender_session_id)
        // seen_at is a timestamp (non-null = seen); derive boolean for the check icon
        const seen     = !!msg.seen_at

        return (
          <div key={msg.id}
            className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${
              prev?.sender_session_id === msg.sender_session_id ? 'mt-0.5' : 'mt-3'
            }`}>

            {showName && (
              <span className="text-xs mb-1 px-1" style={{ color: 'var(--text-secondary)' }}>
                {currentUsername}
              </span>
            )}

            <div
              className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
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

              <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? 'justify-end' : 'justify-start'}`}
                style={{ color: 'var(--text-secondary)' }}>
                <span className="text-[10px]">{fmtTime(msg.created_at)}</span>
                {isOwn && <CheckIcon seen={seen} />}
              </div>
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

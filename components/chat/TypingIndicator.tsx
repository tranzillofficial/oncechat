'use client'

interface TypingIndicatorProps {
  username: string
}

export default function TypingIndicator({ username }: TypingIndicatorProps) {
  return (
    <div className="flex items-end gap-2 px-4 py-1">
      <div
        className="flex items-center gap-1.5 px-3 py-2 rounded-2xl rounded-bl-sm text-xs"
        style={{ background: 'var(--bubble-other)', color: 'var(--text-secondary)' }}
        role="status"
        aria-live="polite"
        aria-label={`${username} is typing`}
      >
        <span>{username} is typing</span>
        <span className="flex gap-0.5">
          <span
            className="w-1 h-1 rounded-full animate-bounce"
            style={{ background: 'var(--text-secondary)', animationDelay: '0ms' }}
          />
          <span
            className="w-1 h-1 rounded-full animate-bounce"
            style={{ background: 'var(--text-secondary)', animationDelay: '150ms' }}
          />
          <span
            className="w-1 h-1 rounded-full animate-bounce"
            style={{ background: 'var(--text-secondary)', animationDelay: '300ms' }}
          />
        </span>
      </div>
    </div>
  )
}

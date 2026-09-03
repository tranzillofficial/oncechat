'use client'

interface OnlineStatusProps {
  username: string
  isOnline: boolean
}

export default function OnlineStatus({ username, isOnline }: OnlineStatusProps) {
  if (!isOnline || !username) {
    return (
      <span
        className="flex items-center gap-1.5 text-xs"
        style={{ color: 'var(--text-secondary)' }}
        aria-label="Just you in room"
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: 'var(--text-secondary)' }}
        />
        just you
      </span>
    )
  }

  return (
    <span
      className="flex items-center gap-1.5 text-xs font-medium"
      style={{ color: 'var(--text-secondary)' }}
      aria-label={`Online with ${username}`}
    >
      <span
        className="w-2 h-2 rounded-full animate-pulse"
        style={{ background: 'var(--success)' }}
      />
      you , <span style={{ color: 'var(--text-primary)' }}>{username}</span>
    </span>
  )
}


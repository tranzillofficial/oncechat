'use client'

interface OnlineStatusProps {
  username: string
  isOnline: boolean
}

export default function OnlineStatus({ username, isOnline }: OnlineStatusProps) {
  return (
    <span
      className="flex items-center gap-1.5 text-xs"
      style={{ color: 'var(--text-secondary)' }}
      aria-label={`${username} is ${isOnline ? 'online' : 'offline'}`}
    >
      <span
        className={`w-2 h-2 rounded-full ${isOnline ? 'animate-pulse' : ''}`}
        style={{ background: isOnline ? 'var(--success)' : 'var(--text-secondary)' }}
      />
      {username} {isOnline ? 'online' : 'offline'}
    </span>
  )
}

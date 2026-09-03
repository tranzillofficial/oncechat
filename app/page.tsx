import Image from 'next/image'
import Link from 'next/link'

export default function HomePage() {
  return (
    <main
      className="flex flex-col items-center justify-center min-h-full px-4"
      style={{ background: 'var(--background)' }}
    >
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/ranchat-icon.png"
            alt="Ranchat"
            width={72}
            height={72}
            className="rounded-2xl"
            priority
          />
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Ranchat
          </h1>
          <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
            Anonymous 1-to-1 chat rooms. No account needed.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 w-full">
          <Link
            href="/create"
            className="btn-primary flex items-center justify-center h-12 rounded-xl font-semibold text-sm"
          >
            Create Room
          </Link>

          <Link
            href="/join"
            className="btn-secondary flex items-center justify-center h-12 rounded-xl font-semibold text-sm"
          >
            Join Room
          </Link>
        </div>

        {/* Footer note */}
        <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
          Rooms support up to 2 people. Chats are private.
        </p>
      </div>
    </main>
  )
}

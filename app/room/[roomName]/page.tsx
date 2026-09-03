import ChatRoom from '@/components/chat/ChatRoom'

interface RoomPageProps {
  params: Promise<{ roomName: string }>
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomName } = await params
  const decodedName = decodeURIComponent(roomName)

  return (
    <main className="flex flex-col h-full">
      <ChatRoom roomName={decodedName} />
    </main>
  )
}

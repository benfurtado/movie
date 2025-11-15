'use client';

import { useState, useEffect } from 'react';

interface Participant {
  userId: string;
  userName: string;
}

interface ParticipantsListProps {
  ws: WebSocket | null;
  currentUserId: string;
}

export default function ParticipantsList({ ws, currentUserId }: ParticipantsListProps) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      // Skip binary messages (video chunks)
      if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
        return;
      }

      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'sync' && message.participants) {
          setParticipants(message.participants);
        } else if (message.type === 'participantsUpdate') {
          setParticipants(message.participants);
        } else if (message.type === 'userJoined') {
          // Participant will be updated via participantsUpdate
        }
      } catch (error) {
        // Ignore JSON parse errors for non-JSON messages
        console.warn('Failed to parse WebSocket message in ParticipantsList:', error);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws]);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 sm:top-6 sm:left-6 z-50 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 sm:px-5 sm:py-3 text-white hover:bg-zinc-800 active:bg-zinc-700 transition-all duration-200 text-xs sm:text-sm font-medium uppercase tracking-wider shadow-lg touch-manipulation"
      >
        <span className="hidden sm:inline">Viewers ({participants.length})</span>
        <span className="sm:hidden">({participants.length})</span>
      </button>

      {isOpen && (
        <div className="fixed top-20 left-4 sm:top-24 sm:left-6 z-50 w-[calc(100vw-2rem)] sm:w-64 max-w-xs bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-white font-semibold text-lg">Participants</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
            {participants.length === 0 ? (
              <div className="text-gray-500 text-sm text-center py-4">No participants</div>
            ) : (
              participants.map((participant) => (
                <div
                  key={participant.userId}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                    participant.userId === currentUserId
                      ? 'bg-zinc-800 border border-zinc-700'
                      : 'bg-zinc-950'
                  }`}
                >
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-white text-sm flex-1">{participant.userName}</span>
                  {participant.userId === currentUserId && (
                    <span className="text-xs text-gray-400">(You)</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}


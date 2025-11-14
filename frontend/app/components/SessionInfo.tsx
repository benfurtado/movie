'use client';

import { useState } from 'react';
import SessionLinkShare from './SessionLinkShare';

interface SessionInfoProps {
  sessionId: string;
  hostName: string;
  type: 'movie' | 'series';
  sessionLink: string;
  isHost?: boolean;
}

export default function SessionInfo({
  sessionId,
  hostName,
  type,
  sessionLink,
  isHost = false,
}: SessionInfoProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000');

  const handleEndSession = async () => {
    if (!isHost || ending) return;
    const confirmed = window.confirm('End this watch session for everyone?');
    if (!confirmed) return;

    setEnding(true);
    setEndError(null);

    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      window.location.href = '/';
    } catch (error) {
      console.error('Failed to end session:', error);
      setEndError('Unable to end session. Please try again.');
      setEnding(false);
    }
  };

  return (
    <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 sm:px-5 sm:py-3 text-white hover:bg-zinc-800 active:bg-zinc-700 transition-all duration-200 text-xs sm:text-sm font-medium uppercase tracking-wider shadow-lg touch-manipulation"
      >
        <span className="hidden sm:inline">{isExpanded ? 'Hide Info' : 'Session Info'}</span>
        <span className="sm:hidden">{isExpanded ? 'Hide' : 'Info'}</span>
      </button>

      {isExpanded && (
        <div className="absolute top-full right-0 mt-2 sm:mt-3 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-6">
          <div className="space-y-4">
            <h3 className="text-white font-semibold text-lg uppercase tracking-wider">Session Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-gray-400 text-sm uppercase tracking-wider">Host</span>
                <span className="text-white font-medium">{hostName}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-gray-400 text-sm uppercase tracking-wider">Type</span>
                <span className="text-white font-medium capitalize">{type}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-6">
            <SessionLinkShare sessionLink={sessionLink} />

            {isHost && (
              <div className="mt-6 space-y-3">
                <button
                  onClick={handleEndSession}
                  disabled={ending}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:border-red-500 transition-colors text-xs sm:text-sm font-semibold uppercase tracking-wider py-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {ending ? (
                    <>
                      <span className="w-3 h-3 border-2 border-red-200 border-t-transparent rounded-full animate-spin"></span>
                      Ending…
                    </>
                  ) : (
                    'End Session'
                  )}
                </button>
                {endError && (
                  <p className="text-xs text-red-400 text-center">{endError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

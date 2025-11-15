'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import VideoPlayer from '../../components/VideoPlayer';
import SessionInfo from '../../components/SessionInfo';
import Chat from '../../components/Chat';
import ParticipantsList from '../../components/ParticipantsList';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : 'http://localhost:3001');
const WS_URL_BASE =
  process.env.NEXT_PUBLIC_WS_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001`
    : 'ws://localhost:3001');

const buildWsUrl = () => {
  const endpoint = WS_URL_BASE.endsWith('/ws')
    ? WS_URL_BASE
    : `${WS_URL_BASE.replace(/\/$/, '')}/ws`;
  return endpoint;
};

const byteToHex: string[] = Array.from({ length: 256 }, (_, i) =>
  (i + 0x100).toString(16).slice(1)
);

const generateClientId = () => {
  if (typeof window !== 'undefined') {
    const cryptoObj = window.crypto || (window as any).msCrypto;
    if (cryptoObj) {
      if (typeof cryptoObj.randomUUID === 'function') {
        return cryptoObj.randomUUID();
      }
      if (typeof cryptoObj.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        cryptoObj.getRandomValues(bytes);

        // Per RFC 4122 version 4 UUID
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;

        let uuid = '';
        for (let i = 0; i < 16; i += 1) {
          uuid += byteToHex[bytes[i]];
          if (i === 3 || i === 5 || i === 7 || i === 9) {
            uuid += '-';
          }
        }
        return uuid;
      }
    }
  }

  // Low-entropy fallback – still reasonably unique for our use case
  return `client-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
};

interface Video {
  id: string;
  filename: string;
  originalName: string;
  path: string;
  uploadedAt?: string;
}

interface SessionData {
  id: string;
  hostName: string;
  type: 'movie' | 'series';
  videos: Video[];
  currentVideoIndex: number;
  participantCount: number;
}

export default function WatchPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    // Get or prompt for user name
    const storedName = localStorage.getItem('rudhra_userName');
    const storedHostId = localStorage.getItem('rudhra_hostId');
    const storedSessionId = localStorage.getItem('rudhra_sessionId');

    let name = storedName;
    if (!name) {
      const promptName = prompt('Enter your name to join the session:');
      if (!promptName) {
        setError('Name is required to join');
        setLoading(false);
        return;
      }
      name = promptName;
      localStorage.setItem('rudhra_userName', name);
    }
    setUserName(name);

    // Check if user is the host
    let id = '';
    if (storedHostId && storedSessionId === sessionId) {
      setIsHost(true);
      id = storedHostId;
    } else {
      id = generateClientId();
    }
    setUserId(id);

    // Fetch session data
    const fetchSession = async () => {
      try {
        const response = await fetch(`${API_URL}/api/sessions/${sessionId}`);
        if (!response.ok) {
          throw new Error('Session not found');
        }
        const data = await response.json();
        setSessionData(data);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
        setLoading(false);
      }
    };

    fetchSession();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionData || !userName || !userId || loading) return;

    // Connect to WebSocket
    const wsConnection = new WebSocket(buildWsUrl());

    wsConnection.onopen = () => {
      wsConnection.send(JSON.stringify({
        type: 'join',
        userId,
        sessionId,
        userName
      }));
      setWs(wsConnection);
    };

    wsConnection.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsConnection.onclose = () => {
      console.log('WebSocket disconnected');
      setWs(null);
    };

    return () => {
      if (wsConnection.readyState === WebSocket.OPEN || wsConnection.readyState === WebSocket.CONNECTING) {
        wsConnection.close();
      }
    };
  }, [sessionData?.id, userName, userId, sessionId, loading]);

  useEffect(() => {
    if (!ws) return;
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data as string);
        if ((message.type === 'videosUpdate' && Array.isArray(message.videos)) ||
            (message.type === 'sync' && Array.isArray(message.videos))) {
          setSessionData((prev) => {
            if (!prev) return prev;
            return { ...prev, videos: message.videos };
          });
        }
      } catch {
        // ignore malformed messages
      }
    };
    ws.addEventListener('message', handleMessage);
    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div className="text-xl font-medium text-white">Loading session...</div>
        </div>
      </div>
    );
  }

  if (error || !sessionData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-6 max-w-md px-4">
          <div className="bg-red-950 border border-red-800 rounded-xl p-6">
            <div className="text-red-400 text-lg font-semibold mb-2">{error || 'Session not found'}</div>
            <p className="text-red-500 text-sm">The session you're looking for doesn't exist or has expired.</p>
          </div>
          <a href="/" className="inline-block px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 transition-all">
            Return to Home
          </a>
        </div>
      </div>
    );
  }

  if (sessionData.videos.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-6 max-w-md px-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8">
            <div className="text-white text-xl font-semibold mb-2">No videos uploaded yet</div>
            <div className="text-gray-400">Waiting for host to upload videos...</div>
          </div>
          <a href="/" className="inline-block px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 transition-all">
            Return to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <VideoPlayer
        sessionId={sessionId}
        userId={userId}
        videos={sessionData.videos}
        type={sessionData.type}
        isHost={isHost}
        ws={ws}
        hostName={sessionData.hostName}
      />
      <SessionInfo
        sessionId={sessionId}
        hostName={sessionData.hostName}
        type={sessionData.type}
        sessionLink={`${window.location.origin}/watch/${sessionId}`}
        isHost={isHost}
      />
      <ParticipantsList ws={ws} currentUserId={userId} />
      <Chat ws={ws} currentUserId={userId} currentUserName={userName} />
    </div>
  );
}


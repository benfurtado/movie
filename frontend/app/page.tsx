'use client';

import { useState, useEffect } from 'react';
import Onboarding from './components/Onboarding';
import LibrarySelection from './components/LibrarySelection';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Home() {
  const [userName, setUserName] = useState<string>('');
  const [contentType, setContentType] = useState<'movie' | 'series' | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [sessionLink, setSessionLink] = useState<string | null>(null);

  const resetSession = () => {
    setSessionId(null);
    setHostId(null);
    setSessionLink(null);
    setContentType(null);
    localStorage.removeItem('rudhra_sessionId');
    localStorage.removeItem('rudhra_hostId');
    localStorage.removeItem('rudhra_contentType');
  };

  useEffect(() => {
    // Check if user data exists in localStorage
    const storedName = localStorage.getItem('rudhra_userName');
    const storedSessionId = localStorage.getItem('rudhra_sessionId');
    const storedHostId = localStorage.getItem('rudhra_hostId');
    const storedContentType = localStorage.getItem('rudhra_contentType') as 'movie' | 'series' | null;

    if (storedName) {
      setUserName(storedName);
    }
    if (storedSessionId && storedHostId && storedContentType) {
      setSessionId(storedSessionId);
      setHostId(storedHostId);
      setContentType(storedContentType);
      setSessionLink(`${window.location.origin}/watch/${storedSessionId}`);

      const validateStoredSession = async () => {
        try {
          const response = await fetch(`${API_URL}/api/sessions/${storedSessionId}`);
          if (!response.ok) {
            throw new Error('Session not found');
          }
        } catch (error) {
          console.warn('Stored session is no longer valid. Clearing session data.', error);
          resetSession();
        }
      };

      validateStoredSession();
    }
  }, []);

  const handleOnboardingComplete = async (name: string, type: 'movie' | 'series') => {
    setUserName(name);
    setContentType(type);
    localStorage.setItem('rudhra_userName', name);
    localStorage.setItem('rudhra_contentType', type);

    try {
      const response = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hostName: name, type }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      setSessionId(data.sessionId);
      setHostId(data.hostId);
      // Always build the watch link using the current site origin (frontend),
      // not the backend host/port returned by the API.
      setSessionLink(`${window.location.origin}/watch/${data.sessionId}`);
      
      localStorage.setItem('rudhra_sessionId', data.sessionId);
      localStorage.setItem('rudhra_hostId', data.hostId);
    } catch (error) {
      console.error('Error creating session:', error);
      alert('Failed to create session. Please try again.');
      resetSession();
    }
  };

  const handleSessionInvalid = () => {
    resetSession();
  };

  if (!userName || !contentType) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (!sessionId || !hostId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div className="text-xl font-medium text-white">Creating session...</div>
        </div>
      </div>
    );
  }

  return (
    <LibrarySelection
      sessionId={sessionId}
      contentType={contentType}
      sessionLink={sessionLink}
      onSessionInvalid={handleSessionInvalid}
    />
  );
}


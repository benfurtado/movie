'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SessionLinkShare from './SessionLinkShare';

interface UploadFile {
  videoId: string | null;
  filename: string;
  originalName: string;
  path: string;
  uploadedAt?: string;
  size?: number | null;
}

interface LibrarySelectionProps {
  sessionId: string;
  sessionLink: string | null;
  contentType: 'movie' | 'series';
  onSessionInvalid: () => void;
}

export default function LibrarySelection({
  sessionId,
  sessionLink,
  contentType,
  onSessionInvalid
}: LibrarySelectionProps) {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : 'http://localhost:3001');

  const [files, setFiles] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [addingToSession, setAddingToSession] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshSelection = () => {
    setSelectedVideoIds((prev) =>
      prev.filter((id) => files.some((file) => file.videoId === id))
    );
  };

  const fetchUploads = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/uploads/files`);
      if (!response.ok) {
        throw new Error(`Failed to load uploads (status: ${response.status})`);
      }
      const data = await response.json();
      if (Array.isArray(data.files)) {
        setFiles(data.files);
      } else {
        setFiles([]);
      }
    } catch (err) {
      console.error('Failed to fetch uploads:', err);
      setError('Unable to load uploaded videos.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  useEffect(() => {
    refreshSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const toggleSelection = (videoId: string | null) => {
    if (!videoId) {
      alert('This video is not available for selection yet.');
      return;
    }

    setSelectedVideoIds((prev) => {
      if (contentType === 'movie') {
        return prev.includes(videoId) ? [] : [videoId];
      }

      if (prev.includes(videoId)) {
        return prev.filter((id) => id !== videoId);
      }
      return [...prev, videoId];
    });
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleUploadChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFiles = Array.from(event.target.files || []).filter((file) => {
      const lowerName = file.name.toLowerCase();
      return file.type.startsWith('video/') || lowerName.endsWith('.ts');
    });

    if (pickedFiles.length === 0) {
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    pickedFiles.forEach((file) => formData.append('videos', file));

    setUploading(true);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiUrl}/api/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      setStatusMessage(
        pickedFiles.length > 1
          ? 'Videos uploaded successfully.'
          : 'Video uploaded successfully.'
      );
      fetchUploads();
    } catch (err) {
      console.error('Failed to upload videos:', err);
      alert('Failed to upload videos. Please try again.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleStartSession = async () => {
    if (selectedVideoIds.length === 0) {
      alert('Select at least one video to start the session.');
      return;
    }

    setAddingToSession(true);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiUrl}/api/sessions/${sessionId}/library`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ videoIds: selectedVideoIds })
      });

      if (!response.ok) {
        if (response.status === 404) {
          alert('Session was not found. It may have been closed.');
          onSessionInvalid();
          return;
        }
        throw new Error(`Failed to update session (status ${response.status})`);
      }

      const target = sessionLink || `/watch/${sessionId}`;
      window.open(target, '_blank', 'noopener,noreferrer');

      setStatusMessage('Session updated. Watch page opened in a new tab.');
    } catch (err) {
      console.error('Failed to add videos to session:', err);
      alert('Unable to update session. Please try again.');
    } finally {
      setAddingToSession(false);
    }
  };

  const formatSize = (bytes?: number | null) => {
    if (!bytes) return '';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
  };

  const formatDate = (date?: string) => {
    if (!date) return '';
    try {
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime())) return '';
      return parsed.toLocaleString();
    } catch {
      return '';
    }
  };

  const isMovie = contentType === 'movie';

  const handleEndSession = async () => {
    if (endingSession) return;
    const confirmed = window.confirm('End this session?');
    if (!confirmed) return;

    setEndingSession(true);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiUrl}/api/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      window.location.href = '/';
    } catch (error) {
      console.error('Failed to end session:', error);
      alert('Unable to end session. Please try again.');
      setEndingSession(false);
    }
  };

  return (
    <div className="min-h-screen bg-black px-4 py-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-white">Choose Your Videos</h1>
            <p className="text-gray-400 text-lg">
              {isMovie
                ? 'Select one video to begin your session.'
                : 'Select one or more episodes for your session.'}
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:items-end sm:justify-end">
            {sessionLink && (
              <div className="sm:w-[min(380px,100%)] sm:max-w-sm w-full">
                <SessionLinkShare sessionLink={sessionLink} onAddVideo={handleUploadClick} />
              </div>
            )}
            <button
              onClick={handleEndSession}
              disabled={endingSession}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:border-red-500 transition-colors text-xs sm:text-sm font-semibold uppercase tracking-wider disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {endingSession ? (
                <>
                  <span className="w-3 h-3 border-2 border-red-200 border-t-transparent rounded-full animate-spin"></span>
                  Ending…
                </>
              ) : (
                'End Session'
              )}
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-400">
          {selectedVideoIds.length} of {isMovie ? 1 : 'many'} selected
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.ts"
          multiple={contentType === 'series'}
          className="hidden"
          onChange={handleUploadChange}
        />

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 gap-3">
              <div className="w-6 h-6 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
              Loading uploaded videos...
            </div>
          ) : error ? (
            <div className="text-red-400 text-center text-sm">{error}</div>
          ) : files.length === 0 ? (
            <div className="text-gray-500 text-center text-sm">
              No videos uploaded yet. Use “Add Another Video” to get started.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[420px] overflow-y-auto pr-2">
              {files.map((file) => {
                const isSelected = file.videoId ? selectedVideoIds.includes(file.videoId) : false;
                const displayName = file.originalName || file.filename;
                const initial = displayName?.trim()?.charAt(0)?.toUpperCase() ?? 'V';

                return (
                  <button
                    key={file.videoId ?? file.filename}
                    onClick={() => toggleSelection(file.videoId)}
                    className={`relative aspect-video w-full overflow-hidden rounded-2xl border transition-all duration-200 group ${
                      isSelected
                        ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.4)]'
                        : 'border-zinc-800 hover:border-white/40 hover:shadow-[0_10px_30px_rgba(0,0,0,0.4)]'
                    }`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black">
                      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.15),_transparent_55%)]" />
                    </div>

                    <div className="relative z-10 h-full p-4 flex flex-col justify-between">
                      <div className="flex items-start justify-between">
                        <div className="bg-white/10 rounded-full w-10 h-10 flex items-center justify-center text-white text-lg font-semibold">
                          {initial}
                        </div>
                        <div
                          className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                            isSelected ? 'border-white bg-white text-black' : 'border-white/40 text-white/60'
                          }`}
                        >
                          {isSelected ? (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <rect x="5" y="5" width="14" height="14" rx="3" />
                            </svg>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1 text-left">
                        <p className="text-white font-semibold text-lg line-clamp-2 group-hover:text-white/90 transition-colors">
                          {displayName}
                        </p>
                        <p className="text-xs text-white/60 line-clamp-1">
                          {file.filename}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/50">
                          {file.size && <span>{formatSize(file.size)}</span>}
                          {file.uploadedAt && (
                            <>
                              <span>•</span>
                              <span>{formatDate(file.uploadedAt)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {statusMessage && (
          <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3">
            {statusMessage}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <button
            onClick={handleStartSession}
            disabled={addingToSession || selectedVideoIds.length === 0}
            className="inline-flex items-center justify-center gap-3 px-5 py-3 rounded-lg bg-white text-black font-semibold uppercase tracking-wider text-sm hover:bg-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {addingToSession ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                Updating...
              </>
            ) : (
              `Start Session${isMovie ? '' : ' with Selected'}`
            )}
          </button>

          {sessionLink && (
            <a
              href={sessionLink}
              className="text-sm text-gray-400 hover:text-white underline-offset-4 hover:underline transition-colors"
            >
              Open watch page
            </a>
          )}
        </div>
      </div>
    </div>
  );
}


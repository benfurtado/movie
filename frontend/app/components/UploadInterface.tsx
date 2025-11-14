'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SessionLinkShare from './SessionLinkShare';

interface UploadInterfaceProps {
  sessionId: string;
  contentType: 'movie' | 'series';
  onUploadComplete: () => void;
  sessionLink: string | null;
  onSessionInvalid: () => void;
}

interface LibraryVideo {
  id: string;
  filename: string;
  originalName: string;
  path: string;
  uploadedAt?: string;
}

export default function UploadInterface({
  sessionId,
  contentType,
  onUploadComplete,
  sessionLink,
  onSessionInvalid,
}: UploadInterfaceProps) {
  const API_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : 'http://localhost:3001');
  const WS_URL =
    process.env.NEXT_PUBLIC_WS_URL ||
    (typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001`
      : 'ws://localhost:3001');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploaded, setUploaded] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [libraryVideos, setLibraryVideos] = useState<LibraryVideo[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [selectedLibraryVideos, setSelectedLibraryVideos] = useState<string[]>([]);
  const [addingFromLibrary, setAddingFromLibrary] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const librarySocketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetState = () => {
    setFiles([]);
    setUploading(false);
    setUploadProgress(0);
    setUploaded(false);
    setUploadMessage('');
    setSelectedLibraryVideos([]);
    setAddingFromLibrary(false);
    setEndingSession(false);
  };

  const fetchLibraryVideos = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError(null);

    try {
      const response = await fetch(`${API_URL}/api/videos`);
      if (!response.ok) {
        const message = `Failed to load library (status: ${response.status})`;
        console.warn(message);
        setLibraryError('Unable to load previously uploaded videos.');
        return;
      }
      const data = await response.json();
      setLibraryVideos(Array.isArray(data.videos) ? data.videos : []);
    } catch (error) {
      console.error('Failed to load video library:', error);
      setLibraryError('Unable to load previously uploaded videos.');
    } finally {
      setLibraryLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchLibraryVideos();
  }, [fetchLibraryVideos]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let isUnmounted = false;

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const connect = () => {
      clearReconnectTimeout();

      const socket = new WebSocket(`${WS_URL}/ws`);
      librarySocketRef.current = socket;

      const handleMessage = (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data as string);
          if (payload.type === 'libraryUpdate' && Array.isArray(payload.videos)) {
            setLibraryVideos(payload.videos);
            setLibraryLoading(false);
            setLibraryError(null);
          }
        } catch (error) {
          console.warn('Failed to process libraryUpdate message', error);
        }
      };

      const handleOpen = () => {
        try {
          socket.send(JSON.stringify({ type: 'librarySubscribe' }));
        } catch (error) {
          console.warn('Failed to subscribe to library updates', error);
        }
      };

      const handleError = (event: Event) => {
        if (!isUnmounted) {
          console.warn('Library WebSocket error', event);
        }
      };

      const handleClose = () => {
        if (librarySocketRef.current === socket) {
          librarySocketRef.current = null;
        }
        if (!isUnmounted) {
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        }
      };

      socket.addEventListener('open', handleOpen);
      socket.addEventListener('message', handleMessage);
      socket.addEventListener('error', handleError);
      socket.addEventListener('close', handleClose);

      return () => {
        socket.removeEventListener('open', handleOpen);
        socket.removeEventListener('message', handleMessage);
        socket.removeEventListener('error', handleError);
        socket.removeEventListener('close', handleClose);
      };
    };

    const teardown = connect();

    return () => {
      isUnmounted = true;
      teardown?.();
      clearReconnectTimeout();

      const socket = librarySocketRef.current;
      if (socket) {
        if (socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ type: 'libraryUnsubscribe' }));
          } catch {}
        }
        try {
          socket.close();
        } catch {}
        librarySocketRef.current = null;
      }
    };
  }, [WS_URL]);

  const toggleLibrarySelection = (videoId: string) => {
    setSelectedLibraryVideos((prev) =>
      prev.includes(videoId) ? prev.filter((id) => id !== videoId) : [...prev, videoId]
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    
    if (contentType === 'movie' && selectedFiles.length > 1) {
      alert('Please select only one file for a movie');
      return;
    }

    setFiles(selectedFiles);
  };

  const handleAddFromLibrary = async () => {
    if (selectedLibraryVideos.length === 0) {
      alert('Select at least one video from your library to add to this session.');
      return;
    }

    setAddingFromLibrary(true);

    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}/library`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoIds: selectedLibraryVideos }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          onSessionInvalid();
        }
        throw new Error('Failed to add videos from library');
      }

      setUploaded(true);
      setUploadMessage(
        selectedLibraryVideos.length > 1
          ? 'Selected videos have been added to this session.'
          : 'Selected video has been added to this session.'
      );
      setAddingFromLibrary(false);
      setSelectedLibraryVideos([]);
      fetchLibraryVideos();
      onUploadComplete();
    } catch (error) {
      console.error('Failed to add videos from library:', error);
      alert('Unable to add selected videos. Please try again.');
      setAddingFromLibrary(false);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      alert('Please select at least one file');
      return;
    }

    const handleUploadFailure = (status?: number, responseText?: string) => {
      let message = 'Failed to upload files. Please try again.';
      if (status === 404) {
        message =
          'Your session is no longer available. Please start a new session and try uploading again.';
        onSessionInvalid();
      }

      console.error('Upload error:', { status, responseText });
      setUploading(false);
      setUploadProgress(0);
      alert(message);
    };

    setUploading(true);
    setUploadProgress(0);

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let uploadedBytes = 0;

    const uploadedIds: string[] = [];
    const uploadFile = (file: File, index: number) =>
      new Promise<void>((resolve, reject) => {
        const formData = new FormData();
        formData.append('videos', file);

        const xhr = new XMLHttpRequest();
        let lastLoaded = 0;

        const updateProgress = (loadedIncrement: number) => {
          if (totalBytes === 0) return;
          uploadedBytes += loadedIncrement;
          const percentComplete = Math.min(100, (uploadedBytes / totalBytes) * 100);
          setUploadProgress(percentComplete);
        };

        xhr.upload.addEventListener('progress', (e) => {
          if (!e.lengthComputable) return;
          const delta = e.loaded - lastLoaded;
          lastLoaded = e.loaded;
          updateProgress(delta);
        });

        const resolveUpload = () => {
          if (lastLoaded < file.size) {
            updateProgress(file.size - lastLoaded);
            lastLoaded = file.size;
          }
          resolve();
        };

        const rejectUpload = () => {
          reject({ status: xhr.status, responseText: xhr.responseText });
        };

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            try {
              const resp = JSON.parse(xhr.responseText || '{}');
              const vids = Array.isArray(resp.videos) ? resp.videos : [];
              vids.forEach((v: any) => {
                if (v && typeof v.id === 'string') uploadedIds.push(v.id);
              });
            } catch {}
            resolveUpload();
          } else {
            rejectUpload();
          }
        });

        xhr.addEventListener('error', rejectUpload);
        xhr.addEventListener('abort', rejectUpload);

        // Upload to global library first so upload is not tied to session lifetime
        xhr.open('POST', `${API_URL}/api/upload`);
        xhr.send(formData);
      });

    try {
      await Promise.all(files.map((file, index) => uploadFile(file, index)));
      setUploadProgress(100);
      setUploaded(true);
      setUploadMessage(
        files.length > 1
          ? 'Your videos have been uploaded successfully.'
          : 'Your video has been uploaded successfully.'
      );
      setUploading(false);
      // Try to add the uploaded videos to the current session (if it still exists)
      if (uploadedIds.length > 0) {
        try {
          const resp = await fetch(`${API_URL}/api/sessions/${sessionId}/library`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoIds: uploadedIds }),
          });
          if (!resp.ok && resp.status === 404) {
            onSessionInvalid();
          }
        } catch {}
      }
      fetchLibraryVideos();
      onUploadComplete();
    } catch (error) {
      const uploadError = error as { status?: number; responseText?: string };
      handleUploadFailure(uploadError.status, uploadError.responseText);
    }
  };

  const handleEndSession = async () => {
    if (endingSession) return;
    const confirmed = window.confirm('Are you sure you want to end this session?');
    if (!confirmed) return;

    setEndingSession(true);
    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const message = response.status === 404
          ? 'Session not found. It may have already been closed.'
          : 'Failed to end session. Please try again.';
        console.error('Failed to end session', response.status);
        alert(message);
        if (response.status === 404) {
          onSessionInvalid();
        }
        return;
      }

      resetState();
      onSessionInvalid();
    } catch (error) {
      console.error('Error ending session:', error);
      alert('Failed to end session. Please check your connection and try again.');
    } finally {
      setEndingSession(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter((file) => {
      const lowerName = file.name.toLowerCase();
      return file.type.startsWith('video/') || lowerName.endsWith('.ts');
    });

    if (contentType === 'movie' && droppedFiles.length > 1) {
      alert('Please drop only one file for a movie');
      return;
    }

    setFiles(droppedFiles);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatUploadedDate = (date?: string) => {
    if (!date) return '';
    try {
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime())) return '';
      return parsed.toLocaleString();
    } catch {
      return '';
    }
  };

const isProcessing = uploading || addingFromLibrary || endingSession;

  const renderSuccessView = () => (
    <div className="min-h-screen flex items-center justify-center bg-black px-4 py-12">
      <div className="max-w-lg w-full">
        <div className="flex justify-end mb-4">
          <button
            onClick={handleEndSession}
            disabled={endingSession}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:border-red-500 transition-colors text-xs sm:text-sm font-semibold uppercase tracking-wider disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {endingSession ? (
              <>
                <span className="w-3 h-3 border-2 border-red-200 border-t-transparent rounded-full animate-spin"></span>
                Ending...
              </>
            ) : (
              'End Session'
            )}
          </button>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 shadow-2xl text-center space-y-6">
          <div className="flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-600 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-white">Upload Complete</h2>
            <p className="text-gray-400 text-base">{uploadMessage || 'Your content is ready.'}</p>
          </div>

          {sessionLink && (
            <a
              href={sessionLink}
              className="block w-full py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 transition-all duration-200 text-base uppercase tracking-wider"
            >
              Go to Watch Page
            </a>
          )}

          <button
            onClick={resetState}
            className="w-full py-3 bg-zinc-800 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-all duration-200 text-base uppercase tracking-wider"
          >
            Upload More Content
          </button>
        </div>

        {!sessionLink && (
          <p className="text-center text-gray-500 text-sm mt-6">
            Share your session link once you&apos;re ready to start watching.
          </p>
        )}
      </div>
    </div>
  );

  if (uploaded) {
    return renderSuccessView();
  }

  return (
    <div className="min-h-screen bg-black px-4 py-12">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-white">
              Upload Your {contentType === 'movie' ? 'Movie' : 'Series'}
            </h1>
            <p className="text-gray-400 text-lg">
              {contentType === 'movie'
                ? 'Select a single video file to upload'
                : 'Select one or more video files (episodes) to upload'}
            </p>
          </div>
          <button
            onClick={handleEndSession}
            disabled={endingSession}
            className="self-start inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:border-red-500 transition-colors text-xs sm:text-sm font-semibold uppercase tracking-wider disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {endingSession ? (
              <>
                <span className="w-3 h-3 border-2 border-red-200 border-t-transparent rounded-full animate-spin"></span>
                Ending...
              </>
            ) : (
              'End Session'
            )}
          </button>
        </div>

        {/* Session Link */}
        {sessionLink && (
          <div>
            <SessionLinkShare sessionLink={sessionLink} />
          </div>
        )}

        {/* Upload Area */}
        <div
          className={`bg-zinc-900 border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 cursor-pointer ${
            isDragging
              ? 'border-white bg-zinc-800'
              : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-950'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.ts"
            multiple={contentType === 'series'}
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="w-20 h-20 border-2 border-zinc-700 rounded-xl flex items-center justify-center">
                <svg className="w-10 h-10 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-white text-xl font-medium">
                Drag and drop your video{contentType === 'series' ? 's' : ''} here
              </p>
              <p className="text-gray-500 text-sm">
                or click to browse from your device
              </p>
              <p className="text-gray-600 text-xs mt-4">
                {contentType === 'movie' ? 'Single video file' : 'Multiple video files supported'}
              </p>
            </div>
          </div>
        </div>

        {/* Selected Files */}
        {files.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-white font-semibold text-lg">Selected Files ({files.length})</h3>
            <div className="space-y-3">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="bg-black border border-zinc-800 rounded-lg px-4 py-3 flex items-center justify-between group hover:border-zinc-700 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{file.name}</p>
                    <p className="text-gray-500 text-sm mt-1">{formatFileSize(file.size)}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const newFiles = files.filter((_, i) => i !== index);
                      setFiles(newFiles);
                    }}
                    className="ml-4 w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white hover:bg-zinc-900 rounded transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Library Section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold text-lg">Previously Uploaded Videos</h3>
            <button
              onClick={fetchLibraryVideos}
              className="text-xs uppercase tracking-wider text-gray-400 hover:text-white transition-colors"
              disabled={libraryLoading}
            >
              Refresh
            </button>
          </div>

          {libraryLoading ? (
            <div className="flex items-center gap-3 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
              Loading your library...
            </div>
          ) : libraryError ? (
            <div className="text-sm text-red-400">{libraryError}</div>
          ) : libraryVideos.length === 0 ? (
            <div className="text-sm text-gray-500">No videos in your library yet.</div>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {libraryVideos.map((video) => {
                const isSelected = selectedLibraryVideos.includes(video.id);
                return (
                  <button
                    key={video.id}
                    onClick={() => toggleLibrarySelection(video.id)}
                    className={`w-full text-left bg-black border rounded-lg px-4 py-3 transition-colors ${
                      isSelected
                        ? 'border-white text-white'
                        : 'border-zinc-800 text-gray-300 hover:border-zinc-700 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{video.originalName || video.filename}</p>
                        <p className="text-xs text-gray-500 mt-1">{video.filename}</p>
                        {video.uploadedAt && (
                          <p className="text-xs text-gray-500 mt-1">
                            Uploaded {formatUploadedDate(video.uploadedAt)}
                          </p>
                        )}
                      </div>
                      <div
                        className={`ml-4 w-6 h-6 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-white bg-white text-black' : 'border-zinc-700'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <a
                        href={`${API_URL}${video.path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-3 text-xs text-gray-400 hover:text-white underline"
                        title="Open file"
                      >
                        Open
                      </a>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={handleAddFromLibrary}
            disabled={selectedLibraryVideos.length === 0 || isProcessing}
            className="w-full py-3 bg-zinc-200 text-black font-semibold rounded-lg hover:bg-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-wider"
          >
            {addingFromLibrary ? 'Adding Videos...' : 'Add Selected Videos to Session'}
          </button>
        </div>

        {/* Upload Button */}
        <div className="space-y-4">
          <button
            onClick={handleUpload}
            disabled={files.length === 0 || isProcessing}
            className="w-full py-4 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-base uppercase tracking-wider"
          >
            {uploading ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                <span>Uploading... {Math.round(uploadProgress)}%</span>
              </div>
            ) : (
              'Upload & Start Session'
            )}
          </button>

          {uploading && (
            <div className="space-y-2">
              <div className="w-full bg-zinc-900 border border-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-white h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <p className="text-center text-gray-500 text-sm">{Math.round(uploadProgress)}% complete</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

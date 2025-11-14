'use client';

import { useEffect, useRef, useState } from 'react';

interface Video {
  id: string;
  filename: string;
  originalName: string;
  path: string;
  uploadedAt?: string;
}

interface VideoPlayerProps {
  sessionId: string;
  userId: string;
  videos: Video[];
  type: 'movie' | 'series';
  isHost: boolean;
  ws: WebSocket | null;
  hostName: string;
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : 'http://localhost:3001');

export default function VideoPlayer({
  sessionId,
  userId,
  videos,
  type,
  isHost,
  ws,
  hostName,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserInteractingRef = useRef(false);
  const syncThreshold = 1;
  const playerRef = useRef<any | null>(null);

  const currentVideo = videos[currentVideoIndex];
const videoUrl = currentVideo ? new URL(currentVideo.path, API_URL).toString() : '';
  const isTs = !!currentVideo?.path?.toLowerCase().endsWith('.ts');

  // Attach MPEG-TS player via mpegts.js when playing .ts files
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    let cancelled = false;

    const destroyPlayer = () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (error) {
          console.warn('Failed to destroy mpegts player', error);
        }
        playerRef.current = null;
      }
    };

    if (!isTs) {
      destroyPlayer();
      videoEl.src = videoUrl;
      return () => {};
    }

    import('mpegts.js/dist/mpegts')
      .then((mpegts: any) => {
        if (cancelled) return;
        if (!mpegts || !mpegts.isSupported()) {
          console.warn('mpegts.js is not supported in this environment');
          return;
        }

        destroyPlayer();

        videoEl.pause();
        try {
          videoEl.removeAttribute('src');
          videoEl.load();
        } catch {
          // ignore
        }

        const player = mpegts.createPlayer(
          { type: 'mpegts', url: videoUrl },
          {
            enableWorker: true,
            enableStashBuffer: true,
            stashInitialSize: 512,
            isLive: false,
            lazyLoad: false,
            seekType: 'range',
          }
        );

        playerRef.current = player;

        try {
          player.on && mpegts.Events && player.on(mpegts.Events.ERROR, (err: any) => {
            console.error('mpegts.js error', err);
          });
        } catch {
          // ignore
        }

        player.attachMediaElement(videoEl);
        player.load();
        player.play().catch(() => {
          // autoplay might be blocked; rely on user interaction
        });
      })
      .catch((error) => {
        console.error('Failed to load mpegts.js', error);
      });

    return () => {
      cancelled = true;
      destroyPlayer();
    };
  }, [isTs, videoUrl]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'sync':
          setCurrentVideoIndex(message.currentVideoIndex || 0);
          if (videoRef.current && message.currentTime !== undefined) {
            videoRef.current.currentTime = message.currentTime;
            setCurrentTime(message.currentTime);
          }
          setIsPlaying(message.isPlaying || false);
          break;

        case 'play':
          if (!isHost && videoRef.current) {
            if (message.currentTime !== undefined) {
              videoRef.current.currentTime = message.currentTime;
              setCurrentTime(message.currentTime);
            }
            setIsPlaying(true);
            videoRef.current.play().catch(console.error);
          }
          break;

        case 'pause':
          if (!isHost && videoRef.current) {
            if (message.currentTime !== undefined) {
              videoRef.current.currentTime = message.currentTime;
              setCurrentTime(message.currentTime);
            }
            setIsPlaying(false);
            videoRef.current.pause();
          }
          break;

        case 'seek':
          if (!isHost && videoRef.current) {
            const timeDiff = Math.abs(videoRef.current.currentTime - message.time);
            if (timeDiff > syncThreshold) {
              videoRef.current.currentTime = message.time;
              setCurrentTime(message.time);
            }
          }
          break;

        case 'videoChange':
          if (!isHost) {
            setCurrentVideoIndex(message.videoIndex);
            setCurrentTime(0);
            setIsPlaying(false);
          }
          break;

        case 'sessionEnded':
          if (videoRef.current) {
            videoRef.current.pause();
          }
          setIsPlaying(false);
          alert(message.reason || 'This session has ended.');
          window.location.href = '/';
          break;
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws, isHost]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (!isUserInteractingRef.current) {
        setCurrentTime(video.currentTime);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setIsBuffering(false);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handleCanPlay = () => {
      setIsBuffering(false);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, [currentVideoIndex]);

  useEffect(() => {
    if (videoRef.current && currentVideo) {
      videoRef.current.load();
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
      if (currentTime > 0) {
        videoRef.current.currentTime = currentTime;
      }
    }
  }, [currentVideoIndex, volume, isMuted, currentVideo]);

  // Real-time sync: Update current time periodically when playing
  useEffect(() => {
    if (!isHost || !videoRef.current || !ws || ws.readyState !== WebSocket.OPEN || !isPlaying) return;

    const syncInterval = setInterval(() => {
      if (videoRef.current && isPlaying) {
        const currentTime = videoRef.current.currentTime;
        ws.send(JSON.stringify({
          type: 'seek',
          time: currentTime
        }));
      }
    }, 2000);

    return () => clearInterval(syncInterval);
  }, [isHost, ws, isPlaying]);

  const handlePlayPause = () => {
    if (!isHost || !videoRef.current) return;

    const currentVideoTime = videoRef.current.currentTime;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'pause',
          currentTime: currentVideoTime
        }));
      }
    } else {
      videoRef.current.play().catch(console.error);
      setIsPlaying(true);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'play',
          currentTime: currentVideoTime
        }));
      }
    }
  };

  const handleSeek = (time: number) => {
    if (!videoRef.current) return;

    const newTime = Math.max(0, Math.min(time, duration));
    
    if (isHost) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'seek', time: newTime }));
      }
    } else {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleSkip = (seconds: number) => {
    if (videoRef.current) {
      handleSeek(currentTime + seconds);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    const vol = Math.max(0, Math.min(1, newVolume));
    setVolume(vol);
    setIsMuted(vol === 0);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (videoRef.current) {
        videoRef.current.muted = false;
      }
    } else {
      setIsMuted(true);
      if (videoRef.current) {
        videoRef.current.muted = true;
      }
    }
  };

  const handleVideoChange = (index: number) => {
    if (!isHost) return;

    if (index >= 0 && index < videos.length) {
      setCurrentVideoIndex(index);
      setCurrentTime(0);
      setIsPlaying(false);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.pause();
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'changeVideo', videoIndex: index }));
      }
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleInteraction = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setShowVolumeSlider(false);
      }
    }, 3000);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();

    let clientX: number | null = null;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0]?.clientX ?? null;
    } else {
      clientX = e.clientX ?? null;
    }

    if (clientX === null) return;

    const clickX = clientX - rect.left;
    const percentage = Math.min(Math.max(clickX / rect.width, 0), 1);
    const newTime = percentage * duration;
    handleSeek(newTime);
    isUserInteractingRef.current = true;
    setTimeout(() => {
      isUserInteractingRef.current = false;
    }, 500);
  };

  if (!currentVideo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white">No video available</div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 w-full h-full bg-black"
      onMouseMove={handleInteraction}
      onTouchStart={handleInteraction}
      onMouseLeave={() => {
        if (isPlaying) {
          setShowControls(false);
          setShowVolumeSlider(false);
        }
      }}
    >
      {/* Video Container - Fits viewport */}
      <div className="absolute inset-0 w-full h-full">
        <video
          ref={videoRef}
          src={isTs ? undefined : videoUrl}
          className="w-full h-full object-contain"
          crossOrigin="anonymous"
          playsInline
        />

        {/* Buffering Indicator */}
        {isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Controls Overlay */}
        {showControls && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Bottom Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 pointer-events-auto">
              {/* Progress Bar */}
              <div
                className="w-full h-2 bg-zinc-900/80 rounded-full mb-4 cursor-pointer touch-none"
                onClick={handleProgressClick}
                onTouchEnd={handleProgressClick}
              >
                <div
                  className="h-full bg-white rounded-full transition-all duration-150 relative"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-2.5 sm:h-2.5 bg-white rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-lg"></div>
                </div>
              </div>

              {/* Controls Bar - Clean, Aligned Layout */}
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                {/* Left Controls Group */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Play/Pause Button */}
                  <button
                    onClick={handlePlayPause}
                    disabled={!isHost}
                    className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 active:bg-white/30 transition-all touch-manipulation ${
                      !isHost ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    title={isHost ? (isPlaying ? 'Pause' : 'Play') : 'Only host can control playback'}
                  >
                    {isPlaying ? (
                      <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white ml-0.5 sm:ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  {/* Skip Backward */}
                  <button
                    onClick={() => handleSkip(-10)}
                    className="hidden sm:flex flex-shrink-0 w-10 h-10 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 active:bg-white/30 transition-all touch-manipulation"
                    title="Skip backward 10s"
                  >
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                    </svg>
                    <span className="text-xs text-white ml-0.5 hidden lg:inline">10</span>
                  </button>

                  {/* Skip Forward */}
                  <button
                    onClick={() => handleSkip(10)}
                    className="hidden sm:flex flex-shrink-0 w-10 h-10 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 active:bg-white/30 transition-all touch-manipulation"
                    title="Skip forward 10s"
                  >
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
                    </svg>
                    <span className="text-xs text-white ml-0.5 hidden lg:inline">10</span>
                  </button>

                  {/* Volume Control */}
                  <div
                    className="relative flex-shrink-0"
                    onMouseEnter={() => setShowVolumeSlider(true)}
                    onMouseLeave={() => setShowVolumeSlider(false)}
                    onTouchStart={() => setShowVolumeSlider(!showVolumeSlider)}
                  >
                    <button
                      onClick={toggleMute}
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 active:bg-white/30 transition-all touch-manipulation"
                      title={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted || volume === 0 ? (
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38.31 2.63.95 3.69 1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                        </svg>
                      ) : volume < 0.5 ? (
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                        </svg>
                      )}
                    </button>
                    {showVolumeSlider && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 rounded-lg p-2 sm:p-3 z-50">
                        <div className="relative w-20 sm:w-24 h-1 bg-zinc-700 rounded-lg touch-none">
                          <div
                            className="absolute left-0 top-0 h-full bg-white rounded-lg pointer-events-none"
                            style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                          />
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={isMuted ? 0 : volume}
                            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                        </div>
                        <div className="text-white text-xs text-center mt-1">{Math.round(volume * 100)}%</div>
                      </div>
                    )}
                  </div>

                  {/* Time Display */}
                  <div className="text-white text-xs sm:text-sm font-mono whitespace-nowrap">
                    <span className="hidden sm:inline">{formatTime(currentTime)} / {formatTime(duration)}</span>
                    <span className="sm:hidden">{formatTime(currentTime)}</span>
                  </div>

                  {/* Episode Navigation - Moved next to timestamps */}
                  {type === 'series' && videos.length > 1 && (
                    <div className="flex items-center gap-2 sm:gap-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-2 sm:px-4 py-1.5 sm:py-2">
                      <button
                        onClick={() => handleVideoChange(currentVideoIndex - 1)}
                        disabled={!isHost || currentVideoIndex === 0}
                        className={`w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center text-white hover:bg-white/20 active:bg-white/30 rounded transition-all touch-manipulation ${
                          !isHost || currentVideoIndex === 0 ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        title="Previous episode"
                      >
                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                        </svg>
                      </button>
                      <span className="text-white text-xs sm:text-sm font-medium min-w-[60px] sm:min-w-[80px] text-center whitespace-nowrap">
                        E{currentVideoIndex + 1}/{videos.length}
                      </span>
                      <button
                        onClick={() => handleVideoChange(currentVideoIndex + 1)}
                        disabled={!isHost || currentVideoIndex === videos.length - 1}
                        className={`w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center text-white hover:bg-white/20 active:bg-white/30 rounded transition-all touch-manipulation ${
                          !isHost || currentVideoIndex === videos.length - 1 ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        title="Next episode"
                      >
                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Right Controls Group */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Host Indicator */}
                  {!isHost && (
                    <div className="hidden sm:block text-xs text-white/70 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 whitespace-nowrap">
                      <span className="hidden md:inline">Watching with {hostName}</span>
                      <span className="md:hidden">With {hostName}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

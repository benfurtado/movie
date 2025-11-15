'use client';

import { useEffect, useRef, useState } from 'react';
import SessionInfo from './SessionInfo';
import Chat from './Chat';
import ParticipantsList from './ParticipantsList';

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
  userName: string;
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
  userName,
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  // Option A: auto keep awake while playing
  const [keepAwake, setKeepAwake] = useState(true);

  const lastPinchDistanceRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any | null>(null);
  const noSleepRef = useRef<any | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserInteractingRef = useRef(false);
  const playerRef = useRef<any | null>(null);

  const currentVideo = videos[currentVideoIndex];
  const videoUrl = currentVideo ? new URL(currentVideo.path, API_URL).toString() : '';
  const isTs = !!currentVideo?.path?.toLowerCase().endsWith('.ts');

  const isIOS = typeof navigator !== 'undefined' && /iP(ad|hone|od)/.test(navigator.userAgent);

  // Helper: request wake lock (usable anywhere)
  const requestWakeLock = async () => {
    try {
      const anyNavigator: any = navigator;
      // Prefer Wake Lock API when available
      if (typeof anyNavigator !== 'undefined' && 'wakeLock' in anyNavigator) {
        if (!wakeLockRef.current) {
          const wl = await anyNavigator.wakeLock.request('screen');
          wakeLockRef.current = wl;
          wl.addEventListener('release', () => {
            wakeLockRef.current = null;
          });
        }
        return;
      }

      // Fallback to NoSleep.js if provided (may not work on some iOS versions)
      if (typeof window !== 'undefined') {
        const anyWindow: any = window;
        if (!noSleepRef.current && anyWindow.NoSleep) {
          noSleepRef.current = new anyWindow.NoSleep();
        }
        if (noSleepRef.current && typeof noSleepRef.current.enable === 'function') {
          await noSleepRef.current.enable().catch(() => {});
        }
      }
    } catch (err) {
      console.warn('requestWakeLock failed:', err);
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current && typeof wakeLockRef.current.release === 'function') {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      if (noSleepRef.current && typeof noSleepRef.current.disable === 'function') {
        await noSleepRef.current.disable();
      }
    } catch (err) {
      console.warn('releaseWakeLock failed:', err);
      wakeLockRef.current = null;
    }
  };

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

  // Handle WebSocket messages (sync playback for ALL users)
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer || event.data instanceof Blob) return;

      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'sync':
            setCurrentVideoIndex(message.currentVideoIndex || 0);
            if (videoRef.current && typeof message.currentTime === 'number') {
              const timeDiff = Math.abs(videoRef.current.currentTime - message.currentTime);
              if (timeDiff > 0.5) {
                videoRef.current.currentTime = message.currentTime;
                setCurrentTime(message.currentTime);
              }
            }
            setIsPlaying(Boolean(message.isPlaying));
            if (message.isPlaying && videoRef.current && videoRef.current.paused) {
              videoRef.current.play().catch(console.error);
            } else if (!message.isPlaying && videoRef.current && !videoRef.current.paused) {
              videoRef.current.pause();
            }
            break;

          case 'play':
            if (videoRef.current) {
              if (typeof message.currentTime === 'number') {
                videoRef.current.currentTime = message.currentTime;
                setCurrentTime(message.currentTime);
              }
              setIsPlaying(true);
              videoRef.current.play().catch(console.error);
            }
            break;

          case 'pause':
            if (videoRef.current) {
              if (typeof message.currentTime === 'number') {
                videoRef.current.currentTime = message.currentTime;
                setCurrentTime(message.currentTime);
              }
              setIsPlaying(false);
              videoRef.current.pause();
            }
            break;

          case 'seek':
            if (videoRef.current && typeof message.time === 'number') {
              const timeDiff = Math.abs(videoRef.current.currentTime - message.time);
              if (timeDiff > 0.5) {
                videoRef.current.currentTime = message.time;
                setCurrentTime(message.time);
              }
            }
            break;

          case 'videoChange':
            if (typeof message.videoIndex === 'number') {
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
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws]);

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
      // On actual playback start, ensure wake lock is active (auto behaviour)
      if (keepAwake) requestWakeLock();
    };

    const handlePause = () => {
      setIsPlaying(false);
      // release wake lock when paused
      releaseWakeLock();
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
  }, [currentVideoIndex, keepAwake]);

  useEffect(() => {
    if (videoRef.current && currentVideo) {
      videoRef.current.load();
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
      // For iOS, enable native controls so that the device keeps screen on while playing
      if (isIOS && videoRef.current) {
        videoRef.current.controls = true;
        // Attempt fullscreen on play for better wake behaviour (may require user gesture)
      } else if (videoRef.current) {
        videoRef.current.controls = false;
      }

      if (currentTime > 0) {
        videoRef.current.currentTime = currentTime;
      }
    }
  }, [currentVideoIndex, volume, isMuted, currentVideo]);

  // Auto-manage wake lock based on play/pause & visibility
  useEffect(() => {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying && keepAwake) {
        requestWakeLock();
      } else {
        // when page hidden, release to be polite
        releaseWakeLock();
      }
    };

    if (isPlaying && keepAwake) {
      // ensure the wake lock is requested when playback starts
      requestWakeLock();
    } else {
      // release when not playing
      releaseWakeLock();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // cleanup on unmount
      releaseWakeLock();
    };
  }, [isPlaying, keepAwake]);

  // Safari / iOS quirk: the first wakeLock.request must be initiated by a user gesture.
  // We attempt to bind a one-time listener to the video element so a user tap will satisfy it.
  useEffect(() => {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') return;
    const anyNavigator: any = navigator;
    if (!('wakeLock' in anyNavigator)) return; // if Wake Lock API not present, skip

    const video = videoRef.current;
    if (!video) return;

    let initialized = false;

    const handleFirstUserGesture = async () => {
      if (initialized) return;
      initialized = true;
      try {
        await requestWakeLock();
      } catch (err) {
        console.warn('Initial Wake Lock request failed (gesture):', err);
      } finally {
        video.removeEventListener('click', handleFirstUserGesture);
      }
    };

    video.addEventListener('click', handleFirstUserGesture);

    return () => {
      video.removeEventListener('click', handleFirstUserGesture);
    };
  }, []);

  const handlePlayPause = async () => {
    if (!videoRef.current) return;

    const currentVideoTime = videoRef.current.currentTime;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      // release wake lock when user pauses
      await releaseWakeLock();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'pause',
          currentTime: currentVideoTime
        }));
      }
    } else {
      try {
        await videoRef.current.play();
        setIsPlaying(true);
        // Auto-enable keep-awake behaviour (Option A)
        setKeepAwake(true);
        // Immediately request wake lock (play is typically a user gesture so this should work on Safari too)
        await requestWakeLock();

        // On iOS, attempt to go fullscreen for better wake behaviour (may require user gesture)
        if (isIOS && videoRef.current) {
          try {
            // Some iOS browsers may not support requestFullscreen on the video element; try container
            if ((videoRef.current as any).requestFullscreen) {
              await (videoRef.current as any).requestFullscreen();
            } else if (playerContainerRef.current?.requestFullscreen) {
              await playerContainerRef.current.requestFullscreen();
            }
          } catch (err) {
            // ignore fullscreen failures
          }
        }

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            type: 'play',
            currentTime: currentVideoTime
          }));
        }
      } catch (err) {
        console.error('Failed to play video:', err);
      }
    }
  };

  const handleSeek = (time: number) => {
    if (!videoRef.current) return;

    const newTime = Math.max(0, Math.min(time, duration));

    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'seek', time: newTime }));
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

  const getTouchDistance = (touches: TouchList | React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleVideoTouchStart = (e: React.TouchEvent<HTMLVideoElement>) => {
    if (!isFullscreen) return;
    if (e.touches.length === 2) {
      lastPinchDistanceRef.current = getTouchDistance(e.touches);
    }
  };

  const handleVideoTouchMove = (e: React.TouchEvent<HTMLVideoElement>) => {
    if (!isFullscreen) return;
    if (e.touches.length === 2 && lastPinchDistanceRef.current) {
      const currentDistance = getTouchDistance(e.touches);
      if (currentDistance <= 0) return;

      const scaleFactor = currentDistance / lastPinchDistanceRef.current;
      lastPinchDistanceRef.current = currentDistance;

      setZoom((prev) => {
        let next = prev * scaleFactor;
        if (next < 1) next = 1;
        if (next > 5) next = 5;
        return next;
      });

      e.preventDefault();
    }
  };

  const handleVideoTouchEnd = () => {
    if (!isFullscreen) {
      lastPinchDistanceRef.current = null;
      return;
    }
    lastPinchDistanceRef.current = null;
    setZoom((prev) => (prev < 1.05 ? 1 : prev));
  };

  const changeZoom = (delta: number) => {
    setZoom((prev) => {
      let next = prev + delta;
      if (next < 1) next = 1;
      if (next > 5) next = 5;
      return Number(next.toFixed(2));
    });
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleToggleFullscreen = async () => {
    if (typeof document === 'undefined') return;

    const container = playerContainerRef.current;
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        }
        const anyScreen: any = typeof screen !== 'undefined' ? screen : null;
        if (anyScreen?.orientation?.lock) {
          try {
            await anyScreen.orientation.lock('landscape');
          } catch {}
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
        setZoom(1);
      }
    } catch (error) {
      console.error('Failed to toggle fullscreen', error);
    }
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
      ref={playerContainerRef}
      className="fixed inset-0 w-full h-full bg-black"
      onMouseMove={handleInteraction}
      onTouchStart={handleInteraction}
      onMouseLeave={() => {
        if (isPlaying) {
          setShowControls(false);
        }
      }}
    >
      <div className="absolute inset-0 w-full h-full">
        <video
          ref={videoRef}
          src={isTs ? undefined : videoUrl}
          className="w-full h-full object-contain"
          style={{
            transform: zoom !== 1 ? `scale(${zoom})` : undefined,
            transformOrigin: 'center center',
            touchAction: isFullscreen ? 'none' : 'auto',
          }}
          crossOrigin="anonymous"
          playsInline
          onTouchStart={handleVideoTouchStart}
          onTouchMove={handleVideoTouchMove}
          onTouchEnd={handleVideoTouchEnd}
        />

        {isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {showControls && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 pointer-events-auto bg-gradient-to-t from-black/80 via-black/50 to-transparent">
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

              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={handlePlayPause}
                    className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 active:bg-white/30 transition-all touch-manipulation"
                    title={isPlaying ? 'Pause' : 'Play'}
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

                  <div className="text-white text-xs sm:text-sm font-mono whitespace-nowrap">
                    <span className="hidden sm:inline">{formatTime(currentTime)} / {formatTime(duration)}</span>
                    <span className="sm:hidden">{formatTime(currentTime)}</span>
                  </div>

                  {type === 'series' && videos.length > 1 && (
                    <div className="flex items-center gap-2 sm:gap-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-2 sm:px-4 py-1.5 sm:py-2">
                      <button
                        onClick={() => handleVideoChange(currentVideoIndex - 1)}
                        disabled={currentVideoIndex === 0}
                        className={`w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center text-white hover:bg-white/20 active:bg-white/30 rounded transition-all touch-manipulation ${
                          currentVideoIndex === 0 ? 'opacity-50 cursor-not-allowed' : ''
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
                        disabled={currentVideoIndex === videos.length - 1}
                        className={`w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center text-white hover:bg-white/20 active:bg-white/30 rounded transition-all touch-manipulation ${
                          currentVideoIndex === videos.length - 1 ? 'opacity-50 cursor-not-allowed' : ''
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

                <div className="flex items-center gap-2 sm:gap-3">
                  {!isHost && (
                    <div className="hidden sm:block text-xs text-white/70 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 whitespace-nowrap">
                      <span className="hidden md:inline">Watching with {hostName}</span>
                      <span className="md:hidden">With {hostName}</span>
                    </div>
                  )}

                  {isFullscreen && (
                    <div className="flex items-center gap-1 sm:gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-2 py-1">
                      <button
                        onClick={() => changeZoom(-0.25)}
                        className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/20 active:bg-white/30 text-white text-xs font-semibold touch-manipulation"
                        title="Zoom out"
                      >
                        -
                      </button>
                      <span className="text-[10px] sm:text-xs text-white min-w-[32px] text-center">
                        {Math.round(zoom * 100)}%
                      </span>
                      <button
                        onClick={() => changeZoom(0.25)}
                        className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/20 active:bg-white/30 text-white text-xs font-semibold touch-manipulation"
                        title="Zoom in"
                      >
                        +
                      </button>
                    </div>
                  )}

                  <button
                    onClick={handleToggleFullscreen}
                    className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 active:bg-white/30 transition-all touch-manipulation"
                    title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  >
                    {isFullscreen ? (
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L5 5m0 0h4M5 5v4m10 6l4 4m0 0h-4m4 0v-4M9 15l-4 4m0 0h4m-4 0v-4m10-6l4-4m0 0h-4m4 0v4" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3H5a2 2 0 00-2 2v3m0 8v3a2 2 0 002 2h3m8-18h3a2 2 0 012 2v3m0 8v3a2 2 0 01-2 2h-3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <SessionInfo
        sessionId={sessionId}
        hostName={hostName}
        type={type}
        sessionLink={`${window.location.origin}/watch/${sessionId}`}
        isHost={isHost}
      />
      <ParticipantsList ws={ws} currentUserId={userId} />
      <Chat ws={ws} currentUserId={userId} currentUserName={userName} />
    </div>
  );
}

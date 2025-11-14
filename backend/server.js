import express from 'express';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { AccessToken } from 'livekit-server-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_ENABLED = process.env.ENABLE_LIVEKIT !== '0' &&
  Boolean(LIVEKIT_URL) &&
  Boolean(LIVEKIT_API_KEY) &&
  Boolean(LIVEKIT_API_SECRET);

// Enable CORS for frontend
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : ['http://localhost:3000', 'http://in01.aashutosh.space:3000'];

console.log('CORS allowed origins:', allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check exact match first
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
      return;
    }
    
    // Normalize and check hostname match (for cases where scheme/port differ)
    try {
      const originUrl = new URL(origin);
      const originHostname = originUrl.hostname;
      
      const hostnameMatch = allowedOrigins.some(allowed => {
        try {
          const allowedUrl = new URL(allowed);
          return allowedUrl.hostname === originHostname;
        } catch {
          return allowed === origin;
        }
      });
      
      if (hostnameMatch) {
        callback(null, true);
        return;
      }
    } catch (e) {
      // URL parsing failed, continue to exact match check
    }
    
    console.error('CORS: Origin not allowed:', origin, 'Allowed:', allowedOrigins);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = join(__dirname, 'uploads');
const allowedVideoExtensions = new Set(['.mp4', '.mkv', '.mov', '.webm', '.avi', '.m4v', '.ts']);
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

const libraryFilePath = join(uploadsDir, 'library.json');
const videosLibrary = new Map();
const librarySubscribers = new Set();

// Persist sessions so they survive restarts (participants/WS are not persisted)
const sessionsFilePath = join(uploadsDir, 'sessions.json');

function persistLibrary() {
  try {
    const data = JSON.stringify(Array.from(videosLibrary.values()), null, 2);
    writeFileSync(libraryFilePath, data);
    broadcastLibraryUpdate();
  } catch (error) {
    console.error('Failed to persist video library:', error);
  }
}

function persistSessions() {
  try {
    const toPersist = Array.from(sessions.values()).map((s) => ({
      id: s.id,
      hostId: s.hostId,
      hostName: s.hostName,
      type: s.type,
      videos: s.videos,
      currentVideoIndex: s.currentVideoIndex,
      currentTime: s.currentTime,
      isPlaying: s.isPlaying,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity
    }));
    writeFileSync(sessionsFilePath, JSON.stringify(toPersist, null, 2));
  } catch (error) {
    console.error('Failed to persist sessions:', error);
  }
}

function loadSessions() {
  if (!existsSync(sessionsFilePath)) {
    persistSessions();
    return;
  }
  try {
    const fileContents = readFileSync(sessionsFilePath, 'utf-8');
    const parsed = JSON.parse(fileContents);
    if (Array.isArray(parsed)) {
      parsed.forEach((s) => {
        if (!s || !s.id) return;
        sessions.set(s.id, {
          id: s.id,
          hostId: s.hostId,
          hostName: s.hostName,
          type: s.type,
          videos: Array.isArray(s.videos) ? s.videos : [],
          currentVideoIndex: Number.isFinite(s.currentVideoIndex) ? s.currentVideoIndex : 0,
          currentTime: Number.isFinite(s.currentTime) ? s.currentTime : 0,
          isPlaying: Boolean(s.isPlaying),
          participants: new Map(),
          createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
          lastActivity: s.lastActivity ? new Date(s.lastActivity) : new Date()
        });
      });
    }
  } catch (error) {
    console.error('Failed to load sessions. Starting with an empty set.', error);
    sessions.clear();
    persistSessions();
  }
}

function loadLibrary() {
  if (!existsSync(libraryFilePath)) {
    persistLibrary();
    return;
  }

  try {
    const fileContents = readFileSync(libraryFilePath, 'utf-8');
    const parsed = JSON.parse(fileContents);

    if (Array.isArray(parsed)) {
      parsed.forEach((video) => {
        if (video && video.id) {
          videosLibrary.set(video.id, video);
        }
      });
    }
  } catch (error) {
    console.error('Failed to load video library. Starting with an empty library.', error);
    videosLibrary.clear();
    persistLibrary();
  }
}

function syncLibraryWithDisk() {
  try {
    const existingFilenames = new Set(Array.from(videosLibrary.values()).map((v) => v.filename));
    const dirEntries = readdirSync(uploadsDir, { withFileTypes: true });

    dirEntries.forEach((entry) => {
      if (!entry.isFile()) return;
      if (entry.name === 'library.json') return;
      const fileExtension = extname(entry.name).toLowerCase();
      if (!allowedVideoExtensions.has(fileExtension)) return;
      if (existingFilenames.has(entry.name)) return;

      const absolutePath = join(uploadsDir, entry.name);
      let uploadedAtIso = new Date().toISOString();
      try {
        const stats = statSync(absolutePath);
        uploadedAtIso = stats.mtime.toISOString();
      } catch {
        // if stat fails, keep default timestamp
      }

      const video = {
        id: uuidv4(),
        filename: entry.name,
        originalName: entry.name,
        path: `/uploads/${entry.name}`,
        uploadedAt: uploadedAtIso
      };
      videosLibrary.set(video.id, video);
    });

    persistLibrary();
  } catch (error) {
    console.error('Failed to sync library with disk:', error);
  }
}

function broadcastLibraryUpdate() {
  if (librarySubscribers.size === 0) {
    return;
  }

  const payload = JSON.stringify({
    type: 'libraryUpdate',
    videos: Array.from(videosLibrary.values()).sort((a, b) => {
      if (a.uploadedAt && b.uploadedAt) {
        return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      }
      return 0;
    })
  });

  librarySubscribers.forEach((subscriber) => {
    if (subscriber.readyState === 1) {
      try {
        subscriber.send(payload);
      } catch (error) {
        console.error('Failed to send library update:', error);
      }
    }
  });
}

function endSession(sessionId, options = {}) {
  const session = sessions.get(sessionId);
  if (!session) return false;

  const { reason = 'Session ended by host' } = options;

  session.participants.forEach((participant, participantId) => {
    if (participant?.ws?.readyState === 1) {
      try {
        participant.ws.send(JSON.stringify({
          type: 'sessionEnded',
          reason
        }));
      } catch (error) {
        console.error('Failed to notify participant about session end:', error);
      }
      try {
        participant.ws.close();
      } catch (error) {
        console.error('Failed to close participant WebSocket after session end:', error);
      }
    }
    userSessions.delete(participantId);
  });

  userSessions.forEach((value, key) => {
    if (value === sessionId) {
      userSessions.delete(key);
    }
  });

  sessions.delete(sessionId);
  persistSessions();
  return true;
}

// In-memory session storage (in production, use Redis or database)
const sessions = new Map();
const userSessions = new Map(); // userId -> sessionId

loadLibrary();
syncLibraryWithDisk();
loadSessions();

// LiveKit token endpoint (must be after sessions is declared and loaded)
app.post('/api/livekit/token', (req, res) => {
  if (!LIVEKIT_ENABLED) {
    return res.status(404).json({ error: 'LiveKit is disabled' });
  }

  const { sessionId, userId, userName, role } = req.body || {};
  if (!sessionId || !userId) {
    return res.status(400).json({ error: 'sessionId and userId are required' });
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    const grant = {
      roomJoin: true,
      room: sessionId,
      canSubscribe: true,
      canPublish: role === 'host',
      canPublishData: true,
    };

    const accessToken = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: userId,
      name: userName || 'Viewer',
      ttl: 60 * 60,
    });

    accessToken.addGrant(grant);

    res.json({
      token: accessToken.toJwt(),
      url: LIVEKIT_URL,
      enabled: true,
    });
  } catch (error) {
    console.error('Failed to create LiveKit token', error);
    res.status(500).json({ error: 'Failed to create LiveKit token' });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const MAX_UPLOAD_SIZE_BYTES = Number.parseInt(process.env.MAX_UPLOAD_SIZE_BYTES || '', 10)
  || 10 * 1024 * 1024 * 1024; // default 10GB

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES
  }
});

// Session structure:
// {
//   id: string,
//   hostId: string,
//   hostName: string,
//   type: 'movie' | 'series',
//   videos: Array<{ id: string, filename: string, originalName: string, path: string }>,
//   currentVideoIndex: number,
//   currentTime: number,
//   isPlaying: boolean,
//   participants: Map<userId, { name: string, ws: WebSocket }>,
//   createdAt: Date
// }

// Create a new session
app.post('/api/sessions', (req, res) => {
  const { hostName, type } = req.body;
  
  if (!hostName || !type || !['movie', 'series'].includes(type)) {
    return res.status(400).json({ error: 'Invalid request. hostName and type (movie/series) required.' });
  }

  const sessionId = uuidv4();
  const hostId = uuidv4();

  const session = {
    id: sessionId,
    hostId,
    hostName,
    type,
    videos: [],
    currentVideoIndex: 0,
    currentTime: 0,
    isPlaying: false,
    participants: new Map(),
    createdAt: new Date(),
    lastActivity: new Date()
  };

  sessions.set(sessionId, session);
  userSessions.set(hostId, sessionId);
  persistSessions();

  res.json({
    sessionId,
    hostId,
    sessionLink: `${req.protocol}://${req.get('host')}/watch/${sessionId}`
  });
});

// Upload video(s) to a session
app.post('/api/sessions/:sessionId/upload', upload.array('videos', 50), (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const rawPositions = req.body.position;
  const positions = Array.isArray(rawPositions)
    ? rawPositions
    : rawPositions !== undefined
      ? [rawPositions]
      : [];

  const existingCount = session.videos.length;

  const uploadedVideosWithOrder = req.files.map((file, index) => {
    const parsedOrder = positions[index] !== undefined ? parseInt(positions[index], 10) : Number.NaN;
    const order = Number.isFinite(parsedOrder) ? parsedOrder : existingCount + index;

    const video = {
      id: uuidv4(),
      filename: file.filename,
      originalName: file.originalname,
      path: `/uploads/${file.filename}`,
      uploadedAt: new Date().toISOString()
    };

    videosLibrary.set(video.id, video);

    return {
      order,
      video
    };
  });

  uploadedVideosWithOrder.sort((a, b) => a.order - b.order);

  const uploadedVideos = uploadedVideosWithOrder.map(({ video }) => video);

  session.videos.push(...uploadedVideos);
  persistLibrary();
  const s = sessions.get(sessionId);
  if (s) {
    s.lastActivity = new Date();
    persistSessions();
  }

  // Broadcast updated playlist to all participants in this session
  try {
    broadcastToSession(sessionId, null, {
      type: 'videosUpdate',
      videos: session.videos,
      totalVideos: session.videos.length
    });
  } catch (error) {
    console.error('Failed to broadcast videosUpdate after upload:', error);
  }

  res.json({
    success: true,
    videos: uploadedVideos,
    totalVideos: session.videos.length
  });
});

// Upload video(s) to global library (no session required)
app.post('/api/upload', upload.array('videos', 50), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const uploadedVideos = req.files.map((file) => {
    const video = {
      id: uuidv4(),
      filename: file.filename,
      originalName: file.originalname,
      path: `/uploads/${file.filename}`,
      uploadedAt: new Date().toISOString()
    };
    videosLibrary.set(video.id, video);
    return video;
  });

  persistLibrary();

  res.json({
    success: true,
    videos: uploadedVideos,
    totalLibraryVideos: videosLibrary.size
  });
});

app.get('/api/videos', (req, res) => {
  const videos = Array.from(videosLibrary.values()).sort((a, b) => {
    if (a.uploadedAt && b.uploadedAt) {
      return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
    }
    return 0;
  });

  res.json({
    videos
  });
});

app.get('/api/uploads/files', (req, res) => {
  try {
    syncLibraryWithDisk();
    const dirEntries = readdirSync(uploadsDir, { withFileTypes: true });
    let libraryUpdated = false;

    const files = dirEntries
      .filter((entry) => entry.isFile())
      .filter((entry) => {
        if (entry.name === 'library.json' || entry.name === 'sessions.json') return false;
        const extension = extname(entry.name).toLowerCase();
        return allowedVideoExtensions.has(extension);
      })
      .map((entry) => {
        const absolutePath = join(uploadsDir, entry.name);
        let stats = null;
        try {
          stats = statSync(absolutePath);
        } catch (error) {
          console.error('Failed to read stats for file:', absolutePath, error);
        }

        let video = Array.from(videosLibrary.values()).find((v) => v.filename === entry.name);
        if (!video) {
          video = {
            id: uuidv4(),
            filename: entry.name,
            originalName: entry.name,
            path: `/uploads/${entry.name}`,
            uploadedAt: stats?.mtime ? stats.mtime.toISOString() : new Date().toISOString()
          };
          videosLibrary.set(video.id, video);
          libraryUpdated = true;
        }

        return {
          videoId: video.id,
          filename: video.filename,
          originalName: video.originalName,
          path: video.path,
          uploadedAt: video.uploadedAt,
          size: stats?.size ?? null
        };
      })
      .sort((a, b) => {
        if (a.uploadedAt && b.uploadedAt) {
          return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
        }
        return 0;
      });

    if (libraryUpdated) {
      persistLibrary();
    }

    res.json({ files });
  } catch (error) {
    console.error('Failed to list uploaded files:', error);
    res.status(500).json({ error: 'Failed to list uploaded files' });
  }
});

app.delete('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const ended = endSession(sessionId);
  if (!ended) {
    return res.status(500).json({ error: 'Failed to end session' });
  }

  res.json({ success: true });
});

app.post('/api/sessions/:sessionId/library', (req, res) => {
  const { sessionId } = req.params;
  const { videoIds } = req.body || {};

  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    return res.status(400).json({ error: 'videoIds array is required' });
  }

  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const videosToAdd = videoIds
    .map((id) => videosLibrary.get(id))
    .filter((video) => Boolean(video));

  if (videosToAdd.length === 0) {
    return res.status(404).json({ error: 'No matching videos found' });
  }

  session.videos.push(...videosToAdd);
  const s = sessions.get(sessionId);
  if (s) {
    s.lastActivity = new Date();
    persistSessions();
  }

  // Broadcast updated playlist to all participants in this session
  try {
    broadcastToSession(sessionId, null, {
      type: 'videosUpdate',
      videos: session.videos,
      totalVideos: session.videos.length
    });
  } catch (error) {
    console.error('Failed to broadcast videosUpdate after adding from library:', error);
  }

  res.json({
    success: true,
    added: videosToAdd,
    totalVideos: session.videos.length
  });
});

// Get session info
app.get('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    id: session.id,
    hostName: session.hostName,
    type: session.type,
    videos: session.videos,
    currentVideoIndex: session.currentVideoIndex,
    participantCount: session.participants.size
  });
});

// Serve uploaded videos with correct content types and range support
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res, path) => {
    const lower = path.toLowerCase();
    if (lower.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }
}));

// WebSocket server for real-time sync
const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  let userId = null;
  let sessionId = null;
  let userName = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'librarySubscribe': {
          librarySubscribers.add(ws);
          ws.send(JSON.stringify({
            type: 'libraryUpdate',
            videos: Array.from(videosLibrary.values()).sort((a, b) => {
              if (a.uploadedAt && b.uploadedAt) {
                return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
              }
              return 0;
            })
          }));
          break;
        }

        case 'libraryUnsubscribe': {
          librarySubscribers.delete(ws);
          break;
        }

        case 'join':
          userId = message.userId;
          sessionId = message.sessionId;
          userName = message.userName;
          
          const session = sessions.get(sessionId);
          if (!session) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
            ws.close();
            return;
          }

          session.participants.set(userId, { name: userName, ws });
          userSessions.set(userId, sessionId);

          // Send current session state to the new participant
          const participantsList = Array.from(session.participants.entries()).map(([id, p]) => ({
            userId: id,
            userName: p.name
          }));

          ws.send(JSON.stringify({
            type: 'sync',
            currentVideoIndex: session.currentVideoIndex,
            currentTime: session.currentTime,
            isPlaying: session.isPlaying,
            videos: session.videos,
            participants: participantsList
          }));

          // Notify other participants
          broadcastToSession(sessionId, userId, {
            type: 'userJoined',
            userId,
            userName,
            participantCount: session.participants.size
          });

          // Send updated participants list to all
          const updatedParticipantsList = Array.from(session.participants.entries()).map(([id, p]) => ({
            userId: id,
            userName: p.name
          }));
          broadcastToSession(sessionId, null, {
            type: 'participantsUpdate',
            participants: updatedParticipantsList
          });
          break;

        case 'play':
          handlePlayback(sessionId, userId, true, message.currentTime);
          break;

        case 'pause':
          handlePlayback(sessionId, userId, false, message.currentTime);
          break;

        case 'seek':
          handleSeek(sessionId, userId, message.time);
          break;

        case 'changeVideo':
          handleVideoChange(sessionId, userId, message.videoIndex);
          break;

        case 'chat':
          handleChatMessage(sessionId, userId, message.text);
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    librarySubscribers.delete(ws);
    if (sessionId && userId) {
      const session = sessions.get(sessionId);
      if (session) {
        session.participants.delete(userId);
        userSessions.delete(userId);
        session.lastActivity = new Date();

        // Notify other participants
        broadcastToSession(sessionId, userId, {
          type: 'userLeft',
          userId,
          userName: session.participants.get(userId)?.name || 'Unknown',
          participantCount: session.participants.size
        });

        // Send updated participants list to all
        const updatedParticipantsList = Array.from(session.participants.entries())
          .filter(([id]) => id !== userId)
          .map(([id, p]) => ({
            userId: id,
            userName: p.name
          }));
        broadcastToSession(sessionId, null, {
          type: 'participantsUpdate',
          participants: updatedParticipantsList
        });
        persistSessions();
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function broadcastToSession(sessionId, excludeUserId, message) {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.participants.forEach((participant, userId) => {
    if (userId !== excludeUserId && participant.ws.readyState === 1) {
      participant.ws.send(JSON.stringify(message));
    }
  });
}

function handlePlayback(sessionId, userId, isPlaying, currentTime) {
  const session = sessions.get(sessionId);
  if (!session) return;

  // Only host can control playback (for now - can be changed)
  if (session.hostId !== userId) {
    const userWs = session.participants.get(userId)?.ws;
    if (userWs && userWs.readyState === 1) {
      userWs.send(JSON.stringify({
        type: 'error',
        message: 'Only the host can control playback'
      }));
    }
    return;
  }

  session.isPlaying = isPlaying;
  if (currentTime !== undefined) {
    session.currentTime = currentTime;
  }
  session.lastActivity = new Date();
  persistSessions();
  
  broadcastToSession(sessionId, userId, {
    type: isPlaying ? 'play' : 'pause',
    timestamp: Date.now(),
    currentTime: session.currentTime
  });
}

function handleSeek(sessionId, userId, time) {
  const session = sessions.get(sessionId);
  if (!session) return;

  // Only host can control seeking
  if (session.hostId !== userId) {
    // But allow periodic sync updates from host
    if (time !== undefined) {
      session.currentTime = time;
    }
    return;
  }

  session.currentTime = time;
  session.lastActivity = new Date();
  persistSessions();
  broadcastToSession(sessionId, userId, {
    type: 'seek',
    time,
    timestamp: Date.now()
  });
}

function handleVideoChange(sessionId, userId, videoIndex) {
  const session = sessions.get(sessionId);
  if (!session) return;

  // Only host can change videos
  if (session.hostId !== userId) {
    const userWs = session.participants.get(userId)?.ws;
    if (userWs && userWs.readyState === 1) {
      userWs.send(JSON.stringify({
        type: 'error',
        message: 'Only the host can change videos'
      }));
    }
    return;
  }

  if (videoIndex >= 0 && videoIndex < session.videos.length) {
    session.currentVideoIndex = videoIndex;
    session.currentTime = 0;
    session.isPlaying = false;
    session.lastActivity = new Date();
    persistSessions();

    broadcastToSession(sessionId, userId, {
      type: 'videoChange',
      videoIndex,
      timestamp: Date.now()
    });
  }
}

function handleChatMessage(sessionId, userId, text) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const participant = session.participants.get(userId);
  if (!participant) return;

  const chatMessage = {
    type: 'chat',
    userId,
    userName: participant.name,
    text,
    timestamp: Date.now()
  };

  // Broadcast to all participants including sender
  session.participants.forEach((p) => {
    if (p.ws.readyState === 1) {
      p.ws.send(JSON.stringify(chatMessage));
    }
  });
  session.lastActivity = new Date();
  persistSessions();
}

// Periodic cleanup: remove sessions older than 24h with no participants
setInterval(() => {
  const now = Date.now();
  const ttlMs = 24 * 60 * 60 * 1000;
  let removed = 0;
  sessions.forEach((s, id) => {
    const last = s.lastActivity ? new Date(s.lastActivity).getTime() : new Date(s.createdAt).getTime();
    if (s.participants.size === 0 && now - last > ttlMs) {
      sessions.delete(id);
      removed += 1;
    }
  });
  if (removed > 0) {
    persistSessions();
  }
}, 30 * 60 * 1000);


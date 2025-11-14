## Rudhra

Rudhra is a collaborative movie and series streaming app that empowers users to upload and watch content together in real time. Designed for creators, fans, and communities, Rudhra transforms passive viewing into a shared experience.

## Features

- 🎬 **Movie & Series Support**: Upload single movies or multiple episodes
- 👥 **Real-Time Sync**: Watch together with synchronized playback
- 🎮 **Shared Controls**: Host controls playback for all participants
- 🔗 **Easy Sharing**: Generate and share session links instantly
- 🎨 **Netflix-Inspired UI**: Clean, minimal, professional design

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, WebSocket (ws)
- **Storage**: Local file system (uploads directory)

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file (optional, defaults are provided):
   ```bash
   cp .env.example .env
   ```
   Edit `.env` if needed:
   ```
   PORT=3001
   FRONTEND_URL=http://localhost:3000
   ```

4. Start the backend server:
   ```bash
   npm run dev
   ```
   The server will run on `http://localhost:3001`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file (optional):
   ```
   NEXT_PUBLIC_API_URL=http://localhost:3001
   NEXT_PUBLIC_WS_URL=ws://localhost:3001
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`

## Usage

1. **Start the Application**:
   - Make sure both backend and frontend servers are running
   - Open `http://localhost:3000` in your browser

2. **Create a Session**:
   - Enter your name
   - Choose "Movie" or "Series"
   - Upload your video file(s)
   - Copy the session link to share with friends

3. **Join a Session**:
   - Open the session link in your browser
   - Enter your name (if not already stored)
   - Watch together in real-time!

## Project Structure

```
rudhra/
├── backend/
│   ├── server.js          # Express server with WebSocket
│   ├── uploads/           # Video storage (created automatically)
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── components/    # React components
│   │   ├── watch/         # Watch page route
│   │   ├── page.tsx       # Home page
│   │   └── layout.tsx
│   └── package.json
└── README.md
```

## Development Notes

- Videos are stored locally in `backend/uploads/`
- Sessions are stored in-memory (will reset on server restart)
- For production, consider using:
  - Redis or database for session persistence
  - Cloud storage (S3, etc.) for video files
  - Authentication and authorization
  - Rate limiting and security measures

## License

See LICENSE file for details.

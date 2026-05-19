# Choco-Tube-Plus

A YouTube frontend client that lets you browse and watch YouTube content without ads, using multiple API backends for resilience.

## Architecture

### Frontend (`app/`)
- React 19 + TypeScript + Vite
- React Router 7 for routing
- Runs on port 5000 (dev server)
- All API calls go through `/api/...` which proxies to the backend

### Backend (`server/`)
- Node.js with Express
- Runs on port 3001
- Handles all external API calls (YouTube, Invidious, stream providers)
- Keeps API keys server-side (not exposed to frontend)

## Workflows

- **Backend API**: `cd server && node server.js` (port 3001)
- **Start application**: `cd app && npm run dev` (port 5000)

## Deployment

- Production publishing uses autoscale.
- Build command: `cd app && npm run build`
- Run command: `cd server && node server.js`
- The server serves `app/dist` and all `/api` routes from the same published app so the frontend works with its API in production.

## Channel Home Tab (youtubei.js)

- Channel pages now have a **「ホーム」** (Home) tab as the default tab
- Uses `youtubei.js` (InnerTube API) to fetch the official channel home page
- Displays: featured video (注目動画), video shelves, channel shelves, and playlist shelves in horizontally scrollable rows
- Backend route: `server/routes/channelhome.js` — endpoint `GET /api/channels/:channelId/home`
- Innertube instance is cached for 30 minutes

## API Endpoints

### YouTube API (`/api/youtube/`)
- `GET /search?q=...&type=video|channel&proxy=...`
- `GET /video/:videoId`
- `GET /channel/:channelId`
- `GET /channel/:channelId/videos`
- `GET /watch/:videoId`

### Invidious API (`/api/invidious/`)
- `GET /search?q=...&page=...`
- `GET /video/:videoId`
- `GET /channel/:channelId`
- `GET /channel/:channelId/videos`
- `GET /related/:videoId`
- `GET /trending?region=...`
- `GET /channels/:channelId/comments` mirrors Inv-tube's channel community/comments endpoint for the channel community tab.
- Channel pages now accept both `/channel/:id` and Inv-tube-style `/channel?id=...`; search channel cards use the new Inv-tube-style channel metadata shape while keeping compatibility with older normalized fields.

### Trend (`/api/trend/`)
- `GET /?region=JP|US|...&category=all|music|game`
- Japan keeps the original GitHub JSON-backed trend sources. Other regions use the Inv-tube compatible Invidious API list with category tabs for overall, music, gaming, news, and movies.

### Search (`/api/search/`)
- `GET /?q=...&page=...&sort_by=...&date=...&duration=...&type=...&features=...&region=...`
- Search now follows the Inv-tube-compatible API proxy method using the kuro-bana Invidious API list instead of the previous YouTube/Invidious priority switch.
- `GET /suggestions?q=...` mirrors Inv-tube's main API suggestion proxy, tries the reference `/api/search/suggestions` path first, falls back to Invidious v1 and YouTube suggestion data, and caches normalized suggestions briefly for faster header autocomplete.

### Inv-tube Compatible Watch Data (`/api/`)
- `GET /videos/:videoId` proxies the same kuro-bana main API path used by Inv-tube for video metadata and recommended videos.
- `GET /comments/:videoId?sort_by=top|new&continuation=...` proxies the same Inv-tube comments path for comment lists, counts, sort switching, and pagination.
- `GET /captions/:videoId` returns available caption tracks `{ captions: [{label, languageCode, url}], source_instance }` via kuro-bana main API.
- `GET /transcripts/:videoId?lang=:lang&label=:label` fetches the VTT from the source Invidious instance and returns parsed transcript lines `[{text, start, duration}]`.
- `GET /playlists/:playlistId?page=...` proxies Invidious playlist data (title, description, videos, videoCount, etc).
- `GET /mixes/:mixId` proxies Invidious mix data (title, videos list).

### Stream (`/api/stream/`)
- `GET /ytdlp/:videoId?mode=sequential|parallel|specific&source=...`
- `GET /ytdlp-all/:videoId` (SSE: streams results from all sources as they arrive)
- `GET /invidious/:videoId`
- `GET /choco/:videoId`
- `GET /ktube/:videoId`
- `GET /hdad/:videoId` (HD+AD separated streams)
- `GET /cors-proxies`

## Stream Sources
- Xerox API (multiple instances)
- Yuzu API
- Siawase API
- Wista API (multiple instances)
- Min2-tube API (multiple instances)
- Katuo API
- Choco Invidious API
- K-tube API
- Invidious instances (direct)

### Rapid API (`/api/stream/rapid/`)
- `GET /:videoId` - Fetches streams from choco-rapid-api (with fallback)

### Thumbnail (`/api/thumbnail/`)
- `GET /base64/:videoId` - Fetches base64 thumbnail via Siawase API
- `GET /proxy?url=...` - Proxies external thumbnail images (for CORS-free download)
- `GET /base64-url?url=...` - Fetches allowed YouTube/Google image URLs and returns `{ thumbnail, contentType }` for client-side data URI rendering

### EDU Params (`/api/edu/`)
- `GET /params/:key` - Fetches YouTube Education embed params from GitHub (cached 5min)

## Pages

- `/` - Home / trending
- `/search?q=...` - Search results
- `/trend` - Trending videos
- `/watch/:videoId` - Watch page with optional `?list=...&index=...` for playlist panel in sidebar
- `/channel/:channelId` - Channel page with tabs (videos, shorts, streams, playlists, community)
- `/playlist?list=...` - Playlist detail page with paginated video list
- `/mix?id=...` - Mix detail page with video list
- `/settings` - Settings page with top tabs; search settings persist default filters for sort, upload date, duration, type, features, and region, and display settings control image rendering mode (`wsrv.nl`, server proxy, or base64)

## Key Files
- `server/config.js` - All API keys and instance lists
- `server/routes/stream.js` - Complex stream fetching logic
- `server/routes/rapid.js` - Rapid API stream fetching
- `server/routes/thumbnail.js` - Thumbnail proxy and base64 fetch
- `server/routes/edu.js` - EDU parameter fetching with caching
- `server/routes/invtube.js` - Inv-tube compatible proxy routes (videos, comments, captions, channels, playlists, mixes)
- `app/src/api/` - Frontend API wrappers (thin, call `/api/...`)
- `app/vite.config.ts` - Vite config with proxy to backend
- `app/src/pages/Watch.tsx` - All external fetch calls replaced with `/api/...`; supports playlist panel sidebar
- `app/src/lib/searchSettings.ts` - Shared search filter options and localStorage persistence for default search settings
- `app/src/lib/imagePreferences.ts` - Shared image rendering preference helpers and URL transformation utilities
- `app/src/components/SmartImage.tsx` - Shared image component that applies the selected image display method to thumbnails, channel icons, avatars, and playlist images
- Playlist and mix side panels now show channel icons beside each author using the same approach as inv-tube: when playlist/mix video items lack `authorThumbnails`, unique `authorId` values are resolved through channel metadata and applied back to the list.
- Playlist detail and mix detail pages also resolve missing per-video channel icons through unique `authorId` channel metadata and render icons beside each author name.
- Search/home video grids use explicit responsive columns capped at four desktop columns so loaded video cards cannot expand to five columns.
- Channel page grid CSS is scoped to `.channel-page` so it cannot override search/home `.video-grid` columns after navigation.
- Channel page video grids also use explicit responsive columns capped at four desktop columns.
- Channel info now fills missing banner/channel images from Invidious channel data before falling back to the no-image hero layout.
- `app/src/pages/Playlist.tsx` - Playlist detail page
- `app/src/pages/Mix.tsx` - Mix detail page

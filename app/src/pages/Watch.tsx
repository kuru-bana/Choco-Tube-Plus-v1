import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import type { Stream, StreamResult } from '../types'
import { fetchYtdlpStreams, fetchYtdlpAllSources, YTDLP_ALL_SOURCES, fetchHdadStreams, fetchKtubeStream } from '../api/stream'
import { fetchWatchMetadata, fetchWatchComments } from '../api/youtube'
import type { WatchMetadata, RelatedVideo, WatchComment } from '../api/youtube'
import { addHistory, isFavorite, toggleFavorite, isSubscribed as libIsSubscribed, toggleSubscription as libToggleSub, getPlaylists, addVideoToPlaylist, removeVideoFromPlaylist, createPlaylist, isVideoInPlaylist } from '../lib/library'
import type { LocalPlaylist } from '../lib/library'
import SmartImage from '../components/SmartImage'
import { buildVideoThumbnailUrl, transformImageUrl } from '../lib/imagePreferences'
import './Watch.css'

const parseTimeSec = (s: string): number => {
  const t = s.trim()
  if (!t) return -1
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t)
  const parts = t.split(':').map(p => parseInt(p, 10))
  if (parts.some(isNaN) || parts.length < 2 || parts.length > 3) return -1
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

const STREAM_TYPE_KEY  = 'preferred_stream_type'
const YTDLP_FILTER_KEY = 'preferred_ytdlp_filter'
const INV_FILTER_KEY   = 'preferred_inv_filter'
const RAPID_FILTER_KEY = 'preferred_rapid_filter'
const EDU_PARAM_KEY    = 'preferred_edu_param'
const LOOP_KEY              = 'video_loop'
const AUTOPLAY_KEY          = 'video_autoplay'
const RESUME_KEY            = 'video_resume_pos'
const AUTO_NEXT_KEY         = 'video_auto_next'
const SPEED_KEY             = 'video_speed'
const YTDLP_FETCH_MODE_KEY       = 'ytdlp_fetch_mode'
const YTDLP_SPECIFIC_API_KEY      = 'ytdlp_specific_api'
const YTDLP_TIMEOUT_KEY           = 'ytdlp_timeout_sec'
const YTDLP_SEQUENTIAL_ORDER_KEY  = 'ytdlp_sequential_order'
const YTDLP_DEFAULT_ORDER         = ['xerox', 'yuzu', 'siawase', 'wista', 'min2tube', 'katuo']
const THUMB_FILE_KEY         = 'thumb_file'
const THUMB_HOST_KEY         = 'thumb_host'
const THUMB_SHOW_KEY         = 'thumb_show'


const THUMB_FILES = [
  'maxresdefault.jpg',
  'sddefault.jpg',
  'hqdefault.jpg',
  'mqdefault.jpg',
  'default.jpg',
]

const THUMB_HOSTS = [
  { key: 'base64',                             label: 'base64 (siawase api)'         },
  { key: 'https://image-proxy.poketube.fun/',  label: 'image-proxy.poketube.fun (proxy)' },
  { key: 'https://wsrv.nl',                    label: 'wsrv.nl (proxy)'              },
  { key: 'https://img.youtube.com',            label: 'img.youtube.com'              },
  { key: 'https://i.ytimg.com',                label: 'i.ytimg.com'                  },
  { key: 'https://i1.ytimg.com',               label: 'i1.ytimg.com'                 },
  { key: 'https://i2.ytimg.com',               label: 'i2.ytimg.com'                 },
  { key: 'https://i3.ytimg.com',               label: 'i3.ytimg.com'                 },
  { key: 'https://i4.ytimg.com',               label: 'i4.ytimg.com'                 },
  { key: 'https://i9.ytimg.com',               label: 'i9.ytimg.com'                 },
]

function buildThumbnailUrl(host: string, videoId: string, file: string): string {
  if (host === 'base64') return buildVideoThumbnailUrl(videoId, file)
  if (host === 'https://image-proxy.poketube.fun/') {
    return `https://image-proxy.poketube.fun/proxy?url=https://img.youtube.com/vi/${videoId}/${file}`
  }
  if (host === 'https://wsrv.nl') {
    return `https://wsrv.nl/?url=https://img.youtube.com/vi/${videoId}/${file}`
  }
  return `${host}/vi/${videoId}/${file}`
}


const YTDLP_SRC_MAP: Record<string, string> = {
  xerox: 'xerox API', yuzu: 'yuzu API', siawase: 'しあ API',
  wista: 'wista API', min2tube: 'min2-tube API', katuo: 'katuo API'
}

interface LogEntry { time: string; msg: string; level: string }

function getSaved(key: string, allowed: string[], def: string): string {
  try { const v = localStorage.getItem(key); return allowed.includes(v || '') ? (v as string) : def } catch { return def }
}

function calcTabState(streams: Stream[]): string | null {
  const hasHLS    = streams.some(s => s.isHLS)
  const hasNonHLS = streams.some(s => !s.isHLS)
  return !hasHLS ? 'no-hls' : !hasNonHLS ? 'hls-only' : null
}

function filterForState(state: string | null, key: string): string {
  if (state === 'hls-only') return 'hls'
  if (state === 'no-hls')   return 'mp4'
  return getSaved(key, ['mp4', 'video', 'audio', 'hls'], 'mp4')
}

function filterStreams(list: Stream[], filter: string): Stream[] {
  if (filter === 'mp4')   return list.filter(s => s.hasAudio && s.hasVideo && !s.isHLS)
  if (filter === 'video') return list.filter(s => s.hasVideo && !s.hasAudio && !s.isHLS)
  if (filter === 'audio') return list.filter(s => s.hasAudio && !s.hasVideo)
  if (filter === 'hls')   return list.filter(s => s.isHLS)
  return list
}

function dedupStreams(list: Stream[], showAll: boolean): Stream[] {
  if (showAll) return list
  const seen = new Map<string, number>(); const result: Stream[] = []
  list.forEach(s => { if (!seen.has(s.quality)) { seen.set(s.quality, 1); result.push(s) } })
  return result
}

function qNum(q: string): number {
  const m = String(q).match(/(\d+)p(?:(\d+)fps)?/i)
  return m ? parseInt(m[1]) * 1000 + (m[2] ? parseInt(m[2]) : 0) : (parseInt(q) || 0)
}

function nowTime(): string { return new Date().toTimeString().slice(0, 8) }

function formatCount(count?: number | null): string {
  if (!count || Number.isNaN(count)) return ''
  if (count >= 100000000) return `${(count / 100000000).toFixed(1)}億回`
  if (count >= 10000) return `${Math.floor(count / 10000)}万回`
  return `${count.toLocaleString()}回`
}

function formatDurationSeconds(seconds?: number): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

type Thumbnail = { url: string; width?: number; height?: number }

const relatedAvatarCache = new Map<string, Thumbnail[] | null>()

function wsrvImage(url: string, w?: number): string {
  return transformImageUrl(url, undefined, w)
}

function getAvatarUrl(thumbs?: Thumbnail[] | null, size = 56): string {
  if (!Array.isArray(thumbs) || thumbs.length === 0) return ''
  const sorted = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0))
  const best = sorted.find(t => (t.width || 0) >= 88) || sorted[0]
  return best?.url || ''
}

async function fetchRelatedAvatar(channelId: string): Promise<Thumbnail[] | null> {
  if (relatedAvatarCache.has(channelId)) return relatedAvatarCache.get(channelId) || null
  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(channelId)}`)
    if (!res.ok) throw new Error('avatar fetch failed')
    const data = await res.json() as { authorThumbnails?: Thumbnail[] }
    const thumbs = data.authorThumbnails || null
    relatedAvatarCache.set(channelId, thumbs)
    return thumbs
  } catch {
    relatedAvatarCache.set(channelId, null)
    return null
  }
}

async function fillPlaylistPanelMissingIcons(data: PlaylistPanelData): Promise<PlaylistPanelData> {
  const videos = data.videos || []
  const missingIds = [...new Set(videos
    .filter(v => v.authorId && !v.authorThumbnails?.length)
    .map(v => v.authorId as string)
  )]
  if (missingIds.length === 0) return data

  const results = await Promise.all(missingIds.map(async id => [id, await fetchRelatedAvatar(id)] as const))
  const thumbMap = new Map(results)
  return {
    ...data,
    videos: videos.map(video => {
      if (!video.authorId || video.authorThumbnails?.length) return video
      const thumbs = thumbMap.get(video.authorId)
      return thumbs ? { ...video, authorThumbnails: thumbs } : video
    }),
  }
}

function renderLinkedDescription(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /(https?:\/\/[^\s<>"]+|#[\p{L}\p{N}_-]+)/gu
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const token = match[0]
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))

    if (token.startsWith('#')) {
      const tagName = token.slice(1)
      parts.push(
        <Link key={`${match.index}-${token}`} to={`/hashtag/${encodeURIComponent(tagName)}`} className="video-desc-link video-desc-hashtag">
          {token}
        </Link>
      )
    } else {
      let cleanToken = token
      let trailing = ''
      const trailingMatch = cleanToken.match(/[),.。！？!?]+$/)
      if (trailingMatch) {
        trailing = trailingMatch[0]
        cleanToken = cleanToken.slice(0, -trailing.length)
      }
      const ytVideo = cleanToken.match(/(?:youtube\.com\/watch.*[?&]v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
      const ytChannel = cleanToken.match(/youtube\.com\/channel\/([A-Za-z0-9_-]+)/)
      const ytHandle = cleanToken.match(/youtube\.com\/(@[^/?&\s]+)/)
      if (ytVideo) {
        parts.push(
          <Link key={`${match.index}-${cleanToken}`} to={`/watch/${ytVideo[1]}`} className="video-desc-link">
            {cleanToken}
          </Link>
        )
      } else if (ytChannel) {
        parts.push(
          <Link key={`${match.index}-${cleanToken}`} to={`/channel/${ytChannel[1]}`} className="video-desc-link">
            {cleanToken}
          </Link>
        )
      } else if (ytHandle) {
        parts.push(
          <Link key={`${match.index}-${cleanToken}`} to={`/channel/${encodeURIComponent(ytHandle[1])}`} className="video-desc-link">
            {cleanToken}
          </Link>
        )
      } else {
        parts.push(
          <a key={`${match.index}-${cleanToken}`} href={cleanToken} className="video-desc-link" target="_blank" rel="noopener noreferrer">
            {cleanToken}
          </a>
        )
      }
      if (trailing) parts.push(trailing)
    }
    lastIndex = match.index + token.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function RelatedVideoItem({ video }: { video: RelatedVideo }) {
  const [fallbackThumbs, setFallbackThumbs] = useState<Thumbnail[] | null>(null)
  const [thumbLoaded, setThumbLoaded] = useState(false)
  const [iconLoaded, setIconLoaded] = useState(false)
  const thumbs = video.authorThumbnails || fallbackThumbs
  const channelIcon = getAvatarUrl(thumbs, 48)
  const channelUrl = video.authorId ? `/channel/${video.authorId}` : ''

  useEffect(() => {
    let cancelled = false
    if (!video.authorId || video.authorThumbnails?.length) return
    fetchRelatedAvatar(video.authorId).then(result => {
      if (!cancelled) setFallbackThumbs(result)
    })
    return () => { cancelled = true }
  }, [video.authorId, video.authorThumbnails])

  const goChannel = (e: React.MouseEvent) => {
    if (!channelUrl) return
    e.preventDefault()
    e.stopPropagation()
    window.location.href = channelUrl
  }

  return (
    <Link className="related-card" to={`/watch/${video.videoId}`}>
      <div className="related-thumb-wrap">
        <SmartImage
          className={`related-thumb${thumbLoaded ? ' loaded' : ''}`}
          src={buildVideoThumbnailUrl(video.videoId)}
          proxyWidth={360}
          alt={video.title}
          loading="lazy"
          onLoad={() => setThumbLoaded(true)}
        />
        {video.lengthSeconds ? <span className="related-duration">{formatDurationSeconds(video.lengthSeconds)}</span> : null}
      </div>
      <div className="related-info">
        <div className="related-title-text">{video.title}</div>
        <div className="related-channel-row">
          <span
            className="related-ch-channel-link"
            onClick={goChannel}
            style={channelUrl ? { cursor: 'pointer' } : undefined}
          >
            <span className="related-ch-icon-wrap">
              {channelIcon
                ? <SmartImage
                    className={`related-ch-icon${iconLoaded ? ' loaded' : ''}`}
                    src={channelIcon}
                    proxyWidth={88}
                    alt={video.author || ''}
                    loading="lazy"
                    onLoad={() => setIconLoaded(true)}
                  />
                : <span className="related-ch-placeholder" />
              }
            </span>
            <span className="related-channel">{video.author || ''}</span>
          </span>
        </div>
        <div className="related-views">{video.viewCountText || formatCount(video.viewCount)}{video.publishedText ? ` · ${video.publishedText}` : ''}</div>
      </div>
    </Link>
  )
}

function getQCheck(videoId: string, label: string): boolean {
  try { return sessionStorage.getItem(`qcheck_${videoId}_${label}`) === '1' } catch { return false }
}
function setQCheck(videoId: string, label: string, v: boolean): void {
  try {
    if (v) sessionStorage.setItem(`qcheck_${videoId}_${label}`, '1')
    else sessionStorage.removeItem(`qcheck_${videoId}_${label}`)
  } catch { /* ignore */ }
}

interface PlaylistPanelVideo {
  videoId: string
  title: string
  author?: string
  authorId?: string
  authorThumbnails?: Thumbnail[]
  lengthSeconds?: number
}

interface PlaylistPanelData {
  title?: string
  videos?: PlaylistPanelVideo[]
  videoCount?: number
}

// プレイリスト/ミックスのAPIレスポンスキャッシュ（キー: "listId_page"）
const playlistCache = new Map<string, PlaylistPanelData>()

function formatDurSec(seconds?: number): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function PlaylistPanelChannel({ video }: { video: PlaylistPanelVideo }) {
  const [iconLoaded, setIconLoaded] = useState(false)
  const channelIcon = getAvatarUrl(video.authorThumbnails, 36)
  const channelUrl = video.authorId ? `/channel?id=${encodeURIComponent(video.authorId)}` : ''

  const goChannel = (e: React.MouseEvent) => {
    if (!channelUrl) return
    e.preventDefault()
    e.stopPropagation()
    window.location.href = channelUrl
  }

  return (
    <div
      className="pl-panel-item-ch-row"
      onClick={goChannel}
      style={channelUrl ? { cursor: 'pointer' } : undefined}
    >
      <span className="pl-panel-ch-icon-wrap">
        {channelIcon
          ? <SmartImage
              className={`pl-panel-ch-icon${iconLoaded ? ' loaded' : ''}`}
              src={channelIcon}
              proxyWidth={60}
              alt={video.author || ''}
              loading="lazy"
              onLoad={() => setIconLoaded(true)}
            />
          : <span className="pl-panel-ch-placeholder" />
        }
      </span>
      {video.author && <span className="pl-panel-item-ch">{video.author}</span>}
    </div>
  )
}

export default function Watch() {
  const { videoId: videoIdParam } = useParams<{ videoId: string }>()
  const [searchParams] = useSearchParams()
  const videoId = videoIdParam || searchParams.get('v') || undefined
  const listId = searchParams.get('list') || ''
  const listIndex = parseInt(searchParams.get('index') || '0', 10)
  const localPlId = searchParams.get('localpl') || ''
  const localPlIndex = parseInt(searchParams.get('index') || '0', 10)
  const navigate = useNavigate()
  const [, forceUpdate] = useState(0)

  const [plData, setPlData] = useState<PlaylistPanelData | null>(null)
  const [plLoading, setPlLoading] = useState(false)
  const [plPage, setPlPage] = useState(1)

  // ローカルプレイリスト
  const localPlData = localPlId ? (getPlaylists().find(p => p.id === localPlId) ?? null) : null

  // プレイリスト次曲送り用のref（イベントハンドラ内からアクセスするため）
  const listIdRef      = useRef(listId)
  const listIndexRef   = useRef(listIndex)
  const localPlIdRef   = useRef(localPlId)
  const localPlIndexRef = useRef(localPlIndex)
  const localPlDataRef = useRef<LocalPlaylist | null>(null)
  const plDataRef      = useRef<PlaylistPanelData | null>(null)
  const plPageRef      = useRef(1)
  const videoIdRef     = useRef(videoId)
  const navigateRef    = useRef(navigate)
  listIdRef.current      = listId
  listIndexRef.current   = listIndex
  localPlIdRef.current   = localPlId
  localPlIndexRef.current = localPlIndex
  localPlDataRef.current = localPlData
  plDataRef.current      = plData
  plPageRef.current      = plPage
  videoIdRef.current     = videoId
  navigateRef.current    = navigate
  // playNextInPlaylist は後で定義するため useRef で遅延参照
  const playNextRef = useRef<() => void>(() => {})

  const [metadata, setMetadata] = useState<WatchMetadata | null>(null)
  const [relatedVideos, setRelatedVideos] = useState<RelatedVideo[]>([])
  const relatedVideosRef = useRef<RelatedVideo[]>([])
  relatedVideosRef.current = relatedVideos
  const [relatedLoading, setRelatedLoading] = useState(true)
  const [comments, setComments] = useState<WatchComment[]>([])
  const [commentCount, setCommentCount] = useState<number | null>(null)
  const [commentSort, setCommentSort] = useState<'top' | 'new'>('top')
  const [commentContinuation, setCommentContinuation] = useState<string | null>(null)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsAppending, setCommentsAppending] = useState(false)
  const [commentsError, setCommentsError] = useState('')

  const [streamMode, setStreamMode] = useState(() =>
    getSaved(STREAM_TYPE_KEY, ['ytdlp', 'invidious', 'rapid', 'nocookie', 'edu', 'hdad'], 'ytdlp')
  )

  const [ytdlpStreams, setYtdlpStreams]   = useState<Stream[] | null>(null)
  const [ytdlpFilter, setYtdlpFilter]     = useState('mp4')
  const [ytdlpTabState, setYtdlpTabState] = useState<string | null>(null)
  const [ytdlpSource, setYtdlpSource]     = useState<string | null>(null)
  const [ytdlpExcluded, setYtdlpExcluded]= useState<string[]>([])
  const [ytdlpShowAll, setYtdlpShowAll]   = useState(false)
  const [ytdlpPlaying, setYtdlpPlaying]   = useState<Stream | null>(null)
  const [ytdlpLoading, setYtdlpLoading]   = useState(false)
  const [ytdlpError, setYtdlpError]       = useState('')
  const [ytdlpLogs, setYtdlpLogs]         = useState<LogEntry[]>([])
  const [ytdlpLogVisible, setYtdlpLogVisible] = useState(false)
  const [ytdlpLogOpen, setYtdlpLogOpen]   = useState(false)
  const [ytdlpShowOtherApi, setYtdlpShowOtherApi] = useState(false)
  const [ytdlpShowOpenUrl, setYtdlpShowOpenUrl]   = useState(false)
  const [ytdlpFetchMode, setYtdlpFetchMode] = useState<'sequential' | 'parallel' | 'specific'>(() => {
    try {
      const v = localStorage.getItem(YTDLP_FETCH_MODE_KEY)
      return (['sequential', 'parallel', 'specific'].includes(v || '') ? v : 'parallel') as 'sequential' | 'parallel' | 'specific'
    } catch { return 'parallel' }
  })
  const [ytdlpSpecificApi, setYtdlpSpecificApi] = useState<string>(() => {
    try { return localStorage.getItem(YTDLP_SPECIFIC_API_KEY) || 'xerox' } catch { return 'xerox' }
  })
  const [ytdlpTimeoutSec, setYtdlpTimeoutSec] = useState<number>(() => {
    try { const v = parseInt(localStorage.getItem(YTDLP_TIMEOUT_KEY) || '', 10); return (!isNaN(v) && v > 0) ? v : 15 } catch { return 15 }
  })
  const [ytdlpTimeoutInput, setYtdlpTimeoutInput] = useState<string>(() => {
    try { const v = parseInt(localStorage.getItem(YTDLP_TIMEOUT_KEY) || '', 10); return (!isNaN(v) && v > 0) ? String(v) : '15' } catch { return '15' }
  })
  const [ytdlpSequentialOrder, setYtdlpSequentialOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(YTDLP_SEQUENTIAL_ORDER_KEY)
      if (!raw) return YTDLP_DEFAULT_ORDER
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return YTDLP_DEFAULT_ORDER
      const valid = (parsed as string[]).filter(k => YTDLP_DEFAULT_ORDER.includes(k))
      if (!valid.length) return YTDLP_DEFAULT_ORDER
      const missing = YTDLP_DEFAULT_ORDER.filter(k => !valid.includes(k))
      return [...valid, ...missing]
    } catch { return YTDLP_DEFAULT_ORDER }
  })
  const [ytdlpOtherApiSelect, setYtdlpOtherApiSelect] = useState('auto')

  const [invStreams, setInvStreams]           = useState<Stream[] | null>(null)
  const [invFilter, setInvFilter]             = useState('mp4')
  const [invTabState, setInvTabState]         = useState<string | null>(null)
  const [invShowAll, setInvShowAll]           = useState(false)
  const [invPlaying, setInvPlaying]           = useState<Stream | null>(null)
  const [invInstance, setInvInstance]         = useState<string | null>(null)
  const [invUsedCombos, setInvUsedCombos]     = useState<{ instance: string; proxy: string }[]>([])
  const [invExcluded, setInvExcluded]         = useState<string[]>([])
  const [invLoading, setInvLoading]           = useState(false)
  const [invError, setInvError]               = useState('')
  const [invLogs, setInvLogs]                 = useState<LogEntry[]>([])
  const [invLogVisible, setInvLogVisible]     = useState(false)
  const [invLogOpen, setInvLogOpen]           = useState(false)
  const [invShowOtherInst, setInvShowOtherInst] = useState(false)
  const [invShowOpenUrl, setInvShowOpenUrl]   = useState(false)
  const [invRegion, setInvRegion]             = useState<'ja' | 'other'>('ja')
  const [invRegionPending, setInvRegionPending] = useState<'ja' | 'other'>('ja')
  
  const [rapidStreams, setRapidStreams]       = useState<Stream[] | null>(null)
  const [rapidFilter, setRapidFilter]         = useState(() => {
    try { const v = localStorage.getItem(RAPID_FILTER_KEY); return (['mp4','video','audio','hls'].includes(v||'') ? v : 'mp4') as string } catch { return 'mp4' }
  })
  const [rapidTabState, setRapidTabState]     = useState<string | null>(null)
  const [rapidPlaying, setRapidPlaying]       = useState<Stream | null>(null)
  const [rapidLoading, setRapidLoading]       = useState(false)
  const [rapidError, setRapidError]           = useState('')
  const [rapidShowAll, setRapidShowAll]       = useState(false)
  const [rapidLogs, setRapidLogs]             = useState<LogEntry[]>([])
  const [rapidLogVisible, setRapidLogVisible] = useState(false)
  const [rapidLogOpen, setRapidLogOpen]       = useState(false)
  const [rapidShowOpenUrl, setRapidShowOpenUrl] = useState(false)

  const [hdadVideoStreams, setHdadVideoStreams] = useState<Stream[] | null>(null)
  const [hdadAudioStreams, setHdadAudioStreams] = useState<Stream[] | null>(null)
  const [hdadVideoPlaying, setHdadVideoPlaying] = useState<Stream | null>(null)
  const [hdadAudioPlaying, setHdadAudioPlaying] = useState<Stream | null>(null)
  const [hdadLoading, setHdadLoading]           = useState(false)
  const [hdadError, setHdadError]               = useState('')
  const [hdadLogs, setHdadLogs]                 = useState<LogEntry[]>([])
  const [hdadLogVisible, setHdadLogVisible]     = useState(false)
  const [hdadLogOpen, setHdadLogOpen]           = useState(false)
  const [hdadUsedSources, setHdadUsedSources]   = useState<string[]>([])

  const [eduParamType, setEduParamType]   = useState<string>(() => {
    try { return localStorage.getItem(EDU_PARAM_KEY) || 'wakame' } catch { return 'wakame' }
  })
  const [eduUrl, setEduUrl]               = useState<string | null>(null)
  const [eduLoading, setEduLoading]       = useState(false)
  const [eduError, setEduError]           = useState('')
  const [eduParamSources, setEduParamSources] = useState<{ key: string; label: string; url: string }[]>([])
  const [embedStartSec, setEmbedStartSec] = useState(0)

  const [qualityPanelOpen, setQualityPanelOpen] = useState(false)

  const [showThumbnail, setShowThumbnail] = useState<boolean>(() => {
    try { return localStorage.getItem(THUMB_SHOW_KEY) === 'true' } catch { return false }
  })
  const [thumbFile, setThumbFile]         = useState<string>(() => {
    try { return localStorage.getItem(THUMB_FILE_KEY) || 'maxresdefault.jpg' } catch { return 'maxresdefault.jpg' }
  })
  const [thumbHost, setThumbHost]         = useState<string>(() => {
    try { return localStorage.getItem(THUMB_HOST_KEY) || 'https://img.youtube.com' } catch { return 'https://img.youtube.com' }
  })
  const [base64ThumbSrc, setBase64ThumbSrc]       = useState<string | null>(null)
  const [base64ThumbLoading, setBase64ThumbLoading] = useState(false)
  const [base64ThumbError, setBase64ThumbError]   = useState<string | null>(null)

  const [currentUrl, setCurrentUrl]       = useState<string | null>(null)
  const [liked, setLiked]                 = useState(false)
  const [disliked, setDisliked]           = useState(false)
  const [favorited, setFavorited]         = useState(() => isFavorite(videoId || ''))
  const [watchSubscribed, setWatchSubscribed] = useState(false)
  const [toastVisible, setToastVisible]   = useState(false)
  const [toastMsg, setToastMsg]           = useState('')
  const [shareOpen, setShareOpen]         = useState(false)
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [downloadTab, setDownloadTab] = useState<'ytdlp' | 'invidious' | 'rapid' | 'thumbnail'>('ytdlp')
  const [dlYtdlpResults, setDlYtdlpResults] = useState<Record<string, Stream[] | null>>({})
  const [dlYtdlpPending, setDlYtdlpPending] = useState<Set<string>>(new Set())
  const [dlYtdlpSelected, setDlYtdlpSelected] = useState<string>(YTDLP_ALL_SOURCES[0].key)
  const dlYtdlpFetchedRef = useRef<string | null>(null)
  const shareRef = useRef<HTMLDivElement>(null)
  const plMenuRef = useRef<HTMLDivElement>(null)
  const [plMenuOpen, setPlMenuOpen] = useState(false)
  const [plMenuTick, setPlMenuTick] = useState(0)
  const [plNewName, setPlNewName] = useState('')
  const [plNewOpen, setPlNewOpen] = useState(false)
  const iframePlayingRef = useRef(false)
  const [playbackInfoOpen, setPlaybackInfoOpen] = useState(false)
  const [clipStart, setClipStart] = useState('')
  const [clipEnd, setClipEnd]     = useState('')
  const clipStartSecRef = useRef(-1)
  const clipEndSecRef   = useRef(-1)
  const [loopEnabled, setLoopEnabled]           = useState(() => { try { return localStorage.getItem(LOOP_KEY) === '1' } catch { return false } })
  const [autoplayEnabled, setAutoplayEnabled]   = useState(() => { try { return localStorage.getItem(AUTOPLAY_KEY) !== '0' } catch { return true } })
  const [resumeEnabled, setResumeEnabled]       = useState(() => { try { return localStorage.getItem(RESUME_KEY) !== '0' } catch { return true } })
  const [autoNextEnabled, setAutoNextEnabled]   = useState(() => { try { return localStorage.getItem(AUTO_NEXT_KEY) !== '0' } catch { return true } })
  const loopEnabledRef      = useRef(loopEnabled)
  const autoplayEnabledRef  = useRef(autoplayEnabled)
  const resumeEnabledRef    = useRef(resumeEnabled)
  const autoNextEnabledRef  = useRef(autoNextEnabled)
  const forceAutoplayRef    = useRef(false)
  const ytdlpFetchModeRef        = useRef(ytdlpFetchMode)
  const ytdlpSpecificApiRef      = useRef(ytdlpSpecificApi)
  const ytdlpTimeoutSecRef       = useRef(ytdlpTimeoutSec)
  const ytdlpSequentialOrderRef  = useRef(ytdlpSequentialOrder)
  const showThumbnailRef         = useRef(showThumbnail)
  loopEnabledRef.current     = loopEnabled && !listId && !localPlId  // プレイリスト/ミックス/ローカルPL内ではループ強制OFF
  autoplayEnabledRef.current = localPlId ? true : autoplayEnabled   // ローカルPL再生中は自動再生強制ON
  resumeEnabledRef.current   = resumeEnabled
  autoNextEnabledRef.current = localPlId ? true : autoNextEnabled   // ローカルPL再生中は次送り強制ON
  showThumbnailRef.current   = showThumbnail
  ytdlpFetchModeRef.current          = ytdlpFetchMode
  ytdlpSpecificApiRef.current        = ytdlpSpecificApi
  ytdlpTimeoutSecRef.current         = ytdlpTimeoutSec
  ytdlpSequentialOrderRef.current    = ytdlpSequentialOrder

  const playerRef             = useRef<HTMLDivElement>(null)
  const nativePlayerWrapRef   = useRef<HTMLDivElement>(null)
  const activeMediaRef        = useRef<HTMLVideoElement | null>(null)
  const ctrlHideTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ctrlSeekRef           = useRef<HTMLDivElement>(null)
  const [ctrlPlaying,     setCtrlPlaying]     = useState(false)
  const [ctrlCurrentTime, setCtrlCurrentTime] = useState(0)
  const [ctrlDuration,    setCtrlDuration]    = useState(0)
  const [ctrlVolume,      setCtrlVolume]      = useState(1)
  const [ctrlMuted,       setCtrlMuted]       = useState(false)
  const [ctrlRate,        setCtrlRate]        = useState(() => { try { const r = parseFloat(localStorage.getItem(SPEED_KEY) ?? ''); return isNaN(r) ? 1 : r } catch { return 1 } })
  const [ctrlVisible,     setCtrlVisible]     = useState(true)
  const [ctrlIsVideo,     setCtrlIsVideo]     = useState(false)
  const [ctrlBuffered,    setCtrlBuffered]    = useState(0)
  const lastTimeRef     = useRef(0)
  const iframeTimeRef   = useRef(0)
  const iframeRef       = useRef<HTMLIFrameElement | null>(null)
  const ytdlpSeqRef     = useRef(0)
  const invSeqRef       = useRef(0)
  const ytdlpLogRef     = useRef<HTMLDivElement>(null)
  const invLogRef       = useRef<HTMLDivElement>(null)
  const rapidLogRef     = useRef<HTMLDivElement>(null)
  const invRaceAbortRef    = useRef<AbortController | null>(null)
  const rapidAbortRef      = useRef<AbortController | null>(null)
  const hdadAbortRef       = useRef<AbortController | null>(null)
  const hdadAudioRef       = useRef<HTMLAudioElement | null>(null)
  const hdadLogRef         = useRef<HTMLDivElement>(null)
  const durationRef        = useRef(0)
  const otherApiSelectRef  = useRef<HTMLSelectElement>(null)
  const commentsSeqRef     = useRef(0)

  const [transcriptTracks, setTranscriptTracks] = useState<{ label: string; language_code?: string; languageCode?: string }[]>([])
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [transcriptLang, setTranscriptLang] = useState<string | null>(null)
  const [transcriptLines, setTranscriptLines] = useState<{ text: string; start: number; duration: number }[]>([])
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptError, setTranscriptError] = useState('')
  const [activeTranscriptIdx, setActiveTranscriptIdx] = useState<number | null>(null)
  const transcriptContentRef = useRef<HTMLDivElement>(null)
  const transcriptHighlightRef = useRef<number>(0)

  const fitSelectWidth = useCallback((el: HTMLSelectElement | null) => {
    if (!el) return
    const text = el.options[el.selectedIndex]?.text || ''
    const span = document.createElement('span')
    span.style.cssText = 'visibility:hidden;position:absolute;font-size:0.82rem;white-space:nowrap;pointer-events:none'
    span.textContent = text
    document.body.appendChild(span)
    el.style.width = (span.offsetWidth + 10) + 'px'
    document.body.removeChild(span)
  }, [])

  useEffect(() => {
    fitSelectWidth(otherApiSelectRef.current)
  }, [ytdlpOtherApiSelect, fitSelectWidth])

  useEffect(() => {
    if (ytdlpShowOtherApi) {
      setTimeout(() => fitSelectWidth(otherApiSelectRef.current), 0)
    }
  }, [ytdlpShowOtherApi, fitSelectWidth])

  useEffect(() => {
    if (ytdlpLogRef.current && ytdlpLogOpen) {
      ytdlpLogRef.current.scrollTop = ytdlpLogRef.current.scrollHeight
    }
  }, [ytdlpLogs, ytdlpLogOpen])

  useEffect(() => {
    if (invLogRef.current && invLogOpen) {
      invLogRef.current.scrollTop = invLogRef.current.scrollHeight
    }
  }, [invLogs, invLogOpen])

  useEffect(() => {
    if (!shareOpen) return
    const handler = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [shareOpen])

  useEffect(() => {
    if (!plMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (plMenuRef.current && !plMenuRef.current.contains(e.target as Node)) setPlMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [plMenuOpen])

  useEffect(() => {
    if (!downloadOpen || downloadTab !== 'ytdlp' || !videoId) return
    if (dlYtdlpFetchedRef.current === videoId) return
    dlYtdlpFetchedRef.current = videoId
    setDlYtdlpResults({})
    setDlYtdlpPending(new Set(YTDLP_ALL_SOURCES.map(s => s.key)))
    fetchYtdlpAllSources(videoId, (source, streams) => {
      setDlYtdlpResults(prev => ({ ...prev, [source]: streams }))
      setDlYtdlpPending(prev => { const next = new Set(prev); next.delete(source); return next })
    })
  }, [downloadOpen, downloadTab, videoId])

  const addYtdlpLog = useCallback((msg: string, level = 'log') => {
    setYtdlpLogs(prev => [...prev, { time: nowTime(), msg, level }])
  }, [])

  const addInvLog = useCallback((msg: string, level = 'log') => {
    setInvLogs(prev => [...prev, { time: nowTime(), msg, level }])
  }, [])

  const addRapidLog = useCallback((msg: string, level = 'log') => {
    setRapidLogs(prev => [...prev, { time: nowTime(), msg, level }])
  }, [])

  const addHdadLog = useCallback((msg: string, level = 'log') => {
    setHdadLogs(prev => [...prev, { time: nowTime(), msg, level }])
  }, [])

  useEffect(() => {
    if (rapidLogRef.current && rapidLogOpen) {
      rapidLogRef.current.scrollTop = rapidLogRef.current.scrollHeight
    }
  }, [rapidLogs, rapidLogOpen])

  useEffect(() => {
    if (hdadLogRef.current && hdadLogOpen) {
      hdadLogRef.current.scrollTop = hdadLogRef.current.scrollHeight
    }
  }, [hdadLogs, hdadLogOpen])

  useEffect(() => {
    fetch('/api/edu/sources')
      .then(r => r.ok ? r.json() : null)
      .then((data: { key: string; label: string; url: string }[] | null) => {
        if (data && data.length > 0) setEduParamSources(data)
      })
      .catch(() => {/* ignore */})
  }, [])

  useEffect(() => {
    if (!videoId) return
    let cancelled = false
    setMetadata(null)
    setRelatedVideos([])
    setRelatedLoading(true)
    setFavorited(isFavorite(videoId))
    setWatchSubscribed(false)
    fetchWatchMetadata(videoId).then(d => {
      if (cancelled) return
      setMetadata(d)
      durationRef.current = d.duration_seconds || 0
      setRelatedVideos(d.recommendedVideos || [])
      if (d.channel_id) setWatchSubscribed(libIsSubscribed(d.channel_id))
      addHistory({
        videoId,
        title: d.video_title || videoId,
        author: d.channel_name || '',
        authorId: d.channel_id || '',
        channelIcon: d.channel_icon || undefined,
        lengthSeconds: d.duration_seconds || undefined,
      })
    }).finally(() => {
      if (!cancelled) setRelatedLoading(false)
    })
    return () => { cancelled = true }
  }, [videoId])

  const loadTranscriptLang = useCallback(async (vid: string, lang: string, label?: string) => {
    setTranscriptLoading(true)
    setTranscriptError('')
    setTranscriptLines([])
    setActiveTranscriptIdx(null)
    try {
      const params = new URLSearchParams({ lang })
      if (label) params.set('label', label)
      const res = await fetch(`/api/transcripts/${encodeURIComponent(vid)}?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const lines = await res.json() as { text: string; start: number; duration: number }[]
      setTranscriptLines(Array.isArray(lines) ? lines : [])
    } catch (e) {
      setTranscriptError('トランスクリプトの取得に失敗しました。')
    } finally {
      setTranscriptLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!videoId) return
    setTranscriptTracks([])
    setTranscriptOpen(false)
    setTranscriptLang(null)
    setTranscriptLines([])
    setTranscriptLoading(false)
    setTranscriptError('')
    setActiveTranscriptIdx(null)
    fetch(`/api/captions/${encodeURIComponent(videoId)}`)
      .then(r => r.ok ? r.json() : { captions: [] })
      .then((data: { captions?: { label: string; language_code?: string; languageCode?: string }[] } | { label: string; language_code?: string; languageCode?: string }[]) => {
        const tracks = Array.isArray(data) ? data : (data.captions || [])
        if (Array.isArray(tracks) && tracks.length > 0) {
          setTranscriptTracks(tracks)
        }
      })
      .catch(() => {})
  }, [videoId])

  useEffect(() => {
    const tick = () => {
      const m = activeMediaRef.current
      if (!m || !transcriptLines.length) return
      const t = m.currentTime
      let best = -1
      for (let i = 0; i < transcriptLines.length; i++) {
        const line = transcriptLines[i]
        if (t >= line.start && t < line.start + line.duration) {
          best = i
          break
        }
      }
      if (best !== transcriptHighlightRef.current) {
        transcriptHighlightRef.current = best
        setActiveTranscriptIdx(best)
        if (best >= 0 && transcriptContentRef.current) {
          const el = transcriptContentRef.current.children[best] as HTMLElement | undefined
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      }
    }
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [transcriptLines])

  const loadComments = useCallback(async (append = false, continuation: string | null = null) => {
    if (!videoId) return
    const seq = ++commentsSeqRef.current
    if (append) setCommentsAppending(true)
    else {
      setCommentsLoading(true)
      setCommentsError('')
      setComments([])
      setCommentContinuation(null)
      setCommentCount(null)
    }
    try {
      const data = await fetchWatchComments(videoId, commentSort, continuation)
      if (seq !== commentsSeqRef.current) return
      if (!append && typeof data.commentCount === 'number') setCommentCount(data.commentCount)
      setComments(prev => append ? [...prev, ...(data.comments || [])] : (data.comments || []))
      setCommentContinuation(data.continuation || null)
    } catch {
      if (seq === commentsSeqRef.current) setCommentsError('コメントの取得に失敗しました。')
    } finally {
      if (seq === commentsSeqRef.current) {
        setCommentsLoading(false)
        setCommentsAppending(false)
      }
    }
  }, [videoId, commentSort])

  useEffect(() => {
    if (!listId) {
      setPlData(null)
      return
    }
    const isMix = listId.startsWith('RD')
    const page = Math.floor(Math.max(listIndex, 0) / 100) + 1
    const targetPage = isMix ? 1 : page
    if (!isMix && targetPage === plPage && plData) return
    const cacheKey = `${listId}_${targetPage}`
    const cached = playlistCache.get(cacheKey)
    if (cached) {
      setPlData(cached)
      if (!isMix) setPlPage(targetPage)
      return
    }
    setPlLoading(true)
    const url = isMix
      ? `/api/mixes/${encodeURIComponent(listId)}`
      : `/api/playlists/${encodeURIComponent(listId)}?page=${targetPage}`
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: PlaylistPanelData) => fillPlaylistPanelMissingIcons(data))
      .then((data: PlaylistPanelData) => {
        playlistCache.set(cacheKey, data)
        setPlData(data)
        if (!isMix) setPlPage(targetPage)
      })
      .catch(() => setPlData(null))
      .finally(() => setPlLoading(false))
  }, [listId, listIndex])

  useEffect(() => {
    setCommentSort('top')
  }, [videoId])

  useEffect(() => {
    loadComments(false)
  }, [loadComments])

  const saveTime = () => {
    const m = playerRef.current?.querySelector('video, audio') as HTMLVideoElement | null
    if (m && isFinite(m.currentTime) && m.currentTime > 0) {
      lastTimeRef.current = m.currentTime
    } else if (iframeTimeRef.current > 0) {
      lastTimeRef.current = iframeTimeRef.current
    }
  }

  // プレイリスト/ミックスの次の動画へ移動（autoplay ON かつ loop OFF 時に onEnded から呼ぶ）
  const playNextInPlaylist = useCallback(() => {
    const lid  = listIdRef.current
    const data = plDataRef.current
    if (!lid || !data || !data.videos || data.videos.length === 0) return
    const pageOffset  = (plPageRef.current - 1) * 100
    const currentIdx  = data.videos.findIndex(v => v.videoId === videoIdRef.current)
    if (currentIdx === -1) return
    const nextInPage = currentIdx + 1
    if (nextInPage < data.videos.length) {
      const next = data.videos[nextInPage]
      const globalIdx = pageOffset + nextInPage
      navigateRef.current(`/watch/${next.videoId}?list=${encodeURIComponent(lid)}&index=${globalIdx}`)
    }
  }, [])
  playNextRef.current = playNextInPlaylist

  // --- カスタムコントロール ヘルパー ---
  const fmtTime = (s: number): string => {
    if (!isFinite(s) || isNaN(s)) return '--:--'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const showCtrl = useCallback(() => {
    setCtrlVisible(true)
    if (ctrlHideTimerRef.current) clearTimeout(ctrlHideTimerRef.current)
    ctrlHideTimerRef.current = setTimeout(() => {
      if (activeMediaRef.current && !activeMediaRef.current.paused) setCtrlVisible(false)
    }, 3000)
  }, [])

  const ctrlTogglePlay = useCallback(() => {
    const m = activeMediaRef.current
    if (!m) return
    if (m.paused) m.play().catch(() => {})
    else m.pause()
  }, [])

  const ctrlToggleMute = useCallback(() => {
    const m = activeMediaRef.current
    if (!m) return
    m.muted = !m.muted
  }, [])

  const ctrlHandleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const m = activeMediaRef.current
    if (!m) return
    const v = parseFloat(e.target.value)
    m.volume = v
    m.muted = v === 0
  }, [])

  const ctrlHandleRateChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const m = activeMediaRef.current
    const rate = parseFloat(e.target.value)
    if (m) m.playbackRate = rate
    setCtrlRate(rate)
    try { localStorage.setItem(SPEED_KEY, String(rate)) } catch { /* ignore */ }
  }, [])

  const ctrlHandlePiP = useCallback(() => {
    const m = activeMediaRef.current
    if (!m || !document.pictureInPictureEnabled) return
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {})
    else m.requestPictureInPicture().catch(() => {})
  }, [])

  const ctrlToggleLoop = useCallback(() => {
    const next = !loopEnabledRef.current
    setLoopEnabled(next)
    try { localStorage.setItem(LOOP_KEY, next ? '1' : '0') } catch { /* ignore */ }
    if (next) {
      setAutoNextEnabled(false)
      try { localStorage.setItem(AUTO_NEXT_KEY, '0') } catch { /* ignore */ }
    }
  }, [])

  const ctrlToggleFullscreen = useCallback(() => {
    const el = nativePlayerWrapRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else el.requestFullscreen().catch(() => {})
  }, [])

  const ctrlSeekStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const el = ctrlSeekRef.current
    const m = activeMediaRef.current
    if (!el || !m || !isFinite(m.duration)) return
    const perform = (clientX: number) => {
      const rect = el.getBoundingClientRect()
      const pad = 12
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left - pad) / (rect.width - pad * 2)))
      m.currentTime = ratio * m.duration
    }
    perform(e.clientX)
    const onMove = (ev: MouseEvent) => perform(ev.clientX)
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  const loadYtdlp = useCallback(async (excluded: string[], background = false, modeOverride?: string, specificApiOverride?: string) => {
    if (!videoId) return
    const seq = ++ytdlpSeqRef.current
    setYtdlpLoading(true)
    setYtdlpError('')
    setYtdlpShowOtherApi(false)
    setYtdlpShowOpenUrl(false)
    setYtdlpLogVisible(true)
    if (!background) {
      saveTime()
      if (playerRef.current) playerRef.current.innerHTML = ''
    }

    const effectiveMode = (modeOverride || ytdlpFetchModeRef.current) as 'sequential' | 'parallel' | 'specific'
    const effectiveApi = specificApiOverride || ytdlpSpecificApiRef.current

    if (effectiveMode === 'specific') {
      const apiLabel = YTDLP_SRC_MAP[effectiveApi] || effectiveApi
      addYtdlpLog(`ストリーム取得を開始します... [指定API: ${apiLabel}]`)
    } else if (effectiveMode === 'parallel') {
      const excludeSet = new Set(excluded.map(s => s.toLowerCase()))
      const sourceLabel = Object.entries(YTDLP_SRC_MAP)
        .filter(([k]) => !excludeSet.has(k))
        .map(([, v]) => v)
        .join(' / ') || '(全API除外)'
      addYtdlpLog(`ストリーム取得を開始します... [並列モード / 対象: ${sourceLabel}]`)
    } else {
      const excludeSet = new Set(excluded.map(s => s.toLowerCase()))
      const orderedKeys = ytdlpSequentialOrderRef.current.filter(k => !excludeSet.has(k))
      const sourceLabel = orderedKeys.map(k => YTDLP_SRC_MAP[k] || k).join(' → ') || '(全API除外)'
      addYtdlpLog(`ストリーム取得を開始します... [順次フォールバック: ${sourceLabel}]`)
    }

    const startTime = Date.now()
    try {
      const result = await fetchYtdlpStreams(videoId, excluded, undefined, effectiveMode, effectiveApi, ytdlpTimeoutSecRef.current * 1000, ytdlpSequentialOrderRef.current)
      if (seq !== ytdlpSeqRef.current) return
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

      if (result && result.streams.length > 0) {
        ;(result.failedSources || []).forEach(f =>
          addYtdlpLog(`⚠️ ${YTDLP_SRC_MAP[f] || f + ' API'}: ストリーム取得失敗 → 次のAPIへフォールバック`, 'warn')
        )
        const src = result.source || '不明'
        addYtdlpLog(`✅ 取得成功 (${result.streams.length}件, ソース: ${YTDLP_SRC_MAP[src] || src}, ${elapsed}秒)`)
        setYtdlpStreams(result.streams)
        setYtdlpSource(result.source || null)
        const ts = calcTabState(result.streams)
        setYtdlpTabState(ts)
        const f = filterForState(ts, YTDLP_FILTER_KEY)
        setYtdlpFilter(f)
        const sorted = [...filterStreams(result.streams, f)].sort((a, b) => qNum(b.quality) - qNum(a.quality))
        setYtdlpPlaying(sorted[0] || null)
        setYtdlpShowOtherApi(true)
        setYtdlpShowOpenUrl(true)
        setYtdlpLogOpen(false)
      } else {
        addYtdlpLog(`❌ ストリームの取得に失敗しました (${elapsed}秒)`, 'err')
        setYtdlpError('ストリームの取得に失敗しました。再読み込みしてください')
      }
    } catch (err: unknown) {
      if (seq !== ytdlpSeqRef.current) return
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      addYtdlpLog(`❌ リクエストエラー: ${(err as Error)?.message || String(err)} (${elapsed}秒)`, 'err')
      setYtdlpError('ストリームの取得に失敗しました。再読み込みしてください')
    } finally {
      if (seq === ytdlpSeqRef.current) setYtdlpLoading(false)
    }
  }, [videoId, addYtdlpLog])

  const applyInvResult = useCallback((result: StreamResult) => {
    setInvStreams(result.streams)
    const combo = { instance: result.instance || 'backend', proxy: result.proxy ?? 'backend' }
    setInvInstance(result.instance || 'backend')
    setInvUsedCombos(prev => [...prev, combo])
    const ts = calcTabState(result.streams)
    setInvTabState(ts)
    const f = filterForState(ts, INV_FILTER_KEY)
    setInvFilter(f)
    const sorted = [...filterStreams(result.streams, f)].sort((a, b) => qNum(b.quality) - qNum(a.quality))
    setInvPlaying(sorted[0] || null)
    setInvShowOtherInst(true)
    setInvShowOpenUrl(true)
    setInvLogOpen(false)
    setInvLogVisible(true)
  }, [])

  const loadInvidious = useCallback(async (excludedInstances: string[], background = false) => {
    if (!videoId) return
    const seq = ++invSeqRef.current

    if (invRaceAbortRef.current) { invRaceAbortRef.current.abort(); invRaceAbortRef.current = null }

    setInvLoading(true)
    setInvError('')
    setInvShowOtherInst(false)
    setInvShowOpenUrl(false)
    setInvLogVisible(true)
    if (!background) {
      saveTime()
      if (playerRef.current) playerRef.current.innerHTML = ''
    }

    addInvLog('Invidiousストリームを取得中...')
    const startTime = Date.now()

    const ctrl = new AbortController()
    invRaceAbortRef.current = ctrl
    try {
      const params = new URLSearchParams()
      if (excludedInstances.length > 0) params.set('exclude', excludedInstances.join(','))
      const url = `/api/stream/invidious/${videoId}` + (params.toString() ? `?${params}` : '')
      const res = await fetch(url, { signal: ctrl.signal })
      if (seq !== invSeqRef.current || ctrl.signal.aborted) return
      invRaceAbortRef.current = null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = await res.json() as StreamResult
      if (seq !== invSeqRef.current) return
      if (result && result.streams && result.streams.length > 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        addInvLog(`✅ 取得成功: ${result.instance} (${result.streams.length}件, ${elapsed}秒)`)
        applyInvResult(result)
        setInvLoading(false)
      } else {
        throw new Error('ストリームが見つかりませんでした')
      }
    } catch (e: unknown) {
      if (seq !== invSeqRef.current || (e instanceof Error && e.name === 'AbortError')) return
      invRaceAbortRef.current = null
      addInvLog(`❌ ストリームの取得に失敗しました: ${(e as Error).message}`, 'err')
      setInvError('ストリームの取得に失敗しました。再読み込みしてください')
      setInvLoading(false)
    }
  }, [videoId, addInvLog, applyInvResult])

  useEffect(() => {
    setYtdlpStreams(null); setYtdlpPlaying(null); setYtdlpSource(null)
    setYtdlpExcluded([]); setYtdlpError(''); setYtdlpLogs([])
    setYtdlpLogVisible(false); setYtdlpLogOpen(false)
    setYtdlpShowOtherApi(false); setYtdlpShowOpenUrl(false)
    setInvStreams(null); setInvPlaying(null); setInvInstance(null)
    setInvUsedCombos([]); setInvExcluded([]); setInvError(''); setInvLogs([])
    setInvLogVisible(false); setInvLogOpen(false)
    setInvShowOtherInst(false); setInvShowOpenUrl(false)
    if (invRaceAbortRef.current) { invRaceAbortRef.current.abort(); invRaceAbortRef.current = null }
    setRapidStreams(null); setRapidPlaying(null); setRapidTabState(null)
    setRapidLoading(false); setRapidError('')
    setRapidLogs([]); setRapidLogVisible(false); setRapidLogOpen(false)
    setRapidShowOpenUrl(false)
    if (rapidAbortRef.current) { rapidAbortRef.current.abort(); rapidAbortRef.current = null }
    setHdadVideoStreams(null); setHdadAudioStreams(null)
    setHdadVideoPlaying(null); setHdadAudioPlaying(null)
    setHdadLoading(false); setHdadError('')
    setHdadLogs([]); setHdadLogVisible(false); setHdadLogOpen(false)
    setHdadUsedSources([])
    if (hdadAbortRef.current) { hdadAbortRef.current.abort(); hdadAbortRef.current = null }
    if (hdadAudioRef.current) { hdadAudioRef.current.pause(); hdadAudioRef.current = null }
    setCurrentUrl(null)
    setEmbedStartSec(0)
    // 先にプレイヤーDOMをクリアしてから lastTimeRef をリセットする。
    // そうしないと後続の loadYtdlp 内 saveTime() が古い動画の再生位置を読み取ってしまう。
    if (playerRef.current) {
      const old = playerRef.current.querySelector('video, audio') as HTMLMediaElement | null
      if (old) { old.pause(); old.src = '' }
      playerRef.current.innerHTML = ''
    }
    lastTimeRef.current = 0
    iframeTimeRef.current = 0
    iframeRef.current = null
    clipStartSecRef.current = -1
    clipEndSecRef.current = -1
    setClipStart('')
    setClipEnd('')

    const saved = getSaved(STREAM_TYPE_KEY, ['ytdlp', 'invidious', 'rapid', 'nocookie', 'edu', 'hdad'], 'ytdlp')
    setStreamMode(saved)

    // 選択中のモードを優先して取得しつつ、他のモードもバックグラウンドで取得開始
    if (saved === 'rapid') {
      if (videoId) loadRapid(videoId)
      loadYtdlp([], true)
      loadInvidious([], true)
    } else if (saved === 'ytdlp') {
      loadYtdlp([])
      loadInvidious([], true)  // バックグラウンドで取得（プレイヤー消去なし）
      if (videoId) loadRapid(videoId)  // バックグラウンドで取得
    } else if (saved === 'invidious') {
      loadInvidious([])
      loadYtdlp([], true)  // バックグラウンドで取得（プレイヤー消去なし）
      if (videoId) loadRapid(videoId)  // バックグラウンドで取得
    } else if (saved === 'hdad') {
      if (videoId) loadHdad(videoId)
      loadYtdlp([], true)
      loadInvidious([], true)
      if (videoId) loadRapid(videoId)
    } else {
      // nocookie / edu モード: 全てバックグラウンドで取得
      loadYtdlp([], true)
      loadInvidious([], true)
      if (videoId) loadRapid(videoId)
      if (saved === 'edu' && videoId) buildEduUrl(
        (() => { try { return localStorage.getItem(EDU_PARAM_KEY) || 'wakame' } catch { return 'wakame' } })(),
        videoId
      )
    }

    // クリーンアップ: StrictMode の二重実行や動画切替時に進行中のリクエストを無効化
    return () => {
      ytdlpSeqRef.current++
      invSeqRef.current++
      if (invRaceAbortRef.current) { invRaceAbortRef.current.abort(); invRaceAbortRef.current = null }
      if (rapidAbortRef.current) { rapidAbortRef.current.abort(); rapidAbortRef.current = null }
    }
  }, [videoId])

  useEffect(() => {
    if (thumbHost !== 'base64' || !videoId) return
    let cancelled = false
    setBase64ThumbSrc(null)
    setBase64ThumbError(null)
    setBase64ThumbLoading(true)
    fetch(`/api/thumbnail/base64/${videoId}`)
      .then(r => r.json())
      .then((data: { thumbnail?: string }) => {
        if (cancelled) return
        if (data?.thumbnail) {
          setBase64ThumbSrc(data.thumbnail)
        } else {
          setBase64ThumbError('サムネイルが取得できませんでした')
        }
      })
      .catch(() => {
        if (!cancelled) setBase64ThumbError('取得エラー')
      })
      .finally(() => {
        if (!cancelled) setBase64ThumbLoading(false)
      })
    return () => { cancelled = true }
  }, [thumbHost, videoId])

  useEffect(() => {
    if (!downloadOpen || downloadTab !== 'thumbnail') return
    if (!videoId) return
    if (base64ThumbSrc || base64ThumbLoading || base64ThumbError) return
    let cancelled = false
    setBase64ThumbLoading(true)
    fetch(`/api/thumbnail/base64/${videoId}`)
      .then(r => r.json())
      .then((data: { thumbnail?: string }) => {
        if (cancelled) return
        if (data?.thumbnail) {
          setBase64ThumbSrc(data.thumbnail)
        } else {
          setBase64ThumbError('サムネイルが取得できませんでした')
        }
      })
      .catch(() => {
        if (!cancelled) setBase64ThumbError('取得エラー')
      })
      .finally(() => {
        if (!cancelled) setBase64ThumbLoading(false)
      })
    return () => { cancelled = true }
  }, [downloadOpen, downloadTab, videoId, base64ThumbSrc, base64ThumbLoading, base64ThumbError])

  const switchMode = (mode: string, vid?: string) => {
    setShowThumbnail(false)
    try { localStorage.setItem(THUMB_SHOW_KEY, 'false') } catch { /* ignore */ }
    saveTime()
    // 再生位置を保存した後、現在のメディアを停止する（音の二重再生防止）
    // src/load のリセットは行わない（<source>経由読み込みの場合エラーイベントが発火するため）
    const m = activeMediaRef.current ?? (playerRef.current?.querySelector('video, audio') as HTMLVideoElement | null)
    if (m) m.pause()
    if (hdadAudioRef.current) { hdadAudioRef.current.pause(); hdadAudioRef.current = null }
    if (!resumeEnabledRef.current) {
      lastTimeRef.current = clipStartSecRef.current >= 0 ? clipStartSecRef.current : 0
    }
    const startSec = Math.floor(lastTimeRef.current)
    const wasContinuing = resumeEnabledRef.current && lastTimeRef.current > 0
    try { localStorage.setItem(STREAM_TYPE_KEY, mode) } catch { /* ignore */ }
    setStreamMode(mode)
    if (mode === 'edu') {
      forceAutoplayRef.current = wasContinuing
      setEmbedStartSec(startSec)
      iframeTimeRef.current = 0
      buildEduUrl(eduParamType, vid || videoId || '', startSec, wasContinuing)
    } else if (mode === 'nocookie') {
      forceAutoplayRef.current = wasContinuing
      setEmbedStartSec(startSec)
      iframeTimeRef.current = 0
    } else {
      setEmbedStartSec(0)
      iframeTimeRef.current = 0
      iframeRef.current = null
    }

    if (mode !== 'ytdlp') {
      setYtdlpLogVisible(false); setYtdlpLogOpen(false)
      setYtdlpShowOtherApi(false); setYtdlpShowOpenUrl(false)
    }
    if (mode !== 'invidious') {
      setInvLogVisible(false); setInvLogOpen(false)
      setInvShowOtherInst(false); setInvShowOpenUrl(false)
      if (invRaceAbortRef.current) { invRaceAbortRef.current.abort(); invRaceAbortRef.current = null }
    }
    if (mode !== 'rapid') {
      setRapidLogVisible(false); setRapidLogOpen(false)
      setRapidShowOpenUrl(false)
    }
    if (mode !== 'hdad') {
      setHdadLogVisible(false); setHdadLogOpen(false)
      if (hdadAbortRef.current) { hdadAbortRef.current.abort(); hdadAbortRef.current = null }
      const hdadAudio = hdadAudioRef.current as HTMLAudioElement | null
      if (hdadAudio) { hdadAudio.pause(); hdadAudioRef.current = null }
    }

    if (mode === 'ytdlp') {
      if (ytdlpStreams) {
        if (ytdlpLogs.length > 0) setYtdlpLogVisible(true)
        if (ytdlpSource !== null) { setYtdlpShowOtherApi(true); setYtdlpShowOpenUrl(true) }
      } else {
        loadYtdlp(ytdlpExcluded)
      }
    } else if (mode === 'invidious') {
      if (invStreams) {
        if (invLogs.length > 0) setInvLogVisible(true)
        if (invInstance !== null) { setInvShowOtherInst(true); setInvShowOpenUrl(true) }
      } else {
        loadInvidious(invExcluded)
      }
    } else if (mode === 'rapid') {
      if (rapidStreams) {
        if (rapidLogs.length > 0) setRapidLogVisible(true)
        setRapidShowOpenUrl(true)
      } else if (vid || videoId) {
        loadRapid(vid || videoId!)
      }
    } else if (mode === 'hdad') {
      if (hdadVideoStreams && hdadVideoStreams.length > 0) {
        if (hdadLogs.length > 0) setHdadLogVisible(true)
      } else if (vid || videoId) {
        loadHdad(vid || videoId!)
      }
    }
  }

  const reloadYtdlpOtherApi = (selectedApi = 'auto') => {
    setYtdlpStreams(null); setYtdlpPlaying(null); setYtdlpSource(null)
    setYtdlpShowOtherApi(false); setYtdlpShowOpenUrl(false)
    if (selectedApi !== 'auto') {
      setYtdlpFetchMode('specific')
      setYtdlpSpecificApi(selectedApi)
      try { localStorage.setItem(YTDLP_FETCH_MODE_KEY, 'specific') } catch { /* ignore */ }
      try { localStorage.setItem(YTDLP_SPECIFIC_API_KEY, selectedApi) } catch { /* ignore */ }
      setYtdlpExcluded([])
      loadYtdlp([], false, 'specific', selectedApi)
    } else {
      let modeToUse = ytdlpFetchModeRef.current
      if (modeToUse === 'specific') {
        modeToUse = 'parallel'
        setYtdlpFetchMode('parallel')
        try { localStorage.setItem(YTDLP_FETCH_MODE_KEY, 'parallel') } catch { /* ignore */ }
      }
      const newExcl = ytdlpSource ? [...ytdlpExcluded, ytdlpSource] : ytdlpExcluded
      setYtdlpExcluded(newExcl)
      loadYtdlp(newExcl, false, modeToUse)
    }
  }

  const reloadInvOtherInstance = async () => {
    if (!videoId) return
    const excludeInstances = invUsedCombos.map(c => c.instance).filter(i => i && i !== 'backend')
    setInvStreams(null); setInvPlaying(null); setInvInstance(null)
    setInvShowOtherInst(false); setInvShowOpenUrl(false)
    saveTime()
    if (playerRef.current) playerRef.current.innerHTML = ''
    addInvLog('別のインスタンスを検索中...')
    await loadInvidious(excludeInstances, true)
  }

  const applyInvRegion = async () => {
    if (!videoId) return
    const region = invRegionPending
    setInvRegion(region)
    if (region === 'ja') {
      if (invRaceAbortRef.current) { invRaceAbortRef.current.abort(); invRaceAbortRef.current = null }
      setInvStreams(null); setInvPlaying(null); setInvInstance(null)
      setInvUsedCombos([]); setInvExcluded([])
      setInvLogs([]); setInvLogVisible(false)
      loadInvidious([])
    } else {
      setInvStreams(null); setInvPlaying(null); setInvInstance(null)
      setInvLoading(true); setInvError('')
      setInvLogs([{ time: nowTime(), msg: 'K-tube APIからストリームを取得中...', level: 'log' }])
      setInvLogVisible(true)
      const result = await fetchKtubeStream(videoId)
      setInvLoading(false)
      if (!result || !result.streams.length) {
        setInvLogs(prev => [...prev, { time: nowTime(), msg: '❌ K-tube APIからのストリーム取得に失敗しました', level: 'err' }])
        setInvError('K-tube APIからのストリーム取得に失敗しました')
        setQualityPanelOpen(true)
        return
      }
      setInvLogs(prev => [...prev, { time: nowTime(), msg: `✅ K-tube API取得成功 (${result.streams.length}件)`, level: 'log' }])
      setInvStreams(result.streams)
      const sorted = [...result.streams].sort((a, b) => qNum(b.quality) - qNum(a.quality))
      setInvPlaying(sorted[0] || null)
      setInvInstance(result.instance)
    }
  }

  const loadRapid = async (vid: string) => {
    if (rapidAbortRef.current) { rapidAbortRef.current.abort() }
    const ac = new AbortController()
    rapidAbortRef.current = ac
    setRapidStreams(null); setRapidPlaying(null)
    setRapidTabState(null); setRapidShowOpenUrl(false)
    setRapidLoading(true); setRapidError('')
    setRapidLogVisible(true)

    addRapidLog('rapidストリームを取得中...')

    const startTime = Date.now()
    try {
      const res = await fetch(`/api/stream/rapid/${vid}`, { signal: ac.signal })
      if (ac.signal.aborted) return
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { streams?: Stream[]; source?: string; error?: string }
      if (!data.streams || data.streams.length === 0) throw new Error(data.error || 'ストリームが見つかりませんでした')
      const streams = data.streams

      if (ac.signal.aborted) return
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      addRapidLog(`✅ 取得成功 (${streams.length}件, ${data.source || ''}, ${elapsed}秒)`)
      setRapidStreams(streams)
      const ts = calcTabState(streams)
      setRapidTabState(ts)
      const f = filterForState(ts, RAPID_FILTER_KEY)
      setRapidFilter(f)
      try { localStorage.setItem(RAPID_FILTER_KEY, f) } catch { /* ignore */ }
      const sorted = [...filterStreams(streams, f)].sort((a, b) => qNum(b.quality) - qNum(a.quality))
      setRapidPlaying(sorted[0] || null)
      setRapidShowOpenUrl(true)
      setRapidLogOpen(false)
    } catch (e: unknown) {
      if (ac.signal.aborted) return
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      addRapidLog(`❌ 取得失敗: ${(e as Error)?.message || String(e)} (${elapsed}秒)`, 'err')
      setRapidError('ストリームの取得に失敗しました。APIがスリープ中の可能性があります。しばらく待ってから再読み込みしてください')
    } finally {
      if (!ac.signal.aborted) setRapidLoading(false)
    }
  }

  const loadHdad = useCallback(async (vid: string, excludeKeys: string[] = []) => {
    if (hdadAbortRef.current) { hdadAbortRef.current.abort() }
    const ac = new AbortController()
    hdadAbortRef.current = ac

    setHdadVideoStreams(null); setHdadAudioStreams(null)
    setHdadVideoPlaying(null); setHdadAudioPlaying(null)
    setHdadLoading(true); setHdadError('')
    setHdadLogVisible(true)

    const startTime = Date.now()
    addHdadLog('HD+AD: ストリーム取得を開始します...')

    const result = await fetchHdadStreams(vid, (msg, level) => {
      if (!ac.signal.aborted) addHdadLog(msg, level)
    }, excludeKeys)

    if (ac.signal.aborted) return

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    if (!result || result.streams.length === 0) {
      addHdadLog(`❌ 取得失敗: 映像・音声分離ストリームが見つかりませんでした (${elapsed}秒)`, 'err')
      setHdadError('映像・音声分離ストリームの取得に失敗しました。別の再生方法をお試しください')
      setHdadLoading(false)
      return
    }

    const videoStreams = result.streams.filter(s => s.hasVideo && !s.hasAudio && !s.isHLS)
    const audioStreams = result.streams.filter(s => s.hasAudio && !s.hasVideo)

    if (videoStreams.length === 0 || audioStreams.length === 0) {
      addHdadLog(`❌ 取得失敗: 映像のみ(${videoStreams.length}件)または音声のみ(${audioStreams.length}件)のストリームが不足しています (${elapsed}秒)`, 'err')
      setHdadError('映像・音声分離ストリームが不足しています')
      setHdadLoading(false)
      return
    }

    const hdadSort = (a: Stream, b: Stream) => {
      const qDiff = qNum(b.quality) - qNum(a.quality)
      if (qDiff !== 0) return qDiff
      const aWebm = a.quality.toLowerCase().includes('webm') ? 1 : 0
      const bWebm = b.quality.toLowerCase().includes('webm') ? 1 : 0
      return bWebm - aWebm
    }
    const sortedVideo = [...videoStreams].sort(hdadSort)
    const sortedAudio = [...audioStreams].sort(hdadSort)

    const defaultVideo = sortedVideo.find(s => s.quality.toLowerCase().includes('webm')) || sortedVideo[0] || null
    const defaultAudio = sortedAudio.find(s => s.quality.toLowerCase().includes('webm')) || sortedAudio[0] || null

    setHdadUsedSources(prev => [...new Set([...prev, ...excludeKeys, result.source])])
    setHdadVideoStreams(sortedVideo)
    setHdadAudioStreams(sortedAudio)
    setHdadVideoPlaying(defaultVideo)
    setHdadAudioPlaying(defaultAudio)
    setHdadLogOpen(false)
    setHdadLoading(false)
  }, [addHdadLog])

  const reloadCurrent = () => {
    if (streamMode === 'ytdlp') {
      setYtdlpStreams(null); setYtdlpPlaying(null); setYtdlpSource(null)
      setYtdlpExcluded([]); setYtdlpShowOtherApi(false); setYtdlpShowOpenUrl(false)
      setYtdlpLogs([]); setYtdlpLogVisible(false)
      loadYtdlp([])
    } else if (streamMode === 'invidious') {
      if (invRaceAbortRef.current) { invRaceAbortRef.current.abort(); invRaceAbortRef.current = null }
      setInvStreams(null); setInvPlaying(null); setInvInstance(null)
      setInvUsedCombos([]); setInvExcluded([])
      setInvShowOtherInst(false); setInvShowOpenUrl(false)
      setInvLogs([]); setInvLogVisible(false)
      loadInvidious([])
    } else if (streamMode === 'rapid') {
      if (videoId) loadRapid(videoId)
    } else if (streamMode === 'hdad') {
      if (hdadAbortRef.current) { hdadAbortRef.current.abort(); hdadAbortRef.current = null }
      if (hdadAudioRef.current) { hdadAudioRef.current.pause(); hdadAudioRef.current = null }
      if (videoId) loadHdad(videoId)
    }
  }

  const switchYtdlpFilter = (f: string) => {
    saveTime()
    try { localStorage.setItem(YTDLP_FILTER_KEY, f) } catch { /* ignore */ }
    setYtdlpFilter(f)
    if (ytdlpStreams) {
      const sorted = [...filterStreams(ytdlpStreams, f)].sort((a, b) => qNum(b.quality) - qNum(a.quality))
      setYtdlpPlaying(sorted[0] || null)
    }
  }

  const switchInvFilter = (f: string) => {
    saveTime()
    try { localStorage.setItem(INV_FILTER_KEY, f) } catch { /* ignore */ }
    setInvFilter(f)
    if (invStreams) {
      const sorted = [...filterStreams(invStreams, f)].sort((a, b) => qNum(b.quality) - qNum(a.quality))
      setInvPlaying(sorted[0] || null)
    }
  }

  const switchRapidFilter = (f: string) => {
    saveTime()
    try { localStorage.setItem(RAPID_FILTER_KEY, f) } catch { /* ignore */ }
    setRapidFilter(f)
    if (rapidStreams) {
      const sorted = [...filterStreams(rapidStreams, f)].sort((a, b) => qNum(b.quality) - qNum(a.quality))
      setRapidPlaying(sorted[0] || null)
    }
  }

  const openStreamUrl = () => {
    if (currentUrl) window.open(currentUrl, '_blank')
    else alert('動画ストリームURLがありません')
  }

  const handleDownload = (url: string, quality: string, container: string) => {
    const title = (metadata?.video_title || videoId || 'video').replace(/[<>:"/\\|?*\n\r]/g, '_').slice(0, 100)
    const ext = container || 'mp4'
    const filename = `${title} [${quality}].${ext}`
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const copyToClipboard = (text: string, msg: string) => {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea')
      ta.value = text; ta.style.opacity = '0'; ta.style.position = 'fixed'
      document.body.appendChild(ta); ta.select(); document.execCommand('copy')
      document.body.removeChild(ta)
    })
    setToastMsg(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  const handleNativeShare = async () => {
    setShareOpen(false)
    const url = `${window.location.origin}/watch/${videoId}`
    try {
      await navigator.share({ title: metadata?.video_title || '動画', url })
    } catch { /* ignore */ }
  }

  const handleLike = () => { setLiked(v => !v); if (disliked) setDisliked(false) }
  const handleDislike = () => { setDisliked(v => !v); if (liked) setLiked(false) }
  const handleWatchSubscribe = () => {
    if (!metadata?.channel_id) return
    const next = libToggleSub({
      authorId: metadata.channel_id,
      author: metadata.channel_name || metadata.channel_id,
      authorThumbnails: metadata.channel_icon ? [{ url: metadata.channel_icon }] : undefined,
    })
    setWatchSubscribed(next)
    setToastMsg(next ? `${metadata.channel_name || 'チャンネル'} に登録しました` : `${metadata.channel_name || 'チャンネル'} の登録を解除しました`)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2500)
  }
  const handleFavorite = () => {
    if (!videoId || !metadata) return
    const next = toggleFavorite({
      videoId,
      title: metadata.video_title || videoId,
      author: metadata.channel_name || '',
      authorId: metadata.channel_id || '',
      channelIcon: metadata.channel_icon || undefined,
      lengthSeconds: metadata.duration_seconds || undefined,
    })
    setFavorited(next)
    setToastMsg(next ? 'お気に入りに追加しました' : 'お気に入りから削除しました')
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  const handleAddToPlaylist = (pl: LocalPlaylist) => {
    if (!videoId || !metadata) return
    addVideoToPlaylist(pl.id, {
      videoId,
      title: metadata.video_title || videoId,
      author: metadata.channel_name || '',
      authorId: metadata.channel_id || '',
      lengthSeconds: metadata.duration_seconds || undefined,
    })
    setToastMsg(`「${pl.title}」に追加しました`)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
    setPlMenuTick(t => t + 1)
  }

  const handleCreateAndAdd = () => {
    const name = plNewName.trim()
    if (!name || !videoId || !metadata) return
    const pl = createPlaylist(name)
    addVideoToPlaylist(pl.id, {
      videoId,
      title: metadata.video_title || videoId,
      author: metadata.channel_name || '',
      authorId: metadata.channel_id || '',
      lengthSeconds: metadata.duration_seconds || undefined,
    })
    setToastMsg(`「${name}」を作成して追加しました`)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
    setPlNewName('')
    setPlNewOpen(false)
    setPlMenuTick(t => t + 1)
  }

  // derived state
  const playingStream = streamMode === 'ytdlp' ? ytdlpPlaying : streamMode === 'rapid' ? rapidPlaying : streamMode === 'hdad' ? null : invPlaying
  const streamLoading = streamMode === 'ytdlp' ? ytdlpLoading : streamMode === 'rapid' ? rapidLoading : streamMode === 'hdad' ? hdadLoading : invLoading
  const streamError   = streamMode === 'ytdlp' ? ytdlpError   : streamMode === 'rapid' ? rapidError   : streamMode === 'hdad' ? hdadError   : invError

  const YTDLP_TABS = [
    { key: 'mp4', label: 'MP4', hidden: ytdlpTabState === 'hls-only' },
    { key: 'video', label: '映像のみ', hidden: ytdlpTabState === 'hls-only' },
    { key: 'audio', label: '音声のみ', hidden: ytdlpTabState === 'hls-only' },
    { key: 'hls', label: 'HLS', hidden: ytdlpTabState === 'no-hls' },
  ]
  const INV_TABS = [
    { key: 'mp4', label: 'MP4', hidden: invTabState === 'hls-only' },
    { key: 'video', label: '映像のみ', hidden: invTabState === 'hls-only' },
    { key: 'audio', label: '音声のみ', hidden: invTabState === 'hls-only' },
    { key: 'hls', label: 'HLS', hidden: invTabState === 'no-hls' },
  ]
  const RAPID_TABS = [
    { key: 'mp4',   label: 'MP4',    hidden: rapidTabState === 'hls-only' },
    { key: 'video', label: '映像のみ', hidden: rapidTabState === 'hls-only' },
    { key: 'audio', label: '音声のみ', hidden: rapidTabState === 'hls-only' },
    { key: 'hls',   label: 'HLS',    hidden: rapidTabState === 'no-hls' || rapidTabState === null },
  ]

  const ytdlpRaw = ytdlpStreams
    ? [...filterStreams(ytdlpStreams, ytdlpFilter)].sort((a, b) => qNum(b.quality) - qNum(a.quality))
    : []
  const ytdlpShowToggle = ytdlpFilter === 'video' || ytdlpFilter === 'audio'
  const ytdlpDisplayed  = ytdlpShowToggle ? dedupStreams(ytdlpRaw, ytdlpShowAll) : ytdlpRaw

  const invRaw      = invStreams
    ? [...filterStreams(invStreams, invFilter)].sort((a, b) => qNum(b.quality) - qNum(a.quality))
    : []
  const invDisplayed = dedupStreams(invRaw, invShowAll)

  const rapidRaw      = rapidStreams
    ? [...filterStreams(rapidStreams, rapidFilter)].sort((a, b) => qNum(b.quality) - qNum(a.quality))
    : []
  const rapidDisplayed  = dedupStreams(rapidRaw, rapidShowAll)
  const rapidShowToggle = rapidFilter === 'video' || rapidFilter === 'audio'

  const noStreamsInCategory = !streamLoading && !streamError && (
    (streamMode === 'ytdlp' && ytdlpStreams !== null && ytdlpRaw.length === 0) ||
    (streamMode === 'invidious' && invStreams !== null && invRaw.length === 0) ||
    (streamMode === 'rapid' && rapidStreams !== null && rapidRaw.length === 0)
  )

  useEffect(() => {
    if (noStreamsInCategory && playerRef.current) {
      const mediaEl = playerRef.current.querySelector('video, audio') as HTMLMediaElement | null
      if (mediaEl) mediaEl.pause()
    }
  }, [noStreamsInCategory])

  useEffect(() => {
    // streamMode が ytdlp / invidious / rapid 以外（edu, nocookie）のときは playerRef を使わない
    if (streamMode !== 'ytdlp' && streamMode !== 'invidious' && streamMode !== 'rapid') return
    if (!playingStream || !playerRef.current) return
    const savedTime = lastTimeRef.current
    setCurrentUrl(playingStream.url)
    const container = playerRef.current

    const rebuild = (): HTMLVideoElement | HTMLAudioElement | null => {
      // 古いメディア要素を先に停止してから DOM を置き換える（音の二重再生防止）
      // innerHTML の上書きで古い要素は破棄されるため pause() のみで十分
      const old = container.querySelector('video, audio') as HTMLMediaElement | null
      if (old) old.pause()
      if (playingStream.isHLS) {
        container.innerHTML = `<video style="width:100%;height:100%;display:block;"><source src="${playingStream.url}" type="application/x-mpegURL"></video>`
      } else if (playingStream.format === 'audio' || (!playingStream.hasVideo && playingStream.hasAudio)) {
        const mime = playingStream.container === 'webm' ? 'audio/webm' : 'audio/mp4'
        container.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;padding:0 16px;box-sizing:border-box;"><audio controls style="width:100%;"><source src="${playingStream.url}" type="${mime}"></audio></div>`
      } else {
        const mime = playingStream.container === 'webm' ? 'video/webm' : 'video/mp4'
        container.innerHTML = `<video style="width:100%;height:100%;display:block;"><source src="${playingStream.url}" type="${mime}"></video>`
      }
      return container.querySelector('video, audio') as HTMLVideoElement | HTMLAudioElement | null
    }

    const mediaEl = rebuild()
    if (!mediaEl) return

    let retryCount = 0
    const MAX_RETRY = 5
    const onLoaded = () => {
      const target = clipStartSecRef.current >= 0 ? clipStartSecRef.current : savedTime
      if (target > 0 && isFinite(target)) (mediaEl as HTMLVideoElement).currentTime = target
      // モード切替（savedTime > 0）は常に再生継続。0:00からは autoplay 設定に従う
      // サムネイル表示中は自動再生しない
      if (!showThumbnailRef.current && (savedTime > 0 || autoplayEnabledRef.current)) {
        ;(mediaEl as HTMLVideoElement).play().catch(() => {})
      }
    }
    mediaEl.addEventListener('loadedmetadata', onLoaded, { once: true })

    const seekToStart = (shouldPlay: boolean) => {
      const startSec = clipStartSecRef.current >= 0 ? clipStartSecRef.current : 0
      ;(mediaEl as HTMLVideoElement).currentTime = startSec
      if (shouldPlay) {
        ;(mediaEl as HTMLVideoElement).play().catch(() => {})
      } else {
        ;(mediaEl as HTMLVideoElement).pause()
      }
    }

    const onTimeUpdate = () => {
      const endSec = clipEndSecRef.current
      if (endSec >= 0 && (mediaEl as HTMLVideoElement).currentTime >= endSec) {
        if (loopEnabledRef.current) {
          seekToStart(autoplayEnabledRef.current)
        } else {
          (mediaEl as HTMLVideoElement).pause()
          ;(mediaEl as HTMLVideoElement).currentTime = endSec
        }
      }
    }
    mediaEl.addEventListener('timeupdate', onTimeUpdate)

    // ended は動画が再生されて自然終了した場合のみ発火するため、自動再生設定に従って再生
    const onEnded = () => {
      if (loopEnabledRef.current) {
        seekToStart(autoplayEnabledRef.current)
      } else if (autoNextEnabledRef.current) {
        if (listIdRef.current) {
          playNextRef.current()
        } else if (localPlIdRef.current && localPlDataRef.current) {
          const nextIdx = localPlIndexRef.current + 1
          const vids = localPlDataRef.current.videos
          if (nextIdx < vids.length) {
            navigateRef.current(`/watch/${vids[nextIdx].videoId}?localpl=${encodeURIComponent(localPlIdRef.current)}&index=${nextIdx}`)
          }
        } else {
          const next = relatedVideosRef.current[0]
          if (next) navigateRef.current(`/watch/${next.videoId}`)
        }
      }
    }
    mediaEl.addEventListener('ended', onEnded)

    const onError = () => {
      if (retryCount >= MAX_RETRY) return
      retryCount++
      container.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p style="color:#e88;font-size:14px;">読み込みエラー発生 — 再読み込み中... (${retryCount}/${MAX_RETRY})</p></div>`
      setTimeout(() => {
        if (!container.querySelector('.spinner')) return
        const el = rebuild()
        if (el) {
          el.addEventListener('loadedmetadata', onLoaded, { once: true })
          el.addEventListener('error', onError, { once: true })
        }
      }, 1500 * retryCount)
    }
    mediaEl.addEventListener('error', onError, { once: true })

    // --- カスタムコントロール同期 ---
    const isVid = mediaEl.tagName === 'VIDEO'
    setCtrlIsVideo(isVid)
    if (isVid) {
      activeMediaRef.current = mediaEl as HTMLVideoElement
      setCtrlPlaying(false); setCtrlCurrentTime(0); setCtrlDuration(0)
      setCtrlVolume((mediaEl as HTMLVideoElement).volume)
      setCtrlMuted((mediaEl as HTMLVideoElement).muted)
      const savedRate = (() => { try { const r = parseFloat(localStorage.getItem(SPEED_KEY) ?? ''); return isNaN(r) ? 1 : r } catch { return 1 } })()
      ;(mediaEl as HTMLVideoElement).playbackRate = savedRate
      setCtrlRate(savedRate); setCtrlBuffered(0); setCtrlVisible(true)
    }
    const syncPlaying  = () => setCtrlPlaying(!(mediaEl as HTMLVideoElement).paused)
    const syncTime     = () => {
      const v = mediaEl as HTMLVideoElement
      setCtrlCurrentTime(v.currentTime)
      if (v.buffered.length > 0) setCtrlBuffered(v.buffered.end(v.buffered.length - 1))
    }
    const syncDuration = () => setCtrlDuration((mediaEl as HTMLVideoElement).duration || 0)
    const syncVolume   = () => {
      setCtrlVolume((mediaEl as HTMLVideoElement).volume)
      setCtrlMuted((mediaEl as HTMLVideoElement).muted)
    }
    const syncRate     = () => setCtrlRate((mediaEl as HTMLVideoElement).playbackRate)
    if (isVid) {
      mediaEl.addEventListener('play',           syncPlaying)
      mediaEl.addEventListener('pause',          syncPlaying)
      mediaEl.addEventListener('timeupdate',     syncTime)
      mediaEl.addEventListener('durationchange', syncDuration)
      mediaEl.addEventListener('volumechange',   syncVolume)
      mediaEl.addEventListener('ratechange',     syncRate)
    }

    return () => {
      // クリーンアップ時にメディア要素を必ず停止する（音の二重再生防止）
      mediaEl.pause()
      mediaEl.removeEventListener('loadedmetadata', onLoaded)
      mediaEl.removeEventListener('error',          onError)
      mediaEl.removeEventListener('timeupdate', onTimeUpdate)
      mediaEl.removeEventListener('ended', onEnded)
      if (isVid) {
        mediaEl.removeEventListener('play',           syncPlaying)
        mediaEl.removeEventListener('pause',          syncPlaying)
        mediaEl.removeEventListener('timeupdate',     syncTime)
        mediaEl.removeEventListener('durationchange', syncDuration)
        mediaEl.removeEventListener('volumechange',   syncVolume)
        mediaEl.removeEventListener('ratechange',     syncRate)
        activeMediaRef.current = null
        setCtrlIsVideo(false)
      }
    }
  }, [playingStream, streamMode])

  // --- HD+AD 分離ストリーム再生 ---
  useEffect(() => {
    if (streamMode !== 'hdad') return
    if (!hdadVideoPlaying || !playerRef.current) return

    const savedTime = lastTimeRef.current
    const container = playerRef.current

    const vmime = hdadVideoPlaying.container === 'webm' ? 'video/webm' : 'video/mp4'
    container.innerHTML = `<video style="width:100%;height:100%;display:block;"><source src="${hdadVideoPlaying.url}" type="${vmime}"></video>`
    const videoEl = container.querySelector('video') as HTMLVideoElement | null
    if (!videoEl) return

    let audioEl: HTMLAudioElement | null = null
    if (hdadAudioPlaying) {
      const amime = hdadAudioPlaying.container === 'webm' ? 'audio/webm' : 'audio/mp4'
      audioEl = new Audio()
      audioEl.src = hdadAudioPlaying.url
      audioEl.preload = 'auto'
      hdadAudioRef.current = audioEl
    }

    const onPlay = () => {
      if (!audioEl) return
      if (Math.abs(audioEl.currentTime - videoEl.currentTime) > 0.1) {
        audioEl.currentTime = videoEl.currentTime
      }
      audioEl.playbackRate = videoEl.playbackRate
      audioEl.volume = videoEl.muted ? 0 : videoEl.volume
      audioEl.muted = videoEl.muted
      audioEl.play().catch(() => {})
    }
    const onPause = () => { if (audioEl) audioEl.pause() }
    const onSeeked = () => { if (audioEl) audioEl.currentTime = videoEl.currentTime }
    const onVolumeChange = () => {
      if (!audioEl) return
      audioEl.volume = videoEl.muted ? 0 : videoEl.volume
      audioEl.muted = videoEl.muted
    }
    const onRateChange = () => { if (audioEl) audioEl.playbackRate = videoEl.playbackRate }

    const onTimeUpdate = () => {
      if (audioEl && !videoEl.paused) {
        const drift = Math.abs(videoEl.currentTime - audioEl.currentTime)
        if (drift > 0.3) audioEl.currentTime = videoEl.currentTime
      }
      const endSec = clipEndSecRef.current
      if (endSec >= 0 && videoEl.currentTime >= endSec) {
        if (loopEnabledRef.current) {
          const startSec = clipStartSecRef.current >= 0 ? clipStartSecRef.current : 0
          videoEl.currentTime = startSec
          if (autoplayEnabledRef.current) videoEl.play().catch(() => {})
          else videoEl.pause()
        } else {
          videoEl.pause()
          videoEl.currentTime = endSec
        }
      }
    }
    const onEnded = () => {
      if (loopEnabledRef.current) {
        const startSec = clipStartSecRef.current >= 0 ? clipStartSecRef.current : 0
        videoEl.currentTime = startSec
        if (autoplayEnabledRef.current) videoEl.play().catch(() => {})
      } else if (autoNextEnabledRef.current) {
        if (listIdRef.current) {
          playNextRef.current()
        } else if (localPlIdRef.current && localPlDataRef.current) {
          const nextIdx = localPlIndexRef.current + 1
          const vids = localPlDataRef.current.videos
          if (nextIdx < vids.length) {
            navigateRef.current(`/watch/${vids[nextIdx].videoId}?localpl=${encodeURIComponent(localPlIdRef.current)}&index=${nextIdx}`)
          }
        } else {
          const next = relatedVideosRef.current[0]
          if (next) navigateRef.current(`/watch/${next.videoId}`)
        }
      }
    }

    const onLoadedMetadata = () => {
      const target = clipStartSecRef.current >= 0 ? clipStartSecRef.current : savedTime
      if (target > 0 && isFinite(target)) videoEl.currentTime = target
      // サムネイル表示中は自動再生しない
      if (!showThumbnailRef.current && (savedTime > 0 || autoplayEnabledRef.current)) {
        videoEl.play().catch(() => {})
      }
    }
    videoEl.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
    videoEl.addEventListener('play', onPlay)
    videoEl.addEventListener('pause', onPause)
    videoEl.addEventListener('seeked', onSeeked)
    videoEl.addEventListener('volumechange', onVolumeChange)
    videoEl.addEventListener('ratechange', onRateChange)
    videoEl.addEventListener('timeupdate', onTimeUpdate)
    videoEl.addEventListener('ended', onEnded)

    activeMediaRef.current = videoEl
    setCtrlIsVideo(true)
    setCtrlPlaying(false); setCtrlCurrentTime(0); setCtrlDuration(0)
    setCtrlVolume(videoEl.volume); setCtrlMuted(videoEl.muted)
    const savedRate2 = (() => { try { const r = parseFloat(localStorage.getItem(SPEED_KEY) ?? ''); return isNaN(r) ? 1 : r } catch { return 1 } })()
    videoEl.playbackRate = savedRate2
    setCtrlRate(savedRate2); setCtrlBuffered(0); setCtrlVisible(true)

    const syncPlaying  = () => setCtrlPlaying(!videoEl.paused)
    const syncTime     = () => {
      setCtrlCurrentTime(videoEl.currentTime)
      if (videoEl.buffered.length > 0) setCtrlBuffered(videoEl.buffered.end(videoEl.buffered.length - 1))
    }
    const syncDuration = () => setCtrlDuration(videoEl.duration || 0)
    const syncVolume   = () => { setCtrlVolume(videoEl.volume); setCtrlMuted(videoEl.muted) }
    const syncRate     = () => setCtrlRate(videoEl.playbackRate)
    videoEl.addEventListener('play',           syncPlaying)
    videoEl.addEventListener('pause',          syncPlaying)
    videoEl.addEventListener('timeupdate',     syncTime)
    videoEl.addEventListener('durationchange', syncDuration)
    videoEl.addEventListener('volumechange',   syncVolume)
    videoEl.addEventListener('ratechange',     syncRate)

    return () => {
      videoEl.removeEventListener('loadedmetadata', onLoadedMetadata)
      videoEl.removeEventListener('play', onPlay)
      videoEl.removeEventListener('pause', onPause)
      videoEl.removeEventListener('seeked', onSeeked)
      videoEl.removeEventListener('volumechange', onVolumeChange)
      videoEl.removeEventListener('ratechange', onRateChange)
      videoEl.removeEventListener('timeupdate', onTimeUpdate)
      videoEl.removeEventListener('ended', onEnded)
      videoEl.removeEventListener('play',           syncPlaying)
      videoEl.removeEventListener('pause',          syncPlaying)
      videoEl.removeEventListener('timeupdate',     syncTime)
      videoEl.removeEventListener('durationchange', syncDuration)
      videoEl.removeEventListener('volumechange',   syncVolume)
      videoEl.removeEventListener('ratechange',     syncRate)
      activeMediaRef.current = null
      setCtrlIsVideo(false)
      if (audioEl) {
        audioEl.pause()
        audioEl.src = ''
        hdadAudioRef.current = null
      }
    }
  }, [hdadVideoPlaying, hdadAudioPlaying, streamMode])  // eslint-disable-line react-hooks/exhaustive-deps

  // --- iframe 再生位置トラッキング ---

  // iframe に listening メッセージを送ってハンドシェイクを完了させるヘルパー
  const sendListening = useCallback(() => {
    const el = iframeRef.current
    if (!el?.contentWindow) return
    try { el.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*') } catch { /* ignore */ }
  }, [])

  // nocookie モードに切り替わったときハンドシェイクを試みる
  useEffect(() => {
    if (streamMode !== 'nocookie') return
    iframeTimeRef.current = 0
    const t = setTimeout(sendListening, 1500)
    return () => clearTimeout(t)
  }, [streamMode])  // eslint-disable-line react-hooks/exhaustive-deps

  // eduUrl 確定後（非同期取得完了）にハンドシェイクを試みる
  useEffect(() => {
    if (streamMode !== 'edu' || !eduUrl) return
    iframeTimeRef.current = 0
    const t = setTimeout(sendListening, 1500)
    return () => clearTimeout(t)
  }, [eduUrl])  // eslint-disable-line react-hooks/exhaustive-deps

  // loopEnabled 変化時に edu / nocookie の URL を再ビルドして loop=1&playlist= を反映させる
  // iframeTimeRef.current で現在の再生位置を取得し、再構築後も同じ位置から再生を再開する
  const isFirstLoopRender = useRef(true)
  useEffect(() => {
    if (isFirstLoopRender.current) { isFirstLoopRender.current = false; return }
    const currentTime = iframeTimeRef.current > 0 ? Math.floor(iframeTimeRef.current) : -1
    const startSec = clipStartSecRef.current >= 0 ? clipStartSecRef.current :
      (currentTime >= 0 ? currentTime : embedStartSec)
    if (streamMode === 'edu' && videoId && eduParamType) {
      buildEduUrl(eduParamType, videoId, startSec, false)
    }
    // nocookie は nocookieUrl の useEffect (deps に loopEnabled) が直接 iframeTimeRef を読んで再ビルドする
  }, [loopEnabled])  // eslint-disable-line react-hooks/exhaustive-deps

  // YouTube IFrame API の postMessage を受け取り currentTime を更新
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (streamMode !== 'edu' && streamMode !== 'nocookie') return
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (!data) return
        if (data.event === 'readyToListen') {
          sendListening()
        } else if (data.event === 'infoDelivery') {
          const t = data.info?.currentTime ?? data.info?.currentTimeFloat
          if (typeof t === 'number' && isFinite(t) && t > 0) {
            iframeTimeRef.current = t
          }
          // メタデータ取得に失敗した場合のフォールバック: YouTubeプレーヤーから duration を補完
          const d = data.info?.duration
          if (typeof d === 'number' && isFinite(d) && d > 0 && durationRef.current === 0) {
            durationRef.current = d
          }
        } else if (data.event === 'onStateChange') {
          // 再生状態を追跡 (1=playing, 2=paused, 0=ended)
          if (data.info === 1) iframePlayingRef.current = true
          else if (data.info === 0 || data.info === 2) iframePlayingRef.current = false
        }
        if (data.event === 'onStateChange' && (data.info === 0 || data.info === 2)) {
          // info=0: 自然終了 / info=2: 一時停止（YouTubeが終了1秒前頃にpauseを送ることがある）
          // ループが有効な場合、終了 or 動画終端付近でのpauseなら先頭に戻って再生
          if (loopEnabledRef.current) {
            const isEnded = data.info === 0
            // ポーリング遅延（1秒周期）を考慮し、5秒以内を「終端付近」とみなす
            const isNearEnd = data.info === 2 && durationRef.current > 0 && iframeTimeRef.current > 0 &&
              (durationRef.current - iframeTimeRef.current) <= 5
            if (isEnded || isNearEnd) {
              const el = iframeRef.current
              if (el?.contentWindow) {
                const startSec = clipStartSecRef.current >= 0 ? clipStartSecRef.current : 0
                if (autoplayEnabledRef.current) {
                  // 自動再生ON: loadVideoById で先頭から再生
                  try {
                    el.contentWindow.postMessage(JSON.stringify({
                      event: 'command', func: 'loadVideoById',
                      args: [{ videoId: videoId, startSeconds: startSec }]
                    }), '*')
                  } catch { /* ignore */ }
                } else {
                  // 自動再生OFF: 先頭にシークしてポーズ（再生しない）
                  try {
                    el.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [startSec, true] }), '*')
                  } catch { /* ignore */ }
                  setTimeout(() => {
                    try {
                      el.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*')
                    } catch { /* ignore */ }
                  }, 200)
                }
              }
            }
          }
        }
      } catch { /* ignore */ }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [streamMode, sendListening])

  // 定期ポーリングで currentTime を取得し、シーク後も正確な位置を追跡する
  useEffect(() => {
    if (streamMode !== 'edu' && streamMode !== 'nocookie') return
    const poll = () => {
      const el = iframeRef.current
      if (!el?.contentWindow) return
      try {
        el.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'getCurrentTime', args: [] }), '*')
      } catch { /* ignore */ }
      // 終了位置チェック
      const endSec = clipEndSecRef.current
      if (endSec >= 0 && iframeTimeRef.current > 0 && iframeTimeRef.current >= endSec) {
        if (loopEnabledRef.current) {
          const startSec = clipStartSecRef.current >= 0 ? clipStartSecRef.current : 0
          if (autoplayEnabledRef.current) {
            // 自動再生ON: 先頭から再生
            try {
              el.contentWindow.postMessage(JSON.stringify({
                event: 'command', func: 'loadVideoById',
                args: [{ videoId: videoId, startSeconds: startSec }]
              }), '*')
            } catch { /* ignore */ }
          } else {
            // 自動再生OFF: 先頭にシークしてポーズ
            try {
              el.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [startSec, true] }), '*')
            } catch { /* ignore */ }
            setTimeout(() => {
              try {
                el.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*')
              } catch { /* ignore */ }
            }, 200)
          }
        } else {
          try { el.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*') } catch { /* ignore */ }
        }
      }
    }
    const t = setTimeout(poll, 2000)
    const interval = setInterval(poll, 1000)
    return () => { clearTimeout(t); clearInterval(interval) }
  }, [streamMode, eduUrl])  // eslint-disable-line react-hooks/exhaustive-deps

  const buildEduUrl = useCallback(async (paramType: string, vid: string, startSec = 0, forcePlay = false) => {
    setEduLoading(true)
    setEduError('')
    setEduUrl(null)
    // 開始時間をURLに埋め込むヘルパー: 既存の start= を上書き or 末尾に追加
    const withStart = (url: string, sec: number) => {
      if (sec <= 0) return url
      return url.replace(/([?&])start=[^&]*/g, '') + `&start=${Math.floor(sec)}`
    }
    try {
      const res = await fetch(`/api/edu/params/${encodeURIComponent(paramType)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as { params: string; error?: string }
      if (json.error) throw new Error(json.error)
      const params = json.params || ''
      // enablejsapi=1 を強制（既存の enablejsapi=0 なども上書き）
      // origin= はパラメータによって別ドメインが指定されている場合があり postMessage をブロックするため除去
      const addJsApi = (url: string) => {
        let result = url
          .replace(/([?&])enablejsapi=[^&]*/g, '')
          .replace(/([?&])origin=[^&]*/g, '')
          .replace(/([?&])autoplay=[^&]*/g, '')
          .replace(/([?&])loop=[^&]*/g, '')
          .replace(/([?&])playlist=[^&]*/g, '')
          .replace(/\?&/g, '?')
          .replace(/&&+/g, '&')
          .replace(/[?&]$/, '')
        // ?が削除されて&パラメータだけ残った場合、最初の&を?に変換
        if (!result.includes('?') && result.includes('&')) {
          result = result.replace('&', '?')
        }
        result += (result.includes('?') ? '&' : '?') + `autoplay=${(autoplayEnabledRef.current || forcePlay) ? '1' : '0'}&enablejsapi=1`
        if (loopEnabledRef.current) {
          result += `&loop=1&playlist=${vid}`
        }
        return result
      }
      setEduUrl(addJsApi(withStart(`https://www.youtubeeducation.com/embed/${vid}${params}`, startSec)))
    } catch (e) {
      setEduError(`パラメータの取得に失敗しました: ${(e as Error).message}`)
    } finally {
      setEduLoading(false)
    }
  }, [])

  // nocookieUrl は videoId / embedStartSec / loopEnabled が変わった時に再構築する。
  // loopEnabled 変化時は iframeTimeRef.current（追跡中の現在位置）を start に使い位置を保持する。
  // loop=1&playlist=videoId を使って YouTube ネイティブのループ機能を利用する。
  const [nocookieUrl, setNocookieUrl] = useState('')
  useEffect(() => {
    // loopEnabled 変化起因のリビルドでは iframeTimeRef.current を優先して現在位置を保持する
    const iframeTime = iframeTimeRef.current > 0 ? Math.floor(iframeTimeRef.current) : -1
    const startSec = clipStartSecRef.current >= 0 ? clipStartSecRef.current :
      (iframeTime >= 0 ? iframeTime : embedStartSec)
    const shouldAutoplay = autoplayEnabledRef.current || forceAutoplayRef.current
    const loopParams = (loopEnabled && !listIdRef.current) ? `&loop=1&playlist=${videoId}` : ''
    setNocookieUrl(
      `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${shouldAutoplay ? '1' : '0'}&controls=1&rel=0&enablejsapi=1${startSec > 0 ? `&start=${startSec}` : ''}${loopParams}`
    )
    forceAutoplayRef.current = false
  }, [videoId, embedStartSec, loopEnabled])  // eslint-disable-line react-hooks/exhaustive-deps

  // 一時停止中はコントロールを常に表示
  useEffect(() => {
    if (!ctrlPlaying) {
      setCtrlVisible(true)
      if (ctrlHideTimerRef.current) clearTimeout(ctrlHideTimerRef.current)
    }
  }, [ctrlPlaying])

  // --- キーボードショートカット ---
  useEffect(() => {
    const RATES = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
    const sendIframeCmd = (func: string, args: unknown[] = []) => {
      try { iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*') } catch { /* ignore */ }
    }
    const getMediaEl = () => (streamMode === 'hdad' ? activeMediaRef.current : playerRef.current?.querySelector('video, audio')) as HTMLVideoElement | null
    const isNative = () => streamMode === 'ytdlp' || streamMode === 'invidious' || streamMode === 'rapid' || streamMode === 'hdad'
    const isIframe = () => streamMode === 'nocookie' || streamMode === 'edu'

    const togglePlay = () => {
      if (isNative()) {
        const m = getMediaEl(); if (!m) return
        m.paused ? m.play().catch(() => {}) : m.pause()
      } else if (isIframe()) {
        iframePlayingRef.current ? sendIframeCmd('pauseVideo') : sendIframeCmd('playVideo')
      }
    }
    const seek = (delta: number) => {
      if (isNative()) {
        const m = getMediaEl(); if (!m) return
        m.currentTime = Math.max(0, Math.min(m.duration || Infinity, m.currentTime + delta))
      } else if (isIframe()) {
        sendIframeCmd('seekTo', [Math.max(0, iframeTimeRef.current + delta), true])
      }
    }
    const changeVolume = (delta: number) => {
      const m = getMediaEl(); if (!m) return
      m.volume = Math.max(0, Math.min(1, m.volume + delta))
      if (delta > 0 && m.muted) m.muted = false
    }
    const seekPercent = (n: number) => {
      if (isNative()) {
        const m = getMediaEl(); if (!m || !isFinite(m.duration)) return
        m.currentTime = m.duration * n
      } else if (isIframe() && durationRef.current > 0) {
        sendIframeCmd('seekTo', [durationRef.current * n, true])
      }
    }
    const changeRate = (dir: 1 | -1) => {
      const m = getMediaEl(); if (!m) return
      const idx = RATES.findIndex(r => Math.abs(r - m.playbackRate) < 0.01)
      const next = RATES[Math.max(0, Math.min(RATES.length - 1, (idx === -1 ? 3 : idx) + dir))]
      if (next !== undefined) m.playbackRate = next
    }
    const toggleFullscreen = () => {
      const el = (isNative() ? (nativePlayerWrapRef.current ?? playerRef.current) : iframeRef.current) as HTMLElement | null
      if (!el) return
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      else el.requestFullscreen().catch(() => {})
    }

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement).isContentEditable) return

      switch (e.key) {
        case ' ': case 'k': case 'K':
          e.preventDefault(); togglePlay(); break
        case 'ArrowLeft': case 'j': case 'J':
          e.preventDefault(); seek(e.shiftKey ? -10 : -5); break
        case 'ArrowRight': case 'l': case 'L':
          e.preventDefault(); seek(e.shiftKey ? 10 : 5); break
        case 'ArrowUp':
          e.preventDefault(); changeVolume(0.05); break
        case 'ArrowDown':
          e.preventDefault(); changeVolume(-0.05); break
        case 'm': case 'M': {
          const m = getMediaEl(); if (m) m.muted = !m.muted; break
        }
        case 'f': case 'F':
          e.preventDefault(); toggleFullscreen(); break
        case 'p': case 'P': {
          const m = getMediaEl()
          if (m && document.pictureInPictureEnabled) {
            if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {})
            else m.requestPictureInPicture().catch(() => {})
          }
          break
        }
        case '0': case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8': case '9':
          seekPercent(parseInt(e.key) * 0.1); break
        case ',':
          if (isNative()) { const m = getMediaEl(); if (m) { m.pause(); m.currentTime = Math.max(0, m.currentTime - 1/30) } }; break
        case '.':
          if (isNative()) { const m = getMediaEl(); if (m) { m.pause(); m.currentTime = m.currentTime + 1/30 } }; break
        case '<':
          changeRate(-1); break
        case '>':
          changeRate(1); break
        case '?':
          setShortcutHelpOpen(v => !v); break
        case 'Escape':
          setShortcutHelpOpen(false); break
        default: break
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [streamMode])  // eslint-disable-line react-hooks/exhaustive-deps

  const downloadThumb = async (src: string, filename: string) => {
    try {
      const res = await fetch(`/api/thumbnail/proxy?url=${encodeURIComponent(src)}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      const a = document.createElement('a')
      a.href = src
      a.download = filename
      a.target = '_blank'
      a.click()
    }
  }

  const applyClip = () => {
    // 適用ボタン押下時にのみ ref を更新する（入力中は反映しない）
    const parsedStart = parseTimeSec(clipStart)
    const parsedEnd   = parseTimeSec(clipEnd)
    clipStartSecRef.current = parsedStart
    clipEndSecRef.current   = parsedEnd
    const startSec = parsedStart >= 0 ? parsedStart : 0
    if (streamMode === 'ytdlp' || streamMode === 'invidious') {
      const m = playerRef.current?.querySelector('video, audio') as HTMLVideoElement | null
      if (m) {
        m.currentTime = startSec
        if (autoplayEnabledRef.current) {
          m.play().catch(() => {})
        } else {
          m.pause()
        }
      }
    } else if (streamMode === 'edu') {
      setEmbedStartSec(startSec)
      if (videoId) buildEduUrl(eduParamType, videoId, startSec, false)
    } else if (streamMode === 'nocookie') {
      forceAutoplayRef.current = false
      setEmbedStartSec(startSec)
    }
  }

  const renderQualityOptions = (
    streams: Stream[] | null,
    displayed: Stream[],
    playing: Stream | null,
    setPlaying: (s: Stream) => void,
    loading: boolean,
    error: string,
    showToggle: boolean,
    raw: Stream[],
    showAll: boolean,
    setShowAll: React.Dispatch<React.SetStateAction<boolean>>
  ) => (
    <div className="quality-options">
      {loading ? (
        <span className="stream-loading-msg">ストリームを読み込み中...</span>
      ) : error ? (
        <span className="stream-error-msg">{error}</span>
      ) : displayed.length === 0 && streams ? (
        <span className="stream-empty-msg">このカテゴリには再生可能なストリームがありません</span>
      ) : (
        displayed.map((s, i) => {
          const checked = getQCheck(videoId!, s.quality)
          return (
            <div key={i} className="quality-option-wrap">
              <button
                className={`quality-option${playing === s || playing?.url === s.url ? ' selected' : ''}`}
                onClick={() => { saveTime(); setPlaying(s) }}
              >
                {s.quality}
              </button>
              <span
                className="quality-check"
                title="メモ用チェック"
                onClick={() => { setQCheck(videoId!, s.quality, !getQCheck(videoId!, s.quality)); forceUpdate(v => v + 1) }}
              >
                {checked ? '✅' : '□'}
              </span>
            </div>
          )
        })
      )}
      {showToggle && !loading && !error && raw.length > 0 && (
        <button className="quality-option show-all-btn" onClick={() => setShowAll(v => !v)}>
          {showAll ? '各項目ごとに読み込み' : '全項目読み込み'}
        </button>
      )}
    </div>
  )

  return (
    <div className="watch-container">
      <div className="video-section">
        {/* 再生方法ボタン */}
        <div className="stream-buttons">
          {[
            { key: 'ytdlp', label: 'ytdlpストリーム' },
            { key: 'invidious', label: 'invidiousストリーム' },
            { key: 'rapid', label: 'rapidストリーム' },
            { key: 'hdad', label: 'HD+AD' },
            { key: 'nocookie', label: 'nocookie再生' },
          ].map(m => (
            <button
              key={m.key}
              className={`stream-btn${!showThumbnail && streamMode === m.key ? ' active' : ''}`}
              onClick={() => switchMode(m.key)}
            >
              {m.label}
            </button>
          ))}
          <button
            className={`stream-btn${!showThumbnail && streamMode === 'edu' ? ' active' : ''}`}
            onClick={() => switchMode('edu')}
          >
            edu再生
          </button>
          <button
            className={`stream-btn${showThumbnail ? ' active' : ''}`}
            onClick={() => {
              if (!showThumbnail) {
                const m = activeMediaRef.current ?? (playerRef.current?.querySelector('video, audio') as HTMLVideoElement | null)
                if (m && !m.paused) m.pause()
              }
              setShowThumbnail(s => {
                const next = !s
                try { localStorage.setItem(THUMB_SHOW_KEY, String(next)) } catch { /* ignore */ }
                return next
              })
            }}
          >
            サムネイル
          </button>
        </div>

        {showThumbnail && (
          <div className="thumb-bar">
            <span className="thumb-bar-label">画質:</span>
            {thumbHost === 'base64' ? (
              <select className="thumb-select" disabled>
                <option>----</option>
              </select>
            ) : (
              <select
                className="thumb-select"
                value={thumbFile}
                onChange={e => {
                  setThumbFile(e.target.value)
                  try { localStorage.setItem(THUMB_FILE_KEY, e.target.value) } catch { /* ignore */ }
                }}
              >
                {THUMB_FILES.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            )}
            <span className="thumb-bar-label">ホスト:</span>
            <select
              className="thumb-select"
              value={thumbHost}
              onChange={e => {
                setThumbHost(e.target.value)
                try { localStorage.setItem(THUMB_HOST_KEY, e.target.value) } catch { /* ignore */ }
              }}
            >
              {THUMB_HOSTS.map(h => (
                <option key={h.key} value={h.key}>{h.label}</option>
              ))}
            </select>
            {thumbHost === 'base64' ? (
              base64ThumbSrc && (
                <>
                  <a
                    href={base64ThumbSrc}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="thumb-new-tab-btn"
                  >
                    別タブで開く
                  </a>
                  <button
                    className="thumb-open-btn"
                    onClick={() => {
                      const ext = base64ThumbSrc.startsWith('data:image/png') ? 'png' : base64ThumbSrc.startsWith('data:image/webp') ? 'webp' : 'jpg'
                      downloadThumb(base64ThumbSrc, `${videoId || 'thumbnail'}_base64.${ext}`)
                    }}
                  >
                    ダウンロード
                  </button>
                </>
              )
            ) : (
              <>
                <a
                  href={buildThumbnailUrl(thumbHost, videoId || '', thumbFile)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="thumb-new-tab-btn"
                >
                  別タブで開く
                </a>
                <button
                  className="thumb-open-btn"
                  onClick={() => downloadThumb(buildThumbnailUrl(thumbHost, videoId || '', thumbFile), thumbFile)}
                >
                  ダウンロード
                </button>
              </>
            )}
          </div>
        )}

        {streamMode === 'edu' && !showThumbnail && (
          <div className="edu-param-bar">
            <span className="edu-param-label">パラメータ:</span>
            <select
              className="edu-param-select"
              value={eduParamType}
              onChange={e => {
                const v = e.target.value
                setEduParamType(v)
                try { localStorage.setItem(EDU_PARAM_KEY, v) } catch { /* ignore */ }
                if (videoId) {
                  saveTime()
                  if (!resumeEnabledRef.current) {
                    lastTimeRef.current = clipStartSecRef.current >= 0 ? clipStartSecRef.current : 0
                  }
                  const s = Math.floor(lastTimeRef.current)
                  const wc = resumeEnabledRef.current && lastTimeRef.current > 0
                  forceAutoplayRef.current = wc; setEmbedStartSec(s); buildEduUrl(v, videoId, s, wc)
                }
              }}
            >
              {eduParamSources.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            {eduUrl && (() => {
              const idx = eduUrl.indexOf('/embed/' + videoId)
              const paramStr = idx !== -1 ? eduUrl.slice(idx + ('/embed/' + videoId).length) : ''
              const sourceUrl = eduParamSources.find(s => s.key === eduParamType)?.url
              return paramStr ? (
                <span className="edu-param-preview">
                  <span className="edu-param-preview-row">
                    <span className="edu-param-preview-label">現在のパラメータ: </span>
                    <span className="edu-param-preview-value">{paramStr}</span>
                  </span>
                  {sourceUrl && (
                    <a
                      className="edu-param-source-link"
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      </svg>
                      ソースを開く
                    </a>
                  )}
                </span>
              ) : null
            })()}
          </div>
        )}

        {/* ytdlp 画質セレクタ */}
        <div className={`quality-selector${streamMode === 'ytdlp' && !showThumbnail ? ' show' : ''}`} id="ytdlpQualitySelector">
          <div className="quality-tabs">
            {YTDLP_TABS.filter(t => !t.hidden).map(t => {
              const tabStreams = ytdlpStreams
                ? [...filterStreams(ytdlpStreams, t.key)].sort((a, b) => qNum(b.quality) - qNum(a.quality))
                : []
              const selectedUrl = !qualityPanelOpen && ytdlpFilter === t.key && ytdlpPlaying && tabStreams.some(s => s.url === ytdlpPlaying.url)
                ? ytdlpPlaying.url : ''
              return (
                <div key={t.key} className="tab-with-select">
                  <button
                    className={`quality-tab${ytdlpFilter === t.key ? ' active' : ''}`}
                    onClick={() => switchYtdlpFilter(t.key)}
                  >
                    {t.label}
                  </button>
                  {!qualityPanelOpen && ytdlpFilter === t.key && tabStreams.length > 0 && (
                    <select
                      className="tab-quality-select"
                      value={selectedUrl}
                      onChange={e => {
                        const stream = tabStreams.find(s => s.url === e.target.value)
                        if (!stream) return
                        switchYtdlpFilter(t.key)
                        setYtdlpPlaying(stream)
                      }}
                    >
                      {selectedUrl === '' && <option value="">—</option>}
                      {tabStreams.map((s, i) => <option key={i} value={s.url}>{s.quality}</option>)}
                    </select>
                  )}
                </div>
              )
            })}
            {ytdlpLogVisible && (
              <button
                id="btn-ytdlp-log"
                className={`log-btn${ytdlpLogOpen ? ' log-open' : ''}`}
                onClick={() => setYtdlpLogOpen(v => !v)}
              >
                ログ
              </button>
            )}
            <div className="quality-tabs-right">
              {ytdlpShowOtherApi && (
                <div className="other-api-row">
                  <select
                    ref={otherApiSelectRef}
                    className="api-select"
                    value={ytdlpOtherApiSelect}
                    onChange={e => { setYtdlpOtherApiSelect(e.target.value); fitSelectWidth(e.target) }}
                  >
                    <option value="auto">他のapi</option>
                    {YTDLP_ALL_SOURCES.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    className="quality-tab"
                    style={{ color: '#f90', textAlign: 'left' }}
                    onClick={() => reloadYtdlpOtherApi(ytdlpOtherApiSelect)}
                  >
                    で読み込む
                  </button>
                </div>
              )}
              {ytdlpShowOpenUrl && (
                <button className="quality-tab" style={{ color: '#adf' }} onClick={openStreamUrl}>
                  動画が再生されない場合はこちら
                </button>
              )}
              <button
                className={`panel-toggle-btn${qualityPanelOpen ? '' : ' closed'}`}
                title={qualityPanelOpen ? '閉じる' : '開く'}
                onClick={() => setQualityPanelOpen(v => !v)}
              >{qualityPanelOpen ? '−' : '+'}</button>
            </div>
          </div>
          {qualityPanelOpen && renderQualityOptions(
            ytdlpStreams, ytdlpDisplayed, ytdlpPlaying, setYtdlpPlaying,
            ytdlpLoading, ytdlpError, ytdlpShowToggle, ytdlpRaw, ytdlpShowAll, setYtdlpShowAll
          )}
        </div>

        {/* Invidious 画質セレクタ */}
        <div className={`quality-selector${streamMode === 'invidious' && !showThumbnail ? ' show' : ''}`} id="qualitySelector">
          <div className="quality-tabs">
            {INV_TABS.filter(t => !t.hidden).map(t => {
              const tabStreams = invStreams
                ? [...filterStreams(invStreams, t.key)].sort((a, b) => qNum(b.quality) - qNum(a.quality))
                : []
              const selectedUrl = !qualityPanelOpen && invFilter === t.key && invPlaying && tabStreams.some(s => s.url === invPlaying.url)
                ? invPlaying.url : ''
              return (
                <div key={t.key} className="tab-with-select">
                  <button
                    className={`quality-tab${invFilter === t.key ? ' active' : ''}`}
                    onClick={() => switchInvFilter(t.key)}
                  >
                    {t.label}
                  </button>
                  {!qualityPanelOpen && invFilter === t.key && tabStreams.length > 0 && (
                    <select
                      className="tab-quality-select"
                      value={selectedUrl}
                      onChange={e => {
                        const stream = tabStreams.find(s => s.url === e.target.value)
                        if (!stream) return
                        switchInvFilter(t.key)
                        setInvPlaying(stream)
                      }}
                    >
                      {selectedUrl === '' && <option value="">—</option>}
                      {tabStreams.map((s, i) => <option key={i} value={s.url}>{s.quality}</option>)}
                    </select>
                  )}
                </div>
              )
            })}
            {invLogVisible && (
              <button
                id="btn-inv-log"
                className={`log-btn${invLogOpen ? ' log-open' : ''}`}
                onClick={() => setInvLogOpen(v => !v)}
              >
                ログ
              </button>
            )}
            <div className="inv-region-row">
              <select
                className="inv-region-select"
                value={invRegionPending}
                onChange={e => setInvRegionPending(e.target.value as 'ja' | 'other')}
              >
                <option value="ja">日本語</option>
                <option value="other">その他</option>
              </select>
              <button
                className="inv-region-apply-btn"
                onClick={applyInvRegion}
                disabled={invRegionPending === invRegion}
              >
                適用
              </button>
            </div>
            <div className="quality-tabs-right">
              {invShowOtherInst && (
                <button className="quality-tab" style={{ color: '#f90' }} onClick={reloadInvOtherInstance}>
                  別のインスタンスで読み込む
                </button>
              )}
              {invShowOpenUrl && (
                <button className="quality-tab" style={{ color: '#adf' }} onClick={openStreamUrl}>
                  動画が再生されない場合はこちら
                </button>
              )}
              <button
                className={`panel-toggle-btn${qualityPanelOpen ? '' : ' closed'}`}
                title={qualityPanelOpen ? '閉じる' : '開く'}
                onClick={() => setQualityPanelOpen(v => !v)}
              >{qualityPanelOpen ? '−' : '+'}</button>
            </div>
          </div>
          {qualityPanelOpen && renderQualityOptions(
            invStreams, invDisplayed, invPlaying, setInvPlaying,
            invLoading, invError, true, invRaw, invShowAll, setInvShowAll
          )}
        </div>

        {/* Rapid 画質セレクタ */}
        <div className={`quality-selector${streamMode === 'rapid' && !showThumbnail ? ' show' : ''}`} id="rapidQualitySelector">
          <div className="quality-tabs">
            {RAPID_TABS.filter(t => !t.hidden).map(t => {
              const tabStreams = rapidStreams
                ? [...filterStreams(rapidStreams, t.key)].sort((a, b) => qNum(b.quality) - qNum(a.quality))
                : []
              const selectedUrl = !qualityPanelOpen && rapidFilter === t.key && rapidPlaying && tabStreams.some(s => s.url === rapidPlaying.url)
                ? rapidPlaying.url : ''
              return (
                <div key={t.key} className="tab-with-select">
                  <button
                    className={`quality-tab${rapidFilter === t.key ? ' active' : ''}`}
                    onClick={() => switchRapidFilter(t.key)}
                  >
                    {t.label}
                  </button>
                  {!qualityPanelOpen && rapidFilter === t.key && tabStreams.length > 0 && (
                    <select
                      className="tab-quality-select"
                      value={selectedUrl}
                      onChange={e => {
                        const stream = tabStreams.find(s => s.url === e.target.value)
                        if (!stream) return
                        switchRapidFilter(t.key)
                        setRapidPlaying(stream)
                      }}
                    >
                      {selectedUrl === '' && <option value="">—</option>}
                      {tabStreams.map((s, i) => <option key={i} value={s.url}>{s.quality}</option>)}
                    </select>
                  )}
                </div>
              )
            })}
            {rapidLogVisible && (
              <button
                id="btn-rapid-log"
                className={`log-btn${rapidLogOpen ? ' log-open' : ''}`}
                onClick={() => setRapidLogOpen(v => !v)}
              >
                ログ
              </button>
            )}
            <div className="quality-tabs-right">
              {!rapidLoading && rapidError && (
                <button className="quality-tab" style={{ color: '#f90' }} onClick={() => { if (videoId) loadRapid(videoId) }}>
                  再読み込み
                </button>
              )}
              {rapidShowOpenUrl && (
                <button className="quality-tab" style={{ color: '#adf' }} onClick={openStreamUrl}>
                  動画が再生されない場合はこちら
                </button>
              )}
              <button
                className={`panel-toggle-btn${qualityPanelOpen ? '' : ' closed'}`}
                title={qualityPanelOpen ? '閉じる' : '開く'}
                onClick={() => setQualityPanelOpen(v => !v)}
              >{qualityPanelOpen ? '−' : '+'}</button>
            </div>
          </div>
          {qualityPanelOpen && renderQualityOptions(
            rapidStreams, rapidDisplayed, rapidPlaying, setRapidPlaying,
            rapidLoading, rapidError, rapidShowToggle, rapidRaw, rapidShowAll, setRapidShowAll
          )}
        </div>

        {/* HD+AD 画質セレクタ */}
        <div className={`quality-selector${streamMode === 'hdad' && !showThumbnail ? ' show' : ''}`} id="hdadQualitySelector">
          <div className="quality-tabs">
            <div className="tab-with-select">
              <span className="quality-tab" style={{ color: '#ccc', cursor: 'default' }}>映像</span>
              {!qualityPanelOpen && hdadVideoStreams && hdadVideoStreams.length > 0 && (() => {
                const opts = hdadVideoStreams.filter((s, i, arr) => arr.findIndex(x => x.quality === s.quality) === i)
                const selUrl = hdadVideoPlaying ? (opts.find(s => s.url === hdadVideoPlaying.url)?.url ?? '') : ''
                return (
                  <select
                    className="tab-quality-select"
                    value={selUrl}
                    onChange={e => {
                      const stream = hdadVideoStreams.find(s => s.url === e.target.value)
                      if (stream) { saveTime(); setHdadVideoPlaying(stream) }
                    }}
                  >
                    {selUrl === '' && <option value="">—</option>}
                    {opts.map((s, i) => <option key={i} value={s.url}>{s.quality}</option>)}
                  </select>
                )
              })()}
            </div>
            {!qualityPanelOpen && hdadAudioStreams && hdadAudioStreams.length > 0 && (() => {
              const opts = hdadAudioStreams.filter((s, i, arr) => arr.findIndex(x => x.quality === s.quality) === i)
              const selUrl = hdadAudioPlaying ? (opts.find(s => s.url === hdadAudioPlaying.url)?.url ?? '') : ''
              return (
                <div className="tab-with-select">
                  <span className="quality-tab" style={{ color: '#ccc', cursor: 'default' }}>音声</span>
                  <select
                    className="tab-quality-select"
                    value={selUrl}
                    onChange={e => {
                      const stream = hdadAudioStreams.find(s => s.url === e.target.value)
                      if (stream) { saveTime(); setHdadAudioPlaying(stream) }
                    }}
                  >
                    {selUrl === '' && <option value="">—</option>}
                    {opts.map((s, i) => <option key={i} value={s.url}>{s.quality}</option>)}
                  </select>
                </div>
              )
            })()}
            {hdadLogVisible && (
              <button
                id="btn-hdad-log"
                className={`log-btn${hdadLogOpen ? ' log-open' : ''}`}
                onClick={() => setHdadLogOpen(v => !v)}
              >
                ログ
              </button>
            )}
            <div className="quality-tabs-right">
              {!hdadLoading && hdadError && (
                <button className="quality-tab" style={{ color: '#f90' }} onClick={() => { if (videoId) loadHdad(videoId) }}>
                  再読み込み
                </button>
              )}
              {!hdadLoading && !hdadError && hdadUsedSources.length > 0 && hdadUsedSources.length < 4 && (
                <button
                  className="quality-tab"
                  style={{ color: '#7bf' }}
                  title={`試済み: ${hdadUsedSources.join(', ')}`}
                  onClick={() => { if (videoId) loadHdad(videoId, hdadUsedSources) }}
                >
                  他のストリームを読み込む
                </button>
              )}
              <button
                className={`panel-toggle-btn${qualityPanelOpen ? '' : ' closed'}`}
                title={qualityPanelOpen ? '閉じる' : '開く'}
                onClick={() => setQualityPanelOpen(v => !v)}
              >{qualityPanelOpen ? '−' : '+'}</button>
            </div>
          </div>
          {qualityPanelOpen && <div className="quality-options">
            {hdadLoading ? (
              <span className="stream-loading-msg">ストリームを読み込み中...</span>
            ) : hdadError ? (
              <span className="stream-error-msg">{hdadError}</span>
            ) : hdadVideoStreams && hdadVideoStreams.length > 0 ? (
              hdadVideoStreams.filter((s, i, arr) => arr.findIndex(x => x.quality === s.quality) === i).map((s, i) => (
                <button
                  key={i}
                  className={`quality-option${hdadVideoPlaying === s || hdadVideoPlaying?.url === s.url ? ' selected' : ''}`}
                  onClick={() => { saveTime(); setHdadVideoPlaying(s) }}
                >
                  {s.quality}
                </button>
              ))
            ) : null}
          </div>}
          {hdadAudioStreams && hdadAudioStreams.length > 0 && qualityPanelOpen && (
            <>
              <div className="quality-tabs" style={{ marginTop: '4px' }}>
                <span className="quality-tab" style={{ color: '#ccc', cursor: 'default' }}>音声</span>
              </div>
              <div className="quality-options">
                {hdadAudioStreams.filter((s, i, arr) => arr.findIndex(x => x.quality === s.quality) === i).map((s, i) => (
                  <button
                    key={i}
                    className={`quality-option${hdadAudioPlaying === s || hdadAudioPlaying?.url === s.url ? ' selected' : ''}`}
                    onClick={() => { saveTime(); setHdadAudioPlaying(s) }}
                  >
                    {s.quality}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* プレイヤー */}
        <div className="player-wrapper">
          <div
            id="inv-log-overlay"
            ref={invLogRef}
            className={`log-overlay${invLogOpen ? ' visible' : ''}`}
          >
            {invLogs.map((e, i) => (
              <div key={i} className={`log-line${e.level === 'warn' ? ' log-warn' : e.level === 'err' ? ' log-err' : ''}`}>
                <span style={{ color: '#555' }}>[{e.time}]</span> {e.msg}
              </div>
            ))}
          </div>
          <div
            id="ytdlp-log-overlay"
            ref={ytdlpLogRef}
            className={`log-overlay${ytdlpLogOpen ? ' visible' : ''}`}
          >
            {ytdlpLogs.map((e, i) => (
              <div key={i} className={`log-line${e.level === 'warn' ? ' log-warn' : e.level === 'err' ? ' log-err' : ''}`}>
                <span style={{ color: '#555' }}>[{e.time}]</span> {e.msg}
              </div>
            ))}
          </div>
          <div
            id="rapid-log-overlay"
            ref={rapidLogRef}
            className={`log-overlay${rapidLogOpen ? ' visible' : ''}`}
          >
            {rapidLogs.map((e, i) => (
              <div key={i} className={`log-line${e.level === 'warn' ? ' log-warn' : e.level === 'err' ? ' log-err' : ''}`}>
                <span style={{ color: '#555' }}>[{e.time}]</span> {e.msg}
              </div>
            ))}
          </div>
          <div
            id="hdad-log-overlay"
            ref={hdadLogRef}
            className={`log-overlay${hdadLogOpen ? ' visible' : ''}`}
          >
            {hdadLogs.map((e, i) => (
              <div key={i} className={`log-line${e.level === 'warn' ? ' log-warn' : e.level === 'err' ? ' log-err' : ''}`}>
                <span style={{ color: '#555' }}>[{e.time}]</span> {e.msg}
              </div>
            ))}
          </div>

          {showThumbnail && (
            <div className="thumbnail-display">
              {thumbHost === 'base64' ? (
                base64ThumbLoading ? (
                  <span style={{ color: '#aaa', fontSize: '14px' }}>base64サムネイルを取得中...</span>
                ) : base64ThumbError ? (
                  <span style={{ color: '#e88', fontSize: '14px' }}>{base64ThumbError}</span>
                ) : base64ThumbSrc ? (
                  <img src={base64ThumbSrc} alt={metadata?.video_title || videoId || 'thumbnail'} className="thumbnail-img" />
                ) : (
                  <span style={{ color: '#aaa', fontSize: '14px' }}>取得中...</span>
                )
              ) : (
                <SmartImage
                  src={buildThumbnailUrl(thumbHost, videoId || '', thumbFile)}
                  alt={metadata?.video_title || videoId || 'thumbnail'}
                  className="thumbnail-img"
                  proxyWidth={960}
                />
              )}
            </div>
          )}
          {!showThumbnail && streamMode === 'nocookie' && (
            <iframe
              ref={(el) => { iframeRef.current = el }}
              src={nocookieUrl}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: '100%', height: '100%', border: 'none' }}
              title={metadata?.video_title || videoId}
            />
          )}
          {!showThumbnail && streamMode === 'edu' && (
            eduLoading ? (
              <div className="player-overlay">
                <div className="spinner" />
                <p style={{ color: '#aaa', fontSize: '14px' }}>eduパラメータを取得中...</p>
              </div>
            ) : eduError ? (
              <div className="player-overlay">
                <div className="error-message-box">
                  <div className="error-message">{eduError}</div>
                  <button className="reload-button" onClick={() => buildEduUrl(eduParamType, videoId || '')}>
                    再試行
                  </button>
                </div>
              </div>
            ) : eduUrl ? (
              <iframe
                ref={(el) => { iframeRef.current = el }}
                src={eduUrl}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ width: '100%', height: '100%', border: 'none' }}
                title={metadata?.video_title || videoId}
              />
            ) : null
          )}
          <div style={{ display: (showThumbnail || streamMode === 'nocookie' || streamMode === 'edu') ? 'none' : 'block', width: '100%', height: '100%' }}>
              <div
                ref={nativePlayerWrapRef}
                className={`native-player-wrap${ctrlIsVideo && ctrlPlaying && !ctrlVisible ? ' hide-cursor' : ''}`}
                onMouseMove={showCtrl}
                onMouseLeave={() => {
                  if (activeMediaRef.current && !activeMediaRef.current.paused) {
                    if (ctrlHideTimerRef.current) clearTimeout(ctrlHideTimerRef.current)
                    ctrlHideTimerRef.current = setTimeout(() => setCtrlVisible(false), 1000)
                  }
                }}
              >
                <div ref={playerRef} style={{ width: '100%', height: '100%' }} />
                {ctrlIsVideo && (
                  <div className={`custom-ctrl${ctrlVisible ? ' visible' : ''}`}>
                    <div
                      ref={ctrlSeekRef}
                      className="custom-ctrl-seekbar"
                      onMouseDown={ctrlSeekStart}
                    >
                      <div className="custom-ctrl-buffered" style={{ width: `calc(${(ctrlDuration ? ctrlBuffered / ctrlDuration : 0).toFixed(6)} * (100% - 24px))` }} />
                      <div className="custom-ctrl-progress" style={{ width: `calc(${(ctrlDuration ? ctrlCurrentTime / ctrlDuration : 0).toFixed(6)} * (100% - 24px))` }} />
                      <div className="custom-ctrl-thumb"    style={{ left:  `calc(12px + ${(ctrlDuration ? ctrlCurrentTime / ctrlDuration : 0).toFixed(6)} * (100% - 24px))` }} />
                    </div>
                    <div className="custom-ctrl-bar">
                      <div className="custom-ctrl-left">
                        <button className="ctrl-icon-btn" onClick={ctrlTogglePlay} title="再生/一時停止">
                          {ctrlPlaying ? '⏸' : '▶'}
                        </button>
                        <div className="ctrl-vol-group">
                          <button className="ctrl-icon-btn" onClick={ctrlToggleMute} title="ミュート切替">
                            {ctrlMuted || ctrlVolume === 0 ? '🔇' : ctrlVolume < 0.5 ? '🔉' : '🔊'}
                          </button>
                          <input
                            type="range" className="ctrl-vol-slider"
                            min={0} max={1} step={0.01}
                            value={ctrlMuted ? 0 : ctrlVolume}
                            onChange={ctrlHandleVolumeChange}
                            style={{ '--vol-pct': `${(ctrlMuted ? 0 : ctrlVolume) * 100}%` } as React.CSSProperties}
                          />
                        </div>
                        <span className="ctrl-time-display">
                          {fmtTime(ctrlCurrentTime)} / {ctrlDuration ? fmtTime(ctrlDuration) : '--:--'}
                        </span>
                      </div>
                      <div className="custom-ctrl-right">
                        <select className="ctrl-rate-select" value={ctrlRate} onChange={ctrlHandleRateChange} title="再生速度">
                          {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(r => (
                            <option key={r} value={r}>{r}x</option>
                          ))}
                        </select>
                        {streamMode === 'hdad' && hdadVideoStreams && hdadVideoStreams.length > 0 && (
                          <select
                            className="ctrl-rate-select"
                            title="映像画質"
                            value={hdadVideoPlaying?.url ?? ''}
                            onChange={e => {
                              const s = hdadVideoStreams.find(x => x.url === e.target.value)
                              if (s) { saveTime(); setHdadVideoPlaying(s) }
                            }}
                          >
                            {hdadVideoStreams.filter((s, i, arr) => arr.findIndex(x => x.quality === s.quality) === i).map((s, i) => (
                              <option key={i} value={s.url}>{s.quality}</option>
                            ))}
                          </select>
                        )}
                        {streamMode === 'hdad' && hdadAudioStreams && hdadAudioStreams.length > 0 && (
                          <select
                            className="ctrl-rate-select"
                            title="音質"
                            value={hdadAudioPlaying?.url ?? ''}
                            onChange={e => {
                              const s = hdadAudioStreams.find(x => x.url === e.target.value)
                              if (s) { saveTime(); setHdadAudioPlaying(s) }
                            }}
                          >
                            {hdadAudioStreams.filter((s, i, arr) => arr.findIndex(x => x.quality === s.quality) === i).map((s, i) => (
                              <option key={i} value={s.url}>{s.quality}</option>
                            ))}
                          </select>
                        )}
                        {streamMode !== 'hdad' && (streamMode === 'ytdlp' ? ytdlpDisplayed : streamMode === 'rapid' ? rapidDisplayed : invDisplayed).length > 0 && (
                          <select
                            className="ctrl-rate-select"
                            title="画質/音質"
                            value={playingStream?.url ?? ''}
                            onChange={e => {
                              const streams = streamMode === 'ytdlp' ? ytdlpDisplayed : streamMode === 'rapid' ? rapidDisplayed : invDisplayed
                              const s = streams.find(x => x.url === e.target.value)
                              if (s) {
                                saveTime()
                                if (streamMode === 'ytdlp') setYtdlpPlaying(s)
                                else if (streamMode === 'rapid') setRapidPlaying(s)
                                else setInvPlaying(s)
                              }
                            }}
                          >
                            {(streamMode === 'ytdlp' ? ytdlpDisplayed : streamMode === 'rapid' ? rapidDisplayed : invDisplayed).map((s, i) => (
                              <option key={i} value={s.url}>
                                {s.quality}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          className={`ctrl-loop-btn${loopEnabled && !listId ? ' ctrl-active' : ''}${listId ? ' ctrl-disabled' : ''}`}
                          onClick={listId ? undefined : ctrlToggleLoop}
                          title={listId ? 'プレイリスト再生中はループ無効' : 'ループ'}
                          style={listId ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m17 2 4 4-4 4"/>
                            <path d="M3 11v-1a4 4 0 0 1 4-4h14"/>
                            <path d="m7 22-4-4 4-4"/>
                            <path d="M21 13v1a4 4 0 0 1-4 4H3"/>
                          </svg>
                        </button>
                        <button className="ctrl-icon-btn" onClick={ctrlHandlePiP} title="ピクチャーインピクチャー">
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 7h-8v6h8V7zm2-4H3C1.9 3 1 3.9 1 5v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z"/></svg>
                        </button>
                        <button className="ctrl-icon-btn" onClick={ctrlToggleFullscreen} title="フルスクリーン">
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {streamLoading && (
                <div className="player-overlay">
                  <div className="spinner" />
                  <p style={{ color: '#aaa', fontSize: '14px' }}>ストリームを読み込み中...</p>
                </div>
              )}
              {!streamLoading && streamError && (
                <div className="player-overlay">
                  <div className="error-message-box">
                    <div className="error-message">{streamError}</div>
                    <button className="reload-button" onClick={reloadCurrent}>再読み込み</button>
                  </div>
                </div>
              )}
              {!streamLoading && !streamError && noStreamsInCategory && (
                <div className="player-overlay">
                  <div className="error-message">このカテゴリには再生可能なストリームがありません</div>
                </div>
              )}
              {!streamLoading && !streamError && !noStreamsInCategory && !playingStream && streamMode !== 'hdad' && (
                <div className="player-overlay">
                  <p style={{ color: '#aaa', fontSize: '14px' }}>ストリームを選択してください</p>
                </div>
              )}
          </div>
        </div>

        {/* 動画再生について */}
        <div className="playback-info-box">
          <div className="playback-info-header" onClick={() => setPlaybackInfoOpen(v => !v)}>
            <span className="playback-info-title">動画再生について</span>
            <span className={`playback-info-toggle${playbackInfoOpen ? '' : ' closed'}`}>{playbackInfoOpen ? '－' : '＋'}</span>
          </div>
          {playbackInfoOpen && (
            <div className="playback-info-body open">
              <div className="clip-range-grid">
                <div className="clip-range-field">
                  <label className="clip-range-label">開始位置</label>
                  <input
                    className="clip-range-input"
                    type="text"
                    placeholder="例: 1:30 または 90"
                    value={clipStart}
                    onChange={e => setClipStart(e.target.value)}
                  />
                  {clipStart && parseTimeSec(clipStart) < 0 && (
                    <span className="clip-range-error">形式: 1:30 または 90</span>
                  )}
                </div>
                <div className="clip-range-field">
                  <label className="clip-range-label">終了位置</label>
                  <div className="clip-range-end-row">
                    <input
                      className="clip-range-input"
                      type="text"
                      placeholder="例: 3:00 または 180"
                      value={clipEnd}
                      onChange={e => setClipEnd(e.target.value)}
                    />
                    <button
                      className="clip-apply-btn"
                      onClick={applyClip}
                      disabled={
                        (clipStart !== '' && parseTimeSec(clipStart) < 0) ||
                        (clipEnd !== '' && parseTimeSec(clipEnd) < 0)
                      }
                    >
                      適用
                    </button>
                    {(clipStart || clipEnd) && (
                      <button
                        className="clip-clear-btn"
                        onClick={() => { setClipStart(''); setClipEnd(''); clipStartSecRef.current = -1; clipEndSecRef.current = -1 }}
                      >
                        クリア
                      </button>
                    )}
                  </div>
                  {clipEnd && parseTimeSec(clipEnd) < 0 && (
                    <span className="clip-range-error">形式: 3:00 または 180</span>
                  )}
                </div>
              </div>
              <div className="ytdlp-fetch-mode-section">
                <div className="ytdlp-fetch-mode-label">yt-dlp 取得モード</div>
                <div className="ytdlp-fetch-mode-btns">
                  {(['sequential', 'parallel'] as const).map(key => (
                    <button
                      key={key}
                      className={`fetch-mode-btn${ytdlpFetchMode === key ? ' active' : ''}`}
                      onClick={() => {
                        setYtdlpFetchMode(key)
                        setYtdlpOtherApiSelect('auto')
                        try { localStorage.setItem(YTDLP_FETCH_MODE_KEY, key) } catch { /* ignore */ }
                      }}
                    >
                      {key === 'sequential' ? '順次フォールバック' : '並列'}
                    </button>
                  ))}
                  <button
                    className={`fetch-mode-btn${ytdlpFetchMode === 'specific' ? ' active' : ''}`}
                    onClick={() => {
                      setYtdlpFetchMode('specific')
                      setYtdlpOtherApiSelect(ytdlpSpecificApi)
                      try { localStorage.setItem(YTDLP_FETCH_MODE_KEY, 'specific') } catch { /* ignore */ }
                    }}
                  >
                    指定API
                  </button>
                  {ytdlpFetchMode === 'specific' && (
                    <select
                      className="api-select api-select-inline"
                      value={ytdlpSpecificApi}
                      onChange={e => {
                        setYtdlpSpecificApi(e.target.value)
                        setYtdlpOtherApiSelect(e.target.value)
                        try { localStorage.setItem(YTDLP_SPECIFIC_API_KEY, e.target.value) } catch { /* ignore */ }
                      }}
                    >
                      {YTDLP_ALL_SOURCES.map(s => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  )}
                  {ytdlpFetchMode !== 'parallel' && (
                    <span className="ytdlp-timeout-row">
                      <span className="ytdlp-timeout-label">タイムアウト</span>
                      <input
                        type="number"
                        className="ytdlp-timeout-input"
                        min={1}
                        max={120}
                        value={ytdlpTimeoutInput}
                        onChange={e => setYtdlpTimeoutInput(e.target.value)}
                        onBlur={e => {
                          const v = parseInt(e.target.value, 10)
                          if (!isNaN(v) && v > 0) {
                            setYtdlpTimeoutSec(v)
                            setYtdlpTimeoutInput(String(v))
                            try { localStorage.setItem(YTDLP_TIMEOUT_KEY, String(v)) } catch { /* ignore */ }
                          } else {
                            setYtdlpTimeoutInput(String(ytdlpTimeoutSec))
                          }
                        }}
                      />
                      <span className="ytdlp-timeout-unit">秒</span>
                    </span>
                  )}
                </div>
                {ytdlpFetchMode === 'sequential' && (
                  <div className="ytdlp-seq-order-preview">
                    <span className="ytdlp-seq-order-label">試行順：</span>
                    {ytdlpSequentialOrder.map((k, i) => (
                      <span key={k} className="ytdlp-seq-order-item">
                        {i > 0 && <span className="ytdlp-seq-order-arrow">→</span>}
                        {YTDLP_SRC_MAP[k] || k}
                      </span>
                    ))}
                    <a className="ytdlp-seq-order-edit" href="/settings" target="_blank" rel="noopener noreferrer">変更</a>
                  </div>
                )}
              </div>

              <div className="playback-toggles">
                <label className="switch-label-row" style={listId ? { opacity: 0.45, pointerEvents: 'none' } : undefined} title={listId ? 'プレイリスト/ミックス再生中はループ無効' : undefined}>
                  <span>🔁 ループ{listId ? ' (無効)' : ''}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={loopEnabled && !listId}
                    data-state={(loopEnabled && !listId) ? 'checked' : 'unchecked'}
                    value={(loopEnabled && !listId) ? 'on' : 'off'}
                    className="switch-btn"
                    disabled={!!listId}
                    onClick={() => {
                      if (listId) return
                      const next = !loopEnabled
                      setLoopEnabled(next)
                      try { localStorage.setItem(LOOP_KEY, next ? '1' : '0') } catch { /* ignore */ }
                      if (next) {
                        setAutoNextEnabled(false)
                        try { localStorage.setItem(AUTO_NEXT_KEY, '0') } catch { /* ignore */ }
                      }
                    }}
                  >
                    <span data-state={(loopEnabled && !listId) ? 'checked' : 'unchecked'} className="switch-thumb" />
                  </button>
                </label>
                <label className="switch-label-row">
                  <span>▶ 自動再生</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoplayEnabled}
                    data-state={autoplayEnabled ? 'checked' : 'unchecked'}
                    value={autoplayEnabled ? 'on' : 'off'}
                    className="switch-btn"
                    onClick={() => {
                      const next = !autoplayEnabled
                      setAutoplayEnabled(next)
                      try { localStorage.setItem(AUTOPLAY_KEY, next ? '1' : '0') } catch { /* ignore */ }
                    }}
                  >
                    <span data-state={autoplayEnabled ? 'checked' : 'unchecked'} className="switch-thumb" />
                  </button>
                </label>
                <label className="switch-label-row">
                  <span>📍 再生位置保存</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={resumeEnabled}
                    data-state={resumeEnabled ? 'checked' : 'unchecked'}
                    value={resumeEnabled ? 'on' : 'off'}
                    className="switch-btn"
                    onClick={() => {
                      const next = !resumeEnabled
                      setResumeEnabled(next)
                      try { localStorage.setItem(RESUME_KEY, next ? '1' : '0') } catch { /* ignore */ }
                    }}
                  >
                    <span data-state={resumeEnabled ? 'checked' : 'unchecked'} className="switch-thumb" />
                  </button>
                </label>
                <label className="switch-label-row">
                  <span>⏭ 次の動画へ自動移動</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoNextEnabled}
                    data-state={autoNextEnabled ? 'checked' : 'unchecked'}
                    value={autoNextEnabled ? 'on' : 'off'}
                    className="switch-btn"
                    onClick={() => {
                      const next = !autoNextEnabled
                      setAutoNextEnabled(next)
                      try { localStorage.setItem(AUTO_NEXT_KEY, next ? '1' : '0') } catch { /* ignore */ }
                      if (next) {
                        setLoopEnabled(false)
                        try { localStorage.setItem(LOOP_KEY, '0') } catch { /* ignore */ }
                      }
                    }}
                  >
                    <span data-state={autoNextEnabled ? 'checked' : 'unchecked'} className="switch-thumb" />
                  </button>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* 動画タイトル・チャンネル */}
        <div className="video-metadata">
          <div className="video-title">{metadata?.video_title || `動画: ${videoId}`}</div>
          <div className="video-stats-inline">
            {metadata?.view_count && <span>{metadata.view_count} 回視聴</span>}
            {metadata?.published_at && <span>{metadata.published_at}</span>}
            {metadata?.like_count != null && (
              <span className="like-count-inline">
                <svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 0 24 24" width="14" fill="currentColor"><path d="M18.77,11h-4.23l1.52-4.94C16.38,5.03,15.54,4,14.38,4c-0.58,0-1.14,0.24-1.52,0.65L7,11H3v10h4h1h9.43c1.06,0,1.98-0.67,2.19-1.61l1.34-6C21.23,12.15,20.18,11,18.77,11z"/></svg>
                {metadata.like_count.toLocaleString()}
              </span>
            )}
          </div>
          <div className="channel-info">
            <div className="channel-link-area">
              {metadata?.channel_id ? (
                <Link to={`/channel/${metadata.channel_id}`} className="channel-icon-link">
                  {metadata.channel_icon ? (
                    <SmartImage src={metadata.channel_icon} alt={metadata.channel_name || ''} className="channel-icon" proxyWidth={88} />
                  ) : (
                    <span className="channel-icon channel-icon-placeholder">?</span>
                  )}
                </Link>
              ) : (
                <span className="channel-icon channel-icon-placeholder">?</span>
              )}
              <span className="channel-details">
                {metadata?.channel_id ? (
                  <Link to={`/channel/${metadata.channel_id}`} className="channel-name-link">{metadata.channel_name || 'Unknown'}</Link>
                ) : (
                  <span className="channel-name-link" style={{ cursor: 'default' }}>{metadata?.channel_name || 'Unknown'}</span>
                )}
                {metadata?.subscriber_count && (
                  <span className="channel-subs">{metadata.subscriber_count}</span>
                )}
              </span>
            </div>
            {metadata?.channel_id && (
              <button
                className={`watch-sub-btn${watchSubscribed ? ' subscribed' : ''}`}
                onClick={handleWatchSubscribe}
              >
                {watchSubscribed ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
                    登録済み
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    登録
                  </>
                )}
              </button>
            )}
            <div className="watch-ch-actions">
              <button className={`watch-action-btn${liked ? ' active' : ''}`} onClick={handleLike} title="高評価">
                <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M18.77,11h-4.23l1.52-4.94C16.38,5.03,15.54,4,14.38,4c-0.58,0-1.14,0.24-1.52,0.65L7,11H3v10h4h1h9.43c1.06,0,1.98-0.67,2.19-1.61l1.34-6C21.23,12.15,20.18,11,18.77,11z M7,20H4v-8h3V20z M19.98,13.17l-1.34,6C18.54,19.65,18.03,20,17.43,20H8v-8.61l5.6-6.06C13.79,5.12,14.08,5,14.38,5c0.26,0,0.5,0.11,0.63,0.3c0.11,0.15,0.15,0.34,0.09,0.51L13.5,11h5.27C19.4,11,20,11.57,20,12.3c0,0.1-0.01,0.2-0.02,0.87z"/></svg>
              </button>
              <button className={`watch-action-btn${favorited ? ' active' : ''}`} onClick={handleFavorite} title={favorited ? 'お気に入りから削除' : 'お気に入りに追加'}>
                <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill={favorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={favorited ? '0' : '2'}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
              <div className="watch-pl-wrap" ref={plMenuRef}>
                {(() => {
                  const inAnyPl = videoId ? getPlaylists().some(pl => isVideoInPlaylist(pl.id, videoId)) : false
                  return (
                    <button className="watch-action-btn" title="プレイリストに追加" onClick={() => { setPlMenuOpen(v => !v); setPlNewOpen(false); setPlNewName('') }}
                      style={inAnyPl ? { color: '#ffb86b' } : undefined}>
                      <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z"/></svg>
                    </button>
                  )
                })()}

                {plMenuOpen && (
                  <div className="watch-pl-popup">
                    {(() => { const pls = getPlaylists(); return pls.length === 0 ? (
                      <div className="watch-pl-empty">プレイリストがありません</div>
                    ) : (
                      pls.map(pl => {
                        const checked = videoId ? isVideoInPlaylist(pl.id, videoId) : false
                        return (
                          <label key={pl.id} className="watch-pl-row">
                            <input
                              type="checkbox"
                              className="watch-pl-check"
                              checked={checked}
                              onChange={() => {
                                if (checked) {
                                  if (videoId) { removeVideoFromPlaylist(pl.id, videoId); setPlMenuTick(t => t + 1) }
                                } else {
                                  handleAddToPlaylist(pl)
                                }
                              }}
                            />
                            <span className="watch-pl-name">{pl.title}</span>
                            <span className="watch-pl-cnt">{pl.videos.length}本</span>
                          </label>
                        )
                      })
                    )})()}
                    <div className="watch-pl-divider" />
                    {plNewOpen ? (
                      <div className="watch-pl-new-form">
                        <input
                          className="watch-pl-create-input"
                          type="text"
                          placeholder="プレイリスト名..."
                          value={plNewName}
                          autoFocus
                          onChange={e => setPlNewName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleCreateAndAdd() }}
                        />
                        <div className="watch-pl-new-form-actions">
                          <button className="watch-pl-new-cancel" onClick={() => { setPlNewOpen(false); setPlNewName('') }}>キャンセル</button>
                          <button className="watch-pl-new-ok" disabled={!plNewName.trim()} onClick={handleCreateAndAdd}>作成</button>
                        </div>
                      </div>
                    ) : (
                      <button className="watch-pl-new-btn" onClick={() => setPlNewOpen(true)}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        新しいプレイリストを作成
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button
                className="watch-action-btn"
                title="ダウンロード"
                onClick={() => {
                  setDownloadTab(streamMode === 'invidious' ? 'invidious' : streamMode === 'rapid' ? 'rapid' : 'ytdlp')
                  setDownloadOpen(v => !v)
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                </svg>
              </button>
              <button className="watch-action-btn" title="再読み込み" onClick={reloadCurrent}>
                <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor">
                  <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
              </button>
              <button className="watch-action-btn" title="キーボードショートカット" onClick={() => setShortcutHelpOpen(v => !v)}>
                <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor">
                  <path d="M20 5H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 5H5v-2h2v2zm0-3H5v-2h2v2zm0-3H5V8h2v2zm9 6h-8v-2h8v2zm0-3h-2v-2h2v2zm0-3h-2V8h2v2zm3 6h-2v-2h2v2zm0-3h-2v-2h2v2zm0-3h-2V8h2v2z"/>
                </svg>
              </button>
              <div className="share-btn-wrap" ref={shareRef}>
                <button className="watch-action-btn" title="共有" onClick={() => setShareOpen(v => !v)}>
                  <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor">
                    <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/>
                  </svg>
                </button>
              {shareOpen && (
                <div className="share-dropdown">
                  <button className="share-dropdown-item" onClick={() => { copyToClipboard(`https://www.youtube.com/watch?v=${videoId}`, 'YouTubeリンクをコピーしました'); setShareOpen(false) }}>
                    <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 24 24" width="18" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/></svg>
                    YouTubeリンクをコピー
                  </button>
                  <button className="share-dropdown-item" onClick={() => { copyToClipboard(window.location.href, 'このページのリンクをコピーしました'); setShareOpen(false) }}>
                    <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 24 24" width="18" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                    このページのリンクをコピー
                  </button>
                  <button className="share-dropdown-item" onClick={() => { copyToClipboard(videoId || '', '動画IDをコピーしました'); setShareOpen(false) }}>
                    <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 24 24" width="18" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 9h-2V5h2v6zm0 4h-2v-2h2v2z"/></svg>
                    動画IDをコピー
                  </button>
                  <button className="share-dropdown-item" onClick={handleNativeShare}>
                    <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 24 24" width="18" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/></svg>
                    共有
                  </button>
                </div>
              )}
            </div>
            </div>
            <a
              className="watch-yt-link"
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 0 24 24" width="16" fill="currentColor"><path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z"/></svg>
              YouTubeで開く
            </a>
          </div>
          <div className="video-desc-box">
            <div className="video-desc-label">説明</div>
            {metadata?.source && <div className="video-source-tag">取得元: {metadata.source}</div>}
            <div className="video-desc-content">
              {metadata?.description ? renderLinkedDescription(metadata.description) : '説明文はありません。'}
            </div>
          </div>
        </div>

        {/* 字幕・トランスクリプト */}
        {transcriptTracks.length > 0 && (
          <div className="transcript-section">
            <div
              className="transcript-header"
              onClick={() => {
                const opening = !transcriptOpen
                setTranscriptOpen(opening)
                if (opening && !transcriptLang && transcriptTracks.length > 0 && videoId) {
                  const track = transcriptTracks[0]
                  const firstLang = track.language_code || track.languageCode || track.label || ''
                  setTranscriptLang(firstLang)
                  loadTranscriptLang(videoId, firstLang, track.label)
                }
              }}
            >
              <h3 className="transcript-title">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                字幕・トランスクリプト
              </h3>
              <button className="transcript-toggle-btn" aria-expanded={transcriptOpen}>
                <svg
                  className={`transcript-chevron${transcriptOpen ? ' open' : ''}`}
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  width="16"
                  height="16"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
            {transcriptOpen && (
              <div className="transcript-body">
                <div className="transcript-langs">
                  {transcriptTracks.map((track, i) => {
                    const langCode = track.language_code || track.languageCode || track.label || ''
                    const langLabel = track.label || langCode
                    return (
                      <button
                        key={i}
                        className={`lang-btn${transcriptLang === langCode ? ' active' : ''}`}
                        onClick={() => {
                          if (transcriptLang === langCode) return
                          setTranscriptLang(langCode)
                          if (videoId) loadTranscriptLang(videoId, langCode, track.label)
                        }}
                      >
                        {langLabel}
                      </button>
                    )
                  })}
                </div>
                <div className="transcript-content" ref={transcriptContentRef}>
                  {transcriptLoading ? (
                    <div className="transcript-loading">
                      <div className="transcript-spinner" />
                      読み込み中...
                    </div>
                  ) : transcriptError ? (
                    <div className="transcript-empty">{transcriptError}</div>
                  ) : transcriptLines.length === 0 ? (
                    <div className="transcript-empty">このトラックにはテキストがありません。</div>
                  ) : (
                    transcriptLines.map((line, i) => {
                      const secs = Math.floor(line.start)
                      const h = Math.floor(secs / 3600)
                      const m = Math.floor((secs % 3600) / 60)
                      const s = secs % 60
                      const ts = h > 0
                        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                        : `${m}:${String(s).padStart(2, '0')}`
                      return (
                        <div
                          key={i}
                          className={`transcript-line${activeTranscriptIdx === i ? ' active' : ''}`}
                          onClick={() => {
                            const m = activeMediaRef.current
                            if (m) {
                              m.currentTime = line.start
                              m.play().catch(() => {})
                            }
                          }}
                        >
                          <span className="transcript-ts">{ts}</span>
                          <span className="transcript-text">{line.text}</span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* コメント欄 */}
        <div className="comments-section">
          <div className="comments-header">
            <div className="comments-title">コメント {commentCount !== null && <span className="comments-count">({commentCount.toLocaleString()})</span>}</div>
            <div className="comments-sort">
              <button className={`comment-sort-btn${commentSort === 'top' ? ' active' : ''}`} onClick={() => setCommentSort('top')}>話題順</button>
              <button className={`comment-sort-btn${commentSort === 'new' ? ' active' : ''}`} onClick={() => setCommentSort('new')}>新しい順</button>
            </div>
          </div>
          {commentsLoading ? (
            <div className="comment-placeholder">コメントを読み込み中...</div>
          ) : commentsError ? (
            <div className="comment-placeholder">{commentsError}</div>
          ) : comments.length === 0 ? (
            <div className="comment-placeholder">コメントはありません。</div>
          ) : (
            <div className="comments-list">
              {comments.map((comment, index) => {
                const avatar = comment.authorThumbnails?.[comment.authorThumbnails.length - 1]?.url || comment.authorThumbnails?.[0]?.url
                const authorId = comment.authorId || ''
                const verified = comment.verified || comment.authorVerified
                return (
                  <div className="comment-item" key={comment.commentId || `${comment.author}-${index}`}>
                    <div className="comment-avatar-wrap">
                      {avatar ? <SmartImage className="comment-avatar" src={avatar} alt={comment.author || ''} loading="lazy" proxyWidth={88} /> : <div className="comment-avatar-placeholder" />}
                    </div>
                    <div className="comment-body">
                      <div className="comment-header">
                        {authorId ? (
                          <Link className={`comment-author${verified ? ' verified' : ''}`} to={`/channel/${authorId}`}>{comment.author || 'Unknown'}</Link>
                        ) : (
                          <span className={`comment-author${verified ? ' verified' : ''}`}>{comment.author || 'Unknown'}</span>
                        )}
                        {comment.publishedText && <span className="comment-date">{comment.publishedText}</span>}
                        {comment.isPinned && (
                          <span className="comment-pinned">
                            📌 固定
                          </span>
                        )}
                      </div>
                      <div className="comment-text">{comment.content || ''}</div>
                      <div className="comment-footer">
                        {!!comment.likeCount && (
                          <span className="comment-action" title="高評価">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
                              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                            </svg>
                            {comment.likeCount.toLocaleString()}
                          </span>
                        )}
                        {!!(comment.replies?.replyCount || comment.replyCount) && (
                          <span className="comment-action" title="返信">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                              <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>
                            </svg>
                            {comment.replies?.replyCount || comment.replyCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {commentContinuation && (
                <div className="load-more-wrap">
                  <button className="load-more-btn" disabled={commentsAppending} onClick={() => loadComments(true, commentContinuation)}>
                    {commentsAppending ? '読み込み中...' : 'もっと読む'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* プレイリスト / 関連動画サイドバー */}
      <div className="related-videos">
        {/* ローカルプレイリストパネル */}
        {localPlId && localPlData && (
          <div className="pl-panel">
            <div className="pl-panel-header">
              <div className="pl-panel-label-row">
                <span>マイプレイリスト</span>
              </div>
              <div className="pl-panel-title">{localPlData.title}</div>
              <div className="pl-panel-progress">
                {localPlIndex + 1} / {localPlData.videos.length}本
              </div>
            </div>
            <div className="pl-panel-list">
              {localPlData.videos.map((v, i) => {
                const isActive = v.videoId === videoId
                const dur = v.lengthSeconds ? (() => {
                  const s = v.lengthSeconds!
                  const h = Math.floor(s / 3600)
                  const m = Math.floor((s % 3600) / 60)
                  const sec = s % 60
                  return h > 0
                    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
                    : `${m}:${String(sec).padStart(2,'0')}`
                })() : ''
                return (
                  <Link
                    key={v.videoId + i}
                    className={`pl-panel-item${isActive ? ' active' : ''}`}
                    to={`/watch/${v.videoId}?localpl=${encodeURIComponent(localPlId)}&index=${i}`}
                  >
                    <span className="pl-panel-num">
                      {isActive
                        ? <svg xmlns="http://www.w3.org/2000/svg" height="12" viewBox="0 0 24 24" width="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        : i + 1
                      }
                    </span>
                    <div className="pl-panel-thumb-wrap">
                      <SmartImage
                        className="pl-panel-thumb loaded"
                        src={buildVideoThumbnailUrl(v.videoId, 'mqdefault.jpg')}
                        fallbackSrc={buildVideoThumbnailUrl(v.videoId)}
                        proxyWidth={240}
                        alt={v.title}
                        loading="lazy"
                      />
                      {dur && <span className="pl-panel-dur">{dur}</span>}
                    </div>
                    <div className="pl-panel-item-info">
                      <div className="pl-panel-item-title">{v.title}</div>
                      {v.author && <div className="pl-panel-item-ch">{v.author}</div>}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
        {listId && (plData || plLoading) && (
          <div className="pl-panel">
            <div className="pl-panel-header">
              <div className="pl-panel-label-row">
                <span>{listId.startsWith('RD') ? 'ミックス' : '再生リスト'}</span>
                {!listId.startsWith('RD') && plData && (
                  <Link className="pl-panel-all-link" to={`/playlist?list=${encodeURIComponent(listId)}`}>
                    再生リストを表示
                  </Link>
                )}
              </div>
              {plData?.title && <div className="pl-panel-title">{plData.title}</div>}
              {plData && videoId && (
                <div className="pl-panel-progress">
                  現在: {(plData.videos || []).findIndex(v => v.videoId === videoId) + 1 || '?'} / {plData.videoCount || (plData.videos || []).length}
                </div>
              )}
            </div>
            {plLoading ? (
              <div className="pl-panel-list">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div className="pl-panel-item-sk" key={i}>
                    <div className="pl-panel-sk-num" style={{ width: 20, height: 12, background: 'var(--skeleton-base)', borderRadius: 4 }} />
                    <div className="pl-panel-sk-thumb" />
                    <div className="pl-panel-sk-info">
                      <div className="related-skel-line long" style={{ height: 10, background: 'var(--skeleton-base)', borderRadius: 4, width: '90%' }} />
                      <div className="related-skel-line short" style={{ height: 10, background: 'var(--skeleton-base)', borderRadius: 4, width: '60%' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pl-panel-list">
                {(plData?.videos || []).map((v, i) => {
                  const pageOffset = (plPage - 1) * 100
                  const globalIdx = pageOffset + i
                  const isActive = v.videoId === videoId
                  const dur = formatDurSec(v.lengthSeconds)
                  return (
                    <Link
                      key={v.videoId}
                      className={`pl-panel-item${isActive ? ' active' : ''}`}
                      to={`/watch/${v.videoId}?list=${encodeURIComponent(listId)}&index=${globalIdx}`}
                    >
                      <span className="pl-panel-num">
                        {isActive
                          ? <svg xmlns="http://www.w3.org/2000/svg" height="12" viewBox="0 0 24 24" width="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                          : globalIdx + 1
                        }
                      </span>
                      <div className="pl-panel-thumb-wrap">
                        <SmartImage
                          className="pl-panel-thumb loaded"
                          src={buildVideoThumbnailUrl(v.videoId, 'mqdefault.jpg')}
                          fallbackSrc={buildVideoThumbnailUrl(v.videoId)}
                          proxyWidth={240}
                          alt={v.title}
                          loading="lazy"
                        />
                        {dur && <span className="pl-panel-dur">{dur}</span>}
                      </div>
                      <div className="pl-panel-item-info">
                        <div className="pl-panel-item-title">{v.title}</div>
                        <PlaylistPanelChannel video={v} />
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}
        <div className="related-title">関連動画</div>
        {relatedLoading ? (
          <div className="related-loading">
            {Array.from({ length: 8 }).map((_, i) => (
              <div className="related-skeleton" key={i}>
                <div className="related-skel-thumb" />
                <div className="related-skel-info">
                  <div className="related-skel-line long" />
                  <div className="related-skel-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : relatedVideos.length === 0 ? (
          <div className="related-placeholder">関連動画がありません</div>
        ) : (
          <div className="related-list">
            {relatedVideos.slice(0, 20).map(video => (
              <RelatedVideoItem video={video} key={video.videoId} />
            ))}
          </div>
        )}
      </div>

      <div id="copy-toast" className={`copy-toast${toastVisible ? ' show' : ''}`}>{toastMsg}</div>

      {/* ダウンロードモーダル */}
      {downloadOpen && (() => {
        const typeGroups = [
          { key: 'mp4',   label: 'MP4（映像＋音声）', filter: (s: Stream) => s.hasAudio && s.hasVideo && !s.isHLS },
          { key: 'video', label: '映像のみ',           filter: (s: Stream) => s.hasVideo && !s.hasAudio && !s.isHLS },
          { key: 'audio', label: '音声のみ',           filter: (s: Stream) => s.hasAudio && !s.hasVideo },
          { key: 'hls',   label: 'HLS',               filter: (s: Stream) => s.isHLS },
        ]
        const dedup = (list: Stream[]) => {
          const seen = new Set<string>()
          return list.filter(s => {
            const key = `${s.quality}|${s.container}|${s.format}|${s.hasVideo}|${s.hasAudio}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
        }
        const invAll = invStreams ? dedup([...invStreams].sort((a, b) => qNum(b.quality) - qNum(a.quality))) : []
        const dlTotalYtdlp = Object.values(dlYtdlpResults).reduce((n, v) => n + (v?.length ?? 0), 0)

        const renderStreamList = (streams: Stream[]) => (
          typeGroups.map(g => {
            const items = streams.filter(g.filter)
            if (items.length === 0) return null
            return (
              <div key={g.key} className="dl-group">
                <div className="dl-group-label">{g.label}</div>
                {items.map((s, i) => (
                  <div key={i} className="dl-item">
                    <div className="dl-item-info">
                      <span className="dl-item-quality">{s.quality}</span>
                      <span className="dl-item-meta">{s.container}{s.format ? ` · ${s.format}` : ''}</span>
                    </div>
                    <button
                      className="dl-btn"
                      onClick={() => handleDownload(s.url, s.quality, s.container)}
                      title="ダウンロード"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 24 24" width="18" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                      DL
                    </button>
                  </div>
                ))}
              </div>
            )
          })
        )

        return (
          <div className="dl-overlay" onClick={() => setDownloadOpen(false)}>
            <div className="dl-modal" onClick={e => e.stopPropagation()}>
              <div className="dl-modal-header">
                <span>ダウンロード</span>
                <button className="shortcut-close-btn" onClick={() => setDownloadOpen(false)}>✕</button>
              </div>
              <div className="dl-tabs">
                <button
                  className={`dl-tab${downloadTab === 'ytdlp' ? ' active' : ''}`}
                  onClick={() => setDownloadTab('ytdlp')}
                >
                  ytdlp
                  {dlTotalYtdlp > 0 && <span className="dl-tab-count">{dlTotalYtdlp}</span>}
                  {dlYtdlpPending.size > 0 && <span className="dl-tab-spinner" />}
                </button>
                <button
                  className={`dl-tab${downloadTab === 'invidious' ? ' active' : ''}`}
                  onClick={() => setDownloadTab('invidious')}
                >
                  Invidious
                  {invAll.length > 0 && <span className="dl-tab-count">{invAll.length}</span>}
                </button>
                <button
                  className={`dl-tab${downloadTab === 'rapid' ? ' active' : ''}`}
                  onClick={() => setDownloadTab('rapid')}
                >
                  rapid
                  {rapidStreams && rapidStreams.length > 0 && <span className="dl-tab-count">{rapidStreams.length}</span>}
                </button>
                <button
                  className={`dl-tab${downloadTab === 'thumbnail' ? ' active' : ''}`}
                  onClick={() => setDownloadTab('thumbnail')}
                >
                  サムネイル
                  <span className="dl-tab-count">{THUMB_FILES.length}</span>
                </button>
              </div>
              <div className="dl-modal-body">
                {downloadTab === 'thumbnail' ? (
                  <div>
                    {THUMB_FILES.map(file => (
                      <div key={file} className="dl-group">
                        <div className="dl-group-label">{file.replace('.jpg', '')} (.jpg)</div>
                        {THUMB_HOSTS.filter(h => h.key !== 'base64').map(h => (
                          <div key={h.key} className="dl-item">
                            <div className="dl-item-info">
                              <span className="dl-item-quality" style={{ fontSize: '0.8em' }}>{h.label}</span>
                            </div>
                            <button
                              className="dl-btn"
                              title="ダウンロード"
                              onClick={() => downloadThumb(buildThumbnailUrl(h.key, videoId || '', file), `${videoId || 'thumbnail'}_${file.replace('.jpg', '')}_${h.key.replace(/https?:\/\//, '').replace(/[^a-z0-9]/g, '_')}.jpg`)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 24 24" width="18" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                              DL
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div className="dl-group">
                      <div className="dl-group-label">base64 (siawase api)</div>
                      {base64ThumbLoading ? (
                        <div className="dl-empty">取得中...</div>
                      ) : base64ThumbError ? (
                        <div className="dl-empty dl-failed">{base64ThumbError}</div>
                      ) : base64ThumbSrc ? (
                        <div className="dl-item">
                          <div className="dl-item-info">
                            <span className="dl-item-quality" style={{ fontSize: '0.8em' }}>base64 (siawase api)</span>
                          </div>
                          <button
                            className="dl-btn"
                            title="ダウンロード"
                            onClick={() => {
                              const ext = base64ThumbSrc.startsWith('data:image/png') ? 'png' : base64ThumbSrc.startsWith('data:image/webp') ? 'webp' : 'jpg'
                              downloadThumb(base64ThumbSrc, `${videoId || 'thumbnail'}_base64.${ext}`)
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 24 24" width="18" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                            DL
                          </button>
                        </div>
                      ) : (
                        <div className="dl-empty">取得中...</div>
                      )}
                    </div>
                  </div>
                ) : downloadTab === 'ytdlp' ? (
                  <>
                    <div className="dl-source-btns">
                      {YTDLP_ALL_SOURCES.map(src => {
                        const streams = dlYtdlpResults[src.key]
                        const isLoading = dlYtdlpPending.has(src.key)
                        const hasFailed = !isLoading && src.key in dlYtdlpResults && !streams
                        return (
                          <button
                            key={src.key}
                            className={`dl-source-btn${dlYtdlpSelected === src.key ? ' active' : ''}${hasFailed ? ' failed' : ''}`}
                            onClick={() => setDlYtdlpSelected(src.key)}
                          >
                            <span className="dl-source-btn-label">{src.label}</span>
                            {isLoading && <span className="dl-source-btn-spin" />}
                            {!isLoading && streams && <span className="dl-source-btn-count">{streams.length}</span>}
                            {hasFailed && <span className="dl-source-btn-x">✕</span>}
                          </button>
                        )
                      })}
                    </div>
                    {(() => {
                      const sel = dlYtdlpResults[dlYtdlpSelected]
                      const isLoading = dlYtdlpPending.has(dlYtdlpSelected)
                      const hasFailed = !isLoading && dlYtdlpSelected in dlYtdlpResults && !sel
                      if (isLoading) return <div className="dl-empty">取得中...</div>
                      if (hasFailed)  return <div className="dl-empty dl-failed">このAPIからの取得に失敗しました</div>
                      if (!sel)       return <div className="dl-empty">取得中...</div>
                      return renderStreamList([...sel].sort((a, b) => qNum(b.quality) - qNum(a.quality)))
                    })()}
                  </>
                ) : downloadTab === 'rapid' ? (
                  rapidLoading ? (
                    <div className="dl-empty">取得中...</div>
                  ) : rapidError ? (
                    <div className="dl-empty dl-failed">{rapidError}</div>
                  ) : !rapidStreams ? (
                    <div className="dl-empty">rapidストリームが取得されていません。rapidストリームモードで動画を読み込んでください。</div>
                  ) : (
                    renderStreamList(dedup([...rapidStreams].sort((a, b) => qNum(b.quality) - qNum(a.quality))))
                  )
                ) : (
                  invAll.length === 0 ? (
                    <div className="dl-empty">Invidiousストリームが取得されていません。Invidiousモードで動画を再生してください。</div>
                  ) : renderStreamList(invAll)
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* キーボードショートカットヘルプ */}
      {shortcutHelpOpen && (
        <div className="shortcut-overlay" onClick={() => setShortcutHelpOpen(false)}>
          <div className="shortcut-modal" onClick={e => e.stopPropagation()}>
            <div className="shortcut-modal-header">
              <span>キーボードショートカット</span>
              <button className="shortcut-close-btn" onClick={() => setShortcutHelpOpen(false)}>✕</button>
            </div>
            <div className="shortcut-modal-body">
              {([
                ['再生 / 一時停止', 'Space  /  K'],
                ['5秒戻る', '←  /  J'],
                ['10秒戻る', 'Shift + ←  /  Shift + J'],
                ['5秒進む', '→  /  L'],
                ['10秒進む', 'Shift + →  /  Shift + L'],
                ['音量を上げる', '↑'],
                ['音量を下げる', '↓'],
                ['ミュート切替', 'M'],
                ['フルスクリーン', 'F'],
                ['ピクチャーインピクチャー (再度Pで解除)', 'P'],
                ['動画の0〜90%へジャンプ', '0 〜 9'],
                ['1フレーム戻る', ','],
                ['1フレーム進む', '.'],
                ['再生速度を下げる', '<'],
                ['再生速度を上げる', '>'],
                ['ショートカットヘルプ', '?'],
              ] as [string, string][]).map(([label, key]) => (
                <div className="shortcut-row" key={label}>
                  <span className="shortcut-label">{label}</span>
                  <span className="shortcut-key">{key}</span>
                </div>
              ))}
              <p className="shortcut-note">※ iframe再生（nocookie / edu）では一部機能が制限されます</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

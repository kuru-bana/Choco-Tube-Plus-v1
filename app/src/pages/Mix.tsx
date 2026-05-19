import { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { isFavoriteMix, toggleFavoriteMix } from '../lib/library'
import SmartImage from '../components/SmartImage'
import { buildVideoThumbnailUrl } from '../lib/imagePreferences'
import './Mix.css'
import '../components/VideoCard.css'
import '../components/VideoGrid.css'

interface Thumbnail {
  url: string
  width?: number
  height?: number
}

interface MixVideo {
  videoId: string
  title: string
  author?: string
  authorId?: string
  authorThumbnails?: Thumbnail[]
  lengthSeconds?: number
  viewCount?: number
  index?: number
}

interface MixData {
  title?: string
  mixId?: string
  videos?: MixVideo[]
}

function formatDuration(seconds?: number): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function getThumbnailUrl(videoId: string): string {
  return buildVideoThumbnailUrl(videoId, 'mqdefault.jpg')
}

function getAvatarUrl(thumbs?: Thumbnail[] | null): string {
  if (!thumbs || thumbs.length === 0) return ''
  return thumbs.find(t => (t.width || 0) >= 32)?.url || thumbs[0]?.url || ''
}

const mixChannelAvatarCache = new Map<string, Thumbnail[] | null>()

async function fetchChannelAvatar(channelId: string): Promise<Thumbnail[] | null> {
  if (mixChannelAvatarCache.has(channelId)) return mixChannelAvatarCache.get(channelId) || null
  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(channelId)}`)
    if (!res.ok) throw new Error('avatar fetch failed')
    const data = await res.json() as { authorThumbnails?: Thumbnail[] }
    const thumbs = data.authorThumbnails || null
    mixChannelAvatarCache.set(channelId, thumbs)
    return thumbs
  } catch {
    mixChannelAvatarCache.set(channelId, null)
    return null
  }
}

async function fillMissingVideoIcons(data: MixData): Promise<MixData> {
  const videos = data.videos || []
  const missingIds = [...new Set(videos
    .filter(video => video.authorId && !video.authorThumbnails?.length)
    .map(video => video.authorId as string)
  )]
  if (missingIds.length === 0) return data

  const results = await Promise.all(missingIds.map(async id => [id, await fetchChannelAvatar(id)] as const))
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

function MixVideoCard({
  video,
  index,
  mixId,
}: {
  video: MixVideo
  index: number
  mixId: string
}) {
  const duration = formatDuration(video.lengthSeconds)
  const thumb = getThumbnailUrl(video.videoId)
  const channelIcon = getAvatarUrl(video.authorThumbnails)
  const channelHref = video.authorId ? `/channel?id=${encodeURIComponent(video.authorId)}` : null
  const href = `/watch/${video.videoId}?list=${encodeURIComponent(mixId)}&index=${index}`
  const goChannel = (e: React.MouseEvent) => {
    if (!channelHref) return
    e.preventDefault()
    e.stopPropagation()
    window.location.href = channelHref
  }

  return (
    <Link className="video-card" to={href}>
      <div className="thumbnail-container">
        <SmartImage
          src={thumb}
          fallbackSrc={buildVideoThumbnailUrl(video.videoId)}
          proxyWidth={480}
          alt={video.title}
          loading="lazy"
        />
        {duration && <span className="video-duration">{duration}</span>}
      </div>
      <div className="video-info">
        <h3>{video.title}</h3>
        <div className="card-channel-row">
          {channelIcon ? (
            <SmartImage
              className="card-channel-icon loaded"
              src={channelIcon}
              proxyWidth={88}
              alt={video.author || ''}
              loading="lazy"
              onClick={goChannel}
            />
          ) : (
            <div className="card-channel-icon-placeholder" onClick={goChannel} />
          )}
          <span
            className="card-channel-name"
            onClick={goChannel}
            style={channelHref ? { cursor: 'pointer' } : undefined}
          >
            {video.author || ''}
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function Mix() {
  const { id: pathId } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const mixId = searchParams.get('id') || pathId || ''

  const [data, setData] = useState<MixData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [favd, setFavd] = useState(() => isFavoriteMix(mixId))

  useEffect(() => { setFavd(isFavoriteMix(mixId)) }, [mixId])

  const handleFav = () => {
    const thumb = data?.videos?.[0]?.videoId ? getThumbnailUrl(data.videos[0].videoId) : undefined
    const next = toggleFavoriteMix({
      mixId,
      title: data?.title || mixId,
      thumbnail: thumb,
    })
    setFavd(next)
  }

  useEffect(() => {
    if (!mixId) return
    setLoading(true)
    setError('')
    setData(null)
    fetch(`/api/mixes/${encodeURIComponent(mixId)}`)
      .then(r => {
        if (!r.ok) return r.json().then(j => Promise.reject(new Error(j.error || `HTTP ${r.status}`)))
        return r.json()
      })
      .then((json: MixData) => fillMissingVideoIcons(json))
      .then((json: MixData) => {
        setData(json)
        setLoading(false)
      })
      .catch((e: Error) => {
        setError(e.message)
        setLoading(false)
      })
  }, [mixId])

  if (!mixId) {
    return (
      <div className="mix-page">
        <div className="mix-error">⚠️ ミックスIDが指定されていません。</div>
      </div>
    )
  }

  const videos = data?.videos || []
  const title = data?.title || 'ミックス'
  const firstThumb = videos.length > 0 ? getThumbnailUrl(videos[0].videoId) : ''

  return (
    <div className="mix-page">
      {loading && (
        <div className="mix-skeleton-wrap">
          <div className="mix-skel-header-card">
            <div className="mix-skel-cover" />
            <div className="mix-skel-meta">
              <div className="mix-skel-line title" />
              <div className="mix-skel-line medium" />
            </div>
          </div>
          <div className="loading-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="skeleton-card">
                <div className="skeleton-thumb" />
                <div className="skeleton-info">
                  <div className="skeleton-line long" />
                  <div className="skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mix-error">⚠️ {error}</div>
      )}

      {!loading && data && (
        <>
          <div className="mix-header">
            {firstThumb && (
              <div className="mix-cover">
                <SmartImage className="mix-cover-img loaded" src={firstThumb} alt={title} proxyWidth={960} />
                <div className="mix-cover-badge">ミックス</div>
              </div>
            )}
            <div className="mix-header-info">
              <h1 className="mix-title">{title}</h1>
              <div className="mix-meta">
                <span>{videos.length}本の動画</span>
              </div>
              <div className="mix-actions">
                {videos.length > 0 && (
                  <Link
                    className="mix-play-btn"
                    to={`/watch/${videos[0].videoId}?list=${encodeURIComponent(mixId)}&index=0`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 24 24" width="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    すべて再生
                  </Link>
                )}
                <button
                  className={`mix-fav-btn${favd ? ' active' : ''}`}
                  onClick={handleFav}
                  title={favd ? 'お気に入りから削除' : 'お気に入りに追加'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={favd ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                  {favd ? 'お気に入り済み' : 'お気に入り'}
                </button>
              </div>
            </div>
          </div>

          <div className="mix-grid-section">
            {videos.length === 0 ? (
              <div className="empty-message">このミックスには動画がありません。</div>
            ) : (
              <div className="video-grid mix-video-grid">
                {videos.map((video, i) => (
                  <MixVideoCard
                    key={video.videoId}
                    video={video}
                    index={i}
                    mixId={mixId}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom'
import { isFavoritePlaylist, toggleFavoritePlaylist } from '../lib/library'
import SmartImage from '../components/SmartImage'
import { buildVideoThumbnailUrl } from '../lib/imagePreferences'
import './Playlist.css'
import '../components/VideoCard.css'
import '../components/VideoGrid.css'

interface Thumbnail {
  url: string
  width?: number
  height?: number
}

interface PlaylistVideo {
  videoId: string
  title: string
  author?: string
  authorId?: string
  authorThumbnails?: Thumbnail[]
  lengthSeconds?: number
  viewCount?: number
  publishedText?: string
}

interface PlaylistData {
  title?: string
  description?: string
  playlistId?: string
  author?: string
  authorId?: string
  authorThumbnails?: Thumbnail[]
  playlistThumbnail?: string
  videoCount?: number
  viewCount?: number
  updated?: number
  videos?: PlaylistVideo[]
}

function formatDuration(seconds?: number): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatViews(n?: number): string {
  if (!n) return ''
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}億回視聴`
  if (n >= 10000) return `${Math.floor(n / 10000)}万回視聴`
  return `${n.toLocaleString()}回視聴`
}

function formatUpdated(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function getAvatarUrl(thumbs?: Thumbnail[] | null): string {
  if (!thumbs || thumbs.length === 0) return ''
  return thumbs.find(t => (t.width || 0) >= 32)?.url || thumbs[0]?.url || ''
}

function getThumbnailUrl(videoId: string): string {
  return buildVideoThumbnailUrl(videoId, 'mqdefault.jpg')
}

const playlistChannelAvatarCache = new Map<string, Thumbnail[] | null>()

async function fetchChannelAvatar(channelId: string): Promise<Thumbnail[] | null> {
  if (playlistChannelAvatarCache.has(channelId)) return playlistChannelAvatarCache.get(channelId) || null
  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(channelId)}`)
    if (!res.ok) throw new Error('avatar fetch failed')
    const data = await res.json() as { authorThumbnails?: Thumbnail[] }
    const thumbs = data.authorThumbnails || null
    playlistChannelAvatarCache.set(channelId, thumbs)
    return thumbs
  } catch {
    playlistChannelAvatarCache.set(channelId, null)
    return null
  }
}

async function fillMissingVideoIcons(data: PlaylistData): Promise<PlaylistData> {
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

function PlaylistVideoCard({
  video,
  playlistId,
  globalIndex,
}: {
  video: PlaylistVideo
  playlistId: string
  globalIndex: number
}) {
  const duration = formatDuration(video.lengthSeconds)
  const views = formatViews(video.viewCount)
  const thumb = getThumbnailUrl(video.videoId)
  const channelIcon = getAvatarUrl(video.authorThumbnails)
  const channelHref = video.authorId ? `/channel?id=${encodeURIComponent(video.authorId)}` : null
  const href = `/watch/${video.videoId}?list=${encodeURIComponent(playlistId)}&index=${globalIndex}`
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
        {views && (
          <div className="video-meta">
            <span className="view-count">{views}</span>
            {video.publishedText && <span className="published-date">{video.publishedText}</span>}
          </div>
        )}
      </div>
    </Link>
  )
}

export default function Playlist() {
  const { id: pathId } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const playlistId = searchParams.get('list') || pathId || ''
  const [currentPage, setCurrentPage] = useState(() =>
    parseInt(searchParams.get('page') || '1', 10)
  )

  const [data, setData] = useState<PlaylistData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [descExpanded, setDescExpanded] = useState(false)
  const [favd, setFavd] = useState(() => isFavoritePlaylist(playlistId))

  useEffect(() => { setFavd(isFavoritePlaylist(playlistId)) }, [playlistId])

  const handleFav = () => {
    const thumb = data?.playlistThumbnail || (data?.videos?.[0]?.videoId ? getThumbnailUrl(data.videos[0].videoId) : undefined)
    const next = toggleFavoritePlaylist({
      playlistId,
      title: data?.title || playlistId,
      author: data?.author,
      authorId: data?.authorId,
      thumbnail: thumb,
      videoCount: data?.videoCount,
    })
    setFavd(next)
  }

  useEffect(() => {
    if (!playlistId) return
    setLoading(true)
    setError('')
    setData(null)
    fetch(`/api/playlists/${encodeURIComponent(playlistId)}?page=${currentPage}`)
      .then(r => {
        if (!r.ok) return r.json().then(j => Promise.reject(new Error(j.error || `HTTP ${r.status}`)))
        return r.json()
      })
      .then((json: PlaylistData) => fillMissingVideoIcons(json))
      .then((json: PlaylistData) => {
        setData(json)
        setLoading(false)
      })
      .catch((e: Error) => {
        setError(e.message)
        setLoading(false)
      })
  }, [playlistId, currentPage])

  const navigatePage = (page: number) => {
    const url = new URLSearchParams()
    url.set('list', playlistId)
    if (page > 1) url.set('page', String(page))
    navigate(`/playlist?${url.toString()}`)
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!playlistId) {
    return (
      <div className="playlist-page">
        <div className="pl-error">⚠️ プレイリストIDが指定されていません。</div>
      </div>
    )
  }

  const videos = data?.videos || []
  const totalVideos = data?.videoCount || 0
  const videosPerPage = videos.length || 100
  const totalPages = totalVideos > 0 ? Math.ceil(totalVideos / 100) : null
  const hasNext = totalPages ? currentPage < totalPages : videosPerPage >= 100
  const hasPrev = currentPage > 1
  const pageOffset = (currentPage - 1) * 100

  const thumb = data?.playlistThumbnail ||
    (videos[0]?.videoId ? getThumbnailUrl(videos[0].videoId) : '')
  const channelIcon = getAvatarUrl(data?.authorThumbnails)
  const desc = data?.description || ''
  const hasMoreDesc = desc.length > 200 || desc.split('\n').length > 3

  return (
    <div className="playlist-page">
      {loading && (
        <div className="pl-skeleton-header-wrap">
          <div className="pl-skel-header">
            <div className="pl-skel-cover" />
            <div className="pl-skel-meta">
              <div className="pl-skel-line title" />
              <div className="pl-skel-line medium" />
              <div className="pl-skel-line short" />
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
        <div className="pl-error">⚠️ {error}</div>
      )}

      {!loading && data && (
        <>
          <div className="pl-header">
            {thumb && (
              <div className="pl-cover">
                <SmartImage
                  className="pl-cover-img loaded"
                  src={thumb}
                  proxyWidth={960}
                  alt={data.title || ''}
                />
                {data.videoCount != null && (
                  <div className="pl-cover-count">
                    <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 0 24 24" width="16" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/></svg>
                    {data.videoCount}本
                  </div>
                )}
              </div>
            )}
            <div className="pl-header-meta">
              <h1 className="pl-title">{data.title || '再生リスト'}</h1>
              {data.authorId ? (
                <Link className="pl-channel-link" to={`/channel/${data.authorId}`}>
                  {channelIcon && <SmartImage className="pl-channel-avatar loaded" src={channelIcon} alt={data.author || ''} proxyWidth={88} />}
                  <span>{data.author || ''}</span>
                </Link>
              ) : data.author ? (
                <div className="pl-channel-link static">
                  {channelIcon && <SmartImage className="pl-channel-avatar loaded" src={channelIcon} alt={data.author} proxyWidth={88} />}
                  <span>{data.author}</span>
                </div>
              ) : null}
              <div className="pl-stats">
                {data.videoCount != null && <span>{data.videoCount}本の動画</span>}
                {data.viewCount != null && <span>{Number(data.viewCount).toLocaleString()}回視聴</span>}
                {data.updated && <span>更新日 {formatUpdated(data.updated)}</span>}
              </div>
              {desc && (
                <div className={`pl-description${descExpanded ? ' expanded' : ''}`}>
                  {desc}
                </div>
              )}
              {hasMoreDesc && (
                <button className="pl-desc-toggle" onClick={() => setDescExpanded(v => !v)}>
                  {descExpanded ? '閉じる' : 'もっと見る'}
                </button>
              )}
              <div className="pl-header-actions">
                {videos.length > 0 && (
                  <Link
                    className="pl-play-all-btn"
                    to={`/watch/${videos[0].videoId}?list=${encodeURIComponent(playlistId)}&index=${pageOffset}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 24 24" width="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    すべて再生
                  </Link>
                )}
                <button
                  className={`pl-fav-btn${favd ? ' active' : ''}`}
                  onClick={handleFav}
                  title={favd ? 'お気に入りから削除' : 'お気に入りに追加'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={favd ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                  {favd ? 'お気に入り済み' : 'お気に入り'}
                </button>
                <a
                  className="pl-ext-link"
                  href={`https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  YouTubeで開く
                </a>
              </div>
            </div>
          </div>

          <div className="pl-grid-section">
            {videos.length === 0 ? (
              <div className="empty-message">動画が見つかりませんでした。</div>
            ) : (
              <div className="video-grid pl-video-grid">
                {videos.map((video, i) => (
                  <PlaylistVideoCard
                    key={video.videoId}
                    video={video}
                    playlistId={playlistId}
                    globalIndex={pageOffset + i}
                  />
                ))}
              </div>
            )}
          </div>

          {(hasNext || hasPrev) && (
            <div className="pl-pagination">
              <button
                className="pl-page-btn"
                disabled={!hasPrev}
                onClick={() => navigatePage(currentPage - 1)}
              >
                ‹ 前へ
              </button>
              <span className="pl-page-info">
                {totalPages ? `${currentPage} / ${totalPages} ページ` : `${currentPage} ページ`}
              </span>
              <button
                className="pl-page-btn"
                disabled={!hasNext}
                onClick={() => navigatePage(currentPage + 1)}
              >
                次へ ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

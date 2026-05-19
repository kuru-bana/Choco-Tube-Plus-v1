import { Link } from 'react-router-dom'
import type { VideoItem } from '../types'
import { getProxyThumbnail } from '../api/utils'
import SmartImage from './SmartImage'
import { buildVideoThumbnailUrl, getImageProxyMode } from '../lib/imagePreferences'
import './VideoCard.css'

interface Props {
  video: VideoItem
  proxyType?: string
  href?: string
}

function getChannelIconUrl(thumbs?: Array<{ url: string; width?: number; height?: number }>): string {
  if (!thumbs || thumbs.length === 0) return ''
  const small = thumbs.find(t => Number(t.width || 0) <= 88) || thumbs[0]
  return small?.url || ''
}

export default function VideoCard({ video, proxyType = getImageProxyMode(), href }: Props) {
  const thumbSrc = video.id
    ? getProxyThumbnail(video.id, proxyType)
    : video.thumbnail
  const fallbackThumb = video.id ? buildVideoThumbnailUrl(video.id) : video.thumbnail
  const badges = [
    video.live ? 'LIVE' : '',
    video.is4k ? '4K' : '',
    video.is360 ? '360°' : '',
    video.hasCaptions ? 'CC' : '',
  ].filter(Boolean)

  const channelIcon = getChannelIconUrl(video.authorThumbnails)
  const channelHref = video.channel_id ? `/channel?id=${encodeURIComponent(video.channel_id)}` : null
  const cardHref = href || `/watch/${video.id}`

  return (
    <Link to={cardHref} className="video-card">
      <div className="thumbnail-container">
        <SmartImage
          src={thumbSrc}
          fallbackSrc={fallbackThumb}
          alt={video.title}
          loading="lazy"
        />
        {video.duration && (
          <span className="video-duration">{video.duration}</span>
        )}
        {badges.length > 0 && (
          <div className="badge-row">
            {badges.map(badge => <span key={badge} className={`video-badge${badge === 'LIVE' ? ' live' : ''}`}>{badge}</span>)}
          </div>
        )}
      </div>
      <div className="video-info">
        <h3 className="card-title">{video.title}</h3>
        <div className="card-meta">
          <div className="card-channel-row">
            {channelIcon ? (
              <SmartImage
                className="card-channel-icon loaded"
                src={channelIcon}
                proxyWidth={88}
                alt={video.channel}
                loading="lazy"
                onClick={channelHref ? (e) => { e.preventDefault(); e.stopPropagation(); window.location.href = channelHref } : undefined}
              />
            ) : (
              <div className="card-channel-icon-placeholder" />
            )}
            <span
              className="card-channel-name"
              onClick={channelHref ? (e) => { e.preventDefault(); e.stopPropagation(); window.location.href = channelHref } : undefined}
              style={channelHref ? { cursor: 'pointer' } : undefined}
            >
              {video.channel}
            </span>
          </div>
          {video.views && video.views !== 'N/A' && (
            <span className="card-views">{video.views}</span>
          )}
          {video.published_at && (
            <span className="card-published">{video.published_at}</span>
          )}
        </div>
      </div>
    </Link>
  )
}

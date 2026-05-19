import type { SearchResultItem } from '../types'
import VideoCard from './VideoCard'
import ChannelCard from './ChannelCard'
import PlaylistCard from './PlaylistCard'
import { getImageProxyMode } from '../lib/imagePreferences'
import './VideoGrid.css'

interface Props {
  items: SearchResultItem[]
  loading?: boolean
  emptyMessage?: string
  proxyType?: string
}

export default function VideoGrid({ items, loading, emptyMessage = '結果がありません', proxyType = getImageProxyMode() }: Props) {
  if (loading) {
    return (
      <div className="loading-grid">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton-thumb" />
            <div className="skeleton-info">
              <div className="skeleton-line long" />
              <div className="skeleton-line short" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!items || items.length === 0) {
    return <div className="empty-message">{emptyMessage}</div>
  }

  return (
    <div className="video-grid">
      {items.map(item => {
        if (item.type === 'channel') return <ChannelCard key={`channel-${item.id}`} channel={item} />
        if (item.type === 'playlist') return <PlaylistCard key={`playlist-${item.id}`} playlist={item} />
        return <VideoCard key={`video-${item.id}`} video={item} proxyType={proxyType} />
      })}
    </div>
  )
}

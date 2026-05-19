import type { PlaylistItem } from '../types'
import SmartImage from './SmartImage'
import './PlaylistCard.css'

interface Props {
  playlist: PlaylistItem
}

export default function PlaylistCard({ playlist }: Props) {
  const isMix = playlist.id && playlist.id.startsWith('RD')
  const href = isMix
    ? `/mix?id=${encodeURIComponent(playlist.id)}`
    : `/playlist?list=${encodeURIComponent(playlist.id)}`
  return (
    <a href={href} className="video-card playlist-card">
      <div className="thumbnail-container playlist-thumb-wrap">
        {playlist.thumbnail ? <SmartImage src={playlist.thumbnail} alt={playlist.title} loading="lazy" proxyWidth={480} /> : <div className="playlist-placeholder" />}
        <span className="playlist-count-badge">{playlist.video_count != null ? `${playlist.video_count}本` : '再生リスト'}</span>
      </div>
      <div className="video-info">
        <h3>{playlist.title}</h3>
        {playlist.channel && <p>{playlist.channel}</p>}
      </div>
    </a>
  )
}

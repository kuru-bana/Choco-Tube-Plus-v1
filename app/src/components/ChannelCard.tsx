import { Link } from 'react-router-dom'
import type { ChannelItem } from '../types'
import SmartImage from './SmartImage'
import './ChannelCard.css'

interface Props {
  channel: ChannelItem
}

export default function ChannelCard({ channel }: Props) {
  const id = channel.authorId || channel.id
  const name = channel.author || channel.title
  const icon = channel.authorThumbnails?.length
    ? channel.authorThumbnails.find(t => (t.width || 0) >= 48)?.url || channel.authorThumbnails[0]?.url
    : channel.thumbnail
  const subscribers = channel.subCount || channel.subscribers

  const formatSubs = (n?: number) => {
    if (!n) return ''
    if (n >= 100000000) return `${(n / 100000000).toFixed(1)}億人`
    if (n >= 10000) return `${Math.floor(n / 10000)}万人`
    return `${n.toLocaleString()}人`
  }

  return (
    <Link to={`/channel?id=${encodeURIComponent(id)}`} className="channel-card">
      <div className="channel-card-inner">
        {icon ? (
          <SmartImage
            className="channel-card-icon loaded"
            src={icon}
            proxyWidth={88}
            alt={name}
            loading="lazy"
          />
        ) : (
          <div className="channel-card-icon-placeholder" />
        )}
        <div className="channel-card-info">
          <div className="channel-card-name">
            {name}
            {(channel.authorVerified || channel.verified) && <span className="verified-badge" title="認証済み">✓</span>}
          </div>
          {subscribers ? <div className="channel-card-subs">登録者 {formatSubs(subscribers)}</div> : null}
          {channel.description ? <div className="channel-card-desc">{channel.description}</div> : null}
        </div>
      </div>
    </Link>
  )
}

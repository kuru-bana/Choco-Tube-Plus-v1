export interface VideoItem {
  id: string
  title: string
  thumbnail: string
  channel: string
  channel_id?: string
  type: 'video'
  views: string
  published_at: string
  duration?: string
  live?: boolean
  is4k?: boolean
  is360?: boolean
  hasCaptions?: boolean
  authorThumbnails?: Array<{ url: string; width?: number; height?: number }>
}

export interface ChannelItem {
  id: string
  title: string
  thumbnail: string
  type: 'channel'
  description?: string
  subscribers?: number
  verified?: boolean
  author?: string
  authorId?: string
  authorVerified?: boolean
  authorThumbnails?: Array<{ url: string; width?: number; height?: number }>
  subCount?: number
}

export interface PlaylistItem {
  id: string
  title: string
  thumbnail: string
  channel?: string
  channel_id?: string
  type: 'playlist'
  video_count?: number | null
}

export type SearchResultItem = VideoItem | ChannelItem | PlaylistItem

export interface SearchResponse {
  results: SearchResultItem[]
  query: string
  next_page: string | null
  page: number
  search_source: 'youtube' | 'invidious'
}

export interface Stream {
  url: string
  quality: string
  format: string
  container: string
  hasAudio: boolean
  hasVideo: boolean
  isHLS: boolean
  isLive?: boolean
}

export interface StreamResult {
  streams: Stream[]
  instance: string
  proxy?: string
}

export interface VideoMetadata {
  videoId: string
  title: string
  description: string
  author: string
  authorId: string
  viewCount: number
  likeCount?: number
  publishedText: string
  lengthSeconds: number
  isLive: boolean
}

export interface TrendVideo {
  id: string
  title: string
  thumbnail: string
  channel: string
  duration: string
  views: string
  published_at: string
}


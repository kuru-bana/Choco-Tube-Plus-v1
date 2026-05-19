import type { SearchResultItem, VideoMetadata } from '../types'

export interface WatchMetadata {
  video_id: string
  video_title: string | null
  view_count: string | null
  published_at: string | null
  channel_name: string | null
  channel_id: string | null
  subscriber_count: string | null
  channel_icon: string | null
  duration_seconds: number
  description?: string | null
  like_count?: number | null
  recommendedVideos?: RelatedVideo[]
  source?: string | null
}

export interface Thumbnail {
  url: string
  width?: number
  height?: number
}

export interface RelatedVideo {
  videoId: string
  title: string
  author?: string
  authorId?: string
  authorThumbnails?: Thumbnail[]
  lengthSeconds?: number
  viewCount?: number
  viewCountText?: string
  publishedText?: string
}

export interface WatchComment {
  authorId?: string
  author?: string
  verified?: boolean
  authorVerified?: boolean
  authorThumbnails?: Thumbnail[]
  likeCount?: number
  replyCount?: number
  isPinned?: boolean
  commentId?: string
  content?: string
  publishedText?: string
  replies?: {
    replyCount?: number
    continuation?: string
  }
}

export interface WatchCommentsResponse {
  commentCount?: number
  comments: WatchComment[]
  continuation?: string | null
  source_instance?: string
}

interface InvTubeVideoResponse {
  source_instance?: string
  title?: string
  videoId?: string
  description?: string
  publishedText?: string
  viewCount?: number
  likeCount?: number
  author?: string
  authorId?: string
  authorThumbnails?: Thumbnail[]
  subCountText?: string
  subCount?: number
  lengthSeconds?: number
  recommendedVideos?: RelatedVideo[]
}

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  try {
    const url = new URL(path, window.location.origin)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
      }
    }
    const res = await fetch(url.toString())
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}

function formatCompactCount(count: number | undefined | null): string | null {
  if (!count || Number.isNaN(count)) return null
  if (count >= 100000000) return `${(count / 100000000).toFixed(1)}億`
  if (count >= 10000) return `${Math.floor(count / 10000)}万`
  return count.toLocaleString()
}

function pickThumb(thumbnails?: Thumbnail[]): string | null {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return null
  return thumbnails[thumbnails.length - 1]?.url || thumbnails[0]?.url || null
}

export async function searchYouTube(
  query: string,
  pageToken: string | null = null,
  proxyType = 'wsrv.nl',
  searchType = 'video'
): Promise<{ results: SearchResultItem[]; nextPage: string | null } | null> {
  return apiFetch('/api/youtube/search', {
    q: query,
    ...(pageToken ? { pageToken } : {}),
    proxy: proxyType,
    type: searchType,
  })
}

export async function getVideoMetadata(videoId: string): Promise<VideoMetadata | null> {
  return apiFetch(`/api/youtube/video/${videoId}`)
}

export async function fetchWatchMetadata(videoId: string): Promise<WatchMetadata> {
  const defaultResult: WatchMetadata = {
    video_id: videoId,
    video_title: null,
    view_count: null,
    published_at: null,
    channel_name: null,
    channel_id: null,
    subscriber_count: null,
    channel_icon: null,
    duration_seconds: 0,
    description: null,
    like_count: null,
    recommendedVideos: [],
    source: null,
  }
  const inv = await apiFetch<InvTubeVideoResponse>(`/api/videos/${videoId}`)
  if (inv && (inv.title || inv.videoId)) {
    const invRecommended = Array.isArray(inv.recommendedVideos) ? inv.recommendedVideos : []
    let recommendedVideos = invRecommended
    if (recommendedVideos.length === 0) {
      const fallback = await apiFetch<WatchMetadata>(`/api/youtube/watch/${videoId}`)
      if (fallback && Array.isArray(fallback.recommendedVideos) && fallback.recommendedVideos.length > 0) {
        recommendedVideos = fallback.recommendedVideos
      }
    }
    return {
      video_id: inv.videoId || videoId,
      video_title: inv.title || null,
      view_count: formatCompactCount(inv.viewCount),
      published_at: inv.publishedText || null,
      channel_name: inv.author || null,
      channel_id: inv.authorId || null,
      subscriber_count: inv.subCountText || formatCompactCount(inv.subCount),
      channel_icon: pickThumb(inv.authorThumbnails),
      duration_seconds: Number(inv.lengthSeconds || 0),
      description: inv.description || null,
      like_count: inv.likeCount ?? null,
      recommendedVideos,
      source: inv.source_instance || null,
    }
  }
  const result = await apiFetch<WatchMetadata>(`/api/youtube/watch/${videoId}`)
  return result ? { ...defaultResult, ...result } : defaultResult
}

export async function fetchWatchComments(
  videoId: string,
  sortBy = 'top',
  continuation?: string | null
): Promise<WatchCommentsResponse> {
  const result = await apiFetch<WatchCommentsResponse>(`/api/comments/${videoId}`, {
    sort_by: sortBy,
    ...(continuation ? { continuation } : {}),
  })
  return result || { comments: [], continuation: null }
}

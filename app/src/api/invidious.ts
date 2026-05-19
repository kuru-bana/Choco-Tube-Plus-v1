import type { SearchResultItem, VideoMetadata } from '../types'

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

export async function searchInvidious(
  query: string,
  page = 1,
  proxyType = 'wsrv.nl',
  searchType = 'video'
): Promise<{ results: SearchResultItem[]; nextPage: number } | null> {
  return apiFetch('/api/invidious/search', {
    q: query,
    page: String(page),
    proxy: proxyType,
    type: searchType,
  })
}

export async function getVideoMetadataInvidious(videoId: string): Promise<VideoMetadata | null> {
  return apiFetch(`/api/invidious/video/${videoId}`)
}

export async function getRelatedVideosInvidious(videoId: string, proxyType = 'wsrv.nl'): Promise<SearchResultItem[]> {
  const result = await apiFetch<SearchResultItem[]>(`/api/invidious/related/${videoId}`, { proxy: proxyType })
  return result || []
}

export async function getTrendingInvidious(region: string, proxyType = 'wsrv.nl'): Promise<{
  id: string; title: string; thumbnail: string; channel: string; duration: string; views: string; published_at: string
}[]> {
  const result = await apiFetch<{
    id: string; title: string; thumbnail: string; channel: string; duration: string; views: string; published_at: string
  }[]>('/api/invidious/trending', { region, proxy: proxyType })
  return result || []
}

interface TrendVideo {
  id: string
  title: string
  thumbnail: string
  channel: string
  channel_id?: string | null
  author_thumbnails?: Array<{ url: string; width?: number; height?: number }> | null
  duration: string
  views: string
  published_at: string
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

export async function getTrend(region: string, category: string, proxyType: string): Promise<TrendVideo[]> {
  const result = await apiFetch<TrendVideo[]>('/api/trend', { region, category, proxy: proxyType })
  return result || []
}

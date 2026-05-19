import type { Stream, StreamResult } from '../types'

export const YTDLP_ALL_SOURCES: { key: string; label: string }[] = [
  { key: 'xerox',    label: 'xerox API'     },
  { key: 'yuzu',     label: 'yuzu API'      },
  { key: 'siawase',  label: 'しあ API'      },
  { key: 'wista',    label: 'wista API'     },
  { key: 'min2tube', label: 'min2-tube API' },
  { key: 'katuo',    label: 'katuo API'     },
]

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

export async function fetchYtdlpStreams(
  videoId: string,
  exclude: string[] = [],
  onLog?: (msg: string, level?: string) => void,
  mode: 'sequential' | 'parallel' | 'specific' = 'sequential',
  specificApi?: string,
  timeoutMs?: number,
  sequentialOrder?: string[]
): Promise<{ streams: Stream[]; source: string; failedSources: string[] } | null> {
  // Specific source mode: use regular endpoint
  if (mode === 'specific' && specificApi) {
    const params: Record<string, string> = { mode: 'specific', source: specificApi }
    if (timeoutMs) params.timeout = String(timeoutMs)
    onLog?.('ストリーム取得中...')
    const result = await apiFetch<{ streams: Stream[]; source: string; failedSources: string[] }>(
      `/api/stream/ytdlp/${videoId}`, params
    )
    if (result) onLog?.(`✅ 取得成功 [${result.source}]`)
    return result
  }

  // Sequential mode: use regular endpoint to respect custom API order
  if (mode === 'sequential') {
    const params: Record<string, string> = { mode: 'sequential' }
    if (exclude.length > 0) params.exclude = exclude.join(',')
    if (timeoutMs) params.timeout = String(timeoutMs)
    if (sequentialOrder && sequentialOrder.length > 0) params.order = sequentialOrder.join(',')
    onLog?.('ストリーム取得中...')
    const result = await apiFetch<{ streams: Stream[]; source: string; failedSources: string[] }>(
      `/api/stream/ytdlp/${videoId}`, params
    )
    if (result) onLog?.(`✅ 取得成功 [${result.source}]`)
    return result
  }

  // parallel: use SSE endpoint — returns as soon as the fastest source succeeds
  onLog?.('ストリーム取得中...')
  return new Promise((resolve) => {
    const urlParams = new URLSearchParams()
    if (exclude.length > 0) urlParams.set('exclude', exclude.join(','))
    if (timeoutMs) urlParams.set('timeout', String(timeoutMs))
    const url = `/api/stream/ytdlp-all/${videoId}` + (urlParams.toString() ? `?${urlParams}` : '')
    const evtSource = new EventSource(url)
    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { done?: boolean; source?: string; streams?: Stream[] | null }
        if (data.done) {
          evtSource.close()
          resolve(null)
          return
        }
        if (data.streams && data.streams.length > 0) {
          evtSource.close()
          onLog?.(`✅ 取得成功 [${data.source}]`)
          resolve({ streams: data.streams, source: data.source ?? '', failedSources: [] })
        }
      } catch { /* ignore */ }
    }
    evtSource.onerror = () => {
      evtSource.close()
      resolve(null)
    }
  })
}

export async function fetchYtdlpAllSources(
  videoId: string,
  onUpdate: (source: string, streams: Stream[] | null) => void
): Promise<void> {
  return new Promise<void>((resolve) => {
    const evtSource = new EventSource(`/api/stream/ytdlp-all/${videoId}`)
    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { done?: boolean; source?: string; streams?: Stream[] | null }
        if (data.done) {
          evtSource.close()
          resolve()
          return
        }
        if (data.source !== undefined) {
          onUpdate(data.source, data.streams ?? null)
        }
      } catch { /* ignore */ }
    }
    evtSource.onerror = () => {
      evtSource.close()
      resolve()
    }
  })
}

export async function fetchKtubeStream(videoId: string, _timeoutMs = 15000): Promise<StreamResult | null> {
  return apiFetch<StreamResult>(`/api/stream/ktube/${videoId}`)
}

export async function fetchGithubProxies(): Promise<string[]> {
  try {
    const res = await fetch('/api/stream/cors-proxies')
    if (!res.ok) return []
    const data = await res.json() as { proxies: string[] }
    return data.proxies || []
  } catch { return [] }
}

export async function fetchHdadStreams(
  videoId: string,
  onLog?: (msg: string, level?: string) => void,
  excludeKeys: string[] = []
): Promise<{ streams: Stream[]; source: string } | null> {
  const params: Record<string, string> = {}
  if (excludeKeys.length > 0) params.exclude = excludeKeys.join(',')
  onLog?.('HD+AD: 映像・音声分離ストリームを取得中...')
  const result = await apiFetch<{ streams: Stream[]; source: string }>(
    `/api/stream/hdad/${videoId}`, params
  )
  if (result) onLog?.(`✅ 取得成功 [${result.source}]`)
  return result
}

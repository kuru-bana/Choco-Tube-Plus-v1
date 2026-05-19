import { buildVideoThumbnailUrl, getImageProxyMode, transformImageUrl } from '../lib/imagePreferences'

export function parseISO8601Duration(duration: string): string {
  if (!duration) return ''
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return ''
  const hours = parseInt(match[1] || '0')
  const minutes = parseInt(match[2] || '0')
  const seconds = parseInt(match[3] || '0')
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function parseDurationToSeconds(duration: string): number {
  if (!duration) return 0
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  const h = parseInt(match[1] || '0')
  const m = parseInt(match[2] || '0')
  const s = parseInt(match[3] || '0')
  return h * 3600 + m * 60 + s
}

export function formatViewCount(count: number | string): string {
  const n = typeof count === 'string' ? parseInt(count) : count
  if (isNaN(n)) return 'N/A'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function formatTimeSeconds(seconds: number): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function getProxyThumbnail(videoId: string, proxyType: string): string {
  const sourceUrl = buildVideoThumbnailUrl(videoId)
  if (proxyType === 'server' || proxyType === 'base64') return transformImageUrl(sourceUrl, proxyType)
  if (proxyType === 'wsrv.nl') return transformImageUrl(sourceUrl, 'wsrv.nl')
  if (proxyType === 'img.youtube.com') return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  if (proxyType === 'i.ytimg.com') return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  if (proxyType === 'self-hosted') return `https://choco-thumb1.onrender.com/vi/${videoId}/hqdefault.jpg`
  return transformImageUrl(sourceUrl, getImageProxyMode())
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function fetchWithTimeout(url: string, ms: number, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  if (signal) {
    if (signal.aborted) { clearTimeout(timer); throw new DOMException('Aborted', 'AbortError') }
    signal.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    return res
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}

export function getCookie(name: string): string | null {
  const v = document.cookie.split('; ').find(r => r.startsWith(name + '='))
  return v ? decodeURIComponent(v.split('=')[1]) : null
}

export function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=2592000; path=/`
}

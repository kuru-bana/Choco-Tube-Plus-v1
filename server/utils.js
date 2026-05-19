export function parseISO8601Duration(duration) {
  if (!duration) return ''
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return ''
  const hours = parseInt(match[1] || '0')
  const minutes = parseInt(match[2] || '0')
  const seconds = parseInt(match[3] || '0')
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function parseDurationToSeconds(duration) {
  if (!duration) return 0
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  const h = parseInt(match[1] || '0')
  const m = parseInt(match[2] || '0')
  const s = parseInt(match[3] || '0')
  return h * 3600 + m * 60 + s
}

export function formatViewCount(count) {
  const n = typeof count === 'string' ? parseInt(count) : count
  if (isNaN(n)) return 'N/A'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function formatTimeSeconds(seconds) {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function getProxyThumbnail(videoId, proxyType) {
  const sourceUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  if (proxyType === 'server' || proxyType === 'base64') return `/api/thumbnail/proxy?url=${encodeURIComponent(sourceUrl)}`
  if (proxyType === 'wsrv.nl') return `https://wsrv.nl/?url=${encodeURIComponent(sourceUrl)}&output=webp`
  if (proxyType === 'img.youtube.com') return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  if (proxyType === 'i.ytimg.com') return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  if (proxyType === 'self-hosted') return `https://choco-thumb1.onrender.com/vi/${videoId}/hqdefault.jpg`
  return sourceUrl
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function fetchWithTimeout(url, ms, signal) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  if (signal) {
    if (signal.aborted) { clearTimeout(timer); throw new Error('Aborted') }
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

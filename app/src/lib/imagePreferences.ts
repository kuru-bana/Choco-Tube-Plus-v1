export type ImageProxyMode = 'wsrv.nl' | 'server' | 'base64'

export const IMAGE_PROXY_MODE_KEY = 'proxy_type'

export const IMAGE_PROXY_OPTIONS: Array<{ value: ImageProxyMode; label: string; description: string }> = [
  { value: 'wsrv.nl', label: 'wsrv.nl', description: '外部画像プロキシを使って表示します。' },
  { value: 'server', label: 'このサーバーで処理', description: 'このアプリのサーバー経由で画像を取得して表示します。' },
  { value: 'base64', label: 'base64', description: 'このアプリのサーバーで画像をbase64化して表示します。' },
]

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const value = document.cookie.split('; ').find(row => row.startsWith(`${name}=`))
  return value ? decodeURIComponent(value.split('=')[1]) : null
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=2592000; path=/`
}

export function isImageProxyMode(value: string | null | undefined): value is ImageProxyMode {
  return value === 'wsrv.nl' || value === 'server' || value === 'base64'
}

export function getImageProxyMode(): ImageProxyMode {
  if (typeof window === 'undefined') return 'wsrv.nl'
  try {
    const localValue = window.localStorage.getItem(IMAGE_PROXY_MODE_KEY)
    if (isImageProxyMode(localValue)) return localValue
  } catch {}
  const cookieValue = readCookie(IMAGE_PROXY_MODE_KEY)
  return isImageProxyMode(cookieValue) ? cookieValue : 'wsrv.nl'
}

export function saveImageProxyMode(mode: ImageProxyMode): void {
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(IMAGE_PROXY_MODE_KEY, mode) } catch {}
  }
  writeCookie(IMAGE_PROXY_MODE_KEY, mode)
}

export function buildVideoThumbnailUrl(videoId: string, file = 'hqdefault.jpg'): string {
  return `https://i.ytimg.com/vi/${videoId}/${file}`
}

export function transformImageUrl(url: string, mode: ImageProxyMode = getImageProxyMode(), width?: number): string {
  if (!url) return ''
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')) return url
  if (mode === 'server') return `/api/thumbnail/proxy?url=${encodeURIComponent(url)}`
  if (mode === 'base64') return url
  const widthParam = width ? `&w=${width}` : ''
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}${widthParam}&output=webp`
}

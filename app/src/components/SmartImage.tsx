import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { getImageProxyMode, transformImageUrl, type ImageProxyMode } from '../lib/imagePreferences'

interface SmartImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string
  fallbackSrc?: string
  proxyMode?: ImageProxyMode
  proxyWidth?: number
}

const base64Cache = new Map<string, string>()

function normalizeBase64(value: string, contentType?: string): string {
  if (value.startsWith('data:')) return value
  return `data:${contentType || 'image/jpeg'};base64,${value}`
}

export default function SmartImage({ src, fallbackSrc, proxyMode, proxyWidth, onError, ...props }: SmartImageProps) {
  const mode = proxyMode || getImageProxyMode()
  const [resolvedSrc, setResolvedSrc] = useState(() => transformImageUrl(src, mode, proxyWidth))

  useEffect(() => {
    let cancelled = false
    if (!src) {
      setResolvedSrc('')
      return
    }
    if (mode !== 'base64' || src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('/')) {
      setResolvedSrc(transformImageUrl(src, mode, proxyWidth))
      return
    }
    const cached = base64Cache.get(src)
    if (cached) {
      setResolvedSrc(cached)
      return
    }
    setResolvedSrc(transformImageUrl(src, 'server', proxyWidth))
    fetch(`/api/thumbnail/base64-url?url=${encodeURIComponent(src)}`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then((data: { thumbnail?: string; contentType?: string }) => {
        if (!data.thumbnail) throw new Error('Missing thumbnail')
        const next = normalizeBase64(data.thumbnail, data.contentType)
        base64Cache.set(src, next)
        if (!cancelled) setResolvedSrc(next)
      })
      .catch(() => {
        if (!cancelled) setResolvedSrc(fallbackSrc ? transformImageUrl(fallbackSrc, 'server', proxyWidth) : transformImageUrl(src, 'server', proxyWidth))
      })
    return () => { cancelled = true }
  }, [src, fallbackSrc, mode, proxyWidth])

  return (
    <img
      {...props}
      src={resolvedSrc}
      onError={event => {
        if (fallbackSrc && event.currentTarget.src !== fallbackSrc) {
          event.currentTarget.src = transformImageUrl(fallbackSrc, mode === 'base64' ? 'server' : mode, proxyWidth)
        }
        onError?.(event)
      }}
    />
  )
}

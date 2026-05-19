import { Router } from 'express'

const router = Router()

const RAPID_API_BASES = [
  'https://choco-rapid-api.onrender.com',
  'https://choco-rapid-api-dnoaw.onrender.com',
]

function parseRapidStreams(data) {
  const streams = []
  for (const f of data.formats ?? []) {
    const mime = f.mimeType ?? ''
    const isWebm = mime.includes('webm')
    const container = isWebm ? 'webm' : 'mp4'
    const codec = isWebm ? 'WebM' : 'MP4'
    const base = f.qualityLabel || f.quality || (f.height ? `${f.height}p` : 'unknown')
    const quality = `${base} (${codec})`
    streams.push({ url: f.url, quality, format: 'mp4', container, hasAudio: true, hasVideo: true, isHLS: false })
  }
  for (const f of data.adaptiveFormats ?? []) {
    const mime = f.mimeType ?? ''
    const isVideo = mime.startsWith('video/')
    const isAudio = mime.startsWith('audio/')
    const isWebm = mime.includes('webm')
    const container = isWebm ? 'webm' : (isAudio ? 'm4a' : 'mp4')
    if (isVideo) {
      const fps = f.fps && f.fps > 30 ? f.fps : 0
      const base = f.qualityLabel || (f.height ? `${f.height}p${fps ? fps : ''}` : 'unknown')
      const codec = isWebm ? 'WebM' : 'H.264'
      const quality = `${base} (${codec})`
      const fmt = isWebm ? 'webmv' : 'mp4v'
      streams.push({ url: f.url, quality, format: fmt, container, hasAudio: false, hasVideo: true, isHLS: false })
    } else if (isAudio) {
      const fmt = isWebm ? 'webma' : 'm4a'
      const audioBitrate = f.bitrate ? `${Math.round(f.bitrate / 1000)}k` : 'audio'
      const audioCodec = isWebm ? 'WebM' : 'M4A'
      const quality = `${audioBitrate} (${audioCodec})`
      streams.push({ url: f.url, quality, format: fmt, container, hasAudio: true, hasVideo: false, isHLS: false })
    }
  }
  return streams
}

router.get('/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params
    const shuffled = [...RAPID_API_BASES].sort(() => Math.random() - 0.5)

    for (const base of shuffled) {
      try {
        const r = await fetch(`${base}/api/stream/${videoId}`, { signal: AbortSignal.timeout(20000) })
        if (!r.ok) continue
        const data = await r.json()
        if (data.status && data.status !== 'OK') continue
        const streams = parseRapidStreams(data)
        if (streams.length === 0) continue
        const hostname = (() => { try { return new URL(base).hostname } catch { return base } })()
        return res.json({ streams, source: hostname })
      } catch { continue }
    }

    res.status(503).json({ error: '全Rapid APIからの取得に失敗しました' })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

export default router

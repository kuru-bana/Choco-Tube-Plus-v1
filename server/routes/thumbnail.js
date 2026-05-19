import { Router } from 'express'

const router = Router()

const SIAWASE_VIDEO_API = 'https://siawaseok.duckdns.org/api/video2'

const allowedHosts = [
  'i.ytimg.com', 'i1.ytimg.com', 'i2.ytimg.com', 'i3.ytimg.com',
  'i4.ytimg.com', 'i9.ytimg.com', 'img.youtube.com',
  'wsrv.nl', 'image-proxy.poketube.fun',
  'choco-thumb1.onrender.com',
  'yt3.ggpht.com', 'yt4.ggpht.com',
  'yt3.googleusercontent.com', 'yt4.googleusercontent.com',
  'lh3.googleusercontent.com', 'lh4.googleusercontent.com',
]

function isAllowedImageUrl(url) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') return false
  return allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))
}

router.get('/base64/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params
    const r = await fetch(`${SIAWASE_VIDEO_API}/${videoId}`, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) return res.status(503).json({ error: 'Siawase API failed' })
    const data = await r.json()
    if (!data?.thumbnail) return res.status(404).json({ error: 'No thumbnail found' })
    res.json({ thumbnail: data.thumbnail })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/proxy', async (req, res) => {
  try {
    const { url } = req.query
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing url parameter' })
    }

    if (!isAllowedImageUrl(url)) {
      return res.status(403).json({ error: 'Host not allowed' })
    }

    const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) return res.status(r.status).json({ error: `Upstream returned ${r.status}` })

    const contentType = r.headers.get('content-type') || 'image/jpeg'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    const buffer = await r.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/base64-url', async (req, res) => {
  try {
    const { url } = req.query
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing url parameter' })
    }
    if (!isAllowedImageUrl(url)) {
      return res.status(403).json({ error: 'Host not allowed' })
    }
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) return res.status(r.status).json({ error: `Upstream returned ${r.status}` })
    const contentType = r.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) return res.status(415).json({ error: 'Not an image' })
    const buffer = Buffer.from(await r.arrayBuffer())
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.json({ thumbnail: buffer.toString('base64'), contentType })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

export default router

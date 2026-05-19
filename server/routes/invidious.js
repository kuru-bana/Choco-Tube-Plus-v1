import { Router } from 'express'
import { INVIDIOUS_INSTANCES } from '../config.js'
import { getProxyThumbnail, formatViewCount, formatTimeSeconds, shuffle } from '../utils.js'

const router = Router()
const TIMEOUT = 5000

async function tryInstances(fn) {
  const instances = shuffle([...INVIDIOUS_INSTANCES])
  for (const inst of instances) {
    try {
      const result = await fn(inst)
      if (result !== null) return result
    } catch { continue }
  }
  return null
}

router.get('/search', async (req, res) => {
  try {
    const { q, page = '1', type: searchType = 'video', proxy: proxyType = 'wsrv.nl' } = req.query
    if (!q) return res.status(400).json({ error: 'Missing query' })

    const result = await tryInstances(async (inst) => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
      try {
        const url = `${inst}/api/v1/search?q=${encodeURIComponent(q)}&type=${searchType}&page=${page}`
        const r = await fetch(url, { signal: ctrl.signal })
        clearTimeout(timer)
        if (!r.ok) return null
        const data = await r.json()
        if (!Array.isArray(data)) return null
        const results = []
        for (const item of data) {
          try {
            if (searchType === 'channel') {
              results.push({
                id: item.authorId,
                title: item.author,
                thumbnail: item.authorThumbnails?.[0]?.url || '',
                type: 'channel',
                description: item.description || '',
              })
            } else {
              const vId = item.videoId
              if (!vId) continue
              const vc = item.viewCount || 0
              results.push({
                id: vId,
                title: item.title || 'Untitled',
                thumbnail: getProxyThumbnail(vId, proxyType),
                channel: item.author || 'Unknown Channel',
                channel_id: item.authorId || '',
                type: 'video',
                views: vc ? formatViewCount(vc) : 'N/A',
                published_at: item.publishedText || '',
                duration: item.lengthSeconds ? formatTimeSeconds(item.lengthSeconds) : '',
              })
            }
          } catch { continue }
        }
        if (results.length === 0) return null
        return { results, nextPage: parseInt(page) + 1 }
      } catch {
        clearTimeout(timer)
        return null
      }
    })

    if (!result) return res.status(503).json({ error: 'All Invidious instances failed' })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/video/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params
    const result = await tryInstances(async (inst) => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
      try {
        const r = await fetch(`${inst}/api/v1/videos/${videoId}`, { signal: ctrl.signal })
        clearTimeout(timer)
        if (!r.ok) return null
        const data = await r.json()
        if (!data.title) return null
        return {
          videoId,
          title: data.title || '',
          description: data.description || '',
          author: data.author || '',
          authorId: data.authorId || '',
          viewCount: data.viewCount || 0,
          publishedText: data.publishedText || '',
          lengthSeconds: data.lengthSeconds || 0,
          isLive: !!data.liveNow,
        }
      } catch {
        clearTimeout(timer)
        return null
      }
    })
    if (!result) return res.status(404).json({ error: 'Video not found' })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/channel/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params
    const result = await tryInstances(async (inst) => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
      try {
        const r = await fetch(`${inst}/api/v1/channels/${channelId}`, { signal: ctrl.signal })
        clearTimeout(timer)
        if (!r.ok) return null
        const data = await r.json()
        if (!data.author) return null
        const thumbs = data.authorThumbnails || []
        const icon = thumbs[0]?.url || ''
        return {
          channelName: data.author || '',
          channelProfile: data.description || '',
          channelIcon: icon,
          subscribers: data.subCount,
        }
      } catch {
        clearTimeout(timer)
        return null
      }
    })
    if (!result) return res.status(404).json({ error: 'Channel not found' })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/channel/:channelId/videos', async (req, res) => {
  try {
    const { channelId } = req.params
    const result = await tryInstances(async (inst) => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
      try {
        const r = await fetch(`${inst}/api/v1/channels/${channelId}/latest`, { signal: ctrl.signal })
        clearTimeout(timer)
        if (!r.ok) return null
        const data = await r.json()
        if (!Array.isArray(data)) return null
        const videos = []
        for (const item of data) {
          try {
            const vId = item.videoId
            if (!vId) continue
            const length = item.lengthSeconds || 0
            videos.push({
              id: vId,
              title: item.title || 'Unknown',
              published: item.published || '',
              views: formatViewCount(item.viewCount || 0),
              length: formatTimeSeconds(length),
              is_short: length <= 60,
            })
          } catch { continue }
        }
        return videos.length > 0 ? videos : null
      } catch {
        clearTimeout(timer)
        return null
      }
    })
    res.json(result || [])
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/related/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params
    const { proxy: proxyType = 'wsrv.nl' } = req.query
    const result = await tryInstances(async (inst) => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
      try {
        const r = await fetch(`${inst}/api/v1/videos/${videoId}`, { signal: ctrl.signal })
        clearTimeout(timer)
        if (!r.ok) return null
        const data = await r.json()
        const related = data.recommendedVideos || []
        if (!related.length) return null
        const videos = []
        for (const item of related) {
          const vId = item.videoId
          if (!vId) continue
          videos.push({
            id: vId,
            title: item.title || 'Untitled',
            thumbnail: getProxyThumbnail(vId, proxyType),
            channel: item.author || 'Unknown',
            channel_id: item.authorId || '',
            type: 'video',
            views: formatViewCount(item.viewCountText || item.viewCount || 0),
            published_at: '',
            duration: item.lengthSeconds ? formatTimeSeconds(item.lengthSeconds) : '',
          })
        }
        return videos.length > 0 ? videos : null
      } catch {
        clearTimeout(timer)
        return null
      }
    })
    res.json(result || [])
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/trending', async (req, res) => {
  try {
    const { region = 'US', proxy: proxyType = 'wsrv.nl' } = req.query
    const result = await tryInstances(async (inst) => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
      try {
        const r = await fetch(`${inst}/api/v1/trending?region=${region}`, { signal: ctrl.signal })
        clearTimeout(timer)
        if (!r.ok) return null
        const data = await r.json()
        if (!Array.isArray(data) || data.length === 0) return null
        const results = []
        for (const item of data) {
          const vId = item.videoId
          if (!vId) continue
          results.push({
            id: vId,
            title: item.title || 'Untitled',
            thumbnail: getProxyThumbnail(vId, proxyType),
            channel: item.author || 'Unknown',
            duration: item.lengthSeconds ? formatTimeSeconds(item.lengthSeconds) : '',
            views: formatViewCount(item.viewCount || 0),
            published_at: item.publishedText || '',
          })
        }
        return results.length > 0 ? results : null
      } catch {
        clearTimeout(timer)
        return null
      }
    })
    res.json(result || [])
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

export default router

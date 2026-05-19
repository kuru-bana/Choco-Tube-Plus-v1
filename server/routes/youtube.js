import { Router } from 'express'
import { YOUTUBE_API_KEYS } from '../config.js'
import { parseISO8601Duration, parseDurationToSeconds, formatViewCount, getProxyThumbnail } from '../utils.js'

const router = Router()
const YT_BASE = 'https://www.googleapis.com/youtube/v3'

async function tryKeys(fn) {
  for (const key of YOUTUBE_API_KEYS) {
    try {
      const result = await fn(key)
      if (result !== null) return result
    } catch {
      continue
    }
  }
  return null
}

router.get('/search', async (req, res) => {
  try {
    const { q, pageToken, type: searchType = 'video', proxy: proxyType = 'wsrv.nl' } = req.query
    if (!q) return res.status(400).json({ error: 'Missing query' })

    const result = await tryKeys(async (key) => {
      let url = `${YT_BASE}/search?part=snippet&q=${encodeURIComponent(q)}&type=${searchType}&maxResults=20&key=${key}`
      if (pageToken) url += `&pageToken=${pageToken}`
      const r = await fetch(url)
      if (!r.ok) return null
      const data = await r.json()
      const results = []
      const videoIds = []

      for (const item of data.items || []) {
        if (searchType === 'channel') {
          results.push({
            id: item.id.channelId,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails?.default?.url || '',
            type: 'channel',
            description: item.snippet.description,
          })
        } else {
          const vId = item.id.videoId
          videoIds.push(vId)
          results.push({
            id: vId,
            title: item.snippet.title,
            thumbnail: getProxyThumbnail(vId, proxyType),
            channel: item.snippet.channelTitle,
            channel_id: item.snippet.channelId,
            type: 'video',
            views: 'N/A',
            published_at: item.snippet.publishedAt,
            duration: '',
          })
        }
      }

      if (videoIds.length > 0 && searchType === 'video') {
        try {
          const statsUrl = `${YT_BASE}/videos?part=statistics,contentDetails&id=${videoIds.join(',')}&key=${key}`
          const sr = await fetch(statsUrl)
          if (sr.ok) {
            const statsData = await sr.json()
            const statsMap = {}
            for (const it of statsData.items || []) statsMap[it.id] = it
            for (const r of results) {
              if (r.type === 'video' && r.id in statsMap) {
                const it = statsMap[r.id]
                r.views = formatViewCount(parseInt(it.statistics?.viewCount || '0'))
                r.duration = parseISO8601Duration(it.contentDetails?.duration || '')
              }
            }
          }
        } catch { /* ignore */ }
      }

      return { results, nextPage: data.nextPageToken || null }
    })

    if (!result) return res.status(503).json({ error: 'All API keys failed' })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/video/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params
    const result = await tryKeys(async (key) => {
      const url = `${YT_BASE}/videos?part=snippet,statistics,contentDetails,liveStreamingDetails&id=${videoId}&key=${key}`
      const r = await fetch(url)
      if (!r.ok) return null
      const data = await r.json()
      const item = data.items?.[0]
      if (!item) return null
      const vc = parseInt(item.statistics?.viewCount || '0')
      const lc = parseInt(item.statistics?.likeCount || '0')
      const ls = parseDurationToSeconds(item.contentDetails?.duration || '')
      return {
        videoId,
        title: item.snippet?.title || '',
        description: item.snippet?.description || '',
        author: item.snippet?.channelTitle || '',
        authorId: item.snippet?.channelId || '',
        viewCount: vc,
        likeCount: lc,
        publishedText: item.snippet?.publishedAt || '',
        lengthSeconds: ls,
        isLive: !!item.liveStreamingDetails?.actualStartTime && !item.liveStreamingDetails?.actualEndTime,
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
    const result = await tryKeys(async (key) => {
      const url = `${YT_BASE}/channels?part=snippet,statistics,brandingSettings&id=${channelId}&key=${key}`
      const r = await fetch(url)
      if (!r.ok) return null
      const data = await r.json()
      const item = data.items?.[0]
      if (!item) return null
      const thumbs = item.snippet?.thumbnails || {}
      const icon = thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || ''
      const banner = item.brandingSettings?.image?.bannerExternalUrl || ''
      return {
        channelName: item.snippet?.title || '',
        channelProfile: item.snippet?.description || '',
        channelIcon: icon,
        channelBanner: banner,
        subscribers: parseInt(item.statistics?.subscriberCount || '0'),
        totalViews: parseInt(item.statistics?.viewCount || '0'),
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
    const uploadsPlaylistId = `UU${channelId.slice(2)}`
    const videos = []

    const result = await tryKeys(async (key) => {
      const url = `${YT_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&key=${key}`
      const r = await fetch(url)
      if (!r.ok) return null
      const data = await r.json()
      const vIds = []
      for (const item of data.items || []) {
        try {
          const vId = item.snippet.resourceId.videoId
          vIds.push(vId)
          videos.push({
            id: vId,
            title: item.snippet.title,
            published: item.snippet.publishedAt?.slice(0, 10) || '',
            views: '0',
            length: '',
            is_short: false,
          })
        } catch { continue }
      }
      if (vIds.length > 0) {
        try {
          const detailsUrl = `${YT_BASE}/videos?part=contentDetails,statistics&id=${vIds.join(',')}&key=${key}`
          const dr = await fetch(detailsUrl)
          if (dr.ok) {
            const dd = await dr.json()
            const map = {}
            for (const it of dd.items || []) map[it.id] = it
            for (const v of videos) {
              if (v.id in map) {
                const dur = map[v.id].contentDetails?.duration || ''
                v.length = parseISO8601Duration(dur)
                v.is_short = parseDurationToSeconds(dur) <= 60
                v.views = formatViewCount(parseInt(map[v.id].statistics?.viewCount || '0'))
              }
            }
          }
        } catch { /* ignore */ }
      }
      return videos
    })

    res.json(result || [])
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/watch/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params
    const result = {
      video_id: videoId,
      video_title: null,
      view_count: null,
      published_at: null,
      channel_name: null,
      channel_id: null,
      subscriber_count: null,
      channel_icon: null,
      duration_seconds: 0,
    }

    for (const key of YOUTUBE_API_KEYS.slice(0, 3)) {
      try {
        const url = `${YT_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${key}`
        const r = await fetch(url)
        if (!r.ok) continue
        const data = await r.json()
        const item = data.items?.[0]
        if (!item) continue

        result.video_title = item.snippet?.title || null
        result.published_at = (item.snippet?.publishedAt || '').split('T')[0] || null
        result.duration_seconds = parseDurationToSeconds(item.contentDetails?.duration || '')

        const vc = parseInt(item.statistics?.viewCount || '0')
        if (vc >= 1000000) result.view_count = `${(vc / 1000000).toFixed(1)}M`
        else if (vc >= 1000) result.view_count = `${(vc / 1000).toFixed(1)}K`
        else result.view_count = String(vc)

        const channelId = item.snippet?.channelId || ''
        result.channel_id = channelId

        if (channelId) {
          try {
            const chUrl = `${YT_BASE}/channels?part=snippet,statistics&id=${channelId}&key=${key}`
            const cr = await fetch(chUrl)
            if (cr.ok) {
              const chData = await cr.json()
              const ch = chData.items?.[0]
              if (ch) {
                result.channel_name = ch.snippet?.title || null
                const subs = parseInt(ch.statistics?.subscriberCount || '0')
                if (subs >= 1000000) result.subscriber_count = `${(subs / 1000000).toFixed(1)}M`
                else if (subs >= 1000) result.subscriber_count = `${(subs / 1000).toFixed(1)}K`
                else result.subscriber_count = String(subs)
                const thumbs = ch.snippet?.thumbnails || {}
                result.channel_icon = thumbs.high?.url || thumbs.default?.url || null
              }
            }
          } catch { /* ignore */ }
        }
        break
      } catch { continue }
    }

    res.json(result)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

export default router

import { Router } from 'express'
import { YOUTUBE_API_KEYS } from '../config.js'
import { getProxyThumbnail, parseISO8601Duration, formatViewCount, formatTimeSeconds, shuffle } from '../utils.js'
import { INVIDIOUS_INSTANCES } from '../config.js'

const router = Router()
const API_LIST_URL = 'https://raw.githubusercontent.com/kuru-bana/yt-data/refs/heads/main/api/invidious.json'
const TREND_CATEGORY_TYPES = {
  music: 'Music',
  gaming: 'Gaming',
  news: 'News',
  movies: 'Movies',
}
let mainApis = []
let apiCacheTime = 0

async function getReferenceApis() {
  if (Date.now() - apiCacheTime < 5 * 60 * 1000 && mainApis.length > 0) return mainApis
  const r = await fetch(API_LIST_URL)
  if (!r.ok) throw new Error(`Failed to load API list: ${r.status}`)
  const data = await r.json()
  mainApis = Array.isArray(data.main) ? data.main : []
  apiCacheTime = Date.now()
  return mainApis
}

function normalizeTrendVideo(item, proxyType) {
  const vId = String(item.videoId || item.id || '')
  if (!vId) return null
  const viewCount = item.viewCount ?? item.views
  const duration = item.lengthSeconds
    ? formatTimeSeconds(Number(item.lengthSeconds))
    : String(item.duration || item.length || '')
  const channelId = item.authorId || item.channelId || item.channel_id || null
  const authorThumbnails = item.authorThumbnails?.length
    ? item.authorThumbnails
    : null
  return {
    id: vId,
    title: String(item.title || 'Untitled'),
    thumbnail: getProxyThumbnail(vId, proxyType),
    channel: String(item.author || item.channel || item.channelTitle || item.uploader || 'Unknown'),
    channel_id: channelId,
    author_thumbnails: authorThumbnails,
    duration,
    views: typeof viewCount === 'number' || /^\d+$/.test(String(viewCount || ''))
      ? formatViewCount(viewCount || 0)
      : String(viewCount || item.viewCountText || ''),
    published_at: String(item.publishedText || item.published_at || item.published || item.publishedAt || ''),
  }
}

async function getTrendingInvidious(region, proxyType, category = '') {
  const instances = shuffle([...INVIDIOUS_INSTANCES])
  const type = TREND_CATEGORY_TYPES[category]
  for (const inst of instances) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    try {
      const params = new URLSearchParams({ region })
      if (type) params.set('type', type)
      const r = await fetch(`${inst}/api/v1/trending?${params.toString()}`, { signal: ctrl.signal })
      clearTimeout(timer)
      if (!r.ok) continue
      const data = await r.json()
      if (!Array.isArray(data) || data.length === 0) continue
      const results = []
      for (const item of data) {
        const vId = item.videoId
        if (!vId) continue
        results.push({
          id: vId,
          title: item.title || 'Untitled',
          thumbnail: getProxyThumbnail(vId, proxyType),
          channel: item.author || 'Unknown',
          channel_id: item.authorId || null,
          author_thumbnails: item.authorThumbnails?.length ? item.authorThumbnails : null,
          duration: item.lengthSeconds ? formatTimeSeconds(item.lengthSeconds) : '',
          views: formatViewCount(item.viewCount || 0),
          published_at: item.publishedText || '',
        })
      }
      if (results.length > 0) return results
    } catch {
      clearTimeout(timer)
    }
  }
  return []
}

async function getReferenceTrend(region, category, proxyType) {
  const apis = await getReferenceApis()
  const endpoint = category ? `/api/trending/${category}?region=${region}` : `/api/trending?region=${region}`
  for (const base of shuffle(apis)) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    try {
      const r = await fetch(`${base}${endpoint}`, { signal: ctrl.signal })
      clearTimeout(timer)
      if (!r.ok) continue
      const raw = await r.json()
      const data = Array.isArray(raw) ? raw : (raw.results || [])
      if (!Array.isArray(data) || data.length === 0) continue
      const results = data.map(item => normalizeTrendVideo(item, proxyType)).filter(Boolean)
      if (results.length > 0) return results
    } catch {
      clearTimeout(timer)
    }
  }
  return getTrendingInvidious(region, proxyType, category)
}

async function getJapanTrend(category, proxyType) {
  const results = []
  try {
    let url
    if (category === 'all') {
      url = "https://raw.githubusercontent.com/siawaseok3/wakame/refs/heads/master/trend.json"
    } else {
      url = "https://raw.githubusercontent.com/ajgpw/youtubedata/refs/heads/main/trend-base64.json"
    }

    const r = await fetch(url)
    if (!r.ok) return []
    const data = await r.json()

    let trendingList
    if (category === 'all') {
      trendingList = data.trending || data
    } else if (category === 'game') {
      trendingList = data.gaming || []
    } else if (category === 'music') {
      trendingList = data.music || []
    } else {
      trendingList = data.trending || data
    }

    const videoIds = []
    for (const item of trendingList) {
      const vId = String(item.id || item.videoId || '')
      if (!vId) continue
      videoIds.push(vId)
      const published = String(item.published || item.publishedAt || item.uploadedAt || '')
      results.push({
        id: vId,
        title: String(item.title || 'No Title'),
        thumbnail: getProxyThumbnail(vId, proxyType),
        channel: String(item.channel || item.author || item.channelTitle || item.uploader || 'Unknown'),
        channel_id: item.channelId || item.authorId || item.channel_id || null,
        author_thumbnails: null,
        duration: '',
        views: 'N/A',
        published_at: published,
      })
    }

    if (videoIds.length > 0) {
      for (const key of YOUTUBE_API_KEYS) {
        try {
          const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds.slice(0, 50).join(',')}&key=${key}`
          const sr = await fetch(statsUrl)
          if (!sr.ok) continue
          const statsData = await sr.json()
          const statsMap = {}
          for (const it of statsData.items || []) statsMap[it.id] = it
          for (const r of results) {
            if (r.id in statsMap) {
              r.duration = parseISO8601Duration(statsMap[r.id].contentDetails?.duration || '')
              const vc = parseInt(statsMap[r.id].statistics?.viewCount || '0')
              r.views = formatViewCount(vc)
            }
          }
          break
        } catch { continue }
      }
    }
  } catch { return [] }

  return results
}

router.get('/', async (req, res) => {
  try {
    const { region = 'JP', category = '', proxy: proxyType = 'wsrv.nl' } = req.query

    let result
    if (region === 'JP') {
      const jpCategory = category === 'gaming' ? 'game' : category || 'all'
      result = await getJapanTrend(jpCategory, proxyType)
    } else {
      result = await getReferenceTrend(region, category, proxyType)
    }

    res.json(result || [])
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

export default router

import { Router } from 'express'
import { Innertube } from 'youtubei.js'
import { getProxyThumbnail, formatTimeSeconds, shuffle } from '../utils.js'

const router = Router()
const API_LIST_URL = 'https://raw.githubusercontent.com/kuru-bana/yt-data/refs/heads/main/api/invidious.json'
let mainApis = []
let apiCacheTime = 0
const suggestionCache = new Map()
const SUGGESTION_CACHE_TTL = 60 * 1000

let _ytInstance = null
let _ytInstanceTime = 0
const YT_INSTANCE_TTL = 30 * 60 * 1000
async function getYt() {
  if (_ytInstance && Date.now() - _ytInstanceTime < YT_INSTANCE_TTL) return _ytInstance
  _ytInstance = await Innertube.create({ retrieve_player: false })
  _ytInstanceTime = Date.now()
  return _ytInstance
}

getYt().catch(() => {})

async function getMainApis() {
  if (Date.now() - apiCacheTime < 5 * 60 * 1000 && mainApis.length > 0) return mainApis
  const r = await fetch(API_LIST_URL)
  if (!r.ok) throw new Error(`Failed to load API list: ${r.status}`)
  const data = await r.json()
  mainApis = Array.isArray(data.main) ? data.main : []
  apiCacheTime = Date.now()
  return mainApis
}

function uniqueSuggestions(items) {
  const seen = new Set()
  const suggestions = []
  for (const item of items) {
    const value = Array.isArray(item) ? item[0] : item
    if (typeof value !== 'string') continue
    const text = value.trim()
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    suggestions.push(text)
  }
  return suggestions
}

function normalizeSuggestions(raw) {
  const rawSuggestions = Array.isArray(raw)
    ? (Array.isArray(raw[1]) ? raw[1] : raw)
    : (raw?.suggestions || raw?.items || [])
  return Array.isArray(rawSuggestions) ? uniqueSuggestions(rawSuggestions) : []
}

async function fetchJsonWithTimeout(url, timeout = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.json()
  } finally {
    clearTimeout(timer)
  }
}

async function fetchGoogleSuggestions(q) {
  const url = new URL('https://suggestqueries.google.com/complete/search')
  url.searchParams.set('client', 'youtube')
  url.searchParams.set('ds', 'yt')
  url.searchParams.set('hl', 'ja')
  url.searchParams.set('gl', 'JP')
  url.searchParams.set('q', q)
  const raw = await fetchJsonWithTimeout(url.toString(), 6000)
  return normalizeSuggestions(raw)
}

function formatViews(count) {
  const n = typeof count === 'string' ? parseInt(count.replace(/[^0-9]/g, '')) : count
  if (!n || Number.isNaN(n)) return ''
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}億回視聴`
  if (n >= 10000) return `${Math.floor(n / 10000)}万回視聴`
  return `${n.toLocaleString()}回視聴`
}

function channelIcon(thumbnails) {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return ''
  const small = thumbnails.find(t => Number(t.width || 0) <= 88) || thumbnails[0]
  return small?.url || ''
}

function normalizeItem(item, proxyType) {
  const itemType = item.type || (item.videoId ? 'video' : item.playlistId ? 'playlist' : item.authorId ? 'channel' : '')

  if (itemType === 'channel') {
    const id = String(item.authorId || item.ucid || item.id || '')
    if (!id) return null
    return {
      id,
      title: String(item.author || item.title || 'Unknown Channel'),
      thumbnail: channelIcon(item.authorThumbnails || item.thumbnails),
      type: 'channel',
      description: String(item.description || ''),
      subscribers: item.subCount || item.subscriberCount || 0,
      verified: Boolean(item.authorVerified),
      author: String(item.author || item.title || 'Unknown Channel'),
      authorId: id,
      authorVerified: Boolean(item.authorVerified),
      authorThumbnails: item.authorThumbnails || item.thumbnails || [],
      subCount: item.subCount || item.subscriberCount || 0,
    }
  }

  if (itemType === 'playlist') {
    const id = String(item.playlistId || item.id || '')
    if (!id) return null
    return {
      id,
      title: String(item.title || 'Untitled playlist'),
      thumbnail: item.playlistThumbnail || item.thumbnail || '',
      channel: String(item.author || item.channel || ''),
      channel_id: String(item.authorId || ''),
      type: 'playlist',
      video_count: item.videoCount ?? item.videos ?? null,
    }
  }

  const id = String(item.videoId || item.id || '')
  if (!id) return null
  const viewText = item.viewCountText || formatViews(item.viewCount || item.views)
  const duration = item.lengthSeconds ? formatTimeSeconds(Number(item.lengthSeconds)) : String(item.duration || item.length || '')
  return {
    id,
    title: String(item.title || 'Untitled'),
    thumbnail: getProxyThumbnail(id, proxyType),
    channel: String(item.author || item.channel || 'Unknown'),
    channel_id: String(item.authorId || ''),
    type: 'video',
    views: viewText,
    published_at: String(item.publishedText || item.published_at || item.published || ''),
    duration,
    live: Boolean(item.liveNow || item.publishedText === '0 seconds ago'),
    is4k: Boolean(item.is4k),
    is360: Boolean(item.isVr360),
    hasCaptions: Boolean(item.hasCaptions),
    authorThumbnails: Array.isArray(item.authorThumbnails) ? item.authorThumbnails : [],
  }
}

router.get('/', async (req, res) => {
  try {
    const { proxy: proxyType = 'wsrv.nl', ...rawQuery } = req.query
    if (!rawQuery.q) return res.status(400).json({ error: 'Missing query' })

    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(rawQuery)) {
      if (value === undefined || value === null || value === '' || value === 'all' || value === 'relevance') continue
      params.set(key, Array.isArray(value) ? value.join(',') : String(value))
    }
    if (rawQuery.q) params.set('q', String(rawQuery.q))
    if (rawQuery.page && String(rawQuery.page) !== '1') params.set('page', String(rawQuery.page))

    const apis = await getMainApis()
    const endpoint = `/api/search?${params.toString()}`
    for (const base of shuffle(apis)) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 10000)
      try {
        const r = await fetch(`${base}${endpoint}`, { signal: ctrl.signal })
        clearTimeout(timer)
        if (!r.ok) continue
        const raw = await r.json()
        const data = Array.isArray(raw) ? raw : (raw.results || [])
        if (!Array.isArray(data)) continue
        const seen = new Set()
        const results = data.map(item => normalizeItem(item, proxyType)).filter(item => {
          if (!item || seen.has(`${item.type}:${item.id}`)) return false
          seen.add(`${item.type}:${item.id}`)
          return true
        })
        return res.json({ results, count: results.length, page: Number(rawQuery.page || 1), source: base })
      } catch {
        clearTimeout(timer)
      }
    }

    res.json({ results: [], count: 0, page: Number(rawQuery.page || 1), source: '' })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

async function fetchInvidiousSuggestions(q, apis) {
  const endpoints = [
    `/api/search/suggestions?q=${encodeURIComponent(q)}`,
    `/api/v1/search/suggestions?q=${encodeURIComponent(q)}`,
  ]
  for (const base of apis) {
    for (const endpoint of endpoints) {
      try {
        const raw = await fetchJsonWithTimeout(`${base}${endpoint}`, 3000)
        const suggestions = normalizeSuggestions(raw)
        if (suggestions.length) return suggestions
      } catch {}
    }
  }
  try {
    return await fetchGoogleSuggestions(q)
  } catch {}
  return []
}

async function fetchYtjsSuggestions(q) {
  try {
    const yt = await getYt()
    const result = await Promise.race([
      yt.getSearchSuggestions(q),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ])
    if (!Array.isArray(result)) return []
    return result.filter(s => typeof s === 'string' && s.trim())
  } catch {
    return []
  }
}

function mergeUniqueSuggestions(...lists) {
  const seen = new Set()
  const result = []
  const maxLen = Math.max(...lists.map(l => l.length))
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (i < list.length) {
        const text = list[i].trim()
        const key = text.toLowerCase()
        if (text && !seen.has(key)) {
          seen.add(key)
          result.push(text)
        }
      }
    }
  }
  return result
}

router.get('/suggestions', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    if (!q) return res.json({ suggestions: [] })

    const cacheKey = q.toLowerCase()
    const cached = suggestionCache.get(cacheKey)
    if (cached && Date.now() - cached.time < SUGGESTION_CACHE_TTL) {
      return res.json(cached.value)
    }

    const apis = await getMainApis()

    let responded = false
    const respond = (suggestions, source) => {
      if (responded) return
      responded = true
      const value = { suggestions, source }
      if (suggestions.length) suggestionCache.set(cacheKey, { time: Date.now(), value })
      res.json(value)
    }

    const ytjsPromise = fetchYtjsSuggestions(q)
    const invPromise = fetchInvidiousSuggestions(q, apis)

    ytjsPromise.then(sugs => {
      if (sugs.length) respond(sugs.slice(0, 15), 'youtubejs')
    }).catch(() => {})

    invPromise.then(sugs => {
      if (sugs.length) respond(sugs.slice(0, 15), 'invidious')
    }).catch(() => {})

    Promise.allSettled([ytjsPromise, invPromise]).then(([ytjsR, invR]) => {
      const ytjsSugs = ytjsR.status === 'fulfilled' ? ytjsR.value : []
      const invSugs = invR.status === 'fulfilled' ? invR.value : []
      const merged = mergeUniqueSuggestions(ytjsSugs, invSugs).slice(0, 15)
      if (merged.length) {
        const src = [ytjsSugs.length ? 'youtubejs' : null, invSugs.length ? 'invidious' : null].filter(Boolean).join('+')
        suggestionCache.set(cacheKey, { time: Date.now(), value: { suggestions: merged, source: src } })
      }
      respond([], 'none')
    })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

export default router

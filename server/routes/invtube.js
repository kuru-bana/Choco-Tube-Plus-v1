import { Router } from 'express'
import { Innertube } from 'youtubei.js'
import { INVIDIOUS_INSTANCES } from '../config.js'

const router = Router()
const API_LIST_URL = 'https://raw.githubusercontent.com/kuru-bana/yt-data/refs/heads/main/api/invidious.json'
let mainApis = []
let apiCacheTime = 0

async function getMainApis() {
  if (Date.now() - apiCacheTime < 5 * 60 * 1000 && mainApis.length > 0) return mainApis
  const res = await fetch(API_LIST_URL)
  if (!res.ok) throw new Error(`Failed to load API list: ${res.status}`)
  const json = await res.json()
  mainApis = Array.isArray(json.main) ? json.main : []
  apiCacheTime = Date.now()
  return mainApis
}

async function proxyToMain(apiPath) {
  const apis = await getMainApis()
  const errors = []
  for (const base of apis) {
    try {
      const res = await fetch(base + apiPath, { signal: AbortSignal.timeout(12000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      errors.push(`${base}: ${e.message}`)
    }
  }
  throw new Error('All APIs failed: ' + errors.join(', '))
}

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

function parseShortCount(text) {
  if (!text) return 0
  const clean = text.replace(/[,\s]*(views?|subscribers?|本の動画)/gi, '').trim()
  const m = clean.match(/([\d.,]+)\s*([KMBkmb億万])?/)
  if (!m) return 0
  let n = parseFloat(m[1].replace(/,/g, ''))
  const unit = (m[2] || '').toLowerCase()
  if (unit === 'k') n *= 1e3
  else if (unit === 'm') n *= 1e6
  else if (unit === 'b') n *= 1e9
  else if (unit === '万') n *= 1e4
  else if (unit === '億') n *= 1e8
  return Math.round(n) || 0
}

async function ytjsChannelInfo(channelId) {
  const yt = await getYt()
  const ch = await yt.getChannel(channelId)
  const content = ch.header?.content

  const author = content?.title?.text?.toString() || ch.header?.page_title || ''
  const avatarImages = content?.image?.avatar?.image || []
  const bannerImages = content?.banner?.image || []

  let subCount
  const rows = content?.metadata?.metadata_rows || []
  for (const row of rows) {
    for (const p of (row.metadata_parts || [])) {
      const t = p.text?.toString() || ''
      if (/subscriber/i.test(t)) {
        subCount = parseShortCount(t)
        break
      }
    }
    if (subCount != null) break
  }

  return {
    author,
    authorId: channelId,
    authorThumbnails: avatarImages.map(img => ({ url: img.url, width: img.width || 0, height: img.height || 0 })),
    authorBanners: bannerImages.map(img => ({ url: img.url, width: img.width || 0, height: img.height || 0 })),
    subCount,
    description: ch.metadata?.description || '',
    source: 'youtubejs',
  }
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0
}

function normalizeInvidiousImages(images) {
  if (!Array.isArray(images)) return []
  return images
    .filter(img => img && typeof img.url === 'string' && img.url)
    .map(img => ({
      url: img.url,
      width: img.width || 0,
      height: img.height || 0,
    }))
}

async function invidiousChannelInfo(channelId) {
  const errors = []
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${base}/api/v1/channels/${encodeURIComponent(channelId)}`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data || !data.author) throw new Error('Invalid channel data')
      return {
        author: data.author || '',
        authorId: data.authorId || channelId,
        authorThumbnails: normalizeInvidiousImages(data.authorThumbnails),
        authorBanners: normalizeInvidiousImages(data.authorBanners),
        subCount: data.subCount,
        totalViews: data.totalViews,
        description: data.description || '',
        source: 'invidious',
      }
    } catch (e) {
      errors.push(`${base}: ${e.message}`)
    }
  }
  throw new Error('All Invidious channel APIs failed: ' + errors.join(', '))
}

function mergeMissingChannelImages(primary, fallback) {
  if (!primary || !fallback) return primary || fallback
  return {
    ...primary,
    authorThumbnails: hasItems(primary.authorThumbnails) ? primary.authorThumbnails : fallback.authorThumbnails,
    authorBanners: hasItems(primary.authorBanners) ? primary.authorBanners : fallback.authorBanners,
  }
}

async function channelInfoWithImageFallback(channelId) {
  let primaryError = null
  try {
    const primary = await proxyToMain(`/api/channels/${encodeURIComponent(channelId)}`)
    if (hasItems(primary.authorBanners)) return primary
    try {
      const inv = await invidiousChannelInfo(channelId)
      if (hasItems(inv.authorBanners) || hasItems(inv.authorThumbnails)) {
        return mergeMissingChannelImages(primary, inv)
      }
    } catch {}
    try {
      const ytjs = await ytjsChannelInfo(channelId)
      return mergeMissingChannelImages(primary, ytjs)
    } catch {}
    return primary
  } catch (e) {
    primaryError = e
  }

  try {
    return await invidiousChannelInfo(channelId)
  } catch {}

  try {
    return await ytjsChannelInfo(channelId)
  } catch {}

  throw primaryError
}

function mapYtjsVideo(v, channelId) {
  return {
    videoId: v.video_id || v.id || '',
    title: v.title?.toString() || '',
    lengthSeconds: v.duration?.seconds || v.length_text ? parseDurationText(v.length_text?.toString()) : 0,
    viewCount: parseShortCount(v.short_view_count?.toString() || v.view_count?.toString()),
    viewCountText: v.short_view_count?.toString() || v.view_count?.toString() || '',
    publishedText: v.published?.toString() || '',
    liveNow: !!(v.is_live),
    authorId: channelId,
  }
}

function parseDurationText(text) {
  if (!text) return 0
  const parts = text.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || 0
}

async function ytjsChannelVideos(channelId) {
  const yt = await getYt()
  const ch = await yt.getChannel(channelId)
  const result = await ch.getVideos()
  const items = result.videos || []
  return { videos: items.map(v => mapYtjsVideo(v, channelId)), continuation: null }
}

async function ytjsChannelShorts(channelId) {
  const yt = await getYt()
  const ch = await yt.getChannel(channelId)
  const result = await ch.getShorts()
  const items = result.shorts || result.videos || result.items || []
  return {
    videos: items.map(s => {
      const videoId = s.on_tap_endpoint?.payload?.videoId || ''
      const title = s.overlay_metadata?.primary_text?.toString() || ''
      const viewCountText = s.overlay_metadata?.secondary_text?.toString() || ''
      return { videoId, title, viewCount: parseShortCount(viewCountText), viewCountText, authorId: channelId }
    }).filter(s => s.videoId),
    continuation: null,
  }
}

async function ytjsChannelStreams(channelId) {
  const yt = await getYt()
  const ch = await yt.getChannel(channelId)
  const result = await ch.getLiveStreams()
  const items = result.videos || []
  return { videos: items.map(v => mapYtjsVideo(v, channelId)), continuation: null }
}

async function ytjsChannelLatest(channelId) {
  const yt = await getYt()
  const ch = await yt.getChannel(channelId)
  const result = await ch.getVideos()
  const items = (result.videos || []).slice(0, 20)
  return items.map(v => mapYtjsVideo(v, channelId))
}

async function ytjsChannelPlaylists(channelId) {
  const yt = await getYt()
  const ch = await yt.getChannel(channelId)
  const result = await ch.getPlaylists()
  const items = result.playlists || result.items || []
  return {
    playlists: items.map(p => ({
      playlistId: p.content_id || '',
      title: p.metadata?.title?.toString() || '',
      playlistThumbnail: p.content_image?.primary_thumbnail?.image?.[0]?.url || '',
    })).filter(p => p.playlistId),
    continuation: null,
  }
}

async function ytjsChannelCommunity(channelId) {
  const yt = await getYt()
  const ch = await yt.getChannel(channelId)
  if (!ch.has_community) throw new Error('no community tab')
  const community = await ch.getCommunity()
  const posts = community.posts || community.items || []

  return {
    posts: posts.map(p => {
      const authorThumbs = (p.author?.thumbnails || []).map(t => ({
        url: t.url?.startsWith('//') ? 'https:' + t.url : (t.url || ''),
        width: t.width || 0,
        height: t.height || 0,
      }))
      const likeRaw = p.vote_count?.toString?.() || ''
      const likeCount = parseShortCount(likeRaw) || undefined
      let attachmentVideoId = null
      if (p.attachment?.type === 'Video') {
        attachmentVideoId = p.attachment.video_id || null
      }
      return {
        id: p.id || '',
        author: p.author?.name || '',
        authorId: p.author?.id || channelId,
        authorThumbnails: authorThumbs,
        content: p.content?.toString() || '',
        publishedText: p.published?.toString() || '',
        likeCount,
        attachmentVideoId,
      }
    }),
    continuation: null,
  }
}

async function withYtjsFallback(res, invPromise, ytjsFallback) {
  try {
    const data = await invPromise
    res.json(data)
  } catch (invErr) {
    try {
      if (!ytjsFallback) throw new Error('no-fallback')
      const data = await (typeof ytjsFallback === 'function' ? ytjsFallback() : ytjsFallback)
      res.json(data)
    } catch {
      res.status(502).json({ error: invErr.message })
    }
  }
}

function parseVtt(vttText) {
  const lines = vttText.split('\n')
  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    const timingMatch = line.match(/^(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/)
    if (timingMatch) {
      const startStr = timingMatch[1].replace(',', '.')
      const endStr = timingMatch[2].replace(',', '.')
      const start = vttTimeToSeconds(startStr)
      const end = vttTimeToSeconds(endStr)
      i++
      const textLines = []
      while (i < lines.length && lines[i].trim() !== '') {
        const txt = lines[i].trim().replace(/<[^>]+>/g, '')
        if (txt) textLines.push(txt)
        i++
      }
      const text = textLines.join(' ')
      if (text) {
        result.push({ text, start, duration: end - start })
      }
    } else {
      i++
    }
  }
  return result
}

function vttTimeToSeconds(timeStr) {
  const parts = timeStr.split(':')
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
  }
  return parseFloat(parts[0]) || 0
}

router.get('/videos/:videoId', async (req, res) => {
  try {
    const data = await proxyToMain(`/api/videos/${encodeURIComponent(req.params.videoId)}`)
    res.json(data)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

router.get('/comments/:videoId', async (req, res) => {
  try {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(req.query)) {
      if (value === undefined || value === null || value === '') continue
      params.set(key, Array.isArray(value) ? value.join(',') : String(value))
    }
    const qs = params.toString() ? `?${params.toString()}` : ''
    const data = await proxyToMain(`/api/comments/${encodeURIComponent(req.params.videoId)}${qs}`)
    res.json(data)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

router.get('/captions/:videoId', async (req, res) => {
  try {
    const data = await proxyToMain(`/api/captions/${encodeURIComponent(req.params.videoId)}`)
    const captions = Array.isArray(data) ? data : (data.captions || [])
    const sourceInstance = data.source_instance || null
    res.json({ captions, source_instance: sourceInstance })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

router.get('/transcripts/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params
    const lang = req.query.lang || ''
    const label = req.query.label || ''

    const captionsData = await proxyToMain(`/api/captions/${encodeURIComponent(videoId)}`)
    const captions = Array.isArray(captionsData) ? captionsData : (captionsData.captions || [])
    const sourceInstance = captionsData.source_instance || null

    if (!captions.length) {
      return res.json([])
    }

    let track = null
    if (label) {
      track = captions.find(c => c.label === label)
    }
    if (!track && lang) {
      track = captions.find(c => c.languageCode === lang || c.language_code === lang)
      if (!track) {
        const prefix = lang.split('-')[0].toLowerCase()
        track = captions.find(c => (c.languageCode || c.language_code || '').toLowerCase().startsWith(prefix))
      }
    }
    if (!track) {
      track = captions[0]
    }

    if (!track || !track.url || !sourceInstance) {
      return res.json([])
    }

    const vttUrl = sourceInstance + track.url + (track.url.includes('?') ? '&fmt=vtt' : '?fmt=vtt')
    const vttRes = await fetch(vttUrl, { signal: AbortSignal.timeout(12000) })
    if (!vttRes.ok) {
      return res.status(502).json({ error: `VTT fetch failed: HTTP ${vttRes.status}` })
    }
    const vttText = await vttRes.text()
    const lines = parseVtt(vttText)
    res.json(lines)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

router.get('/channels/:channelId', async (req, res) => {
  const { channelId } = req.params
  try {
    res.json(await channelInfoWithImageFallback(channelId))
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

router.get('/channels/:channelId/videos', async (req, res) => {
  const { channelId } = req.params
  const p = new URLSearchParams()
  if (req.query.sort_by) p.set('sort_by', req.query.sort_by)
  if (req.query.continuation) p.set('continuation', req.query.continuation)
  const qs = p.toString() ? `?${p}` : ''
  await withYtjsFallback(
    res,
    proxyToMain(`/api/channels/${encodeURIComponent(channelId)}/videos${qs}`),
    req.query.continuation ? null : () => ytjsChannelVideos(channelId),
  )
})

router.get('/channels/:channelId/shorts', async (req, res) => {
  const { channelId } = req.params
  const p = new URLSearchParams()
  if (req.query.continuation) p.set('continuation', req.query.continuation)
  const qs = p.toString() ? `?${p}` : ''
  await withYtjsFallback(
    res,
    proxyToMain(`/api/channels/${encodeURIComponent(channelId)}/shorts${qs}`),
    req.query.continuation ? null : () => ytjsChannelShorts(channelId),
  )
})

router.get('/channels/:channelId/streams', async (req, res) => {
  const { channelId } = req.params
  const p = new URLSearchParams()
  if (req.query.continuation) p.set('continuation', req.query.continuation)
  const qs = p.toString() ? `?${p}` : ''
  await withYtjsFallback(
    res,
    proxyToMain(`/api/channels/${encodeURIComponent(channelId)}/streams${qs}`),
    req.query.continuation ? null : () => ytjsChannelStreams(channelId),
  )
})

router.get('/channels/:channelId/latest', async (req, res) => {
  const { channelId } = req.params
  await withYtjsFallback(
    res,
    proxyToMain(`/api/channels/${encodeURIComponent(channelId)}/latest`),
    () => ytjsChannelLatest(channelId),
  )
})

router.get('/channels/:channelId/playlists', async (req, res) => {
  const { channelId } = req.params
  const p = new URLSearchParams()
  if (req.query.continuation) p.set('continuation', req.query.continuation)
  const qs = p.toString() ? `?${p}` : ''
  await withYtjsFallback(
    res,
    proxyToMain(`/api/channels/${encodeURIComponent(channelId)}/playlists${qs}`),
    req.query.continuation ? null : () => ytjsChannelPlaylists(channelId),
  )
})

router.get('/channels/:channelId/community', async (req, res) => {
  const { channelId } = req.params
  const p = new URLSearchParams()
  if (req.query.continuation) p.set('continuation', req.query.continuation)
  const qs = p.toString() ? `?${p}` : ''
  await withYtjsFallback(
    res,
    proxyToMain(`/api/channels/${encodeURIComponent(channelId)}/community${qs}`),
    req.query.continuation ? null : () => ytjsChannelCommunity(channelId),
  )
})

router.get('/channels/:channelId/comments', async (req, res) => {
  const { channelId } = req.params
  const p = new URLSearchParams()
  if (req.query.continuation) p.set('continuation', req.query.continuation)
  const qs = p.toString() ? `?${p}` : ''
  await withYtjsFallback(
    res,
    proxyToMain(`/api/channels/${encodeURIComponent(channelId)}/comments${qs}`),
    req.query.continuation ? null : () => ytjsChannelCommunity(channelId),
  )
})

router.get('/channels/:channelId/search', async (req, res) => {
  try {
    const p = new URLSearchParams()
    if (req.query.q) p.set('q', req.query.q)
    if (req.query.page) p.set('page', req.query.page)
    const qs = p.toString() ? `?${p}` : ''
    const data = await proxyToMain(`/api/channels/${encodeURIComponent(req.params.channelId)}/search${qs}`)
    res.json(data)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

router.get('/playlists/:playlistId', async (req, res) => {
  try {
    const p = new URLSearchParams()
    if (req.query.page) p.set('page', req.query.page)
    const qs = p.toString() ? `?${p}` : ''
    const data = await proxyToMain(`/api/playlists/${encodeURIComponent(req.params.playlistId)}${qs}`)
    res.json(data)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

router.get('/mixes/:mixId', async (req, res) => {
  try {
    const data = await proxyToMain(`/api/mixes/${encodeURIComponent(req.params.mixId)}`)
    res.json(data)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

export default router

import { Router } from 'express'
import {
  XEROX_API_LIST_URL, XEROX_API_FALLBACK,
  MIN2_TUBE_API_LIST_URL, MIN2_TUBE_API_FALLBACK,
  WISTA_API_LIST_URL, WISTA_API_FALLBACK,
  INVIDIOUS_STREAM_INSTANCES,
  YUZU_API_BASE, SIAWASE_API_BASE, KATUO_API_BASE,
  CHOCO_API_BASE, KTUBE_API_BASE,
  CORS_PROXY_GITHUB_URL,
} from '../config.js'

const router = Router()

const ITAG_INFO = {
  17: { height: 144, isAudio: false, fmt: 'mp4' },
  18: { height: 360, isAudio: false, fmt: 'mp4' },
  22: { height: 720, isAudio: false, fmt: 'mp4' },
  37: { height: 1080, isAudio: false, fmt: 'mp4' },
  38: { height: 3072, isAudio: false, fmt: 'mp4' },
  82: { height: 360, isAudio: false, fmt: 'mp4' },
  83: { height: 480, isAudio: false, fmt: 'mp4' },
  84: { height: 720, isAudio: false, fmt: 'mp4' },
  85: { height: 1080, isAudio: false, fmt: 'mp4' },
  133: { height: 240, isAudio: false, fmt: 'mp4v' },
  134: { height: 360, isAudio: false, fmt: 'mp4v' },
  135: { height: 480, isAudio: false, fmt: 'mp4v' },
  136: { height: 720, isAudio: false, fmt: 'mp4v' },
  137: { height: 1080, isAudio: false, fmt: 'mp4v' },
  138: { height: 2160, isAudio: false, fmt: 'mp4v' },
  160: { height: 144, isAudio: false, fmt: 'mp4v' },
  264: { height: 1440, isAudio: false, fmt: 'mp4v' },
  266: { height: 2160, isAudio: false, fmt: 'mp4v' },
  167: { height: 360, isAudio: false, fmt: 'webmv' },
  168: { height: 480, isAudio: false, fmt: 'webmv' },
  169: { height: 1080, isAudio: false, fmt: 'webmv' },
  218: { height: 480, isAudio: false, fmt: 'webmv' },
  219: { height: 144, isAudio: false, fmt: 'webmv' },
  242: { height: 240, isAudio: false, fmt: 'webmv' },
  243: { height: 360, isAudio: false, fmt: 'webmv' },
  244: { height: 480, isAudio: false, fmt: 'webmv' },
  245: { height: 480, isAudio: false, fmt: 'webmv' },
  246: { height: 480, isAudio: false, fmt: 'webmv' },
  247: { height: 720, isAudio: false, fmt: 'webmv' },
  248: { height: 1080, isAudio: false, fmt: 'webmv' },
  271: { height: 1440, isAudio: false, fmt: 'webmv' },
  272: { height: 2160, isAudio: false, fmt: 'webmv' },
  302: { height: 720, isAudio: false, fmt: 'webmv' },
  303: { height: 1080, isAudio: false, fmt: 'webmv' },
  308: { height: 1440, isAudio: false, fmt: 'webmv' },
  313: { height: 2160, isAudio: false, fmt: 'webmv' },
  315: { height: 2160, isAudio: false, fmt: 'webmv' },
  139: { height: 0, isAudio: true, fmt: 'm4a' },
  140: { height: 0, isAudio: true, fmt: 'm4a' },
  141: { height: 0, isAudio: true, fmt: 'm4a' },
  171: { height: 0, isAudio: true, fmt: 'webma' },
  172: { height: 0, isAudio: true, fmt: 'webma' },
  249: { height: 0, isAudio: true, fmt: 'webma' },
  250: { height: 0, isAudio: true, fmt: 'webma' },
  251: { height: 0, isAudio: true, fmt: 'webma' },
}

const HLS_LIVE_ITAGS = { 91: 144, 92: 240, 93: 360, 94: 480, 95: 720, 96: 1080, 300: 720, 301: 1080 }
const WISTA_AUDIO_ITAGS = new Set(['139','140','141','171','172','249','250','251'])
const WISTA_MUXED_ITAGS = new Set(['17','18','22','37','38','82','83','84','85'])
const WISTA_HLS_ITAGS = new Set(['91','92','93','94','95','96','300','301'])
const ERROR_KEYWORDS = ["shutdown", "blocked", "Forbidden", "<!DOCTYPE", "<html", "Rate limit", "not found", "temporarily unavailable", "maintenance"]

let _xeroxApiCache = null
let _xeroxApiCacheTime = 0
let _min2ApiCache = null
let _min2ApiCacheTime = 0
let _wistaApiCache = null
let _wistaApiCacheTime = 0
let _githubProxies = []
let _githubProxiesFetched = false

async function fetchApiList(url, fallback) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (res.ok) {
      const data = await res.json()
      let urls = []
      if (Array.isArray(data)) {
        urls = data.map(item => typeof item === 'string' ? item : item.url || '').filter(Boolean)
      } else if (data && typeof data === 'object') {
        urls = data.apis || data.urls || []
      }
      urls = urls.filter(Boolean)
      if (urls.length) return urls
    }
  } catch { /* ignore */ }
  return fallback
}

async function getXeroxApiList() {
  const now = Date.now()
  if (_xeroxApiCache && now - _xeroxApiCacheTime < 300000) return _xeroxApiCache
  const list = await fetchApiList(XEROX_API_LIST_URL, XEROX_API_FALLBACK)
  _xeroxApiCache = list; _xeroxApiCacheTime = now
  return list
}

async function getMin2ApiList() {
  const now = Date.now()
  if (_min2ApiCache && now - _min2ApiCacheTime < 300000) return _min2ApiCache
  const list = await fetchApiList(MIN2_TUBE_API_LIST_URL, MIN2_TUBE_API_FALLBACK)
  _min2ApiCache = list; _min2ApiCacheTime = now
  return list
}

async function getWistaApiList() {
  const now = Date.now()
  if (_wistaApiCache && now - _wistaApiCacheTime < 300000) return _wistaApiCache
  const list = await fetchApiList(WISTA_API_LIST_URL, WISTA_API_FALLBACK)
  _wistaApiCache = list; _wistaApiCacheTime = now
  return list
}

async function fetchGithubProxies() {
  if (_githubProxiesFetched) return _githubProxies
  _githubProxiesFetched = true
  try {
    const res = await fetch(CORS_PROXY_GITHUB_URL, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const text = await res.text()
      const matches = text.match(/https?:\/\/[^\s"',\]]+/g) || []
      const proxies = matches.filter(l => l.startsWith('http')).map(l => l.endsWith('/') ? l : l + '/')
      if (proxies.length > 0) _githubProxies = proxies
    }
  } catch { /* ignore */ }
  return _githubProxies
}

function xeroxBuildLabel(url, quality, height, container, isAudio, isVideoOnly = false) {
  try {
    let params
    try { params = new URL(url).searchParams } catch { params = new URLSearchParams() }
    let itagFmt = ''
    const itagStr = params.get('itag')
    if (itagStr) {
      const itag = parseInt(itagStr)
      const info = ITAG_INFO[itag]
      if (info) {
        if (!height && info.height) height = info.height
        if (!isAudio && info.isAudio) isAudio = true
        itagFmt = info.fmt
      }
    }
    let bitrateStr = ''
    const clen = params.get('clen')
    const dur = params.get('dur')
    if (clen && dur) {
      const kbps = Math.round(parseInt(clen) * 8 / parseFloat(dur) / 1000)
      if (!isNaN(kbps) && isFinite(kbps)) bitrateStr = `${kbps}kbps`
    }
    const mime = params.get('mime') || ''
    if (isAudio || (mime && mime.startsWith('audio'))) {
      let fmt
      if (mime.includes('webm')) fmt = 'WebM'
      else if (mime.includes('mp4') || mime.includes('aac')) fmt = 'M4A'
      else fmt = (container || 'audio').toUpperCase()
      return bitrateStr ? `${bitrateStr} (${fmt})` : fmt
    } else {
      if (!height && quality) {
        const m = quality.match(/^(\d+)/)
        if (m) height = parseInt(m[1])
      }
      const base = height ? `${height}p` : (quality || 'Auto')
      if (isVideoOnly) {
        let codec
        if (itagFmt.includes('webm') || mime.includes('webm') || (container || '').toLowerCase() === 'webm') {
          codec = 'WebM'
        } else { codec = 'H.264' }
        return `${base} (${codec})`
      }
      return base
    }
  } catch { return quality || 'Auto' }
}

function parseYuzuSiawaseFormats(data) {
  const streams = []
  const seen = new Set()
  const hlsUrl = data.hls_url || data.hlsUrl || data.manifest_url
  if (hlsUrl && !seen.has(hlsUrl)) {
    seen.add(hlsUrl)
    streams.push({ url: hlsUrl, quality: 'Auto (HLS)', format: 'hls', container: 'm3u8', hasAudio: true, hasVideo: true, isHLS: true })
  }
  const formats = data.formats || []
  for (const fmt of formats) {
    const streamUrl = fmt.url
    if (!streamUrl || seen.has(streamUrl)) continue
    seen.add(streamUrl)
    const itagStr = String(fmt.itag || '')
    const ext = String(fmt.ext || 'mp4')
    const resolution = String(fmt.resolution || '')
    let isHls = ext === 'm3u8' || streamUrl.includes('hls_playlist')
    let hlsHeight = 0
    if (!isHls && itagStr) {
      const itagInt = parseInt(itagStr)
      if (!isNaN(itagInt) && HLS_LIVE_ITAGS[itagInt]) {
        isHls = true
        hlsHeight = HLS_LIVE_ITAGS[itagInt]
      }
    }
    if (isHls) {
      if (!hlsHeight && resolution && resolution.includes('x')) {
        try { hlsHeight = parseInt(resolution.toLowerCase().split('x')[1]) } catch { /* ignore */ }
      }
      const fps = fmt.fps
      const fpsStr = fps && parseInt(String(fps)) > 30 ? `${fps}fps` : ''
      const qualLabel = hlsHeight ? `HLS ${hlsHeight}p${fpsStr}` : 'HLS'
      streams.push({ url: streamUrl, quality: qualLabel, format: 'hls', container: 'm3u8', hasAudio: true, hasVideo: true, isHLS: true })
      continue
    }
    let height = 0
    let isAudio = resolution === 'audio only'
    let isVideoOnly = false
    let isCombined = false
    let container = ext
    if (itagStr) {
      const itagInt = parseInt(itagStr)
      if (!isNaN(itagInt)) {
        const info = ITAG_INFO[itagInt]
        if (info) {
          if (info.height) height = info.height
          if (info.isAudio) isAudio = true
          else if (info.fmt.endsWith('v')) isVideoOnly = true
          else isCombined = true
          if (info.fmt.includes('webm')) container = 'webm'
          else if (info.fmt.includes('mp4') || info.fmt === 'm4a') container = info.isAudio ? 'm4a' : 'mp4'
        }
      }
    }
    if (!height && resolution && resolution !== 'audio only') {
      const parts = resolution.toLowerCase().split('x')
      if (parts.length === 2) { const h = parseInt(parts[1]); if (!isNaN(h)) height = h }
    }
    if (!isAudio && !isVideoOnly && !isCombined) {
      if (resolution.includes('x')) isVideoOnly = true
    }
    if (isAudio) {
      const label = xeroxBuildLabel(streamUrl, '', height, container || 'm4a', true)
      streams.push({ url: streamUrl, quality: label || 'M4A', format: 'audio', container: container || 'm4a', hasAudio: true, hasVideo: false, isHLS: false })
    } else if (isVideoOnly) {
      const label = xeroxBuildLabel(streamUrl, '', height, container, false, true)
      streams.push({ url: streamUrl, quality: label || (height ? `${height}p` : 'Auto'), format: 'video', container, hasAudio: false, hasVideo: true, isHLS: false })
    } else {
      const label = xeroxBuildLabel(streamUrl, '', height, container, false)
      streams.push({ url: streamUrl, quality: label || (height ? `${height}p` : 'Auto'), format: 'mp4', container, hasAudio: true, hasVideo: true, isHLS: false })
    }
  }
  return streams
}

function mergedSignal(timeoutMs, signal) {
  if (signal) return AbortSignal.any([AbortSignal.timeout(timeoutMs), signal])
  return AbortSignal.timeout(timeoutMs)
}

async function fetchXeroxStream(apiUrl, videoId, timeoutMs = 10000, signal) {
  try {
    const res = await fetch(`${apiUrl}/stream?id=${videoId}`, { signal: mergedSignal(timeoutMs, signal) })
    if (!res.ok) return null
    const data = await res.json()
    const streams = []
    const seen = new Set()
    const formats = data.formats || []
    for (const fmt of formats) {
      const url = fmt.url || fmt.streamingUrl
      if (!url || seen.has(url)) continue
      seen.add(url)
      const quality = String(fmt.quality || '')
      const height = Number(fmt.height || 0)
      const container = String(fmt.container || 'mp4')
      const label = xeroxBuildLabel(url, quality, height, container, false)
      streams.push({ url, quality: label, format: 'mp4', container, hasAudio: true, hasVideo: true, isHLS: false })
    }
    const streamingUrl = data.streamingUrl || data.url
    if (!streams.length && streamingUrl && !seen.has(streamingUrl)) {
      seen.add(streamingUrl)
      const label = xeroxBuildLabel(streamingUrl, '', 0, 'mp4', false)
      streams.push({ url: streamingUrl, quality: label, format: 'mp4', container: 'mp4', hasAudio: true, hasVideo: true, isHLS: false })
    }
    const audioUrl = data.audioUrl
    if (audioUrl && !seen.has(audioUrl)) {
      seen.add(audioUrl)
      const label = xeroxBuildLabel(audioUrl, '', 0, 'm4a', true)
      streams.push({ url: audioUrl, quality: label, format: 'audio', container: 'm4a', hasAudio: true, hasVideo: false, isHLS: false })
    }
    return streams.length > 0 ? streams : null
  } catch { return null }
}

async function fetchYuzuStream(videoId, timeoutMs = 15000, signal) {
  try {
    const res = await fetch(`${YUZU_API_BASE}/stream/${videoId}`, { signal: mergedSignal(timeoutMs, signal) })
    if (!res.ok) return null
    const data = await res.json()
    const streams = parseYuzuSiawaseFormats(data)
    return streams.length > 0 ? streams : null
  } catch { return null }
}

async function fetchSiawaseStream(videoId, timeoutMs = 15000, signal) {
  try {
    const res = await fetch(`${SIAWASE_API_BASE}/api/streams/${videoId}`, { signal: mergedSignal(timeoutMs, signal) })
    if (!res.ok) return null
    const data = await res.json()
    const streams = parseYuzuSiawaseFormats(data)
    return streams.length > 0 ? streams : null
  } catch { return null }
}

async function fetchKatuoStream(videoId, timeoutMs = 15000, signal) {
  try {
    const res = await fetch(`${KATUO_API_BASE}/stream/${videoId}`, { signal: mergedSignal(timeoutMs, signal) })
    if (!res.ok) return null
    const data = await res.json()
    const streams = parseYuzuSiawaseFormats(data)
    return streams.length > 0 ? streams : null
  } catch { return null }
}

function convertWistaRawStream(s) {
  const url = String(s.url || '')
  if (!url) return null
  const ext = String(s.ext || '').toLowerCase()
  const quality = String(s.quality || '')
  const formatId = String(s.format_id || '')
  const fps = s.fps != null ? Number(s.fps) : null
  const size = s.size != null ? Number(s.size) : null
  if (ext === 'mhtml' || quality.toLowerCase() === 'storyboard') return null
  const isHLS = WISTA_HLS_ITAGS.has(formatId) || url.includes('hls_playlist')
  if (isHLS) {
    const qStr = /^\d+$/.test(quality) ? `${quality}p` : quality
    return { url, quality: qStr ? `${qStr} (HLS)` : 'HLS', format: 'hls', container: 'm3u8', hasAudio: true, hasVideo: true, isHLS: true }
  }
  const fpsIsVideo = fps !== null && fps > 0
  const codec = ext === 'webm' ? 'WebM' : 'H.264'
  const isAudioOnly =
    WISTA_AUDIO_ITAGS.has(formatId) ||
    ext === 'm4a' ||
    (ext === 'webm' && !fpsIsVideo && !WISTA_MUXED_ITAGS.has(formatId)) ||
    (!fpsIsVideo && !WISTA_MUXED_ITAGS.has(formatId) && ext !== 'mp4')
  if (isAudioOnly) {
    let label
    if (size) label = `${Math.round(size / 1024)}KB (${ext.toUpperCase()})`
    else label = quality ? `${quality} (${ext.toUpperCase()})` : ext.toUpperCase()
    return { url, quality: label, format: 'audio', container: ext || 'm4a', hasAudio: true, hasVideo: false, isHLS: false }
  }
  if (WISTA_MUXED_ITAGS.has(formatId)) {
    return { url, quality: quality || formatId, format: 'mp4', container: ext || 'mp4', hasAudio: true, hasVideo: true, isHLS: false }
  }
  const label = quality ? `${quality} (${codec})` : codec
  return { url, quality: label, format: 'video', container: ext || 'mp4', hasAudio: false, hasVideo: true, isHLS: false }
}

async function fetchWistaStream(apiUrl, videoId, timeoutMs = 10000, signal) {
  try {
    const res = await fetch(`${apiUrl}/api/video/${videoId}`, { signal: mergedSignal(timeoutMs, signal) })
    if (!res.ok) return null
    const data = await res.json()
    const rawStreams = data.streams || []
    const streams = []
    for (const s of rawStreams) {
      const converted = convertWistaRawStream(s)
      if (converted) streams.push(converted)
    }
    const hlsStreams = streams.filter(s => s.isHLS).sort((a, b) => {
      const aH = parseInt(a.quality.match(/(\d+)/)?.[1] || '0')
      const bH = parseInt(b.quality.match(/(\d+)/)?.[1] || '0')
      return bH - aH
    })
    const otherStreams = streams.filter(s => !s.isHLS)
    const result = [...hlsStreams, ...otherStreams]
    return result.length > 0 ? result : null
  } catch { return null }
}

async function fetchMin2Stream(apiUrl, videoId, timeoutMs = 10000, signal) {
  try {
    const res = await fetch(`${apiUrl}/api/video/${videoId}`, { signal: mergedSignal(timeoutMs, signal) })
    if (!res.ok) return null
    const data = await res.json()
    const streams = []
    const seen = new Set()

    const addEntry = (url, fmt = {}, overrideIsAudio = false, overrideIsVideoOnly = false, overrideIsHls = false) => {
      if (!url || seen.has(url)) return
      seen.add(url)
      let isHls = overrideIsHls || String(fmt.container || '').toLowerCase() === 'm3u8' || String(fmt.container || '').toLowerCase() === 'hls' || !!fmt.isHLS
      if (isHls) {
        streams.push({ url, quality: 'Auto (HLS)', format: 'hls', container: 'm3u8', hasAudio: true, hasVideo: true, isHLS: true })
        return
      }
      let isAudio = overrideIsAudio
      let isVideoOnly = overrideIsVideoOnly
      let height = Number(fmt.height || 0)
      let container = String(fmt.container || fmt.ext || 'mp4')
      const itagStr = (() => { try { return new URL(url).searchParams.get('itag') } catch { return null } })()
      if (itagStr) {
        const itagInt = parseInt(itagStr)
        const info = ITAG_INFO[itagInt]
        if (info) {
          if (!height && info.height) height = info.height
          if (info.isAudio) isAudio = true
          else if (info.fmt.endsWith('v')) isVideoOnly = true
          if (info.fmt.includes('webm')) container = 'webm'
          else if (info.fmt.includes('mp4') || info.fmt === 'm4a') container = info.isAudio ? 'm4a' : 'mp4'
        }
      }
      const mime = (() => { try { return new URL(url).searchParams.get('mime') || '' } catch { return '' } })()
      if (mime) {
        if (mime.startsWith('audio')) isAudio = true
        if (mime.includes('webm')) container = 'webm'
        else if (mime.includes('mp4')) container = isAudio ? 'm4a' : 'mp4'
      }
      const fmtMime = String(fmt.type || fmt.mimeType || '')
      if (fmtMime) {
        if (fmtMime.startsWith('audio')) isAudio = true
        else if (fmtMime.startsWith('video') && !isAudio) isVideoOnly = true
      }
      const quality = String(fmt.qualityLabel || fmt.quality || '')
      if (isAudio) {
        const label = xeroxBuildLabel(url, quality, height, container || 'm4a', true)
        streams.push({ url, quality: label || 'M4A', format: 'audio', container: container || 'm4a', hasAudio: true, hasVideo: false, isHLS: false })
      } else if (isVideoOnly) {
        const label = xeroxBuildLabel(url, quality, height, container, false, true)
        streams.push({ url, quality: label || (height ? `${height}p` : 'Auto'), format: 'video', container, hasAudio: false, hasVideo: true, isHLS: false })
      } else {
        const label = xeroxBuildLabel(url, quality, height, container, false)
        streams.push({ url, quality: label || (height ? `${height}p` : 'Auto'), format: 'mp4', container, hasAudio: true, hasVideo: true, isHLS: false })
      }
    }

    for (const fmt of data.formats || []) {
      const url = fmt.url || fmt.stream_url || fmt.streamingUrl
      const hasAudio = fmt.hasAudio !== false
      const hasVideo = fmt.hasVideo !== false
      const isHls = !!fmt.isHLS || ['m3u8', 'hls'].includes(String(fmt.container || '').toLowerCase())
      const isAudio = (!hasVideo) || !!fmt.audio_only
      const isVideoOnly = (!hasAudio) && hasVideo
      addEntry(url, fmt, isAudio, isVideoOnly, isHls)
    }
    for (const fmt of data.adaptiveFormats || []) {
      addEntry(fmt.url || fmt.stream_url, fmt)
    }
    for (const fmt of data.formatStreams || []) {
      addEntry(fmt.url, fmt)
    }
    addEntry(data.stream_url || data.streamingUrl || data.url)
    addEntry(data.audioUrl || data.audio_url, {}, true)
    for (const k of ['videoUrl', 'video_url', 'highstreamUrl', 'highStreamUrl', 'high_stream_url']) {
      addEntry(data[k], {}, false, true)
    }
    const hlsU = data.hlsUrl || data.hls_url
    if (hlsU && !seen.has(hlsU)) {
      seen.add(hlsU)
      streams.push({ url: hlsU, quality: 'Auto (HLS)', format: 'hls', container: 'm3u8', hasAudio: true, hasVideo: true, isHLS: true })
    }
    return streams.length > 0 ? streams : null
  } catch { return null }
}

function parseInvidiousStreams(data) {
  const streams = []
  if (data.hlsUrl) {
    streams.push({ url: String(data.hlsUrl), quality: 'Auto (HLS)', format: 'hls', container: 'm3u8', hasAudio: true, hasVideo: true, isHLS: true, isLive: !!data.liveNow })
  }
  for (const fmt of (data.formatStreams || [])) {
    const url = String(fmt.url || '')
    if (!url) continue
    streams.push({ url, quality: String(fmt.qualityLabel || fmt.quality || 'Unknown'), format: 'mp4', container: String(fmt.container || 'mp4'), hasAudio: true, hasVideo: true, isHLS: false })
  }
  for (const fmt of (data.adaptiveFormats || [])) {
    const url = String(fmt.url || '')
    if (!url) continue
    const codecRaw = String(fmt.codec || fmt.encoding || fmt.type || '')
    const mimeType = String(fmt.type || '').toLowerCase()
    const codec = codecRaw.toLowerCase()
    const quality = String(fmt.qualityLabel || fmt.quality || '')
    const bitrate = Number(fmt.bitrate || 0)
    const container = String(fmt.container || 'mp4')
    const isVideoMime = mimeType.startsWith('video/')
    const isAudioMime = mimeType.startsWith('audio/')
    if (isVideoMime || ['vp9', 'vp8', 'av1', 'vp09', 'h264', 'h265', 'avc1'].some(v => codec.includes(v))) {
      const isWebm = ['vp9', 'vp8', 'av1', 'vp09'].some(v => codec.includes(v))
      const q = quality.split(' ')[0] || 'unknown'
      streams.push({ url, quality: `${q} (${isWebm ? 'WebM' : 'H.264'})`, format: 'video', container: isWebm ? 'webm' : (container || 'mp4'), hasAudio: false, hasVideo: true, isHLS: false })
    } else if (isAudioMime || ['opus', 'aac', 'mp4a', 'vorbis', 'mp3'].some(a => codec.includes(a))) {
      const br = bitrate > 1000 ? `${Math.round(bitrate / 1000)}` : String(bitrate)
      const codecLabel = codec.includes('opus') ? 'WebM' : codec.includes('aac') || codec.includes('mp4a') ? 'M4A' : codec.includes('vorbis') ? 'Vorbis' : (String(fmt.encoding || 'Audio')).toUpperCase()
      streams.push({ url, quality: `${br} kbps (${codecLabel})`, format: 'audio', container, hasAudio: true, hasVideo: false, isHLS: false })
    }
  }
  return streams
}

async function raceFirst(fns) {
  return new Promise(resolve => {
    let done = false
    let completed = 0
    if (!fns.length) { resolve(null); return }
    fns.forEach(fn => fn().then(r => {
      completed++
      if (!done && r) { done = true; resolve(r); return }
      if (completed === fns.length && !done) { done = true; resolve(null) }
    }).catch(() => {
      completed++
      if (completed === fns.length && !done) { done = true; resolve(null) }
    }))
  })
}

async function fetchYtdlpSource(key, videoId, timeoutMs = 15000, signal) {
  if (key === 'xerox') {
    const apiList = await getXeroxApiList()
    if (!apiList.length) return null
    return raceFirst(apiList.map(api => () => fetchXeroxStream(api, videoId, timeoutMs, signal)))
  } else if (key === 'yuzu') {
    return fetchYuzuStream(videoId, timeoutMs, signal)
  } else if (key === 'siawase') {
    return fetchSiawaseStream(videoId, timeoutMs, signal)
  } else if (key === 'wista') {
    const apiList = await getWistaApiList()
    if (!apiList.length) return null
    return raceFirst(apiList.map(api => () => fetchWistaStream(api, videoId, timeoutMs, signal)))
  } else if (key === 'min2tube') {
    const apiList = await getMin2ApiList()
    if (!apiList.length) return null
    return raceFirst(apiList.map(api => () => fetchMin2Stream(api, videoId, timeoutMs, signal)))
  } else if (key === 'katuo') {
    return fetchKatuoStream(videoId, timeoutMs, signal)
  }
  return null
}

const ALL_SOURCES = ['xerox', 'yuzu', 'siawase', 'wista', 'min2tube', 'katuo']

const YTDLP_RETRY_TIMEOUTS = [15000, 25000, 40000]

async function raceParallel(keys, videoId, timeoutMs) {
  return new Promise(resolve => {
    let done = false
    let completed = 0
    if (!keys.length) { resolve(null); return }
    keys.forEach(key => {
      fetchYtdlpSource(key, videoId, timeoutMs).then(r => {
        completed++
        if (!done && r && r.length > 0) { done = true; resolve({ streams: r, source: key }); return }
        if (completed === keys.length && !done) { done = true; resolve(null) }
      }).catch(() => {
        completed++
        if (completed === keys.length && !done) { done = true; resolve(null) }
      })
    })
  })
}

router.get('/ytdlp/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params
    const { source, mode = 'parallel', exclude, timeout, order } = req.query
    const excludeSet = new Set((exclude ? exclude.split(',') : []).map(e => e.toLowerCase()))
    const customTimeout = timeout ? parseInt(timeout) : null

    if (source) {
      const tms = customTimeout || 25000
      const streams = await fetchYtdlpSource(source.toLowerCase(), videoId, tms)
      if (!streams) return res.status(503).json({ error: 'Source failed', source })
      return res.json({ streams, source })
    }

    // Apply custom order if provided, keeping any sources not in the order list at the end
    let keys
    if (order) {
      const ordered = order.split(',').map(k => k.trim().toLowerCase()).filter(k => ALL_SOURCES.includes(k))
      const rest = ALL_SOURCES.filter(k => !ordered.includes(k))
      keys = [...ordered, ...rest].filter(k => !excludeSet.has(k))
    } else {
      keys = ALL_SOURCES.filter(k => !excludeSet.has(k))
    }

    if (mode === 'parallel') {
      const retryTimeouts = customTimeout ? [customTimeout] : YTDLP_RETRY_TIMEOUTS
      for (const tms of retryTimeouts) {
        const result = await raceParallel(keys, videoId, tms)
        if (result) return res.json({ ...result, failedSources: [] })
      }
      return res.status(503).json({ error: 'All sources failed' })
    }

    // sequential mode with retries
    const retryTimeouts = customTimeout ? [customTimeout] : YTDLP_RETRY_TIMEOUTS
    const failedSources = []
    for (const tms of retryTimeouts) {
      const remaining = keys.filter(k => !failedSources.includes(k))
      if (!remaining.length) break
      for (const key of remaining) {
        const streams = await fetchYtdlpSource(key, videoId, tms)
        if (streams) return res.json({ streams, source: key, failedSources })
        if (!failedSources.includes(key)) failedSources.push(key)
      }
    }
    res.status(503).json({ error: 'All sources failed', failedSources })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/ytdlp-all/:videoId', async (req, res) => {
  const { videoId } = req.params
  const { exclude, timeout } = req.query
  const excludeSet = new Set((exclude ? exclude.split(',') : []).map(e => e.toLowerCase()))
  const customTimeout = timeout ? parseInt(timeout) : null

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const ctrl = new AbortController()
  req.on('close', () => ctrl.abort())

  const sources = ALL_SOURCES.filter(k => !excludeSet.has(k))
  const RETRY_TIMEOUTS = customTimeout ? [customTimeout] : [10000, 15000, 20000, 30000, 45000]

  await Promise.allSettled(sources.map(async (key) => {
    let result = null
    for (const tms of RETRY_TIMEOUTS) {
      if (ctrl.signal.aborted) break
      try {
        result = await fetchYtdlpSource(key, videoId, tms, ctrl.signal)
        if (result) break
      } catch { /* retry */ }
    }
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ source: key, streams: result })}\n\n`)
    }
  }))

  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    res.end()
  }
})

router.get('/invidious/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params
    const { exclude } = req.query
    const excludeSet = new Set(exclude ? exclude.split(',') : [])
    const INV_BATCH_SIZE = 6
    const INV_REQ_TIMEOUT = 3000

    // 1. choco-api と min2tube を並列でレース（先に成功した方を使う）
    const chocoHost = (() => { try { return new URL(CHOCO_API_BASE).hostname } catch { return '' } })()
    const fastAttempts = []

    if (!excludeSet.has(chocoHost) && !excludeSet.has(CHOCO_API_BASE)) {
      fastAttempts.push(async () => {
        try {
          let chocoUrl = `${CHOCO_API_BASE}/api/v1/videos/${videoId}`
          if (exclude) chocoUrl += `?exclude=${exclude}`
          const r = await fetch(chocoUrl, { signal: AbortSignal.timeout(10000) })
          if (!r.ok) return null
          const text = await r.text()
          if (ERROR_KEYWORDS.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) return null
          const json = JSON.parse(text)
          if (!json || !json.title) return null
          const streams = parseInvidiousStreams(json)
          if (!streams || !streams.length) return null
          const instance = String(json.instance || json._instance || CHOCO_API_BASE)
          return { streams, instance, proxy: 'choco-api' }
        } catch { return null }
      })
    }

    // min2tube を追加
    fastAttempts.push(async () => {
      try {
        const apiList = await getMin2ApiList()
        if (!apiList.length) return null
        const streams = await raceFirst(apiList.map(api => () => fetchMin2Stream(api, videoId, 10000)))
        if (streams && streams.length > 0) return { streams, instance: 'min2tube' }
        return null
      } catch { return null }
    })

    if (fastAttempts.length > 0) {
      const result = await raceFirst(fastAttempts)
      if (result) return res.json(result)
    }

    // 2. INVIDIOUS_STREAM_INSTANCES をバッチで並列試行
    const allInstances = INVIDIOUS_STREAM_INSTANCES.filter(i => !excludeSet.has(i))
    for (let i = 0; i < Math.ceil(allInstances.length / INV_BATCH_SIZE); i++) {
      const batch = allInstances.slice(i * INV_BATCH_SIZE, (i + 1) * INV_BATCH_SIZE)
      const promises = batch.map(instance => {
        const apiUrl = `${instance}/api/v1/videos/${videoId}`
        return fetch(apiUrl, { signal: AbortSignal.timeout(INV_REQ_TIMEOUT) })
          .then(async r => {
            if (!r.ok) return null
            const text = await r.text()
            if (ERROR_KEYWORDS.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) return null
            const json = JSON.parse(text)
            if (!json || json.error || !json.title) return null
            const streams = parseInvidiousStreams(json)
            if (!streams.length) return null
            return { streams, instance }
          })
          .catch(() => null)
      })
      const results = await Promise.all(promises)
      const success = results.find(r => r !== null)
      if (success) return res.json(success)
    }

    res.status(503).json({ error: 'All Invidious instances failed' })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/choco/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params
    const { exclude } = req.query
    let url = `${CHOCO_API_BASE}/api/v1/videos/${videoId}`
    if (exclude) url += `?exclude=${exclude}`
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!r.ok) return res.status(503).json({ error: 'Choco API failed' })
    const text = await r.text()
    if (ERROR_KEYWORDS.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
      return res.status(503).json({ error: 'Choco API returned error content' })
    }
    const data = JSON.parse(text)
    if (!data || !data.title) return res.status(503).json({ error: 'Invalid response' })
    const streams = parseInvidiousStreams(data)
    if (!streams.length) return res.status(503).json({ error: 'No streams found' })
    const instance = String(data.instance || data._instance || data.used_instance || CHOCO_API_BASE)
    res.json({ streams, instance, proxy: 'choco-api' })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/ktube/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params
    const r = await fetch(`${KTUBE_API_BASE}?v=${videoId}`, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) return res.status(503).json({ error: 'K-tube API failed' })
    const text = await r.text()
    if (ERROR_KEYWORDS.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
      return res.status(503).json({ error: 'K-tube returned error content' })
    }
    const data = JSON.parse(text)
    if (!data || !data.title) return res.status(503).json({ error: 'Invalid response' })
    const streams = parseInvidiousStreams(data)
    if (!streams.length) return res.status(503).json({ error: 'No streams found' })
    res.json({ streams, instance: 'K-tube API', proxy: 'ktube' })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/hdad/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params
    const { exclude } = req.query
    const excludeKeys = exclude ? exclude.split(',') : []

    const wistaList = await getWistaApiList()

    const allTasks = [
      { key: 'yuzu', fn: () => fetchYuzuStream(videoId) },
      { key: 'siawase', fn: () => fetchSiawaseStream(videoId) },
      ...(wistaList.length > 0 ? [{
        key: 'wista',
        fn: () => raceFirst(wistaList.map(api => () => fetchWistaStream(api, videoId)))
      }] : []),
      { key: 'choco', fn: async () => {
        try {
          const r = await fetch(`${CHOCO_API_BASE}/api/v1/videos/${videoId}`, { signal: AbortSignal.timeout(10000) })
          if (!r.ok) return null
          const text = await r.text()
          if (ERROR_KEYWORDS.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) return null
          const data = JSON.parse(text)
          if (!data || !data.title) return null
          return parseInvidiousStreams(data)
        } catch { return null }
      }},
    ]

    const tasks = excludeKeys.length > 0 ? allTasks.filter(t => !excludeKeys.includes(t.key)) : allTasks

    const result = await new Promise(resolve => {
      let done = false
      let completed = 0
      if (!tasks.length) { resolve(null); return }
      tasks.forEach(({ key, fn }) => fn().then(streams => {
        completed++
        if (!done && streams && streams.length > 0) {
          const hasVideoOnly = streams.some(s => s.hasVideo && !s.hasAudio && !s.isHLS)
          const hasAudioOnly = streams.some(s => s.hasAudio && !s.hasVideo)
          if (hasVideoOnly && hasAudioOnly) {
            done = true
            resolve({ streams, source: key })
            return
          }
        }
        if (completed === tasks.length && !done) { done = true; resolve(null) }
      }).catch(() => {
        completed++
        if (completed === tasks.length && !done) { done = true; resolve(null) }
      }))
    })

    if (!result) return res.status(503).json({ error: 'No HD+AD streams found' })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

router.get('/cors-proxies', async (req, res) => {
  try {
    const proxies = await fetchGithubProxies()
    res.json({ proxies })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

export default router

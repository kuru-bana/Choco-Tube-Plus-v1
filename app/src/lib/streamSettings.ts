export type StreamMode = 'ytdlp' | 'invidious' | 'rapid' | 'nocookie' | 'edu' | 'hdad'
export type StreamFilter = 'mp4' | 'video' | 'audio' | 'hls'
export type YtdlpFetchMode = 'sequential' | 'parallel' | 'specific'

export const DEFAULT_SEQUENTIAL_ORDER = ['xerox', 'yuzu', 'siawase', 'wista', 'min2tube', 'katuo']

export interface StreamSettings {
  streamMode: StreamMode
  ytdlpFilter: StreamFilter
  ytdlpFetchMode: YtdlpFetchMode
  ytdlpSpecificApi: string
  ytdlpTimeoutSec: number
  ytdlpSequentialOrder: string[]
  invFilter: StreamFilter
  rapidFilter: StreamFilter
  eduParam: string
}

export const STREAM_TYPE_KEY           = 'preferred_stream_type'
export const YTDLP_FILTER_KEY          = 'preferred_ytdlp_filter'
export const INV_FILTER_KEY            = 'preferred_inv_filter'
export const RAPID_FILTER_KEY          = 'preferred_rapid_filter'
export const EDU_PARAM_KEY             = 'preferred_edu_param'
export const YTDLP_FETCH_MODE_KEY      = 'ytdlp_fetch_mode'
export const YTDLP_SPECIFIC_API_KEY    = 'ytdlp_specific_api'
export const YTDLP_TIMEOUT_KEY         = 'ytdlp_timeout_sec'
export const YTDLP_SEQUENTIAL_ORDER_KEY = 'ytdlp_sequential_order'

export const DEFAULT_STREAM_SETTINGS: StreamSettings = {
  streamMode: 'ytdlp',
  ytdlpFilter: 'mp4',
  ytdlpFetchMode: 'parallel',
  ytdlpSpecificApi: 'xerox',
  ytdlpTimeoutSec: 15,
  ytdlpSequentialOrder: DEFAULT_SEQUENTIAL_ORDER,
  invFilter: 'mp4',
  rapidFilter: 'mp4',
  eduParam: 'wakame',
}

export const STREAM_MODE_OPTIONS: Array<{ value: StreamMode; label: string; description: string }> = [
  { value: 'ytdlp',     label: 'yt-dlp',        description: 'yt-dlp API 経由でストリームを取得します（推奨）' },
  { value: 'invidious', label: 'Invidious',      description: 'Invidious インスタンス経由で取得します' },
  { value: 'rapid',     label: 'Rapid',          description: 'Rapid API 経由で取得します' },
  { value: 'hdad',      label: 'HD+音声分離',     description: '映像と音声を個別に取得して再生します（高画質）' },
  { value: 'nocookie',  label: 'YouTube 埋め込み', description: 'youtube-nocookie.com の埋め込みで再生します' },
  { value: 'edu',       label: '教育埋め込み (edu)', description: 'YouTube 教育用パラメータ付き埋め込みで再生します' },
]

export const FILTER_OPTIONS: Array<{ value: StreamFilter; label: string }> = [
  { value: 'mp4',   label: '動画＋音声（mp4）' },
  { value: 'hls',   label: 'HLS ストリーム' },
  { value: 'video', label: '映像のみ（音声なし）' },
  { value: 'audio', label: '音声のみ（映像なし）' },
]

export const YTDLP_FETCH_MODE_OPTIONS: Array<{ value: YtdlpFetchMode; label: string; description: string }> = [
  { value: 'parallel',   label: '並列取得',   description: '複数 API に同時にリクエストして最初に成功したものを使います（高速）' },
  { value: 'sequential', label: '順次取得',   description: '失敗したら次の API に切り替えながら取得します' },
  { value: 'specific',   label: 'API を指定', description: '特定の API だけを使います' },
]

export const YTDLP_API_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'xerox',    label: 'xerox API' },
  { value: 'yuzu',     label: 'yuzu API' },
  { value: 'siawase',  label: 'しあ API' },
  { value: 'wista',    label: 'wista API' },
  { value: 'min2tube', label: 'min2-tube API' },
  { value: 'katuo',    label: 'katuo API' },
]

function saved(key: string, allowed: string[], def: string): string {
  try { const v = localStorage.getItem(key); return allowed.includes(v ?? '') ? (v as string) : def } catch { return def }
}

function savedOrder(): string[] {
  try {
    const raw = localStorage.getItem(YTDLP_SEQUENTIAL_ORDER_KEY)
    if (!raw) return DEFAULT_SEQUENTIAL_ORDER
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return DEFAULT_SEQUENTIAL_ORDER
    const valid = parsed.filter((k): k is string => typeof k === 'string' && DEFAULT_SEQUENTIAL_ORDER.includes(k))
    if (valid.length === 0) return DEFAULT_SEQUENTIAL_ORDER
    const missing = DEFAULT_SEQUENTIAL_ORDER.filter(k => !valid.includes(k))
    return [...valid, ...missing]
  } catch { return DEFAULT_SEQUENTIAL_ORDER }
}

export function getStreamSettings(): StreamSettings {
  if (typeof window === 'undefined') return DEFAULT_STREAM_SETTINGS
  try {
    const streamMode     = saved(STREAM_TYPE_KEY,       ['ytdlp','invidious','rapid','nocookie','edu','hdad'], 'ytdlp') as StreamMode
    const ytdlpFilter    = saved(YTDLP_FILTER_KEY,      ['mp4','video','audio','hls'], 'mp4') as StreamFilter
    const ytdlpFetchMode = saved(YTDLP_FETCH_MODE_KEY,  ['sequential','parallel','specific'], 'parallel') as YtdlpFetchMode
    const ytdlpSpecificApi = localStorage.getItem(YTDLP_SPECIFIC_API_KEY) || 'xerox'
    const rawTimeout     = parseInt(localStorage.getItem(YTDLP_TIMEOUT_KEY) || '', 10)
    const ytdlpTimeoutSec = (!isNaN(rawTimeout) && rawTimeout > 0) ? rawTimeout : 15
    const ytdlpSequentialOrder = savedOrder()
    const invFilter      = saved(INV_FILTER_KEY,        ['mp4','video','audio','hls'], 'mp4') as StreamFilter
    const rapidFilter    = saved(RAPID_FILTER_KEY,      ['mp4','video','audio','hls'], 'mp4') as StreamFilter
    const eduParam       = localStorage.getItem(EDU_PARAM_KEY) || 'wakame'
    return { streamMode, ytdlpFilter, ytdlpFetchMode, ytdlpSpecificApi, ytdlpTimeoutSec, ytdlpSequentialOrder, invFilter, rapidFilter, eduParam }
  } catch {
    return DEFAULT_STREAM_SETTINGS
  }
}

export function saveStreamSettings(s: StreamSettings): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STREAM_TYPE_KEY,             s.streamMode)
    localStorage.setItem(YTDLP_FILTER_KEY,            s.ytdlpFilter)
    localStorage.setItem(YTDLP_FETCH_MODE_KEY,        s.ytdlpFetchMode)
    localStorage.setItem(YTDLP_SPECIFIC_API_KEY,      s.ytdlpSpecificApi)
    localStorage.setItem(YTDLP_TIMEOUT_KEY,           String(s.ytdlpTimeoutSec))
    localStorage.setItem(YTDLP_SEQUENTIAL_ORDER_KEY,  JSON.stringify(s.ytdlpSequentialOrder))
    localStorage.setItem(INV_FILTER_KEY,              s.invFilter)
    localStorage.setItem(RAPID_FILTER_KEY,            s.rapidFilter)
    localStorage.setItem(EDU_PARAM_KEY,               s.eduParam)
  } catch { /* ignore */ }
}

export function resetStreamSettings(): StreamSettings {
  saveStreamSettings(DEFAULT_STREAM_SETTINGS)
  return DEFAULT_STREAM_SETTINGS
}

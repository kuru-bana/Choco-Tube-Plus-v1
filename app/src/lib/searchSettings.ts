export interface SearchSettings {
  sort_by: string
  date: string
  duration: string
  type: string
  features: string[]
  region: string
  searchSuggestionsEnabled: boolean
}

export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
  sort_by: 'relevance',
  date: '',
  duration: '',
  type: 'all',
  features: [],
  region: 'JP',
  searchSuggestionsEnabled: true,
}

export const SEARCH_SETTINGS_STORAGE_KEY = 'search_settings'

export const SORT_OPTIONS = [
  { value: 'relevance', label: '関連度順' },
  { value: 'rating', label: '評価順' },
  { value: 'upload_date', label: '投稿日順' },
  { value: 'view_count', label: '再生回数順' },
]

export const DATE_OPTIONS = [
  { value: '', label: 'すべて' },
  { value: 'hour', label: '1時間以内' },
  { value: 'today', label: '今日' },
  { value: 'week', label: '今週' },
  { value: 'month', label: '今月' },
  { value: 'year', label: '今年' },
]

export const DURATION_OPTIONS = [
  { value: '', label: 'すべて' },
  { value: 'short', label: '短い（4分未満）' },
  { value: 'medium', label: '普通（4〜20分）' },
  { value: 'long', label: '長い（20分以上）' },
]

export const TYPE_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'video', label: '動画' },
  { value: 'channel', label: 'チャンネル' },
  { value: 'playlist', label: '再生リスト' },
  { value: 'movie', label: '映画' },
  { value: 'show', label: '番組' },
]

export const FEATURE_OPTIONS = [
  { value: 'hd', label: 'HD' },
  { value: '4k', label: '4K' },
  { value: 'live', label: 'ライブ配信' },
  { value: 'subtitles', label: '字幕あり' },
  { value: 'hdr', label: 'HDR' },
  { value: '360', label: '360度' },
  { value: 'vr180', label: 'VR180' },
  { value: '3d', label: '3D' },
  { value: 'creative_commons', label: 'CC' },
]

function isSearchSettings(value: unknown): value is Partial<SearchSettings> {
  return typeof value === 'object' && value !== null
}

export function getSearchSettings(): SearchSettings {
  if (typeof window === 'undefined') return DEFAULT_SEARCH_SETTINGS
  try {
    const raw = window.localStorage.getItem(SEARCH_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SEARCH_SETTINGS
    const parsed = JSON.parse(raw)
    if (!isSearchSettings(parsed)) return DEFAULT_SEARCH_SETTINGS
    return {
      ...DEFAULT_SEARCH_SETTINGS,
      ...parsed,
      features: Array.isArray(parsed.features) ? parsed.features.filter((item): item is string => typeof item === 'string') : [],
    }
  } catch {
    return DEFAULT_SEARCH_SETTINGS
  }
}

export function saveSearchSettings(settings: SearchSettings): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SEARCH_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

export function resetSearchSettings(): SearchSettings {
  saveSearchSettings(DEFAULT_SEARCH_SETTINGS)
  return DEFAULT_SEARCH_SETTINGS
}

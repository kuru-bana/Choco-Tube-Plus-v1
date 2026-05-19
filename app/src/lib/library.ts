// ==========================================
// choco-tube-plus ライブラリ管理
// inv-tube (github.com/kuru-bana/inv-tube) と互換のフォーマット
// ==========================================

const SUBS_KEY    = 'invtube_subs'
const HIST_KEY    = 'invtube_history'
const PL_KEY      = 'invtube_playlists'
const FAV_KEY     = 'invtube_favorites'
const FAV_PL_KEY  = 'invtube_fav_playlists'
const FAV_MIX_KEY = 'invtube_fav_mixes'
const OLD_SUBS_KEY = 'ch_subscriptions'
const HIST_MAX = 500

export interface Subscription {
  authorId: string
  author: string
  authorThumbnails?: Array<{ url: string; width?: number; height?: number }>
  subCount?: number
  subscribedAt: number
}

export interface HistoryItem {
  videoId: string
  title: string
  author: string
  authorId: string
  channelIcon?: string
  lengthSeconds?: number
  watchedAt: number
}

export interface LocalVideo {
  videoId: string
  title: string
  author: string
  authorId: string
  channelIcon?: string
  lengthSeconds?: number
  addedAt: number
}

export interface LocalPlaylist {
  id: string
  title: string
  createdAt: number
  videos: LocalVideo[]
}

export interface FavoriteItem {
  videoId: string
  title: string
  author: string
  authorId: string
  channelIcon?: string
  lengthSeconds?: number
  favoritedAt: number
}

export interface FavoritePlaylist {
  playlistId: string
  title: string
  author?: string
  authorId?: string
  thumbnail?: string
  videoCount?: number
  favoritedAt: number
}

export interface FavoriteMix {
  mixId: string
  title: string
  thumbnail?: string
  favoritedAt: number
}

export interface LibraryExport {
  version: 2
  exportedAt: string
  subscriptions: Subscription[]
  history: HistoryItem[]
  playlists: LocalPlaylist[]
  favorites: FavoriteItem[]
  favoritePlaylists?: FavoritePlaylist[]
  favoriteMixes?: FavoriteMix[]
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, val: T) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// ch_subscriptions → invtube_subs への移行
function migrateSubs() {
  if (localStorage.getItem(SUBS_KEY) !== null) return
  const old = readJson<Array<{ authorId: string; author: string; authorThumbnails?: Array<{ url: string; width?: number; height?: number }>; subCount?: number }>>(OLD_SUBS_KEY, [])
  if (old.length === 0) return
  const migrated: Subscription[] = old.map(s => ({ ...s, subscribedAt: Date.now() }))
  writeJson(SUBS_KEY, migrated)
}

migrateSubs()

// ---- 登録チャンネル ----
export function getSubscriptions(): Subscription[] {
  return readJson<Subscription[]>(SUBS_KEY, [])
}

export function isSubscribed(authorId: string): boolean {
  return getSubscriptions().some(s => s.authorId === authorId)
}

export function toggleSubscription(ch: Omit<Subscription, 'subscribedAt'>): boolean {
  const subs = getSubscriptions()
  const idx = subs.findIndex(s => s.authorId === ch.authorId)
  if (idx >= 0) {
    subs.splice(idx, 1)
    writeJson(SUBS_KEY, subs)
    return false
  } else {
    subs.push({ ...ch, subscribedAt: Date.now() })
    writeJson(SUBS_KEY, subs)
    return true
  }
}

export function removeSubscription(authorId: string) {
  const subs = getSubscriptions().filter(s => s.authorId !== authorId)
  writeJson(SUBS_KEY, subs)
}

// ---- 視聴履歴 ----
export function getHistory(): HistoryItem[] {
  return readJson<HistoryItem[]>(HIST_KEY, [])
}

export function addHistory(item: Omit<HistoryItem, 'watchedAt'>) {
  const hist = getHistory().filter(h => h.videoId !== item.videoId)
  hist.unshift({ ...item, watchedAt: Date.now() })
  if (hist.length > HIST_MAX) hist.length = HIST_MAX
  writeJson(HIST_KEY, hist)
}

export function removeHistoryItem(videoId: string) {
  writeJson(HIST_KEY, getHistory().filter(h => h.videoId !== videoId))
}

export function clearHistory() {
  writeJson(HIST_KEY, [])
}

// ---- マイプレイリスト ----
export function getPlaylists(): LocalPlaylist[] {
  return readJson<LocalPlaylist[]>(PL_KEY, [])
}

export function createPlaylistWithVideos(title: string, videos: Omit<LocalVideo, 'addedAt'>[]): LocalPlaylist {
  const now = Date.now()
  const pl: LocalPlaylist = {
    id: `pl_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    createdAt: now,
    videos: videos.map(v => ({ ...v, addedAt: now })),
  }
  const pls = getPlaylists()
  pls.push(pl)
  writeJson(PL_KEY, pls)
  return pl
}

export function createPlaylist(title: string): LocalPlaylist {
  const pl: LocalPlaylist = {
    id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    createdAt: Date.now(),
    videos: [],
  }
  const pls = getPlaylists()
  pls.push(pl)
  writeJson(PL_KEY, pls)
  return pl
}

export function renamePlaylist(id: string, title: string) {
  const pls = getPlaylists().map(p => p.id === id ? { ...p, title } : p)
  writeJson(PL_KEY, pls)
}

export function deletePlaylist(id: string) {
  writeJson(PL_KEY, getPlaylists().filter(p => p.id !== id))
}

export function addVideoToPlaylist(playlistId: string, video: Omit<LocalVideo, 'addedAt'>) {
  const pls = getPlaylists().map(p => {
    if (p.id !== playlistId) return p
    if (p.videos.some(v => v.videoId === video.videoId)) return p
    return { ...p, videos: [...p.videos, { ...video, addedAt: Date.now() }] }
  })
  writeJson(PL_KEY, pls)
}

export function removeVideoFromPlaylist(playlistId: string, videoId: string) {
  const pls = getPlaylists().map(p =>
    p.id !== playlistId ? p : { ...p, videos: p.videos.filter(v => v.videoId !== videoId) }
  )
  writeJson(PL_KEY, pls)
}

export function isVideoInPlaylist(playlistId: string, videoId: string): boolean {
  return getPlaylists().find(p => p.id === playlistId)?.videos.some(v => v.videoId === videoId) ?? false
}

// ---- お気に入り ----
export function getFavorites(): FavoriteItem[] {
  return readJson<FavoriteItem[]>(FAV_KEY, [])
}

export function isFavorite(videoId: string): boolean {
  return getFavorites().some(f => f.videoId === videoId)
}

export function toggleFavorite(item: Omit<FavoriteItem, 'favoritedAt'>): boolean {
  const favs = getFavorites()
  const idx = favs.findIndex(f => f.videoId === item.videoId)
  if (idx >= 0) {
    favs.splice(idx, 1)
    writeJson(FAV_KEY, favs)
    return false
  } else {
    favs.unshift({ ...item, favoritedAt: Date.now() })
    writeJson(FAV_KEY, favs)
    return true
  }
}

export function removeFavorite(videoId: string) {
  writeJson(FAV_KEY, getFavorites().filter(f => f.videoId !== videoId))
}

export function clearFavorites() {
  writeJson(FAV_KEY, [])
}

// ---- お気に入りプレイリスト ----
export function getFavoritePlaylists(): FavoritePlaylist[] {
  return readJson<FavoritePlaylist[]>(FAV_PL_KEY, [])
}

export function isFavoritePlaylist(playlistId: string): boolean {
  return getFavoritePlaylists().some(f => f.playlistId === playlistId)
}

export function toggleFavoritePlaylist(item: Omit<FavoritePlaylist, 'favoritedAt'>): boolean {
  const favs = getFavoritePlaylists()
  const idx = favs.findIndex(f => f.playlistId === item.playlistId)
  if (idx >= 0) {
    favs.splice(idx, 1)
    writeJson(FAV_PL_KEY, favs)
    return false
  } else {
    favs.unshift({ ...item, favoritedAt: Date.now() })
    writeJson(FAV_PL_KEY, favs)
    return true
  }
}

export function removeFavoritePlaylist(playlistId: string) {
  writeJson(FAV_PL_KEY, getFavoritePlaylists().filter(f => f.playlistId !== playlistId))
}

export function clearFavoritePlaylists() {
  writeJson(FAV_PL_KEY, [])
}

// ---- お気に入りミックス ----
export function getFavoriteMixes(): FavoriteMix[] {
  return readJson<FavoriteMix[]>(FAV_MIX_KEY, [])
}

export function isFavoriteMix(mixId: string): boolean {
  return getFavoriteMixes().some(f => f.mixId === mixId)
}

export function toggleFavoriteMix(item: Omit<FavoriteMix, 'favoritedAt'>): boolean {
  const favs = getFavoriteMixes()
  const idx = favs.findIndex(f => f.mixId === item.mixId)
  if (idx >= 0) {
    favs.splice(idx, 1)
    writeJson(FAV_MIX_KEY, favs)
    return false
  } else {
    favs.unshift({ ...item, favoritedAt: Date.now() })
    writeJson(FAV_MIX_KEY, favs)
    return true
  }
}

export function removeFavoriteMix(mixId: string) {
  writeJson(FAV_MIX_KEY, getFavoriteMixes().filter(f => f.mixId !== mixId))
}

export function clearFavoriteMixes() {
  writeJson(FAV_MIX_KEY, [])
}

// ---- 書き出し / 読み込み ----
export function exportLibrary(): LibraryExport {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    subscriptions: getSubscriptions(),
    history: getHistory(),
    playlists: getPlaylists(),
    favorites: getFavorites(),
    favoritePlaylists: getFavoritePlaylists(),
    favoriteMixes: getFavoriteMixes(),
  }
}

export function downloadLibraryJson() {
  const data = exportLibrary()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `choco-tube-library-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export interface ImportResult {
  subscriptions: number
  history: number
  playlists: number
  favorites: number
}

export function importLibraryData(raw: unknown): ImportResult {
  if (typeof raw !== 'object' || raw === null) throw new Error('無効なフォーマットです')
  const data = raw as Record<string, unknown>
  let subCount = 0, histCount = 0, plCount = 0, favCount = 0

  // 登録チャンネル
  if (Array.isArray(data.subscriptions)) {
    const existing = getSubscriptions()
    const ids = new Set(existing.map(s => s.authorId))
    let added = 0
    for (const s of data.subscriptions) {
      if (s && typeof s.authorId === 'string' && !ids.has(s.authorId)) {
        existing.push({
          authorId: s.authorId,
          author: s.author || s.authorId,
          authorThumbnails: s.authorThumbnails,
          subCount: s.subCount,
          subscribedAt: s.subscribedAt || Date.now(),
        })
        ids.add(s.authorId)
        added++
      }
    }
    writeJson(SUBS_KEY, existing)
    subCount = added
  }

  // 視聴履歴
  if (Array.isArray(data.history)) {
    const existing = getHistory()
    const ids = new Set(existing.map(h => h.videoId))
    let added = 0
    for (const h of data.history) {
      if (h && typeof h.videoId === 'string' && !ids.has(h.videoId)) {
        existing.push({
          videoId: h.videoId,
          title: h.title || h.videoId,
          author: h.author || '',
          authorId: h.authorId || '',
          channelIcon: h.channelIcon,
          lengthSeconds: h.lengthSeconds,
          watchedAt: h.watchedAt || Date.now(),
        })
        ids.add(h.videoId)
        added++
      }
    }
    if (existing.length > HIST_MAX) existing.length = HIST_MAX
    writeJson(HIST_KEY, existing)
    histCount = added
  }

  // マイプレイリスト
  if (Array.isArray(data.playlists)) {
    const existing = getPlaylists()
    const ids = new Set(existing.map(p => p.id))
    let added = 0
    for (const p of data.playlists) {
      if (p && typeof p.id === 'string' && !ids.has(p.id)) {
        existing.push({
          id: p.id,
          title: p.title || p.id,
          createdAt: p.createdAt || Date.now(),
          videos: Array.isArray(p.videos) ? p.videos : [],
        })
        ids.add(p.id)
        added++
      }
    }
    writeJson(PL_KEY, existing)
    plCount = added
  }

  // お気に入り
  if (Array.isArray(data.favorites)) {
    const existing = getFavorites()
    const ids = new Set(existing.map(f => f.videoId))
    let added = 0
    for (const f of data.favorites) {
      if (f && typeof f.videoId === 'string' && !ids.has(f.videoId)) {
        existing.push({
          videoId: f.videoId,
          title: f.title || f.videoId,
          author: f.author || '',
          authorId: f.authorId || '',
          channelIcon: f.channelIcon,
          lengthSeconds: f.lengthSeconds,
          favoritedAt: f.favoritedAt || Date.now(),
        })
        ids.add(f.videoId)
        added++
      }
    }
    writeJson(FAV_KEY, existing)
    favCount = added
  }

  // お気に入りプレイリスト
  if (Array.isArray(data.favoritePlaylists)) {
    const existing = getFavoritePlaylists()
    const ids = new Set(existing.map(f => f.playlistId))
    for (const f of data.favoritePlaylists) {
      if (f && typeof f.playlistId === 'string' && !ids.has(f.playlistId)) {
        existing.push({
          playlistId: f.playlistId,
          title: f.title || f.playlistId,
          author: f.author,
          authorId: f.authorId,
          thumbnail: f.thumbnail,
          videoCount: f.videoCount,
          favoritedAt: f.favoritedAt || Date.now(),
        })
        ids.add(f.playlistId)
      }
    }
    writeJson(FAV_PL_KEY, existing)
  }

  // お気に入りミックス
  if (Array.isArray(data.favoriteMixes)) {
    const existing = getFavoriteMixes()
    const ids = new Set(existing.map(f => f.mixId))
    for (const f of data.favoriteMixes) {
      if (f && typeof f.mixId === 'string' && !ids.has(f.mixId)) {
        existing.push({
          mixId: f.mixId,
          title: f.title || f.mixId,
          thumbnail: f.thumbnail,
          favoritedAt: f.favoritedAt || Date.now(),
        })
        ids.add(f.mixId)
      }
    }
    writeJson(FAV_MIX_KEY, existing)
  }

  return { subscriptions: subCount, history: histCount, playlists: plCount, favorites: favCount }
}

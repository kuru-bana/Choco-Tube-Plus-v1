import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  getSubscriptions, removeSubscription,
  getHistory, removeHistoryItem, clearHistory,
  getPlaylists, createPlaylist, renamePlaylist, deletePlaylist,
  removeVideoFromPlaylist,
  getFavorites, removeFavorite, clearFavorites,
  getFavoritePlaylists, removeFavoritePlaylist, clearFavoritePlaylists,
  getFavoriteMixes, removeFavoriteMix, clearFavoriteMixes,
  downloadLibraryJson, importLibraryData,
  type Subscription, type HistoryItem, type LocalPlaylist, type FavoriteItem, type LocalVideo,
  type FavoritePlaylist, type FavoriteMix,
} from '../lib/library'
import SmartImage from '../components/SmartImage'
import { buildVideoThumbnailUrl } from '../lib/imagePreferences'
import './Library.css'

type LibTab = 'subscriptions' | 'history' | 'playlists' | 'favorites'
type FavSubTab = 'videos' | 'playlists' | 'mixes'

function formatDuration(sec?: number): string {
  if (!sec) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function formatWatchedAt(ts: number): string {
  const now = Date.now()
  const diffMs = now - ts
  const diffMin = Math.floor(diffMs / 60000)
  const diffDay = Math.floor(diffMs / 86400000)

  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const timeStr = `${hh}:${mm}`

  const today = new Date()
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()

  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()

  if (diffMin < 1) return 'たった今'
  if (diffMin < 60) return `${diffMin}分前`
  if (isToday) return `今日 ${timeStr}`
  if (isYesterday) return `昨日 ${timeStr}`
  if (diffDay < 7) return `${diffDay}日前`
  return formatDate(ts)
}

function getThumbnail(videoId: string): string {
  return buildVideoThumbnailUrl(videoId, 'mqdefault.jpg')
}

function getAvatar(thumbs?: Array<{ url: string; width?: number; height?: number }>): string {
  if (!thumbs || !thumbs.length) return ''
  const sorted = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0))
  return sorted.find(t => (t.width || 0) >= 88)?.url || sorted[0]?.url || ''
}

interface VideoCardProps {
  videoId: string
  title: string
  author?: string
  authorId?: string
  channelIcon?: string
  lengthSeconds?: number
  dateLine?: string
  onRemove?: () => void
}

function LibVideoCard({ videoId, title, author, authorId, channelIcon, lengthSeconds, dateLine, onRemove }: VideoCardProps) {
  const duration = formatDuration(lengthSeconds)
  return (
    <div className="lib-video-card-wrap">
      <Link to={`/watch/${videoId}`} className="lib-video-card">
        <div className="lib-vc-thumb-wrap">
          <SmartImage
            className="lib-vc-thumb"
            src={getThumbnail(videoId)}
            fallbackSrc={buildVideoThumbnailUrl(videoId)}
            proxyWidth={480}
            alt={title}
            loading="lazy"
            onLoad={e => e.currentTarget.classList.add('loaded')}
          />
          {duration && <span className="lib-vc-dur">{duration}</span>}
        </div>
        <div className="lib-vc-info">
          <div className="lib-vc-title">{title}</div>
          <div className="lib-vc-meta">
            {author && (
              <div className="lib-vc-author-row">
                {channelIcon && (
                  <SmartImage
                    className="lib-vc-ch-icon"
                    src={channelIcon}
                    proxyWidth={88}
                    alt={author}
                    loading="lazy"
                    onLoad={e => e.currentTarget.classList.add('loaded')}
                  />
                )}
                {authorId
                  ? <Link to={`/channel/${authorId}`} className="lib-vc-author" onClick={e => e.stopPropagation()}>{author}</Link>
                  : <span className="lib-vc-author">{author}</span>
                }
              </div>
            )}
            {dateLine && <span className="lib-vc-date">{dateLine}</span>}
          </div>
        </div>
      </Link>
      {onRemove && (
        <button className="lib-vc-del-btn" onClick={onRemove} title="削除">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}
    </div>
  )
}

export default function Library() {
  const [tab, setTab] = useState<LibTab>('subscriptions')
  const [tick, setTick] = useState(0)
  const refresh = () => setTick(t => t + 1)

  const [importResult, setImportResult] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedPlId, setSelectedPlId] = useState<string | null>(null)
  const [showNewPlModal, setShowNewPlModal] = useState(false)
  const [newPlName, setNewPlName] = useState('')
  const [renamingPl, setRenamingPl] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [favSubTab, setFavSubTab] = useState<FavSubTab>('videos')

  const subscriptions: Subscription[] = getSubscriptions()
  const history: HistoryItem[] = getHistory()
  const playlists: LocalPlaylist[] = getPlaylists()
  const favorites: FavoriteItem[] = getFavorites()
  const favoritePlaylists: FavoritePlaylist[] = getFavoritePlaylists()
  const favoriteMixes: FavoriteMix[] = getFavoriteMixes()
  const totalFavCount = favorites.length + favoritePlaylists.length + favoriteMixes.length

  const selectedPl = selectedPlId ? playlists.find(p => p.id === selectedPlId) || null : null

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportResult(null)
    setImportError(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string)
        const result = importLibraryData(raw)
        setImportResult(
          `読み込み完了: 登録${result.subscriptions}件・履歴${result.history}件・プレイリスト${result.playlists}件・お気に入り${result.favorites}件 を追加しました`
        )
        refresh()
      } catch (err) {
        setImportError('読み込み失敗: ' + (err instanceof Error ? err.message : String(err)))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleCreatePl = () => {
    if (!newPlName.trim()) return
    createPlaylist(newPlName.trim())
    setNewPlName('')
    setShowNewPlModal(false)
    refresh()
  }

  return (
    <div className="lib-page">
      {/* Header */}
      <div className="lib-header">
        <h1 className="lib-title">ライブラリ</h1>
        <div className="lib-actions">
          <button className="lib-action-btn" onClick={downloadLibraryJson} title="ライブラリをJSONで書き出す">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            書き出し
          </button>
          <button className="lib-action-btn" onClick={() => fileInputRef.current?.click()} title="JSONファイルを読み込む">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            読み込み
          </button>
          <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />
        </div>
      </div>

      {importResult && (
        <div className="lib-toast lib-toast-ok">
          <span>✅ {importResult}</span>
          <button onClick={() => setImportResult(null)}>✕</button>
        </div>
      )}
      {importError && (
        <div className="lib-toast lib-toast-err">
          <span>❌ {importError}</span>
          <button onClick={() => setImportError(null)}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="lib-tabs">
        {([
          ['subscriptions', '登録チャンネル', subscriptions.length,
            <svg key="s" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>],
          ['history', '視聴履歴', history.length,
            <svg key="h" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><polyline points="12 8 12 12 14 14"/><circle cx="12" cy="12" r="9"/></svg>],
          ['playlists', 'マイプレイリスト', playlists.length,
            <svg key="p" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>],
          ['favorites', 'お気に入り', totalFavCount,
            <svg key="f" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>],
        ] as [LibTab, string, number, React.ReactNode][]).map(([id, label, count, icon]) => (
          <button
            key={id}
            className={`lib-tab${tab === id ? ' active' : ''}`}
            onClick={() => { setTab(id); setSelectedPlId(null) }}
          >
            {icon}
            <span className="lib-tab-label">{label}</span>
            {count > 0 && <span className="lib-tab-count">{count}</span>}
          </button>
        ))}
      </div>

      <div className="lib-content">

        {/* 登録チャンネル */}
        {tab === 'subscriptions' && (
          subscriptions.length === 0 ? (
            <div className="lib-empty">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <p>登録しているチャンネルはありません</p>
              <p className="lib-empty-hint">チャンネルページや動画ページの「登録」ボタンで追加できます</p>
            </div>
          ) : (
            <div className="lib-channel-grid">
              {subscriptions.map(sub => {
                const avatar = getAvatar(sub.authorThumbnails)
                return (
                  <div key={sub.authorId} className="lib-channel-card">
                    <Link to={`/channel/${sub.authorId}`} className="lib-channel-link">
                      {avatar ? (
                        <SmartImage
                          src={avatar}
                          alt={sub.author}
                          className="lib-channel-avatar"
                          proxyWidth={160}
                          onLoad={e => e.currentTarget.classList.add('loaded')}
                        />
                      ) : (
                        <div className="lib-channel-avatar-ph">{sub.author?.[0] || '?'}</div>
                      )}
                      <div className="lib-channel-info">
                        <div className="lib-channel-name">{sub.author}</div>
                        <div className="lib-channel-date">{formatDate(sub.subscribedAt)} に登録</div>
                      </div>
                    </Link>
                    <button
                      className="lib-unsub-btn"
                      onClick={() => { removeSubscription(sub.authorId); refresh() }}
                    >
                      登録解除
                    </button>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* 視聴履歴 */}
        {tab === 'history' && (
          <div>
            {history.length > 0 && (
              <div className="lib-hist-toolbar">
                <button className="lib-clear-btn" onClick={() => { if (confirm('視聴履歴をすべて削除しますか？')) { clearHistory(); refresh() } }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  履歴をすべて削除
                </button>
              </div>
            )}
            {history.length === 0 ? (
              <div className="lib-empty">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48"><polyline points="12 8 12 12 14 14"/><circle cx="12" cy="12" r="9"/></svg>
                <p>視聴履歴はありません</p>
                <p className="lib-empty-hint">動画を視聴すると自動的に記録されます</p>
              </div>
            ) : (
              <div className="lib-video-grid">
                {history.map(item => (
                  <LibVideoCard
                    key={item.videoId}
                    videoId={item.videoId}
                    title={item.title}
                    author={item.author}
                    authorId={item.authorId}
                    channelIcon={item.channelIcon}
                    lengthSeconds={item.lengthSeconds}
                    dateLine={formatWatchedAt(item.watchedAt) + ' に視聴'}
                    onRemove={() => { removeHistoryItem(item.videoId); refresh() }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* マイプレイリスト */}
        {tab === 'playlists' && (
          selectedPl ? (
            /* 詳細ビュー */
            <div>
              <div className="lib-pl-detail-header">
                <button className="lib-back-btn" onClick={() => setSelectedPlId(null)}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
                  一覧に戻る
                </button>
                <div className="lib-pl-detail-meta">
                  {renamingPl === selectedPl.id ? (
                    <form
                      className="lib-pl-rename-form"
                      onSubmit={e => {
                        e.preventDefault()
                        if (renameVal.trim()) { renamePlaylist(selectedPl.id, renameVal.trim()); refresh() }
                        setRenamingPl(null)
                      }}
                    >
                      <input
                        className="lib-pl-rename-input"
                        autoFocus
                        value={renameVal}
                        onChange={e => setRenameVal(e.target.value)}
                      />
                      <button type="submit" className="lib-action-btn">保存</button>
                      <button type="button" className="lib-cancel-btn" onClick={() => setRenamingPl(null)}>キャンセル</button>
                    </form>
                  ) : (
                    <>
                      <div className="lib-pl-detail-name">{selectedPl.title}</div>
                      <div className="lib-pl-detail-count">{selectedPl.videos.length}本の動画</div>
                    </>
                  )}
                </div>
                {renamingPl !== selectedPl.id && (
                  <div className="lib-pl-detail-actions">
                    {selectedPl.videos.length > 0 && (
                      <Link
                        className="lib-play-all-btn"
                        to={`/watch/${selectedPl.videos[0].videoId}?localpl=${selectedPl.id}&index=0`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M8 5v14l11-7z"/></svg>
                        すべて再生
                      </Link>
                    )}
                    <button className="lib-action-btn" onClick={() => { setRenamingPl(selectedPl.id); setRenameVal(selectedPl.title) }}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      名前を変更
                    </button>
                    <button className="lib-clear-btn" onClick={() => { if (confirm(`「${selectedPl.title}」を削除しますか？`)) { deletePlaylist(selectedPl.id); setSelectedPlId(null); refresh() } }}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                      削除
                    </button>
                  </div>
                )}
              </div>
              {selectedPl.videos.length === 0 ? (
                <div className="lib-empty">
                  <p>動画が追加されていません</p>
                </div>
              ) : (
                <div className="lib-pl-detail-list">
                  {selectedPl.videos.map((v: LocalVideo, idx: number) => (
                    <div key={v.videoId} className="lib-pl-item">
                      <span className="lib-pl-item-num">{idx + 1}</span>
                      <Link to={`/watch/${v.videoId}?localpl=${selectedPl.id}&index=${idx}`} className="lib-pl-item-link">
                        <div className="lib-pl-item-thumb-wrap">
                          <SmartImage
                            className="lib-pl-item-thumb"
                            src={getThumbnail(v.videoId)}
                            fallbackSrc={buildVideoThumbnailUrl(v.videoId)}
                            proxyWidth={320}
                            alt={v.title}
                            loading="lazy"
                            onLoad={e => e.currentTarget.classList.add('loaded')}
                          />
                          {v.lengthSeconds ? <span className="lib-pl-item-dur">{formatDuration(v.lengthSeconds)}</span> : null}
                        </div>
                        <div className="lib-pl-item-info">
                          <div className="lib-pl-item-title">{v.title}</div>
                          {v.author && <div className="lib-pl-item-ch">{v.author}</div>}
                        </div>
                      </Link>
                      <button
                        className="lib-pl-item-remove"
                        title="プレイリストから削除"
                        onClick={() => { removeVideoFromPlaylist(selectedPl.id, v.videoId); refresh() }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* 一覧ビュー */
            <div>
              <div className="lib-pl-toolbar">
                <button className="lib-action-btn" onClick={() => setShowNewPlModal(true)}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  新しいプレイリスト
                </button>
              </div>
              {playlists.length === 0 ? (
                <div className="lib-empty">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                  <p>プレイリストはありません</p>
                  <p className="lib-empty-hint">「新しいプレイリスト」ボタンから作成できます</p>
                </div>
              ) : (
                <div className="lib-pl-grid">
                  {playlists.map(pl => {
                    const firstThumb = pl.videos[0]?.videoId ? getThumbnail(pl.videos[0].videoId) : ''
                    return (
                      <div key={pl.id} className="lib-pl-card" onClick={() => setSelectedPlId(pl.id)}>
                        <div className="lib-pl-card-thumb">
                          {firstThumb ? (
                            <SmartImage
                              src={firstThumb}
                              alt={pl.title}
                              proxyWidth={320}
                              onLoad={e => e.currentTarget.classList.add('loaded')}
                            />
                          ) : (
                            <div className="lib-pl-card-thumb-empty">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                            </div>
                          )}
                          <div className="lib-pl-card-count">{pl.videos.length}本</div>
                        </div>
                        <div className="lib-pl-card-info">
                          <div className="lib-pl-card-name">{pl.title}</div>
                          <div className="lib-pl-card-date">{formatDate(pl.createdAt)} に作成</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        )}

        {/* お気に入り */}
        {tab === 'favorites' && (
          <div>
            <div className="lib-fav-subtabs">
              <button className={`lib-fav-subtab${favSubTab === 'videos' ? ' active' : ''}`} onClick={() => setFavSubTab('videos')}>
                動画{favorites.length > 0 && <span className="lib-fav-subtab-count">{favorites.length}</span>}
              </button>
              <button className={`lib-fav-subtab${favSubTab === 'playlists' ? ' active' : ''}`} onClick={() => setFavSubTab('playlists')}>
                プレイリスト{favoritePlaylists.length > 0 && <span className="lib-fav-subtab-count">{favoritePlaylists.length}</span>}
              </button>
              <button className={`lib-fav-subtab${favSubTab === 'mixes' ? ' active' : ''}`} onClick={() => setFavSubTab('mixes')}>
                ミックス{favoriteMixes.length > 0 && <span className="lib-fav-subtab-count">{favoriteMixes.length}</span>}
              </button>
            </div>

            {favSubTab === 'videos' && (
              <div>
                {favorites.length > 0 && (
                  <div className="lib-hist-toolbar">
                    <button className="lib-clear-btn" onClick={() => { if (confirm('お気に入り動画をすべて削除しますか？')) { clearFavorites(); refresh() } }}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      すべて削除
                    </button>
                  </div>
                )}
                {favorites.length === 0 ? (
                  <div className="lib-empty">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    <p>お気に入り動画はありません</p>
                    <p className="lib-empty-hint">動画ページのハートボタンでお気に入りに追加できます</p>
                  </div>
                ) : (
                  <div className="lib-video-grid">
                    {favorites.map(item => (
                      <LibVideoCard
                        key={item.videoId}
                        videoId={item.videoId}
                        title={item.title}
                        author={item.author}
                        authorId={item.authorId}
                        channelIcon={item.channelIcon}
                        lengthSeconds={item.lengthSeconds}
                        dateLine={formatDate(item.favoritedAt) + ' に追加'}
                        onRemove={() => { removeFavorite(item.videoId); refresh() }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {favSubTab === 'playlists' && (
              <div>
                {favoritePlaylists.length > 0 && (
                  <div className="lib-hist-toolbar">
                    <button className="lib-clear-btn" onClick={() => { if (confirm('お気に入りプレイリストをすべて削除しますか？')) { clearFavoritePlaylists(); refresh() } }}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      すべて削除
                    </button>
                  </div>
                )}
                {favoritePlaylists.length === 0 ? (
                  <div className="lib-empty">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                    <p>お気に入りプレイリストはありません</p>
                    <p className="lib-empty-hint">プレイリストページのハートボタンで追加できます</p>
                  </div>
                ) : (
                  <div className="lib-pl-grid">
                    {favoritePlaylists.map(item => (
                      <div key={item.playlistId} className="lib-fav-pl-card">
                        <Link to={`/playlist?list=${encodeURIComponent(item.playlistId)}`} className="lib-fav-pl-card-link">
                          <div className="lib-fav-pl-thumb">
                            {item.thumbnail ? (
                              <SmartImage src={item.thumbnail} alt={item.title} proxyWidth={320} onLoad={e => e.currentTarget.classList.add('loaded')} />
                            ) : (
                              <div className="lib-pl-card-thumb-empty">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                              </div>
                            )}
                            {item.videoCount != null && <div className="lib-pl-card-count">{item.videoCount}本</div>}
                          </div>
                          <div className="lib-pl-card-info">
                            <div className="lib-pl-card-name">{item.title}</div>
                            {item.author && <div className="lib-fav-pl-author">{item.author}</div>}
                            <div className="lib-pl-card-date">{formatDate(item.favoritedAt)} に追加</div>
                          </div>
                        </Link>
                        <button
                          className="lib-vc-del-btn"
                          onClick={() => { removeFavoritePlaylist(item.playlistId); refresh() }}
                          title="お気に入りから削除"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {favSubTab === 'mixes' && (
              <div>
                {favoriteMixes.length > 0 && (
                  <div className="lib-hist-toolbar">
                    <button className="lib-clear-btn" onClick={() => { if (confirm('お気に入りミックスをすべて削除しますか？')) { clearFavoriteMixes(); refresh() } }}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      すべて削除
                    </button>
                  </div>
                )}
                {favoriteMixes.length === 0 ? (
                  <div className="lib-empty">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48"><path d="M18 15l-6-6-6 6"/><path d="M18 9l-6 6-6-6"/></svg>
                    <p>お気に入りミックスはありません</p>
                    <p className="lib-empty-hint">ミックスページのハートボタンで追加できます</p>
                  </div>
                ) : (
                  <div className="lib-pl-grid">
                    {favoriteMixes.map(item => (
                      <div key={item.mixId} className="lib-fav-pl-card">
                        <Link to={`/mix?id=${encodeURIComponent(item.mixId)}`} className="lib-fav-pl-card-link">
                          <div className="lib-fav-pl-thumb">
                            {item.thumbnail ? (
                              <SmartImage src={item.thumbnail} alt={item.title} proxyWidth={320} onLoad={e => e.currentTarget.classList.add('loaded')} />
                            ) : (
                              <div className="lib-pl-card-thumb-empty">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28"><path d="M18 15l-6-6-6 6"/><path d="M18 9l-6 6-6-6"/></svg>
                              </div>
                            )}
                            <div className="lib-mix-badge">ミックス</div>
                          </div>
                          <div className="lib-pl-card-info">
                            <div className="lib-pl-card-name">{item.title}</div>
                            <div className="lib-pl-card-date">{formatDate(item.favoritedAt)} に追加</div>
                          </div>
                        </Link>
                        <button
                          className="lib-vc-del-btn"
                          onClick={() => { removeFavoriteMix(item.mixId); refresh() }}
                          title="お気に入りから削除"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 新規プレイリスト作成モーダル */}
      {showNewPlModal && (
        <div className="lib-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowNewPlModal(false) }}>
          <div className="lib-modal">
            <h2 className="lib-modal-title">新しいプレイリスト</h2>
            <input
              type="text"
              className="lib-modal-input"
              placeholder="プレイリスト名"
              maxLength={100}
              value={newPlName}
              onChange={e => setNewPlName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreatePl() }}
              autoFocus
            />
            <div className="lib-modal-actions">
              <button className="lib-modal-cancel" onClick={() => { setShowNewPlModal(false); setNewPlName('') }}>キャンセル</button>
              <button className="lib-modal-ok" disabled={!newPlName.trim()} onClick={handleCreatePl}>作成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

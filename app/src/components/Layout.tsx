import { useState, useCallback, useEffect, useRef } from 'react'
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { getSearchSuggestions } from '../api/search'
import { getSearchHistory, addSearchHistory, removeSearchHistory, clearSearchHistory } from '../lib/searchHistory'
import { getSearchSettings } from '../lib/searchSettings'
import './Layout.css'

const decodeHtml = (value: string) => {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value
}

type SuggestMode = 'history' | 'suggestions'

export default function Layout() {
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestMode, setSuggestMode] = useState<SuggestMode>('history')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const suggestTimer = useRef<number | null>(null)
  const suggestAbort = useRef<AbortController | null>(null)
  const suggestRequestId = useRef(0)
  const isFocused = useRef(false)
  const composing = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    setSearchQuery(params.get('q') || '')
  }, [location.search])

  const showHistory = useCallback(() => {
    if (!getSearchSettings().searchSuggestionsEnabled) return
    const history = getSearchHistory()
    if (history.length > 0) {
      setSuggestions(history.slice(0, 8))
      setSuggestMode('history')
      setSuggestOpen(true)
    } else {
      setSuggestOpen(false)
    }
  }, [])

  const fetchSuggestions = useCallback((q: string, delay = 150) => {
    if (suggestTimer.current) window.clearTimeout(suggestTimer.current)
    if (!getSearchSettings().searchSuggestionsEnabled) {
      setSuggestOpen(false)
      return
    }
    if (!q.trim()) {
      suggestAbort.current?.abort()
      if (isFocused.current) {
        showHistory()
      }
      return
    }
    suggestTimer.current = window.setTimeout(async () => {
      if (!isFocused.current) return
      const requestId = ++suggestRequestId.current
      suggestAbort.current?.abort()
      const ctrl = new AbortController()
      suggestAbort.current = ctrl
      try {
        const items = await getSearchSuggestions(q.trim(), ctrl.signal)
        if (suggestRequestId.current !== requestId) return
        if (!isFocused.current) return
        const decodedItems = items.map(decodeHtml).slice(0, 8)
        setSuggestions(decodedItems)
        setSuggestMode('suggestions')
        setSuggestOpen(decodedItems.length > 0)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (suggestRequestId.current === requestId) setSuggestOpen(false)
      }
    }, Math.min(delay, 80))
  }, [showHistory])

  useEffect(() => {
    if (composing.current) return
    setActiveSuggestion(-1)
    fetchSuggestions(searchQuery, 150)
    return () => {
      if (suggestTimer.current) window.clearTimeout(suggestTimer.current)
    }
  }, [searchQuery, fetchSuggestions])

  const extractYouTubeVideoId = (value: string) => {
    const patterns = [
      /(?:youtube\.com\/watch[?&]v=|youtu\.be\/)([A-Za-z0-9_-]{11})/,
      /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    ]
    for (const pattern of patterns) {
      const match = value.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  const extractYouTubeChannelId = (value: string) => {
    const match = value.match(/youtube\.com\/channel\/([A-Za-z0-9_-]+)/)
    return match ? match[1] : null
  }

  const extractYouTubePlaylistId = (value: string) => {
    const match = value.match(/[?&]list=([A-Za-z0-9_-]+)/)
    return match ? match[1] : null
  }

  const closeSuggestions = useCallback(() => {
    if (suggestTimer.current) window.clearTimeout(suggestTimer.current)
    suggestAbort.current?.abort()
    setSuggestOpen(false)
    setSuggestions([])
    setActiveSuggestion(-1)
  }, [])

  const submitSearch = useCallback((value: string) => {
    const q = value.trim()
    if (!q) return
    addSearchHistory(q)
    closeSuggestions()
    inputRef.current?.blur()
    const videoId = extractYouTubeVideoId(q)
    if (videoId) {
      navigate(`/watch/${videoId}`)
      return
    }
    const playlistId = extractYouTubePlaylistId(q)
    if (playlistId) {
      navigate(`/search?q=${encodeURIComponent(q)}&type=playlist`)
      return
    }
    const channelId = extractYouTubeChannelId(q)
    if (channelId) {
      navigate(`/channel/${channelId}`)
      return
    }
    navigate(`/search?q=${encodeURIComponent(q)}`)
  }, [navigate, closeSuggestions])

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    submitSearch(searchQuery)
  }, [searchQuery, submitSearch])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') {
      closeSuggestions()
      return
    }
    if (!suggestOpen || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = activeSuggestion < suggestions.length - 1 ? activeSuggestion + 1 : 0
      setActiveSuggestion(next)
      setSearchQuery(suggestions[next])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = activeSuggestion > 0 ? activeSuggestion - 1 : suggestions.length - 1
      setActiveSuggestion(next)
      setSearchQuery(suggestions[next])
    }
  }

  const handleRemoveHistory = (item: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    removeSearchHistory(item)
    const updated = getSearchHistory().slice(0, 8)
    if (updated.length > 0) {
      setSuggestions(updated)
    } else {
      setSuggestOpen(false)
      setSuggestions([])
    }
  }

  const handleClearHistory = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    clearSearchHistory()
    setSuggestOpen(false)
    setSuggestions([])
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="logo">
            <span className="logo-inv">Choco</span><span className="logo-tube">-Tube-Plus</span>
          </Link>
          <div className="search-wrapper">
            <form onSubmit={handleSearch} className="search-form">
              <input
                ref={inputRef}
                className="search-input"
                type="text"
                value={searchQuery}
                onChange={e => {
                  const val = e.target.value
                  setSearchQuery(val)
                  if (!composing.current) fetchSuggestions(val, 150)
                }}
                onCompositionStart={() => { composing.current = true }}
                onCompositionEnd={e => {
                  composing.current = false
                  const val = e.currentTarget.value
                  setSearchQuery(val)
                  fetchSuggestions(val, 150)
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  isFocused.current = true
                  if (!searchQuery.trim()) {
                    showHistory()
                  } else {
                    fetchSuggestions(searchQuery, 100)
                  }
                }}
                onBlur={() => {
                  isFocused.current = false
                  window.setTimeout(() => setSuggestOpen(false), 150)
                }}
                placeholder="動画を検索..."
                autoComplete="off"
                role="combobox"
                aria-expanded={suggestOpen}
                aria-controls="header-search-suggestions"
              />
              <button type="submit" className="search-btn" aria-label="検索">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </button>
            </form>
            <ul id="header-search-suggestions" className="suggestions-list" hidden={!suggestOpen} role="listbox">
              {suggestMode === 'history' && suggestions.length > 0 && (
                <li className="suggest-header">
                  <span>検索履歴</span>
                  <button
                    className="suggest-clear-btn"
                    onMouseDown={handleClearHistory}
                    tabIndex={-1}
                  >すべて削除</button>
                </li>
              )}
              {suggestions.map((suggestion, index) => (
                <li
                  key={`${suggestion}-${index}`}
                  className={`suggestion-item${index === activeSuggestion ? ' active' : ''}`}
                  role="option"
                  aria-selected={index === activeSuggestion}
                  onMouseDown={e => {
                    e.preventDefault()
                    setSearchQuery(suggestion)
                    submitSearch(suggestion)
                  }}
                >
                  {suggestMode === 'history' ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  )}
                  <span>{suggestion}</span>
                  {suggestMode === 'history' && (
                    <button
                      className="suggest-remove-btn"
                      onMouseDown={e => handleRemoveHistory(suggestion, e)}
                      tabIndex={-1}
                      aria-label="削除"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <nav className="header-nav">
            <Link to="/" className={location.pathname === '/' ? 'header-nav-link active' : 'header-nav-link'}>ホーム</Link>
            <Link to="/trend" className={location.pathname === '/trend' ? 'header-nav-link active' : 'header-nav-link'}>トレンド</Link>
            <Link to="/library" className={location.pathname === '/library' ? 'header-nav-link active' : 'header-nav-link'}>ライブラリ</Link>
            <Link to="/links" className={location.pathname === '/links' ? 'header-nav-link active' : 'header-nav-link'}>リンク</Link>
            <Link to="/chat" className="header-nav-link header-nav-chat">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{marginRight:'3px',verticalAlign:'middle'}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              チャット
            </Link>
            <Link to="/settings" className={location.pathname === '/settings' ? 'header-nav-link active' : 'header-nav-link'}>設定</Link>
          </nav>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

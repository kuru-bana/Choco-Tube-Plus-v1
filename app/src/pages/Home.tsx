import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getSearchSuggestions } from '../api/search'
import { getSearchHistory, addSearchHistory, removeSearchHistory, clearSearchHistory } from '../lib/searchHistory'
import { getSearchSettings } from '../lib/searchSettings'
import './Home.css'

const decodeHtml = (value: string) => {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value
}

export default function Home() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestMode, setSuggestMode] = useState<'history' | 'suggestions'>('history')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestTimer = useRef<number | null>(null)
  const suggestAbort = useRef<AbortController | null>(null)
  const suggestReqId = useRef(0)
  const isFocused = useRef(false)
  const composing = useRef(false)
  const navigate = useNavigate()

  useEffect(() => {
    const PING_KEY = 'choco_tube_pinged'
    if (localStorage.getItem(PING_KEY)) return
    const selfUrl = encodeURIComponent(window.location.origin)
    const pingUrls = [
      `https://link-up-r6fn.onrender.com/url=${selfUrl}`,
      `https://link-up-hsda.onrender.com/url=${selfUrl}`,
    ]
    ;(async () => {
      for (const url of pingUrls) {
        try {
          await fetch(url, { mode: 'no-cors' })
          break
        } catch {
          // try next
        }
      }
      localStorage.setItem(PING_KEY, '1')
    })()
  }, [])

  const extractVideoId = (v: string) => {
    const patterns = [
      /(?:youtube\.com\/watch[?&]v=|youtu\.be\/)([A-Za-z0-9_-]{11})/,
      /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    ]
    for (const p of patterns) { const m = v.match(p); if (m) return m[1] }
    return null
  }
  const extractChannelId = (v: string) => {
    const m = v.match(/youtube\.com\/channel\/([A-Za-z0-9_-]+)/)
    return m ? m[1] : null
  }
  const extractPlaylistId = (v: string) => {
    const m = v.match(/[?&]list=([A-Za-z0-9_-]+)/)
    return m ? m[1] : null
  }

  const closeSuggestions = useCallback(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    suggestAbort.current?.abort()
    setSuggestOpen(false)
    setSuggestions([])
    setActiveIdx(-1)
  }, [])

  const showHistory = useCallback(() => {
    if (!getSearchSettings().searchSuggestionsEnabled) return
    const hist = getSearchHistory()
    if (hist.length > 0) {
      setSuggestions(hist.slice(0, 8))
      setSuggestMode('history')
      setSuggestOpen(true)
    } else {
      setSuggestOpen(false)
    }
  }, [])

  const fetchSuggestions = useCallback((q: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    if (!getSearchSettings().searchSuggestionsEnabled) { setSuggestOpen(false); return }
    if (!q.trim()) { suggestAbort.current?.abort(); if (isFocused.current) showHistory(); return }
    suggestTimer.current = window.setTimeout(async () => {
      if (!isFocused.current) return
      const reqId = ++suggestReqId.current
      suggestAbort.current?.abort()
      const ctrl = new AbortController()
      suggestAbort.current = ctrl
      try {
        const items = await getSearchSuggestions(q.trim(), ctrl.signal)
        if (suggestReqId.current !== reqId || !isFocused.current) return
        const decoded = items.map(decodeHtml).slice(0, 8)
        setSuggestions(decoded)
        setSuggestMode('suggestions')
        setSuggestOpen(decoded.length > 0)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (suggestReqId.current === reqId) setSuggestOpen(false)
      }
    }, 150)
  }, [showHistory])

  useEffect(() => {
    if (!composing.current) {
      setActiveIdx(-1)
      fetchSuggestions(query)
    }
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current) }
  }, [query, fetchSuggestions])

  const submit = useCallback((q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    addSearchHistory(trimmed)
    closeSuggestions()
    inputRef.current?.blur()
    const vid = extractVideoId(trimmed)
    if (vid) { navigate(`/watch/${vid}`); return }
    const pid = extractPlaylistId(trimmed)
    if (pid) { navigate(`/search?q=${encodeURIComponent(trimmed)}&type=playlist`); return }
    const cid = extractChannelId(trimmed)
    if (cid) { navigate(`/channel/${cid}`); return }
    navigate(`/search?q=${encodeURIComponent(trimmed)}`)
  }, [navigate, closeSuggestions])

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); submit(query) }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') { closeSuggestions(); return }
    if (!suggestOpen || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = activeIdx < suggestions.length - 1 ? activeIdx + 1 : 0
      setActiveIdx(next); setQuery(suggestions[next])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = activeIdx > 0 ? activeIdx - 1 : suggestions.length - 1
      setActiveIdx(next); setQuery(suggestions[next])
    }
  }

  const handleRemoveHistory = (item: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    removeSearchHistory(item)
    const updated = getSearchHistory().slice(0, 8)
    if (updated.length > 0) { setSuggestions(updated) } else { setSuggestOpen(false); setSuggestions([]) }
  }

  const handleClearHistory = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    clearSearchHistory(); setSuggestOpen(false); setSuggestions([])
  }

  return (
    <div className="home-page">
      <div className="home-hero">
        <div className="home-logo">
          <span className="home-logo-choco">Choco</span>
          <span className="home-logo-tube">-Tube-Plus</span>
        </div>
        <p className="home-tagline">広告なしで YouTube コンテンツを楽しもう</p>

        <div className="home-search-wrap">
          <form onSubmit={handleSubmit} className="home-search-form" autoComplete="off">
            <div className="home-search-inner">
              <input
                ref={inputRef}
                type="text"
                className="home-search-input"
                placeholder="動画を検索、または YouTube URL を貼り付け..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => { isFocused.current = true; if (!query.trim()) showHistory() }}
                onBlur={() => {
                  isFocused.current = false
                  setTimeout(() => { if (!isFocused.current) closeSuggestions() }, 200)
                }}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => { composing.current = true }}
                onCompositionEnd={() => { composing.current = false; fetchSuggestions(query) }}
                aria-label="検索"
                aria-autocomplete="list"
                aria-controls="home-suggestions"
                aria-expanded={suggestOpen}
              />
              <button type="submit" className="home-search-btn" aria-label="検索">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </button>
            </div>

            {suggestOpen && suggestions.length > 0 && (
              <ul id="home-suggestions" className="home-suggestions" role="listbox">
                {suggestMode === 'history' && (
                  <li className="home-suggest-header">
                    <span>最近の検索</span>
                    <button type="button" className="home-suggest-clear" onClick={handleClearHistory}>すべて削除</button>
                  </li>
                )}
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    className={`home-suggest-item${i === activeIdx ? ' active' : ''}`}
                    role="option"
                    aria-selected={i === activeIdx}
                    onMouseDown={() => { setQuery(s); submit(s) }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" className="home-suggest-icon">
                      {suggestMode === 'history'
                        ? <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>
                        : <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>
                      }
                    </svg>
                    <span>{s}</span>
                    {suggestMode === 'history' && (
                      <button
                        type="button"
                        className="home-suggest-remove"
                        onMouseDown={e => handleRemoveHistory(s, e)}
                        aria-label="削除"
                      >✕</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </form>
        </div>

        <div className="home-links">
          <Link to="/trend" className="home-link-btn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
            </svg>
            トレンド
          </Link>
          <Link to="/library" className="home-link-btn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            ライブラリ
          </Link>
          <Link to="/chat" className="home-link-btn home-link-chat">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            チャット
          </Link>
          <Link to="/settings" className="home-link-btn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            設定
          </Link>
        </div>
      </div>
    </div>
  )
}

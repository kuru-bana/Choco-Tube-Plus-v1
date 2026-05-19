import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import VideoGrid from '../components/VideoGrid'
import type { SearchResultItem } from '../types'
import { searchReference } from '../api/search'
import { getCookie, setCookie } from '../api/utils'
import { REGIONS } from './Trend'
import {
  DATE_OPTIONS,
  DURATION_OPTIONS,
  FEATURE_OPTIONS,
  SORT_OPTIONS,
  TYPE_OPTIONS,
  getSearchSettings,
  saveSearchSettings,
  type SearchSettings,
} from '../lib/searchSettings'
import { getImageProxyMode } from '../lib/imagePreferences'
import './Search.css'

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const savedSettings = getSearchSettings()
  const [sortBy, setSortBy] = useState(searchParams.get('sort_by') || savedSettings.sort_by)
  const [date, setDate] = useState(searchParams.get('date') || savedSettings.date)
  const [duration, setDuration] = useState(searchParams.get('duration') || savedSettings.duration)
  const [type, setType] = useState(searchParams.get('type') || savedSettings.type)
  const [features, setFeatures] = useState<string[]>(searchParams.get('features')?.split(',').filter(Boolean) || savedSettings.features)
  const [region, setRegion] = useState(searchParams.get('region') || getCookie('trend_region') || savedSettings.region)
  const [proxyType] = useState(getImageProxyMode())
  const [page, setPage] = useState(Number(searchParams.get('page') || 1))
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [featureOpen, setFeatureOpen] = useState(false)
  const [lastCount, setLastCount] = useState(0)

  const updateUrl = useCallback((next: Partial<Record<string, string | number>>) => {
    const current = {
      q: query,
      page,
      sort_by: sortBy,
      date,
      duration,
      type,
      features: features.join(','),
      region,
      ...next,
    }
    const params = new URLSearchParams()
    if (current.q) params.set('q', String(current.q))
    if (Number(current.page) > 1) params.set('page', String(current.page))
    if (current.sort_by && current.sort_by !== 'relevance') params.set('sort_by', String(current.sort_by))
    if (current.date) params.set('date', String(current.date))
    if (current.duration) params.set('duration', String(current.duration))
    if (current.type && current.type !== 'all') params.set('type', String(current.type))
    if (current.features) params.set('features', String(current.features))
    if (current.region && current.region !== 'JP') params.set('region', String(current.region))
    setSearchParams(params)
  }, [query, page, sortBy, date, duration, type, features, region, setSearchParams])

  useEffect(() => {
    if (!query) return
    const cacheKey = `search:${query}:${page}:${sortBy}:${date}:${duration}:${type}:${features.join(',')}:${region}`
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        if (Date.now() - parsed.ts < 10 * 60 * 1000) {
          setResults(parsed.results)
          setLastCount(parsed.count)
          return
        }
      } catch {}
    }

    let cancelled = false
    setLoading(true)
    setError('')
    searchReference({
      q: query,
      page,
      sort_by: sortBy,
      date,
      duration: type === 'video' || type === 'all' ? duration : '',
      type,
      features: features.join(','),
      region,
      proxy: proxyType,
    }).then(data => {
      if (cancelled) return
      setResults(data.results)
      setLastCount(data.count)
      sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), results: data.results, count: data.count }))
    }).catch(() => {
      if (!cancelled) setError('検索に失敗しました。しばらく経ってから再試行してください。')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [query, page, sortBy, date, duration, type, features, region, proxyType])

  const persistSearchSettings = (next: SearchSettings) => {
    saveSearchSettings(next)
    setCookie('trend_region', next.region)
  }

  const setFilter = (setter: (value: string) => void, key: string, value: string) => {
    setter(value)
    setPage(1)
    persistSearchSettings({
      sort_by: key === 'sort_by' ? value : sortBy,
      date: key === 'date' ? value : date,
      duration: key === 'duration' ? value : duration,
      type: key === 'type' ? value : type,
      features,
      region: key === 'region' ? value : region,
      searchSuggestionsEnabled: savedSettings.searchSuggestionsEnabled,
    })
    updateUrl({ [key]: value, page: 1 })
  }

  const toggleFeature = (value: string) => {
    const next = features.includes(value) ? features.filter(f => f !== value) : [...features, value]
    setFeatures(next)
    setPage(1)
    persistSearchSettings({ sort_by: sortBy, date, duration, type, features: next, region, searchSuggestionsEnabled: savedSettings.searchSuggestionsEnabled })
    updateUrl({ features: next.join(','), page: 1 })
  }

  const changePage = (nextPage: number) => {
    setPage(nextPage)
    updateUrl({ page: nextPage })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!query) {
    return <div className="search-empty"><p>キーワードを入力して検索してください。</p></div>
  }

  return (
    <div className="search-page">
      <div className="filter-bar">
        <div className="filter-bar-inner">
          <label className="filter-group">
            <span className="filter-label">並び順</span>
            <select className="filter-select" value={sortBy} onChange={e => setFilter(setSortBy, 'sort_by', e.target.value)}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="filter-group">
            <span className="filter-label">投稿日</span>
            <select className="filter-select" value={date} onChange={e => setFilter(setDate, 'date', e.target.value)}>
              {DATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="filter-group">
            <span className="filter-label">動画長</span>
            <select className="filter-select" value={duration} onChange={e => setFilter(setDuration, 'duration', e.target.value)} disabled={type !== 'video' && type !== 'all'}>
              {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="filter-group">
            <span className="filter-label">種別</span>
            <select className="filter-select" value={type} onChange={e => setFilter(setType, 'type', e.target.value)}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <div className="filter-group">
            <span className="filter-label">機能</span>
            <div className="features-wrap">
              <button type="button" className={`features-toggle${featureOpen ? ' active' : ''}`} onClick={() => setFeatureOpen(v => !v)}>
                <span>{features.length ? features.map(f => f.toUpperCase()).join(', ') : 'すべて'}</span>
                <span aria-hidden="true">⌄</span>
              </button>
              <div className="features-dropdown" hidden={!featureOpen}>
                {FEATURE_OPTIONS.map(o => (
                  <label key={o.value} className="feature-item">
                    <input type="checkbox" checked={features.includes(o.value)} onChange={() => toggleFeature(o.value)} />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <label className="filter-group">
            <span className="filter-label">地域</span>
            <select className="filter-select region-select-sm" value={region} onChange={e => setFilter(setRegion, 'region', e.target.value)}>
              {[...REGIONS].sort((a, b) => a.label.localeCompare(b.label, 'ja')).map(r => (
                <option key={r.value} value={r.value}>{r.label} ({r.value})</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="result-header" hidden={loading || results.length === 0}>
        「{query}」の検索結果 — {results.length}件
      </div>

      {error && <div className="search-error">{error}</div>}

      <VideoGrid items={results} loading={loading} emptyMessage={`「${query}」の検索結果が見つかりませんでした。`} proxyType={proxyType} />

      {!loading && (page > 1 || lastCount >= 10) && (
        <div className="pagination">
          <button className="page-btn" disabled={page <= 1} onClick={() => changePage(page - 1)}>‹ 前のページ</button>
          <span className="page-info">{page} ページ</span>
          <button className="page-btn" disabled={lastCount < 10} onClick={() => changePage(page + 1)}>次のページ ›</button>
        </div>
      )}
    </div>
  )
}

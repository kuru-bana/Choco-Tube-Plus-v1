import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import VideoGrid from '../components/VideoGrid'
import type { SearchResultItem } from '../types'
import { searchReference } from '../api/search'
import './Hashtag.css'

export default function Hashtag() {
  const { tag } = useParams<{ tag: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get('page') || '1', 10)

  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const seqRef = useRef(0)

  useEffect(() => {
    if (!tag) return
    const seq = ++seqRef.current
    setLoading(true)
    setError('')
    setResults([])

    searchReference({ q: '#' + tag, page, type: 'video', region: 'JP' })
      .then(data => {
        if (seq !== seqRef.current) return
        setResults(data.results || [])
      })
      .catch(() => {
        if (seq !== seqRef.current) return
        setError('動画の取得に失敗しました。')
      })
      .finally(() => {
        if (seq === seqRef.current) setLoading(false)
      })

    window.scrollTo({ top: 0 })
  }, [tag, page])

  const goPage = (pg: number) => {
    setSearchParams(pg === 1 ? {} : { page: String(pg) })
  }

  const displayTag = tag ? '#' + tag : ''

  return (
    <div className="hashtag-page">
      <div className="hashtag-header">
        <div className="hashtag-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="9" x2="20" y2="9"/>
            <line x1="4" y1="15" x2="20" y2="15"/>
            <line x1="10" y1="3" x2="8" y2="21"/>
            <line x1="16" y1="3" x2="14" y2="21"/>
          </svg>
        </div>
        <div>
          <h1 className="hashtag-title">{displayTag}</h1>
          <p className="hashtag-sub">このハッシュタグの動画</p>
        </div>
      </div>

      {error && <p className="hashtag-error">{error}</p>}

      {loading ? (
        <div className="hashtag-loading">
          {Array.from({ length: 12 }).map((_, i) => (
            <div className="hashtag-skel" key={i}>
              <div className="hashtag-skel-thumb" />
              <div className="hashtag-skel-info">
                <div className="hashtag-skel-line long" />
                <div className="hashtag-skel-line short" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <VideoGrid items={results} />
          {results.length > 0 && (
            <div className="hashtag-pagination">
              {page > 1 && (
                <button className="hashtag-page-btn" onClick={() => goPage(page - 1)}>← 前へ</button>
              )}
              <span className="hashtag-page-num">{page} ページ</span>
              {results.length >= 20 && (
                <button className="hashtag-page-btn" onClick={() => goPage(page + 1)}>次へ →</button>
              )}
            </div>
          )}
          {!loading && results.length === 0 && !error && (
            <p className="hashtag-empty">このハッシュタグの動画が見つかりませんでした。</p>
          )}
        </>
      )}
    </div>
  )
}

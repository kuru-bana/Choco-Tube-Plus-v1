import { useEffect, useState } from 'react'
import './LinkList.css'

const LINK_LIST_URL = 'https://raw.githubusercontent.com/kuru-bana/Link-list/refs/heads/main/choco-tube-plus.json'

export default function LinkList() {
  const [links, setLinks] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(LINK_LIST_URL)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: string[]) => { setLinks(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  return (
    <div className="linklist-page">
      <h1 className="linklist-title">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        リンクリスト
      </h1>

      {loading && (
        <div className="linklist-loading">
          <div className="linklist-spinner" />
          読み込み中...
        </div>
      )}

      {error && (
        <div className="linklist-error">取得エラー: {error}</div>
      )}

      {!loading && !error && (
        <div className="linklist-count">{links.length} 件のリンク</div>
      )}

      {!loading && !error && links.length > 0 && (
        <ul className="linklist-ul">
          {links.map((url, i) => (
            <li key={i} className="linklist-item">
              <span className="linklist-num">{i + 1}</span>
              <a href={url} target="_blank" rel="noopener noreferrer" className="linklist-link">
                {url}
              </a>
              <button
                className="linklist-copy-btn"
                onClick={() => navigator.clipboard.writeText(url)}
                title="コピー"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && links.length === 0 && (
        <p className="linklist-empty">リンクが見つかりませんでした。</p>
      )}
    </div>
  )
}

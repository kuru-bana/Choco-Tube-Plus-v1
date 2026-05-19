import { useState, useEffect, useCallback } from 'react'
import VideoGrid from '../components/VideoGrid'
import type { SearchResultItem } from '../types'
import { getTrend } from '../api/trend'
import { getCookie, setCookie, getProxyThumbnail } from '../api/utils'
import { IMAGE_PROXY_OPTIONS, getImageProxyMode, saveImageProxyMode } from '../lib/imagePreferences'
import './Trend.css'

export const REGIONS = [
  { value: 'DZ', label: 'アルジェリア' },
  { value: 'AR', label: 'アルゼンチン' },
  { value: 'AU', label: 'オーストラリア' },
  { value: 'AT', label: 'オーストリア' },
  { value: 'AZ', label: 'アゼルバイジャン' },
  { value: 'BH', label: 'バーレーン' },
  { value: 'BD', label: 'バングラデシュ' },
  { value: 'BY', label: 'ベラルーシ' },
  { value: 'BE', label: 'ベルギー' },
  { value: 'BO', label: 'ボリビア' },
  { value: 'BA', label: 'ボスニア・ヘルツェゴビナ' },
  { value: 'BR', label: 'ブラジル' },
  { value: 'BG', label: 'ブルガリア' },
  { value: 'CA', label: 'カナダ' },
  { value: 'CL', label: 'チリ' },
  { value: 'CO', label: 'コロンビア' },
  { value: 'CR', label: 'コスタリカ' },
  { value: 'HR', label: 'クロアチア' },
  { value: 'CY', label: 'キプロス' },
  { value: 'CZ', label: 'チェコ' },
  { value: 'DK', label: 'デンマーク' },
  { value: 'DO', label: 'ドミニカ共和国' },
  { value: 'EC', label: 'エクアドル' },
  { value: 'EG', label: 'エジプト' },
  { value: 'SV', label: 'エルサルバドル' },
  { value: 'EE', label: 'エストニア' },
  { value: 'ET', label: 'エチオピア' },
  { value: 'FI', label: 'フィンランド' },
  { value: 'FR', label: 'フランス' },
  { value: 'GE', label: 'ジョージア' },
  { value: 'DE', label: 'ドイツ' },
  { value: 'GH', label: 'ガーナ' },
  { value: 'GR', label: 'ギリシャ' },
  { value: 'GT', label: 'グアテマラ' },
  { value: 'HN', label: 'ホンジュラス' },
  { value: 'HK', label: '香港' },
  { value: 'HU', label: 'ハンガリー' },
  { value: 'IN', label: 'インド' },
  { value: 'ID', label: 'インドネシア' },
  { value: 'IQ', label: 'イラク' },
  { value: 'IE', label: 'アイルランド' },
  { value: 'IL', label: 'イスラエル' },
  { value: 'IT', label: 'イタリア' },
  { value: 'JM', label: 'ジャマイカ' },
  { value: 'JP', label: '日本' },
  { value: 'JO', label: 'ヨルダン' },
  { value: 'KZ', label: 'カザフスタン' },
  { value: 'KE', label: 'ケニア' },
  { value: 'KW', label: 'クウェート' },
  { value: 'LA', label: 'ラオス' },
  { value: 'LV', label: 'ラトビア' },
  { value: 'LB', label: 'レバノン' },
  { value: 'LY', label: 'リビア' },
  { value: 'LT', label: 'リトアニア' },
  { value: 'LU', label: 'ルクセンブルク' },
  { value: 'MY', label: 'マレーシア' },
  { value: 'MT', label: 'マルタ' },
  { value: 'MX', label: 'メキシコ' },
  { value: 'MD', label: 'モルドバ' },
  { value: 'ME', label: 'モンテネグロ' },
  { value: 'MA', label: 'モロッコ' },
  { value: 'MZ', label: 'モザンビーク' },
  { value: 'NP', label: 'ネパール' },
  { value: 'NL', label: 'オランダ' },
  { value: 'NZ', label: 'ニュージーランド' },
  { value: 'NI', label: 'ニカラグア' },
  { value: 'NG', label: 'ナイジェリア' },
  { value: 'MK', label: '北マケドニア' },
  { value: 'NO', label: 'ノルウェー' },
  { value: 'OM', label: 'オマーン' },
  { value: 'PK', label: 'パキスタン' },
  { value: 'PA', label: 'パナマ' },
  { value: 'PG', label: 'パプアニューギニア' },
  { value: 'PY', label: 'パラグアイ' },
  { value: 'PE', label: 'ペルー' },
  { value: 'PH', label: 'フィリピン' },
  { value: 'PL', label: 'ポーランド' },
  { value: 'PT', label: 'ポルトガル' },
  { value: 'PR', label: 'プエルトリコ' },
  { value: 'QA', label: 'カタール' },
  { value: 'RO', label: 'ルーマニア' },
  { value: 'RU', label: 'ロシア' },
  { value: 'SA', label: 'サウジアラビア' },
  { value: 'SN', label: 'セネガル' },
  { value: 'RS', label: 'セルビア' },
  { value: 'SG', label: 'シンガポール' },
  { value: 'SK', label: 'スロバキア' },
  { value: 'SI', label: 'スロベニア' },
  { value: 'ZA', label: '南アフリカ' },
  { value: 'KR', label: '韓国' },
  { value: 'ES', label: 'スペイン' },
  { value: 'LK', label: 'スリランカ' },
  { value: 'SE', label: 'スウェーデン' },
  { value: 'CH', label: 'スイス' },
  { value: 'TW', label: '台湾' },
  { value: 'TZ', label: 'タンザニア' },
  { value: 'TH', label: 'タイ' },
  { value: 'TN', label: 'チュニジア' },
  { value: 'TR', label: 'トルコ' },
  { value: 'UG', label: 'ウガンダ' },
  { value: 'UA', label: 'ウクライナ' },
  { value: 'AE', label: 'アラブ首長国連邦' },
  { value: 'GB', label: 'イギリス' },
  { value: 'US', label: 'アメリカ' },
  { value: 'UY', label: 'ウルグアイ' },
  { value: 'UZ', label: 'ウズベキスタン' },
  { value: 'VE', label: 'ベネズエラ' },
  { value: 'VN', label: 'ベトナム' },
  { value: 'YE', label: 'イエメン' },
  { value: 'ZW', label: 'ジンバブエ' },
]

const JP_CATEGORIES = [
  { value: 'all', label: '全て' },
  { value: 'game', label: 'ゲーム' },
  { value: 'music', label: '音楽' },
]

const GLOBAL_CATEGORIES = [
  { value: '', label: '🔥 総合' },
  { value: 'music', label: '🎵 音楽' },
  { value: 'gaming', label: '🎮 ゲーム' },
  { value: 'news', label: '📰 ニュース' },
  { value: 'movies', label: '🎬 映画' },
]

export default function Trend() {
  const [region, setRegion] = useState(getCookie('trend_region') || 'JP')
  const [proxyType, setProxyType] = useState(getImageProxyMode())
  const [category, setCategory] = useState(getCookie('trend_category') || 'all')
  const [dateFormat, setDateFormat] = useState(getCookie('date_format') || 'ago')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRegion = (v: string) => {
    setRegion(v)
    setCookie('trend_region', v)
    if (v === 'JP' && !['all', 'game', 'music'].includes(category)) {
      setCategory('all')
      setCookie('trend_category', 'all')
    }
    if (v !== 'JP' && category === 'game') {
      setCategory('gaming')
      setCookie('trend_category', 'gaming')
    }
  }
  const handleProxy = (v: string) => {
    if (v === 'wsrv.nl' || v === 'server' || v === 'base64') {
      setProxyType(v)
      saveImageProxyMode(v)
    }
  }
  const handleCategory = (v: string) => { setCategory(v); setCookie('trend_category', v) }
  const handleDateFormat = (v: string) => { setDateFormat(v); setCookie('date_format', v) }

  const fetchTrend = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const effectiveCategory = region === 'JP'
        ? (['all', 'game', 'music'].includes(category) ? category : 'all')
        : category === 'all' ? '' : category === 'game' ? 'gaming' : category
      const data = await getTrend(region, effectiveCategory, proxyType)
      const items: SearchResultItem[] = data.map(v => ({
        id: v.id,
        title: v.title,
        thumbnail: getProxyThumbnail(v.id, proxyType),
        channel: v.channel,
        channel_id: v.channel_id || '',
        type: 'video' as const,
        views: v.views,
        published_at: formatPublishedAt(v.published_at, dateFormat),
        duration: v.duration,
        authorThumbnails: v.author_thumbnails?.length ? v.author_thumbnails : undefined,
      }))
      setResults(items)
    } catch {
      setError('トレンドの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [region, category, proxyType, dateFormat])

  useEffect(() => {
    fetchTrend()
  }, [fetchTrend])

  function formatPublishedAt(published_at: string, fmt: string): string {
    if (!published_at) return ''
    const isoMatch = published_at.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) {
      if (fmt === 'date') return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
      const date = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`)
      const now = new Date()
      const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
      if (diffDays < 1) return '今日'
      if (diffDays < 7) return `${diffDays}日前`
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}週間前`
      if (diffDays < 365) return `${Math.floor(diffDays / 30)}ヶ月前`
      return `${Math.floor(diffDays / 365)}年前`
    }
    return published_at
  }

  return (
    <div className="trend-page">
      <div className="trend-header">
        <h2 className="trend-title">
          <span aria-hidden="true">↗</span>
          トレンド動画
        </h2>

        <div className="region-wrap">
          <label htmlFor="trendRegion" className="region-label">地域</label>
          <select
            id="trendRegion"
            className="region-select"
            value={region}
            onChange={e => handleRegion(e.target.value)}
          >
            {[...REGIONS].sort((a, b) => a.label.localeCompare(b.label, 'ja')).map(r => (
              <option key={r.value} value={r.value}>{r.label} ({r.value})</option>
            ))}
          </select>
        </div>

        <div className="trend-right-controls">
          {region === 'JP' && (
            <label className="trend-select-group">
              日付:
              <select value={dateFormat} onChange={e => handleDateFormat(e.target.value)}>
                <option value="ago">~ago</option>
                <option value="date">YYYY-MM-DD</option>
              </select>
            </label>
          )}
          <label className="trend-select-group">
            サムネイル:
            <select value={proxyType} onChange={e => handleProxy(e.target.value)}>
              {IMAGE_PROXY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="category-tabs">
        {(region === 'JP' ? JP_CATEGORIES : GLOBAL_CATEGORIES).map(c => {
          const activeCategory = region === 'JP'
            ? (['all', 'game', 'music'].includes(category) ? category : 'all')
            : category === 'all' || category === 'game' ? (category === 'game' ? 'gaming' : '') : category
          return (
            <button
              key={c.value || 'all'}
              className={`category-tab${activeCategory === c.value ? ' active' : ''}`}
              onClick={() => handleCategory(c.value)}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {error && <div className="trend-error">{error}</div>}

      <VideoGrid
        items={results}
        loading={loading}
        emptyMessage="トレンド動画が取得できませんでした"
        proxyType={proxyType}
      />
    </div>
  )
}

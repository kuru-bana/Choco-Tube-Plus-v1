import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { setCookie } from '../api/utils'
import { fetchYtdlpStreams, fetchHdadStreams } from '../api/stream'
import type { Stream, StreamResult } from '../types'
import { REGIONS } from './Trend'
import {
  DATE_OPTIONS,
  DEFAULT_SEARCH_SETTINGS,
  DURATION_OPTIONS,
  FEATURE_OPTIONS,
  SORT_OPTIONS,
  TYPE_OPTIONS,
  getSearchSettings,
  resetSearchSettings,
  saveSearchSettings,
  type SearchSettings,
} from '../lib/searchSettings'
import {
  DEFAULT_PLAYBACK_SETTINGS,
  SPEED_OPTIONS,
  getPlaybackSettings,
  resetPlaybackSettings,
  savePlaybackSettings,
  type PlaybackSettings,
} from '../lib/playbackSettings'
import {
  DEFAULT_SEQUENTIAL_ORDER,
  FILTER_OPTIONS,
  STREAM_MODE_OPTIONS,
  YTDLP_API_OPTIONS,
  YTDLP_FETCH_MODE_OPTIONS,
  getStreamSettings,
  resetStreamSettings,
  saveStreamSettings,
  type StreamSettings,
} from '../lib/streamSettings'
import { IMAGE_PROXY_OPTIONS, getImageProxyMode, saveImageProxyMode, type ImageProxyMode } from '../lib/imagePreferences'
import './Settings.css'

type SettingsTab = 'search' | 'playback' | 'stream' | 'display'

const tabs: Array<{ id: SettingsTab; label: string; description: string }> = [
  { id: 'search',   label: '検索',     description: '検索結果で使うフィルターの初期値' },
  { id: 'playback', label: '再生',     description: '自動再生・速度などの初期値' },
  { id: 'stream',   label: '再生方法', description: 'ストリームの取得方法' },
  { id: 'display',  label: '表示',     description: '画像や見た目の設定' },
]

function featureSummary(features: string[]) {
  if (features.length === 0) return 'すべて'
  return FEATURE_OPTIONS.filter(option => features.includes(option.value)).map(option => option.label).join('、')
}

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="settings-toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="settings-toggle-track">
        <span className="settings-toggle-thumb" />
      </span>
      {label !== undefined && <span className="settings-toggle-label">{checked ? 'オン' : 'オフ'}</span>}
    </label>
  )
}

const TEST_VIDEO_IDS = ['7G0ovtPqHnI', 'Ol1o3dgPIbI', 'z9tsfkdgByA', 'oZpYEEcvu5I', 'Sw1Flgub9s8', '7xht3kQO_TM']

function pickBestStream(streams: Stream[], filter: string): Stream | null {
  let candidates: Stream[]
  if (filter === 'hls') {
    candidates = streams.filter(s => s.isHLS)
  } else if (filter === 'audio') {
    candidates = streams.filter(s => s.hasAudio && !s.hasVideo)
  } else if (filter === 'video') {
    candidates = streams.filter(s => s.hasVideo && !s.hasAudio)
  } else {
    candidates = streams.filter(s => s.hasAudio && s.hasVideo && !s.isHLS)
    if (candidates.length === 0) candidates = streams.filter(s => s.hasAudio && s.hasVideo)
    if (candidates.length === 0) candidates = streams.filter(s => s.isHLS)
  }
  if (candidates.length === 0) candidates = streams
  const sorted = [...candidates].sort((a, b) => {
    const qa = parseInt(a.quality) || 0
    const qb = parseInt(b.quality) || 0
    return qb - qa
  })
  return sorted[0] ?? null
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('search')
  const [settings, setSettings] = useState<SearchSettings>(() => getSearchSettings())
  const [playback, setPlayback] = useState<PlaybackSettings>(() => getPlaybackSettings())
  const [stream, setStream] = useState<StreamSettings>(() => getStreamSettings())
  const [eduParamSources, setEduParamSources] = useState<{ key: string; label: string; url: string }[]>([])
  const [imageMode, setImageMode] = useState<ImageProxyMode>(() => getImageProxyMode())
  const [savedMessage, setSavedMessage] = useState('保存済み')

  const [testPhase, setTestPhase] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle')
  const [testVideoId, setTestVideoId] = useState<string | null>(null)
  const [testStreamUrl, setTestStreamUrl] = useState<string | null>(null)
  const [testIsIframe, setTestIsIframe] = useState(false)
  const [testIframeSrc, setTestIframeSrc] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [testSource, setTestSource] = useState<string | null>(null)
  const [testQuality, setTestQuality] = useState<string | null>(null)
  const testAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/edu/sources')
      .then(r => r.ok ? r.json() : null)
      .then((data: { key: string; label: string; url: string }[] | null) => {
        if (data && data.length > 0) setEduParamSources(data)
      })
      .catch(() => {})
  }, [])

  const flash = (msg = '保存しました') => {
    setSavedMessage(msg)
    window.setTimeout(() => setSavedMessage('保存済み'), 1200)
  }

  const persist = (next: SearchSettings) => {
    saveSearchSettings(next)
    setCookie('trend_region', next.region)
    setSettings(next)
    flash()
  }

  const updateSetting = (key: keyof SearchSettings, value: string | string[] | boolean) => {
    persist({ ...settings, [key]: value })
  }

  const toggleFeature = (value: string) => {
    const nextFeatures = settings.features.includes(value)
      ? settings.features.filter(feature => feature !== value)
      : [...settings.features, value]
    updateSetting('features', nextFeatures)
  }

  const handleReset = () => {
    const defaults = resetSearchSettings()
    setCookie('trend_region', defaults.region)
    setSettings({ ...defaults })
    flash('初期設定に戻しました')
  }

  const persistPlayback = (next: PlaybackSettings) => {
    savePlaybackSettings(next)
    setPlayback(next)
    flash()
  }

  const updatePlayback = (key: keyof PlaybackSettings, value: boolean | number) => {
    const next = { ...playback, [key]: value }
    if (key === 'loop' && value === true) next.autoNext = false
    if (key === 'autoNext' && value === true) next.loop = false
    persistPlayback(next)
  }

  const handleResetPlayback = () => {
    const defaults = resetPlaybackSettings()
    setPlayback({ ...defaults })
    flash('初期設定に戻しました')
  }

  const persistStream = (next: StreamSettings) => {
    saveStreamSettings(next)
    setStream(next)
    flash()
  }

  const updateStream = <K extends keyof StreamSettings>(key: K, value: StreamSettings[K]) => {
    persistStream({ ...stream, [key]: value })
  }

  const handleResetStream = () => {
    const defaults = resetStreamSettings()
    setStream({ ...defaults })
    flash('初期設定に戻しました')
  }

  const stopPlaybackTest = () => {
    if (testAbortRef.current) { testAbortRef.current.abort(); testAbortRef.current = null }
    setTestPhase('idle')
    setTestVideoId(null)
    setTestStreamUrl(null)
    setTestIsIframe(false)
    setTestIframeSrc(null)
    setTestError(null)
    setTestSource(null)
    setTestQuality(null)
  }

  const runPlaybackTest = async () => {
    stopPlaybackTest()
    const vid = TEST_VIDEO_IDS[Math.floor(Math.random() * TEST_VIDEO_IDS.length)]
    const ac = new AbortController()
    testAbortRef.current = ac
    setTestVideoId(vid)
    setTestPhase('loading')

    try {
      const mode = stream.streamMode

      if (mode === 'nocookie') {
        setTestIframeSrc(`https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&controls=1`)
        setTestIsIframe(true)
        setTestPhase('playing')
        return
      }

      if (mode === 'edu') {
        const paramKey = stream.eduParam || eduParamSources[0]?.key || 'wakame'
        try {
          const res = await fetch(`/api/edu/params/${encodeURIComponent(paramKey)}`, { signal: ac.signal })
          if (res.ok) {
            const json = await res.json() as { params?: string }
            const params = json.params || ''
            setTestIframeSrc(`https://www.youtubeeducation.com/embed/${vid}${params}${params.includes('?') ? '&' : '?'}autoplay=1&controls=1`)
          } else {
            setTestIframeSrc(`https://www.youtubeeducation.com/embed/${vid}?autoplay=1&controls=1`)
          }
        } catch {
          setTestIframeSrc(`https://www.youtubeeducation.com/embed/${vid}?autoplay=1&controls=1`)
        }
        setTestIsIframe(true)
        setTestPhase('playing')
        return
      }

      if (mode === 'ytdlp') {
        const result = await fetchYtdlpStreams(
          vid, [], undefined,
          stream.ytdlpFetchMode,
          stream.ytdlpSpecificApi,
          stream.ytdlpTimeoutSec * 1000,
          stream.ytdlpSequentialOrder
        )
        if (ac.signal.aborted) return
        if (!result || result.streams.length === 0) throw new Error('ストリームが見つかりませんでした')
        const best = pickBestStream(result.streams, stream.ytdlpFilter)
        if (!best) throw new Error('再生可能なストリームが見つかりませんでした')
        setTestStreamUrl(best.url)
        setTestSource(result.source)
        setTestQuality(best.quality || null)
        setTestPhase('playing')
        return
      }

      if (mode === 'invidious') {
        const res = await fetch(`/api/stream/invidious/${vid}`, { signal: ac.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json() as StreamResult
        if (ac.signal.aborted) return
        if (!data.streams || data.streams.length === 0) throw new Error('ストリームが見つかりませんでした')
        const best = pickBestStream(data.streams, stream.invFilter)
        if (!best) throw new Error('再生可能なストリームが見つかりませんでした')
        setTestStreamUrl(best.url)
        setTestSource(data.instance || null)
        setTestQuality(best.quality || null)
        setTestPhase('playing')
        return
      }

      if (mode === 'rapid') {
        const res = await fetch(`/api/stream/rapid/${vid}`, { signal: ac.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json() as { streams?: Stream[]; source?: string; error?: string }
        if (ac.signal.aborted) return
        if (!data.streams || data.streams.length === 0) throw new Error(data.error || 'ストリームが見つかりませんでした')
        const best = pickBestStream(data.streams, stream.rapidFilter)
        if (!best) throw new Error('再生可能なストリームが見つかりませんでした')
        setTestStreamUrl(best.url)
        setTestSource(data.source || null)
        setTestQuality(best.quality || null)
        setTestPhase('playing')
        return
      }

      if (mode === 'hdad') {
        const result = await fetchHdadStreams(vid)
        if (ac.signal.aborted) return
        if (!result || result.streams.length === 0) throw new Error('ストリームが見つかりませんでした')
        const best = pickBestStream(result.streams, 'mp4')
        if (!best) throw new Error('再生可能なストリームが見つかりませんでした')
        setTestStreamUrl(best.url)
        setTestSource(result.source || null)
        setTestQuality(best.quality || null)
        setTestPhase('playing')
        return
      }

      throw new Error('未対応の再生方法です')
    } catch (e: unknown) {
      if (ac.signal.aborted) return
      setTestError((e as Error).message || '再生テストに失敗しました')
      setTestPhase('error')
    }
  }

  const updateImageMode = (mode: ImageProxyMode) => {
    saveImageProxyMode(mode)
    setImageMode(mode)
    flash()
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <div>
          <h1 className="settings-title">設定</h1>
          <p className="settings-lead">検索や表示など、Choco-Tube-Plus の動作をまとめて調整できます。</p>
        </div>
        <Link className="settings-open-search" to="/search">検索画面へ</Link>
      </div>

      <div className="settings-shell">
        <aside className="settings-tabs" aria-label="設定カテゴリ">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`settings-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
              <small>{tab.description}</small>
            </button>
          ))}
        </aside>

        <section className="settings-panel">
          {activeTab === 'search' ? (
            <>
              <div className="settings-panel-head">
                <div>
                  <h2>検索設定</h2>
                  <p>ここで選んだ内容が、新しい検索時の標準フィルターになります。検索画面で変更した場合も自動で保存されます。</p>
                </div>
                <span className="settings-save-state">{savedMessage}</span>
              </div>

              <div className="settings-grid">
                <label className="settings-field">
                  <span>並び順</span>
                  <select value={settings.sort_by} onChange={e => updateSetting('sort_by', e.target.value)}>
                    {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                <label className="settings-field">
                  <span>投稿日</span>
                  <select value={settings.date} onChange={e => updateSetting('date', e.target.value)}>
                    {DATE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                <label className="settings-field">
                  <span>動画長</span>
                  <select value={settings.duration} onChange={e => updateSetting('duration', e.target.value)} disabled={settings.type !== 'video' && settings.type !== 'all'}>
                    {DURATION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  {settings.type !== 'video' && settings.type !== 'all' && <small>種別が動画以外のときは検索時に使われません。</small>}
                </label>

                <label className="settings-field">
                  <span>種別</span>
                  <select value={settings.type} onChange={e => updateSetting('type', e.target.value)}>
                    {TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                <label className="settings-field settings-field-wide">
                  <span>地域</span>
                  <select value={settings.region} onChange={e => updateSetting('region', e.target.value)}>
                    {[...REGIONS].sort((a, b) => a.label.localeCompare(b.label, 'ja')).map(region => (
                      <option key={region.value} value={region.value}>{region.label} ({region.value})</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="settings-feature-card">
                <div className="settings-feature-head">
                  <div>
                    <h3>機能</h3>
                    <p>{featureSummary(settings.features)}</p>
                  </div>
                  <button type="button" className="settings-reset-link" onClick={() => updateSetting('features', [])}>すべてに戻す</button>
                </div>
                <div className="settings-feature-list">
                  {FEATURE_OPTIONS.map(option => (
                    <label key={option.value} className="settings-feature-item">
                      <input type="checkbox" checked={settings.features.includes(option.value)} onChange={() => toggleFeature(option.value)} />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="settings-feature-card">
                <div className="settings-feature-head">
                  <div>
                    <h3>検索サジェスト</h3>
                    <p>検索バーに入力中、候補を自動で表示します。</p>
                  </div>
                  <ToggleSwitch
                    checked={settings.searchSuggestionsEnabled}
                    onChange={v => updateSetting('searchSuggestionsEnabled', v)}
                    label=""
                  />
                </div>
              </div>

              <div className="settings-footer-actions">
                <button type="button" className="settings-reset-btn" onClick={handleReset}>検索設定を初期状態に戻す</button>
                <div className="settings-defaults-note">
                  初期状態: {SORT_OPTIONS.find(option => option.value === DEFAULT_SEARCH_SETTINGS.sort_by)?.label}、投稿日すべて、動画長すべて、種別すべて、地域 JP
                </div>
              </div>
            </>
          ) : activeTab === 'playback' ? (
            <>
              <div className="settings-panel-head">
                <div>
                  <h2>再生設定</h2>
                  <p>動画再生時のデフォルト動作を設定します。再生画面で変更した場合も自動で保存されます。</p>
                </div>
                <span className="settings-save-state">{savedMessage}</span>
              </div>

              <div className="settings-feature-card">
                <div className="settings-feature-head">
                  <div>
                    <h3>自動再生</h3>
                    <p>動画を開いたとき自動で再生を開始します。</p>
                  </div>
                  <ToggleSwitch checked={playback.autoplay} onChange={v => updatePlayback('autoplay', v)} label="" />
                </div>
              </div>

              <div className="settings-feature-card">
                <div className="settings-feature-head">
                  <div>
                    <h3>次の動画へ自動送り</h3>
                    <p>プレイリスト・ミックス再生中に動画が終わったら自動で次へ進みます。ループがオンのときは無効になります。</p>
                  </div>
                  <ToggleSwitch checked={playback.autoNext && !playback.loop} onChange={v => updatePlayback('autoNext', v)} label="" />
                </div>
              </div>

              <div className="settings-feature-card">
                <div className="settings-feature-head">
                  <div>
                    <h3>ループ再生</h3>
                    <p>動画が終わったら先頭から繰り返します。プレイリスト中は無効。オンにすると自動送りはオフになります。</p>
                  </div>
                  <ToggleSwitch checked={playback.loop} onChange={v => updatePlayback('loop', v)} label="" />
                </div>
              </div>

              <div className="settings-feature-card">
                <div className="settings-feature-head">
                  <div>
                    <h3>再生位置を保存</h3>
                    <p>次に同じ動画を開いたとき、前回の続きから再生します。</p>
                  </div>
                  <ToggleSwitch checked={playback.resumePosition} onChange={v => updatePlayback('resumePosition', v)} label="" />
                </div>
              </div>

              <div className="settings-feature-card">
                <div className="settings-feature-head">
                  <div>
                    <h3>再生速度</h3>
                    <p>現在: {SPEED_OPTIONS.find(o => o.value === playback.speed)?.label ?? `${playback.speed}x`}</p>
                  </div>
                </div>
                <div className="settings-grid" style={{ paddingTop: '0.75rem' }}>
                  <label className="settings-field settings-field-wide">
                    <span>速度</span>
                    <select value={playback.speed} onChange={e => updatePlayback('speed', parseFloat(e.target.value))}>
                      {SPEED_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="settings-footer-actions">
                <button type="button" className="settings-reset-btn" onClick={handleResetPlayback}>再生設定を初期状態に戻す</button>
                <div className="settings-defaults-note">
                  初期状態: 自動再生オン・自動送りオン・ループオフ・再生位置保存オン・速度 標準 (1x)
                </div>
              </div>
            </>
          ) : activeTab === 'stream' ? (
            <>
              <div className="settings-panel-head">
                <div>
                  <h2>再生方法の設定</h2>
                  <p>ストリームの取得方法と、各方法ごとの追加設定を選べます。再生画面で変更した場合も自動で保存されます。</p>
                </div>
                <span className="settings-save-state">{savedMessage}</span>
              </div>

              <div className="settings-feature-card">
                <div className="settings-feature-head">
                  <div>
                    <h3>再生方法</h3>
                    <p>現在: {STREAM_MODE_OPTIONS.find(o => o.value === stream.streamMode)?.label}</p>
                  </div>
                </div>
                <div className="settings-radio-list" style={{ marginTop: '0.75rem' }}>
                  {STREAM_MODE_OPTIONS.map(option => (
                    <label key={option.value} className="settings-radio-item">
                      <input
                        type="radio"
                        name="stream-mode"
                        value={option.value}
                        checked={stream.streamMode === option.value}
                        onChange={() => updateStream('streamMode', option.value)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {stream.streamMode === 'ytdlp' && (
                <>
                  <div className="settings-feature-card">
                    <div className="settings-feature-head">
                      <div><h3>yt-dlp フィルター</h3><p>取得するストリームの種別</p></div>
                    </div>
                    <div className="settings-grid" style={{ paddingTop: '0.75rem' }}>
                      <label className="settings-field settings-field-wide">
                        <span>フィルター</span>
                        <select value={stream.ytdlpFilter} onChange={e => updateStream('ytdlpFilter', e.target.value as StreamSettings['ytdlpFilter'])}>
                          {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="settings-feature-card">
                    <div className="settings-feature-head">
                      <div><h3>取得モード</h3><p>API へのリクエスト方法</p></div>
                    </div>
                    <div className="settings-radio-list" style={{ marginTop: '0.75rem' }}>
                      {YTDLP_FETCH_MODE_OPTIONS.map(option => (
                        <label key={option.value} className="settings-radio-item">
                          <input
                            type="radio"
                            name="ytdlp-fetch-mode"
                            value={option.value}
                            checked={stream.ytdlpFetchMode === option.value}
                            onChange={() => updateStream('ytdlpFetchMode', option.value)}
                          />
                          <span>
                            <strong>{option.label}</strong>
                            <small>{option.description}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    {stream.ytdlpFetchMode === 'specific' && (
                      <div className="settings-grid" style={{ paddingTop: '0.75rem' }}>
                        <label className="settings-field settings-field-wide">
                          <span>使用する API</span>
                          <select value={stream.ytdlpSpecificApi} onChange={e => updateStream('ytdlpSpecificApi', e.target.value)}>
                            {YTDLP_API_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </label>
                      </div>
                    )}
                    {stream.ytdlpFetchMode === 'sequential' && (
                      <div style={{ paddingTop: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted, #aaa)' }}>試行順（上から順番に試みます）</span>
                          <button
                            className="settings-link-btn"
                            onClick={() => updateStream('ytdlpSequentialOrder', DEFAULT_SEQUENTIAL_ORDER)}
                          >デフォルトに戻す</button>
                        </div>
                        <div className="seq-order-list">
                          {stream.ytdlpSequentialOrder.map((key, idx) => {
                            const label = YTDLP_API_OPTIONS.find(o => o.value === key)?.label ?? key
                            const isFirst = idx === 0
                            const isLast = idx === stream.ytdlpSequentialOrder.length - 1
                            const move = (dir: -1 | 1) => {
                              const next = [...stream.ytdlpSequentialOrder]
                              const swap = idx + dir
                              ;[next[idx], next[swap]] = [next[swap], next[idx]]
                              updateStream('ytdlpSequentialOrder', next)
                            }
                            return (
                              <div key={key} className="seq-order-item">
                                <span className="seq-order-num">{idx + 1}</span>
                                <span className="seq-order-label">{label}</span>
                                <div className="seq-order-btns">
                                  <button
                                    className="seq-order-btn"
                                    disabled={isFirst}
                                    onClick={() => move(-1)}
                                    title="上へ"
                                  >▲</button>
                                  <button
                                    className="seq-order-btn"
                                    disabled={isLast}
                                    onClick={() => move(1)}
                                    title="下へ"
                                  >▼</button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="settings-feature-card">
                    <div className="settings-feature-head">
                      <div><h3>タイムアウト</h3><p>各 API へのリクエストがこの秒数を超えたら失敗とみなします</p></div>
                    </div>
                    <div className="settings-grid" style={{ paddingTop: '0.75rem' }}>
                      <label className="settings-field">
                        <span>タイムアウト（秒）</span>
                        <input
                          type="number"
                          className="settings-number-input"
                          min={1}
                          max={120}
                          value={stream.ytdlpTimeoutSec}
                          onChange={e => {
                            const v = parseInt(e.target.value, 10)
                            if (!isNaN(v) && v > 0) updateStream('ytdlpTimeoutSec', v)
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </>
              )}

              {stream.streamMode === 'invidious' && (
                <div className="settings-feature-card">
                  <div className="settings-feature-head">
                    <div><h3>Invidious フィルター</h3><p>取得するストリームの種別</p></div>
                  </div>
                  <div className="settings-grid" style={{ paddingTop: '0.75rem' }}>
                    <label className="settings-field settings-field-wide">
                      <span>フィルター</span>
                      <select value={stream.invFilter} onChange={e => updateStream('invFilter', e.target.value as StreamSettings['invFilter'])}>
                        {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              )}

              {stream.streamMode === 'rapid' && (
                <div className="settings-feature-card">
                  <div className="settings-feature-head">
                    <div><h3>Rapid フィルター</h3><p>取得するストリームの種別</p></div>
                  </div>
                  <div className="settings-grid" style={{ paddingTop: '0.75rem' }}>
                    <label className="settings-field settings-field-wide">
                      <span>フィルター</span>
                      <select value={stream.rapidFilter} onChange={e => updateStream('rapidFilter', e.target.value as StreamSettings['rapidFilter'])}>
                        {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              )}

              {stream.streamMode === 'edu' && (
                <div className="settings-feature-card">
                  <div className="settings-feature-head">
                    <div>
                      <h3>教育埋め込みパラメータ</h3>
                      <p>YouTube 教育用埋め込みに使うパラメータを選択します</p>
                    </div>
                  </div>
                  <div className="settings-grid" style={{ paddingTop: '0.75rem' }}>
                    <label className="settings-field settings-field-wide">
                      <span>パラメータ</span>
                      {eduParamSources.length > 0 ? (
                        <select value={stream.eduParam} onChange={e => updateStream('eduParam', e.target.value)}>
                          {eduParamSources.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      ) : (
                        <input
                          type="text"
                          className="settings-number-input"
                          value={stream.eduParam}
                          onChange={e => updateStream('eduParam', e.target.value)}
                          placeholder="例: wakame"
                        />
                      )}
                    </label>
                  </div>
                </div>
              )}

              {(stream.streamMode === 'nocookie' || stream.streamMode === 'hdad') && (
                <div className="settings-feature-card">
                  <div className="settings-feature-head">
                    <div>
                      <h3>追加設定なし</h3>
                      <p>このモードには設定画面から変更できる追加設定はありません。</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="settings-feature-card">
                <div className="settings-feature-head">
                  <div>
                    <h3>再生テスト</h3>
                    <p>現在の設定でストリームを取得し、実際に再生を試みます</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {testPhase !== 'idle' && (
                      <button type="button" className="settings-reset-btn" onClick={stopPlaybackTest}>停止</button>
                    )}
                    <button
                      type="button"
                      className="settings-link-btn"
                      style={{ fontWeight: 700, fontSize: '0.9rem', padding: '0.4rem 1rem', border: '1px solid rgba(249,115,22,0.4)', borderRadius: '6px', color: 'var(--color-accent, #f97316)', background: 'rgba(249,115,22,0.08)' }}
                      disabled={testPhase === 'loading'}
                      onClick={runPlaybackTest}
                    >
                      {testPhase === 'loading' ? '取得中...' : testPhase === 'playing' ? '別の動画でテスト' : 'テストを開始'}
                    </button>
                  </div>
                </div>

                <div className="playtest-area">
                  <div className="playtest-meta">
                    <span className="playtest-mode">{STREAM_MODE_OPTIONS.find(o => o.value === stream.streamMode)?.label ?? stream.streamMode}</span>
                    {testVideoId && <span className="playtest-vid">動画ID: {testVideoId}</span>}
                    {testSource && <span className="playtest-src">ソース: {testSource}</span>}
                    {testQuality && <span className="playtest-quality">品質: {testQuality}</span>}
                  </div>

                  {testPhase === 'loading' && (
                    <div className="playtest-status loading">
                      <div className="playtest-spinner" />
                      <span>ストリームを取得中...</span>
                    </div>
                  )}

                  {testPhase === 'error' && (
                    <div className="playtest-status error">
                      <span>❌ {testError}</span>
                    </div>
                  )}

                  <div className="playtest-player">
                    {testPhase === 'playing' && testIsIframe && testIframeSrc ? (
                      <iframe
                        src={testIframeSrc}
                        className="playtest-iframe"
                        allowFullScreen
                        allow="autoplay; fullscreen"
                        title="再生テスト"
                      />
                    ) : testPhase === 'playing' && !testIsIframe && testStreamUrl ? (
                      <video
                        key={testStreamUrl}
                        src={testStreamUrl}
                        className="playtest-video"
                        controls
                        autoPlay
                        onError={() => {
                          setTestError('動画の再生に失敗しました（ストリームURLが無効か期限切れの可能性があります）')
                          setTestPhase('error')
                        }}
                      />
                    ) : (
                      <div className="playtest-placeholder">
                        <span>{testPhase === 'loading' ? 'プレイヤーを準備中...' : 'テストを開始するとここで動画を再生します'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="settings-footer-actions">
                <button type="button" className="settings-reset-btn" onClick={handleResetStream}>再生方法設定を初期状態に戻す</button>
                <div className="settings-defaults-note">
                  初期状態: yt-dlp・フィルター 動画＋音声・並列取得・タイムアウト 15秒
                </div>
              </div>
            </>
          ) : activeTab === 'display' ? (
            <>
              <div className="settings-panel-head">
                <div>
                  <h2>表示設定</h2>
                  <p>動画サムネイル、チャンネルアイコン、プレイリスト画像などの読み込み方式を選べます。</p>
                </div>
                <span className="settings-save-state">{savedMessage}</span>
              </div>

              <div className="settings-feature-card">
                <div className="settings-feature-head">
                  <div>
                    <h3>画像の表示方式</h3>
                    <p>現在: {IMAGE_PROXY_OPTIONS.find(option => option.value === imageMode)?.label}</p>
                  </div>
                </div>
                <div className="settings-radio-list">
                  {IMAGE_PROXY_OPTIONS.map(option => (
                    <label key={option.value} className="settings-radio-item">
                      <input
                        type="radio"
                        name="image-proxy-mode"
                        value={option.value}
                        checked={imageMode === option.value}
                        onChange={() => updateImageMode(option.value)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="settings-coming-soon">
              <h2>{tabs.find(tab => tab.id === activeTab)?.label}設定</h2>
              <p>このカテゴリは今後追加できます。まずは検索設定を使えるようにしています。</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

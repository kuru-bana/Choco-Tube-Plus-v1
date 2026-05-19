import { Router } from 'express'

const router = Router()

const EDU_PARAM_SOURCES = [
  {
    key: 'wakame',
    label: 'wakame',
    url: 'https://raw.githubusercontent.com/wakame02/wktopu/refs/heads/main/edu.text',
    type: 'text',
  },
  {
    key: 'siawaseok',
    label: 'siawaseok',
    url: 'https://raw.githubusercontent.com/siawaseok3/wakame/master/video_config.json',
    type: 'json',
    field: 'params',
  },
  {
    key: 'woolisbest-1',
    label: 'woolisbest-1',
    url: 'https://raw.githubusercontent.com/woolisbest-4520/about-youtube/refs/heads/main/edu/parameter.txt',
    type: 'raw-text',
  },
  {
    key: 'woolisbest-2',
    label: 'woolisbest-2',
    url: 'https://raw.githubusercontent.com/woolisbest-4520/about-youtube/refs/heads/main/edu/edu.txt',
    type: 'raw-text',
  },
  {
    key: 'woolisbest-3',
    label: 'woolisbest-3',
    url: 'https://raw.githubusercontent.com/woolisbest-4520/about-youtube/refs/heads/main/edu/ep.txt',
    type: 'raw-text',
  },
  {
    key: 'Toka_Kun_-1',
    label: 'Toka_Kun_-1',
    url: 'https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/key1.json',
    type: 'json',
    field: 'result',
  },
  {
    key: 'Toka_Kun_-2',
    label: 'Toka_Kun_-2',
    url: 'https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/key2.json',
    type: 'json',
    field: 'result',
  },
  {
    key: 'choco-1',
    label: 'choco-1',
    url: 'https://raw.githubusercontent.com/choco-1515/About-youtube/refs/heads/main/edu/key1.json',
    type: 'json',
    field: 'value',
  },
  {
    key: 'choco-2',
    label: 'choco-2',
    url: 'https://raw.githubusercontent.com/choco-1515/About-youtube/refs/heads/main/edu/key2.json',
    type: 'json',
    field: 'value',
  },
  {
    key: 'choco-3',
    label: 'choco-3',
    url: 'https://raw.githubusercontent.com/choco-1515/About-youtube/refs/heads/main/edu/key3.json',
    type: 'json',
    field: 'value',
  },
]

const _cache = new Map()
const CACHE_TTL = 5 * 60 * 60 * 1000

router.get('/sources', (_req, res) => {
  res.json(EDU_PARAM_SOURCES.map(s => ({ key: s.key, label: s.label, url: s.url })))
})

router.get('/params/:key', async (req, res) => {
  try {
    const { key } = req.params
    const source = EDU_PARAM_SOURCES.find(s => s.key === key)
    if (!source) return res.status(404).json({ error: 'Unknown param source key' })

    const cached = _cache.get(key)
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      return res.json({ params: cached.params })
    }

    const r = await fetch(source.url, { signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)

    let params
    if (source.type === 'text') {
      const text = await r.text()
      params = text.trim().replace(/&amp;/g, '&')
    } else if (source.type === 'raw-text') {
      const text = await r.text()
      params = text.trim().replace(/&amp;/g, '&')
    } else {
      const json = await r.json()
      const fieldName = source.field || 'params'
      params = (json[fieldName] || '').replace(/&amp;/g, '&')
    }

    _cache.set(key, { params, time: Date.now() })
    res.json({ params, type: source.type })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

export default router

import express from 'express'

const router = express.Router()

const CHOCO_CHAT_URL_JSON = 'https://raw.githubusercontent.com/kuru-bana/choco-chat-tool/refs/heads/main/url.json'

router.get('/choco-chat-new', async (req, res) => {
  try {
    const response = await fetch(CHOCO_CHAT_URL_JSON, {
      headers: { 'User-Agent': 'Choco-Tube-Plus/1.0' },
    })
    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream error: ${response.status}` })
    }
    const contentType = response.headers.get('content-type') || 'application/json'
    const text = await response.text()
    res.setHeader('Content-Type', contentType.includes('json') ? 'application/json' : contentType)
    res.send(text)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/whats', (req, res) => {
  res.json({ name: 'choco-tube-botu' })
})

export default router

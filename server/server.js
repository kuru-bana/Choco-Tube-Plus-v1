import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import path from 'path'
import youtubeRoutes from './routes/youtube.js'
import invidiousRoutes from './routes/invidious.js'
import trendRoutes from './routes/trend.js'
import searchRoutes from './routes/search.js'
import streamRoutes from './routes/stream.js'
import rapidRoutes from './routes/rapid.js'
import thumbnailRoutes from './routes/thumbnail.js'
import eduRoutes from './routes/edu.js'
import invtubeRoutes from './routes/invtube.js'
import channelHomeRoutes from './routes/channelhome.js'
import chocochainRoutes from './routes/chocochain.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.use('/api/youtube', youtubeRoutes)
app.use('/api/invidious', invidiousRoutes)
app.use('/api/trend', trendRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/stream', streamRoutes)
app.use('/api/stream/rapid', rapidRoutes)
app.use('/api/thumbnail', thumbnailRoutes)
app.use('/api/edu', eduRoutes)
app.use('/api', invtubeRoutes)
app.use('/api', channelHomeRoutes)
app.use('/', chocochainRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

const distPath = path.join(__dirname, '..', 'app', 'dist')
app.use(express.static(distPath))
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`)
})

import { Router } from 'express'
import { Innertube } from 'youtubei.js'

const router = Router()

let ytInstance = null
let ytInstanceTime = 0
const YT_INSTANCE_TTL = 30 * 60 * 1000

async function getYt() {
  if (ytInstance && Date.now() - ytInstanceTime < YT_INSTANCE_TTL) return ytInstance
  ytInstance = await Innertube.create({ retrieve_player: false })
  ytInstanceTime = Date.now()
  return ytInstance
}

function extractThumbnailUrl(thumbnails) {
  if (!thumbnails || !thumbnails.length) return null
  const sorted = [...thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0))
  return sorted[0]?.url || null
}

function extractLockupThumbnailUrl(contentImage) {
  if (!contentImage) return null
  if (contentImage.type === 'ThumbnailView') {
    const imgs = contentImage.image || []
    const sorted = [...imgs].sort((a, b) => (b.width || 0) - (a.width || 0))
    return sorted[0]?.url || null
  }
  if (contentImage.type === 'CollectionThumbnailView') {
    const primary = contentImage.primary_thumbnail
    if (!primary) return null
    const imgs = primary.image || []
    const sorted = [...imgs].sort((a, b) => (b.width || 0) - (a.width || 0))
    return sorted[0]?.url || null
  }
  return null
}

function parseGridVideo(item) {
  const thumbUrl = extractThumbnailUrl(item.thumbnails)
  return {
    type: 'video',
    videoId: item.id,
    title: item.title?.toString() || '',
    author: item.author?.name || item.short_byline_text?.toString() || '',
    authorId: item.author?.id || null,
    durationText: item.duration?.text || '',
    durationSeconds: item.duration?.seconds || null,
    viewCountText: item.views?.toString() || item.short_view_count?.toString() || '',
    publishedText: item.published?.toString() || '',
    thumbnailUrl: thumbUrl,
    isLive: item.is_live || false,
  }
}

function parseGridChannel(item) {
  const thumbUrl = item.author?.thumbnails?.[0]?.url || null
  return {
    type: 'channel',
    channelId: item.id,
    name: item.author?.name || item.author || '',
    thumbnailUrl: thumbUrl,
    subscribers: item.subscribers?.toString() || '',
    videoCount: item.video_count?.toString() || '',
  }
}

function parseShelfItems(items) {
  const result = []
  for (const item of items) {
    if (!item || !item.type) continue
    if (item.type === 'GridVideo' || item.type === 'CompactVideo' || item.type === 'Video') {
      const parsed = parseGridVideo(item)
      if (parsed.videoId) result.push(parsed)
    } else if (item.type === 'GridChannel') {
      const parsed = parseGridChannel(item)
      if (parsed.channelId) result.push(parsed)
    } else if (item.type === 'LockupView') {
      const contentId = item.content_id
      const titleText = item.metadata?.title?.toString() || ''
      const thumbUrl = extractLockupThumbnailUrl(item.content_image)
      if (contentId) {
        // content_type フィールドで判別、なければIDの長さとプレフィックスで推定
        // 動画IDは11文字の英数字、プレイリストIDは PL/UU/RD 等で始まる長い文字列
        const contentType = item.content_type || ''
        const isPlaylist = contentType === 'PLAYLIST'
          || (!contentType && (
            contentId.length > 11
            || /^(PL|UU|RD|FL|LL|WL|OL)/i.test(contentId)
          ))
        if (isPlaylist) {
          result.push({
            type: 'playlist',
            playlistId: contentId,
            title: titleText,
            thumbnailUrl: thumbUrl,
          })
        } else {
          // 動画として扱う
          const durationText = item.metadata?.metadata_rows?.[0]?.metadata_parts
            ?.map(p => p.text?.toString() || '').filter(Boolean).join(' ') || ''
          result.push({
            type: 'video',
            videoId: contentId,
            title: titleText,
            thumbnailUrl: thumbUrl,
            durationText,
            durationSeconds: null,
            viewCountText: '',
            publishedText: '',
            isLive: false,
          })
        }
      }
    }
  }
  return result
}

router.get('/channels/:channelId/home', async (req, res) => {
  try {
    const { channelId } = req.params
    const yt = await getYt()
    const channel = await yt.getChannel(channelId)
    const home = await channel.getHome()

    const sections = home.current_tab?.content?.contents || []

    let featuredVideo = null
    const shelves = []

    for (const section of sections) {
      const innerItems = section.contents || section.items || []
      for (const inner of innerItems) {
        if (!inner || !inner.type) continue

        if (inner.type === 'ChannelVideoPlayer') {
          featuredVideo = {
            videoId: inner.id,
            title: inner.title?.toString() || '',
            description: inner.description?.toString() || '',
            viewCountText: inner.view_count?.toString() || '',
            publishedText: inner.published_time?.toString() || '',
          }

        } else if (inner.type === 'Shelf') {
          const title = inner.title?.toString() || ''
          const rawItems = inner.content?.items || inner.content?.contents || []
          const parsed = parseShelfItems(rawItems)
          if (parsed.length > 0) {
            // play_all_button からプレイリストID・先頭動画IDを抽出
            let playlistId = null
            let playAllVideoId = null
            try {
              const payload = inner.play_all_button?.endpoint?.payload
              if (payload) {
                playlistId = payload.listId || payload.list || null
                playAllVideoId = payload.videoId || null
              }
              // playlist_id が取れなければ endpoint の URL から抽出を試みる
              if (!playlistId) {
                const url = inner.play_all_button?.endpoint?.metadata?.url || ''
                const m = url.match(/[?&]list=([A-Za-z0-9_-]+)/)
                if (m) playlistId = m[1]
              }
            } catch { /* ignore */ }
            shelves.push({ title, items: parsed, playlistId, playAllVideoId })
          }
        }
      }
    }

    res.json({ featuredVideo, shelves })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

export default router

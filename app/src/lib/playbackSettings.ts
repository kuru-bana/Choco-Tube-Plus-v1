export interface PlaybackSettings {
  autoplay: boolean
  loop: boolean
  autoNext: boolean
  speed: number
  resumePosition: boolean
}

export const PLAYBACK_LOOP_KEY      = 'video_loop'
export const PLAYBACK_AUTOPLAY_KEY  = 'video_autoplay'
export const PLAYBACK_AUTO_NEXT_KEY = 'video_auto_next'
export const PLAYBACK_SPEED_KEY     = 'video_speed'
export const PLAYBACK_RESUME_KEY    = 'video_resume_pos'

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  autoplay: true,
  loop: false,
  autoNext: true,
  speed: 1.0,
  resumePosition: true,
}

export const SPEED_OPTIONS = [
  { value: 0.25, label: '0.25x' },
  { value: 0.5,  label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1.0,  label: '標準 (1x)' },
  { value: 1.25, label: '1.25x' },
  { value: 1.5,  label: '1.5x' },
  { value: 1.75, label: '1.75x' },
  { value: 2.0,  label: '2x' },
]

export function getPlaybackSettings(): PlaybackSettings {
  if (typeof window === 'undefined') return DEFAULT_PLAYBACK_SETTINGS
  try {
    const autoplay       = localStorage.getItem(PLAYBACK_AUTOPLAY_KEY)  !== '0'
    const loop           = localStorage.getItem(PLAYBACK_LOOP_KEY)       === '1'
    const autoNext       = localStorage.getItem(PLAYBACK_AUTO_NEXT_KEY)  !== '0'
    const rawSpeed       = parseFloat(localStorage.getItem(PLAYBACK_SPEED_KEY) ?? '')
    const speed          = isNaN(rawSpeed) ? DEFAULT_PLAYBACK_SETTINGS.speed : rawSpeed
    const resumePosition = localStorage.getItem(PLAYBACK_RESUME_KEY) !== '0'
    return { autoplay, loop, autoNext, speed, resumePosition }
  } catch {
    return DEFAULT_PLAYBACK_SETTINGS
  }
}

export function savePlaybackSettings(settings: PlaybackSettings): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PLAYBACK_AUTOPLAY_KEY,  settings.autoplay        ? '1' : '0')
    localStorage.setItem(PLAYBACK_LOOP_KEY,       settings.loop            ? '1' : '0')
    localStorage.setItem(PLAYBACK_AUTO_NEXT_KEY,  settings.autoNext        ? '1' : '0')
    localStorage.setItem(PLAYBACK_SPEED_KEY,      String(settings.speed))
    if (!settings.resumePosition) {
      localStorage.setItem(PLAYBACK_RESUME_KEY, '0')
    } else {
      const cur = localStorage.getItem(PLAYBACK_RESUME_KEY)
      if (cur === '0' || cur === null) localStorage.setItem(PLAYBACK_RESUME_KEY, '1')
    }
  } catch { /* ignore */ }
}

export function resetPlaybackSettings(): PlaybackSettings {
  savePlaybackSettings(DEFAULT_PLAYBACK_SETTINGS)
  return DEFAULT_PLAYBACK_SETTINGS
}

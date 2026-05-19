const STORAGE_KEY = 'choco_search_history'
const MAX_ITEMS = 20

export function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function addSearchHistory(query: string): void {
  const q = query.trim()
  if (!q) return
  const history = getSearchHistory().filter(item => item.toLowerCase() !== q.toLowerCase())
  history.unshift(q)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ITEMS)))
  } catch {}
}

export function removeSearchHistory(query: string): void {
  const history = getSearchHistory().filter(item => item !== query)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch {}
}

export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

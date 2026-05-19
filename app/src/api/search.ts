import type { SearchResultItem } from '../types'

export interface ReferenceSearchParams {
  q: string
  page?: number
  sort_by?: string
  date?: string
  duration?: string
  type?: string
  features?: string
  region?: string
  proxy?: string
}

export interface ReferenceSearchResponse {
  results: SearchResultItem[]
  count: number
  page: number
  source: string
}

export async function searchReference(params: ReferenceSearchParams): Promise<ReferenceSearchResponse> {
  const url = new URL('/api/search', window.location.origin)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== 'all' && value !== 'relevance') {
      url.searchParams.set(key, String(value))
    }
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error('Search failed')
  return await res.json() as ReferenceSearchResponse
}

export async function getSearchSuggestions(q: string, signal?: AbortSignal): Promise<string[]> {
  const url = new URL('/api/search/suggestions', window.location.origin)
  url.searchParams.set('q', q)
  const res = await fetch(url.toString(), { signal })
  if (!res.ok) return []
  const data = await res.json() as { suggestions?: unknown } | unknown[]
  const rawSuggestions = Array.isArray(data)
    ? (Array.isArray(data[1]) ? data[1] : data)
    : data.suggestions
  if (!Array.isArray(rawSuggestions)) return []
  const seen = new Set<string>()
  return rawSuggestions
    .map(item => Array.isArray(item) ? item[0] : item)
    .filter((item): item is string => {
      if (typeof item !== 'string') return false
      const key = item.trim().toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

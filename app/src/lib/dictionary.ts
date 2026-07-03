// Click-to-define lookups via the Free Dictionary API (https://dictionaryapi.dev),
// with an in-memory cache. Falls back gracefully when offline.

export interface LookupResult {
  word: string
  phonetic?: string
  meanings: { partOfSpeech: string; definition: string; example?: string }[]
}

const cache = new Map<string, LookupResult | null>()
const audioCache = new Map<string, string | null>()

// One entry fetch shared by wordAudio + lookupWord (a word tap fires both), with
// in-flight dedup so it's ONE request, and a hard timeout so a stalled/blocked
// dictionary host (common from mainland China) never hangs the voice path.
const ENTRY_TIMEOUT_MS = 2500
const entryCache = new Map<string, any[] | null>()
const entryInFlight = new Map<string, Promise<any[] | null>>()

const normalize = (raw: string) => raw.toLowerCase().replace(/[^a-z'-]/g, '')

async function fetchEntry(word: string): Promise<any[] | null> {
  if (entryCache.has(word)) return entryCache.get(word)!
  const pending = entryInFlight.get(word)
  if (pending) return pending
  const p = (async () => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), ENTRY_TIMEOUT_MS)
    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
        { signal: ctrl.signal },
      )
      if (!res.ok) {
        // 404 = genuinely no entry → cache the miss. Other statuses (5xx) →
        // do NOT cache, so a later retry can still succeed.
        if (res.status === 404) entryCache.set(word, null)
        return null
      }
      const data = await res.json()
      const entries = Array.isArray(data) ? data : null
      if (entries) entryCache.set(word, entries)
      return entries
    } catch {
      // Timeout / offline / network — do NOT cache, allow retry when back.
      return null
    } finally {
      clearTimeout(timer)
      entryInFlight.delete(word)
    }
  })()
  entryInFlight.set(word, p)
  return p
}

/** Real human pronunciation URL for a single word (Free Dictionary API media).
 *  US then UK only — the whole app speaks en-US, so a random AU/regional clip
 *  is dropped and the word falls through to the en-US neural voice instead.
 *  null when there's no suitable recording. */
export async function wordAudio(raw: string): Promise<string | null> {
  const word = normalize(raw)
  if (!word) return null
  if (audioCache.has(word)) return audioCache.get(word)!
  const entries = await fetchEntry(word)
  if (!entries) return null // transient/miss — uncached, so retry stays possible
  const phonetics: any[] = entries.flatMap((e: any) => e?.phonetics || [])
  const pick =
    phonetics.find((p) => p?.audio && /-us\.mp3$/i.test(p.audio)) ||
    phonetics.find((p) => p?.audio && /-uk\.mp3$/i.test(p.audio))
  let url: string | null = pick?.audio || null
  if (url && url.startsWith('//')) url = 'https:' + url
  // Cache the result (incl. "no us/uk clip" → null) so replays skip straight to
  // the neural voice instead of re-deriving.
  audioCache.set(word, url)
  return url
}

export async function lookupWord(raw: string): Promise<LookupResult | null> {
  const word = normalize(raw)
  if (!word) return null
  if (cache.has(word)) return cache.get(word)!

  const entries = await fetchEntry(word)
  if (!entries) return null // transient/miss — uncached (entryCache holds 404s)
  {
    const entry = entries[0]
    if (!entry) {
      cache.set(word, null)
      return null
    }
    const phonetic: string | undefined =
      entry.phonetic || entry.phonetics?.find((p: any) => p.text)?.text
    const meanings = (entry.meanings || [])
      .flatMap((m: any) =>
        (m.definitions || []).slice(0, 2).map((d: any) => ({
          partOfSpeech: m.partOfSpeech,
          definition: d.definition,
          example: d.example,
        })),
      )
      .slice(0, 4)
    const result: LookupResult = { word: entry.word || word, phonetic, meanings }
    cache.set(word, result)
    return result
  }
}

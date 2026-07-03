// Click-to-define lookups via the Free Dictionary API (https://dictionaryapi.dev),
// with an in-memory cache. Falls back gracefully when offline.

export interface LookupResult {
  word: string
  phonetic?: string
  meanings: { partOfSpeech: string; definition: string; example?: string }[]
}

const cache = new Map<string, LookupResult | null>()
const audioCache = new Map<string, string | null>()

/** Real human pronunciation URL for a single word (Free Dictionary API media),
 *  US preferred. Sounds far better + more consistent than sentence-trained
 *  neural TTS on a lone word. null when the word has no recording. */
export async function wordAudio(raw: string): Promise<string | null> {
  const word = raw.toLowerCase().replace(/[^a-z'-]/g, '')
  if (!word) return null
  if (audioCache.has(word)) return audioCache.get(word)!
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    )
    if (!res.ok) {
      if (res.status === 404) audioCache.set(word, null)
      return null
    }
    const data = await res.json()
    const phonetics: any[] = (Array.isArray(data) ? data : []).flatMap(
      (e: any) => e?.phonetics || [],
    )
    const pick =
      phonetics.find((p) => p?.audio && /-us\.mp3$/i.test(p.audio)) ||
      phonetics.find((p) => p?.audio && /-uk\.mp3$/i.test(p.audio)) ||
      phonetics.find((p) => p?.audio)
    let url: string | null = pick?.audio || null
    if (url && url.startsWith('//')) url = 'https:' + url
    audioCache.set(word, url)
    return url
  } catch {
    return null
  }
}

export async function lookupWord(raw: string): Promise<LookupResult | null> {
  const word = raw.toLowerCase().replace(/[^a-z'-]/g, '')
  if (!word) return null
  if (cache.has(word)) return cache.get(word)!

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    )
    if (!res.ok) {
      // 404 = the word genuinely has no entry → cache the miss.
      // Any other status (5xx, offline reachable-but-erroring) → do NOT cache,
      // so a later retry (or reconnection) can still succeed.
      if (res.status === 404) cache.set(word, null)
      return null
    }
    const data = await res.json()
    const entry = Array.isArray(data) ? data[0] : null
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
  } catch {
    // Network error / offline — do not cache, allow retry when back online.
    return null
  }
}

// Click-to-define lookups via the Free Dictionary API (https://dictionaryapi.dev),
// with an in-memory cache. Falls back gracefully when offline.

export interface LookupResult {
  word: string
  phonetic?: string
  meanings: { partOfSpeech: string; definition: string; example?: string }[]
}

const cache = new Map<string, LookupResult | null>()

export async function lookupWord(raw: string): Promise<LookupResult | null> {
  const word = raw.toLowerCase().replace(/[^a-z'-]/g, '')
  if (!word) return null
  if (cache.has(word)) return cache.get(word)!

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    )
    if (!res.ok) {
      cache.set(word, null)
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
    cache.set(word, null)
    return null
  }
}

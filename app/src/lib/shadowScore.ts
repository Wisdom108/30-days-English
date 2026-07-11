// Shadow-reading scorer: aligns an ASR transcript against the reference
// sentence and produces per-word hit marks for highlighting plus a coverage
// score. Runs entirely on-device — no cloud pronunciation API needed.
//
// Pipeline: tokenize (keep original spans for highlight) → normalize each
// word (lowercase, expand contractions, light lemmatization) → longest
// common subsequence over normalized token streams (keeps word order) →
// map matches back to original words.

export type ShadowSegment = {
  /** Original text chunk (word or the punctuation/space between words). */
  text: string
  /** True when this segment is a word that participates in scoring. */
  word: boolean
  /** True when the word was found in the transcript (order-preserving). */
  hit: boolean
}

export type ShadowGrade = 'great' | 'pass' | 'retry'

export type ShadowResult = {
  /** Matched reference tokens / total reference tokens, 0..1. */
  score: number
  grade: ShadowGrade
  /** Reference sentence split into word/gap segments with hit marks. */
  reference: ShadowSegment[]
  /** Transcript words with hit marks (gaps omitted — ASR text has no styling to preserve). */
  spoken: ShadowSegment[]
  matched: number
  total: number
  /** True when the transcript contains no English words at all. */
  noSpeech: boolean
}

export const SHADOW_PASS = 0.5
export const SHADOW_GREAT = 0.8

// Contractions expand to the words a speech recognizer usually emits, so
// "don't" in the lesson matches "do not" in the transcript and vice versa.
// Keys are lowercase, apostrophe-less variants included (ASR often drops it).
const CONTRACTIONS: Record<string, string[]> = {
  "ain't": ['not'], "aren't": ['are', 'not'], "can't": ['can', 'not'],
  "couldn't": ['could', 'not'], "didn't": ['do', 'not'], "doesn't": ['do', 'not'],
  "don't": ['do', 'not'], "hadn't": ['have', 'not'], "hasn't": ['have', 'not'],
  "haven't": ['have', 'not'], "isn't": ['be', 'not'], "mustn't": ['must', 'not'],
  "shouldn't": ['should', 'not'], "wasn't": ['be', 'not'], "weren't": ['be', 'not'],
  "won't": ['will', 'not'], "wouldn't": ['would', 'not'],
  "i'm": ['i', 'be'], "i've": ['i', 'have'], "i'll": ['i', 'will'], "i'd": ['i', 'would'],
  "you're": ['you', 'be'], "you've": ['you', 'have'], "you'll": ['you', 'will'], "you'd": ['you', 'would'],
  "he's": ['he', 'be'], "he'll": ['he', 'will'], "he'd": ['he', 'would'],
  "she's": ['she', 'be'], "she'll": ['she', 'will'], "she'd": ['she', 'would'],
  "it's": ['it', 'be'], "it'll": ['it', 'will'],
  "we're": ['we', 'be'], "we've": ['we', 'have'], "we'll": ['we', 'will'], "we'd": ['we', 'would'],
  "they're": ['they', 'be'], "they've": ['they', 'have'], "they'll": ['they', 'will'], "they'd": ['they', 'would'],
  "that's": ['that', 'be'], "there's": ['there', 'be'], "here's": ['here', 'be'],
  "what's": ['what', 'be'], "who's": ['who', 'be'], "where's": ['where', 'be'],
  "how's": ['how', 'be'], "let's": ['let', 'us'],
  cannot: ['can', 'not'], gonna: ['go', 'to'], wanna: ['want', 'to'], gotta: ['get', 'to'],
}
// Apostrophe-less fallbacks ("dont" → same expansion as "don't") — but ONLY
// where the bare form is not a real English word. "we'll"→"well", "we're"→
// "were", "it's"→"its", "i'd"→"id", "she'd"→"shed" etc. would hijack ordinary
// words and hand out false credit (or false misses) for sentences containing
// them, so those stay apostrophe-only.
const BARE_UNSAFE = new Set(['well', 'were', 'its', 'ill', 'id', 'hell', 'shell', 'wed', 'shed', 'lets'])
for (const key of Object.keys(CONTRACTIONS)) {
  const bare = key.replace(/'/g, '')
  if (bare !== key && !(bare in CONTRACTIONS) && !BARE_UNSAFE.has(bare)) CONTRACTIONS[bare] = CONTRACTIONS[key]
}

// Common irregular forms → base. Enough for A1-B1 course vocabulary; regular
// inflections are handled by the suffix rules below.
const IRREGULAR: Record<string, string> = {
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  has: 'have', had: 'have', having: 'have',
  does: 'do', did: 'do', done: 'do',
  went: 'go', gone: 'go', goes: 'go',
  said: 'say', says: 'say', saw: 'see', seen: 'see',
  came: 'come', got: 'get', gotten: 'get', gave: 'give', given: 'give',
  took: 'take', taken: 'take', made: 'make', knew: 'know', known: 'know',
  thought: 'think', found: 'find', told: 'tell', felt: 'feel', left: 'leave',
  met: 'meet', paid: 'pay', bought: 'buy', brought: 'bring', taught: 'teach',
  caught: 'catch', sat: 'sit', stood: 'stand', ran: 'run', ate: 'eat', eaten: 'eat',
  spoke: 'speak', spoken: 'speak', wrote: 'write', written: 'write',
  read: 'read', heard: 'hear', held: 'hold', kept: 'keep', slept: 'sleep',
  sent: 'send', spent: 'spend', built: 'build', lost: 'lose', won: 'win',
  wore: 'wear', worn: 'wear', drove: 'drive', driven: 'drive',
  flew: 'fly', flown: 'fly', drank: 'drink', drunk: 'drink', sang: 'sing',
  swam: 'swim', began: 'begin', begun: 'begin', broke: 'break', broken: 'break',
  chose: 'choose', chosen: 'choose', forgot: 'forget', forgotten: 'forget',
  understood: 'understand', woke: 'wake', woken: 'wake',
  men: 'man', women: 'woman', children: 'child', people: 'person',
  feet: 'foot', teeth: 'tooth', mice: 'mouse',
  better: 'good', best: 'good', worse: 'bad', worst: 'bad', more: 'many', most: 'many',
  an: 'a',
}

/** Light stemmer for regular inflections: plurals, -ed, -ing, possessives. */
function stem(word: string): string {
  let w = word
  if (w.endsWith("'s")) w = w.slice(0, -2)
  if (w.length <= 3) return w
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y'
  if (w.endsWith('sses') || w.endsWith('shes') || w.endsWith('ches') || w.endsWith('xes')) {
    return w.slice(0, -2)
  }
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) {
    return w.slice(0, -1)
  }
  for (const [suffix, min] of [['ing', 5], ['ed', 4]] as const) {
    if (w.endsWith(suffix) && w.length >= min + 1) {
      let base = w.slice(0, -suffix.length)
      // doubled final consonant: running → run, stopped → stop
      if (base.length >= 3 && base[base.length - 1] === base[base.length - 2]
        && !'aeiou'.includes(base[base.length - 1])) {
        base = base.slice(0, -1)
      }
      return base
    }
  }
  return w
}

// ASR engines write times and counts as digits ("at 7", "7:30") while lesson
// text spells them out — normalize digit tokens to number words so a correct
// reading is never marked as a miss. 0–99 covers A1–B1 course content; bigger
// numbers fall through as literal digit strings.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function numberWords(digits: string): string[] {
  const n = Number(digits)
  if (n < 20) return [ONES[n]]
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)]
    return n % 10 === 0 ? [tens] : [tens, ONES[n % 10]]
  }
  return [digits]
}

/** Normalize one raw word into the token(s) used for matching. */
function normalize(raw: string): string[] {
  if (/^\d+$/.test(raw)) return numberWords(raw)
  const lower = raw.toLowerCase()
  const expanded = CONTRACTIONS[lower]
  if (expanded) return expanded.map((t) => IRREGULAR[t] ?? t)
  const w = lower.replace(/'/g, '')
  return [IRREGULAR[w] ?? stem(w)]
}

type Token = { norm: string; wordIndex: number }

const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)?|\d+/g

/** Split text into word/gap segments and a normalized token stream. */
function tokenize(text: string): { segments: ShadowSegment[]; tokens: Token[] } {
  const segments: ShadowSegment[] = []
  const tokens: Token[] = []
  let cursor = 0
  let wordIndex = -1
  for (const m of text.matchAll(WORD_RE)) {
    if (m.index > cursor) segments.push({ text: text.slice(cursor, m.index), word: false, hit: false })
    wordIndex = segments.length
    segments.push({ text: m[0], word: true, hit: false })
    for (const norm of normalize(m[0])) tokens.push({ norm, wordIndex })
    cursor = m.index + m[0].length
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), word: false, hit: false })
  return { segments, tokens }
}

/** Order-preserving alignment: LCS over the two normalized token streams. */
function lcsPairs(a: Token[], b: Token[]): Array<[number, number]> {
  const n = a.length
  const m = b.length
  // dp[i][j] = LCS length of a[i:], b[j:]
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].norm === b[j].norm
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const pairs: Array<[number, number]> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i].norm === b[j].norm) {
      pairs.push([i, j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return pairs
}

/**
 * Score a shadow-reading attempt. `reference` is the lesson sentence,
 * `transcript` is what the speech recognizer heard.
 */
export function scoreShadow(reference: string, transcript: string): ShadowResult {
  const ref = tokenize(reference)
  const spoken = tokenize(transcript)

  if (spoken.tokens.length === 0) {
    return {
      score: 0, grade: 'retry', reference: ref.segments,
      spoken: [], matched: 0, total: ref.tokens.length, noSpeech: true,
    }
  }

  const pairs = lcsPairs(ref.tokens, spoken.tokens)

  // A displayed word may expand to several tokens (contractions); count how
  // many of its tokens matched and mark it hit only when all of them did.
  const need = new Map<number, number>()
  const got = new Map<number, number>()
  for (const t of ref.tokens) need.set(t.wordIndex, (need.get(t.wordIndex) ?? 0) + 1)
  for (const [i] of pairs) {
    const w = ref.tokens[i].wordIndex
    got.set(w, (got.get(w) ?? 0) + 1)
  }
  for (const [w, count] of got) {
    if (count >= (need.get(w) ?? 1)) ref.segments[w].hit = true
  }
  for (const [, j] of pairs) spoken.segments[spoken.tokens[j].wordIndex].hit = true

  const total = ref.tokens.length
  const matched = pairs.length
  const score = total > 0 ? matched / total : 0
  const grade: ShadowGrade = score >= SHADOW_GREAT ? 'great' : score >= SHADOW_PASS ? 'pass' : 'retry'

  return {
    score, grade, reference: ref.segments,
    spoken: spoken.segments.filter((s) => s.word),
    matched, total, noSpeech: false,
  }
}

// Validate src/data/lessons.json: structure, content-quality guards (unique
// headwords per day, no HTML entities, POS in enum, IPA slash-wrapped, no
// British spellings that the normalizer should have removed).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const path = join(__dirname, '..', 'src', 'data', 'lessons.json')
const lessons = JSON.parse(readFileSync(path, 'utf8'))

const errors = []
const warnings = []
const seen = new Set()

const POS_ENUM = new Set([
  'n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'pron.', 'det.', 'num.',
  'modal', 'interj.', 'phr.', 'phr.v.',
])
const posOk = (p) => p.split('/').every((x) => POS_ENUM.has(x.trim()))
const BRIT = /\b(favourite|colour|neighbour|travelled|travelling|centre|realise|grey|practise|behaviour|flavour|theatre)\b/i

for (const l of lessons) {
  seen.add(l.day)
  const need = ['title_en', 'title_zh', 'grammarNote', 'listening', 'speaking', 'reading', 'writing']
  for (const k of need) if (!l[k]) errors.push(`Day ${l.day}: missing ${k}`)
  if (!l.vocabulary?.length) errors.push(`Day ${l.day}: no vocabulary`)
  if (!l.listening?.script) errors.push(`Day ${l.day}: no listening script`)
  if (!l.speaking?.shadowing?.length) errors.push(`Day ${l.day}: no shadowing`)
  if (!l.reading?.passage) errors.push(`Day ${l.day}: no reading passage`)

  // content-quality guards
  for (const k of ['theme', 'title_en', 'title_zh']) {
    if (typeof l[k] === 'string' && /&amp;|&lt;|&gt;/.test(l[k])) errors.push(`Day ${l.day}: HTML entity in ${k}`)
  }
  const words = new Set()
  for (const v of l.vocabulary || []) {
    const key = v.word.trim().toLowerCase()
    if (words.has(key)) errors.push(`Day ${l.day}: duplicate headword "${v.word}"`)
    words.add(key)
    if (!/^\/.*\/$/.test(v.ipa)) errors.push(`Day ${l.day}: IPA not slash-wrapped for "${v.word}" (${v.ipa})`)
    if (!posOk(v.pos)) errors.push(`Day ${l.day}: non-enum POS "${v.pos}" for "${v.word}"`)
  }
  // spelling drift (warn only — some may be intentional lexical choices)
  const en = [
    ...l.vocabulary.map((v) => v.example_en),
    l.listening.script,
    l.reading.passage,
    l.writing.modelAnswer,
  ].join(' ')
  const m = en.match(BRIT)
  if (m) warnings.push(`Day ${l.day}: British spelling "${m[0]}"`)
}
for (let d = 1; d <= 30; d++) if (!seen.has(d)) errors.push(`Missing Day ${d}`)

if (warnings.length) {
  console.warn(`⚠️  ${warnings.length} spelling warning(s):`)
  for (const w of warnings) console.warn('  - ' + w)
}
if (errors.length) {
  console.error(`❌ lessons.json has ${errors.length} issue(s):`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}

const totalVocab = lessons.reduce((s, l) => s + l.vocabulary.length, 0)
const uniq = new Set(lessons.flatMap((l) => l.vocabulary.map((v) => v.word.toLowerCase()))).size
console.log(`✅ lessons.json OK — ${lessons.length} days, ${totalVocab} vocab (${uniq} unique headwords).`)

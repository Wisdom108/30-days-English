// Validate src/data/lessons.json: 30 days present, no gaps, required sections non-empty.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const path = join(__dirname, '..', 'src', 'data', 'lessons.json')
const lessons = JSON.parse(readFileSync(path, 'utf8'))

const errors = []
const seen = new Set()

for (const l of lessons) {
  seen.add(l.day)
  const need = ['title_en', 'title_zh', 'grammarNote', 'listening', 'speaking', 'reading', 'writing']
  for (const k of need) if (!l[k]) errors.push(`Day ${l.day}: missing ${k}`)
  if (!l.vocabulary?.length) errors.push(`Day ${l.day}: no vocabulary`)
  if (!l.listening?.script) errors.push(`Day ${l.day}: no listening script`)
  if (!l.speaking?.shadowing?.length) errors.push(`Day ${l.day}: no shadowing`)
  if (!l.reading?.passage) errors.push(`Day ${l.day}: no reading passage`)
}
for (let d = 1; d <= 30; d++) if (!seen.has(d)) errors.push(`Missing Day ${d}`)

if (errors.length) {
  console.error(`❌ lessons.json has ${errors.length} issue(s):`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}

const totalVocab = lessons.reduce((s, l) => s + l.vocabulary.length, 0)
console.log(`✅ lessons.json OK — ${lessons.length} days, ${totalVocab} vocabulary items.`)

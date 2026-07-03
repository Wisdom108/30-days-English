#!/usr/bin/env node
// Generate activation codes as SQL INSERTs (prints to stdout, touches nothing).
//
//   node scripts/gen-codes.mjs [count=10] [days=365]
//
// Then load them into D1:
//   node scripts/gen-codes.mjs 10 365 > codes.sql
//   wrangler d1 execute thirty-days-en-db --remote --file=codes.sql
import { randomInt } from 'node:crypto'

const count = Math.max(1, Number(process.argv[2] || '10') || 1)
const days = Math.max(1, Number(process.argv[3] || '365') || 1)

// Unambiguous alphabet: no 0/O, no 1/I. crypto-random via randomInt.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const seg = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')

console.log(`-- ${count} activation code(s), ${days} day(s) each. Apply with:`)
console.log(`-- wrangler d1 execute thirty-days-en-db --remote --file=codes.sql`)
for (let i = 0; i < count; i++) {
  console.log(`INSERT INTO codes (code, days) VALUES ('EN30-${seg()}-${seg()}', ${days});`)
}

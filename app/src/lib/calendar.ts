import type { DayLesson } from '../types'
import { BLOCKS } from '../blocks'
import { addDays } from './srs'

// Generate an .ics calendar file with 30 daily study reminders, anchored to the
// learner's real start date. Events use FLOATING local time (no timezone), so a
// 07:00 reminder fires at 07:00 wherever the learner is — no timezone guessing.

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function stamp(iso: string, hhmmss: string): string {
  return iso.replace(/-/g, '') + 'T' + hhmmss
}

const scheduleText = BLOCKS.map((b) => `${b.slot} ${b.title_zh} (${b.minutes}′)`).join('\\n')

export function buildIcs(
  lessons: DayLesson[],
  startISO: string,
  hour = 7,
): string {
  const hh = String(hour).padStart(2, '0')
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//30 Days English//ZH//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:🚀 30天英语提升',
  ]
  const sorted = [...lessons].sort((a, b) => a.day - b.day)
  for (const l of sorted) {
    const date = addDays(startISO, l.day - 1)
    const start = stamp(date, `${hh}0000`)
    const end = stamp(date, `${hh}3000`)
    const desc = [
      `${l.title_en}`,
      `主题：${l.theme}`,
      '',
      '今日目标：',
      ...l.goals.map((g) => `• ${g}`),
      '',
      '每日五模块（听说侧重）：',
      scheduleText,
      '',
      `🔁 回顾：${l.reviewFocus}`,
      '',
      '打开 App 开始学习，坚持打卡 🔥',
    ].join('\n')
    lines.push(
      'BEGIN:VEVENT',
      `UID:30days-english-day${l.day}@local`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${esc(`🚀 Day ${l.day} · ${l.title_zh}`)}`,
      `DESCRIPTION:${esc(desc)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`Day ${l.day} 英语学习时间到！`)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadIcs(content: string, filename = '30-days-english.ics') {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

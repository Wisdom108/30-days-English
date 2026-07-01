import type { BlockMeta } from './types'

// The five daily study blocks, ordered by their scientifically-scheduled time slot.
// Listening + Speaking are the priority skills and get the most time.
export const BLOCKS: BlockMeta[] = [
  {
    key: 'listening',
    icon: '🎧',
    slot: '🌅 晨起 · 精力峰值',
    minutes: 30,
    title_zh: '精听 + 听写',
    subtitle_zh: '晨间警觉度最高，主攻新输入',
  },
  {
    key: 'vocab',
    icon: '🔤',
    slot: '☕ 晨间 · 隔夜检索',
    minutes: 20,
    title_zh: '词卡复习 (SRS)',
    subtitle_zh: '隔日检索是抗遗忘黄金点',
  },
  {
    key: 'speaking',
    icon: '🗣️',
    slot: '🌞 午间 · 主攻产出',
    minutes: 40,
    title_zh: '影子跟读 + 发音打分',
    subtitle_zh: '全天精力充沛，口语重点时段',
  },
  {
    key: 'reading',
    icon: '📖',
    slot: '🌆 傍晚 · 语境巩固',
    minutes: 25,
    title_zh: '分级阅读 + 点词查义',
    subtitle_zh: '在语境中巩固当日词汇',
  },
  {
    key: 'writing',
    icon: '✍️',
    slot: '🌙 睡前 · 睡眠巩固',
    minutes: 30,
    title_zh: '写作 + 今日新词首刷',
    subtitle_zh: '睡前记忆，睡眠期自动巩固',
  },
]

export const TOTAL_MINUTES = BLOCKS.reduce((s, b) => s + b.minutes, 0)

export const PHASE_INFO: Record<
  number,
  { name_zh: string; range: string; color: string; softBg: string; dot: string }
> = {
  1: { name_zh: '生存基础', range: 'Day 1–10', color: '#ffffff', softBg: 'rgba(255,255,255,0.10)', dot: '' },
  2: { name_zh: '日常生活', range: 'Day 11–20', color: '#8a8a8a', softBg: 'rgba(138,138,138,0.16)', dot: '' },
  3: { name_zh: '流利冲刺', range: 'Day 21–30', color: '#d6001c', softBg: 'rgba(214,0,28,0.16)', dot: '' },
}

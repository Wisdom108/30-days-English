// ---- Curriculum content types (mirror the generated lesson JSON) ----

export interface VocabItem {
  word: string
  ipa: string
  pos: string
  meaning_zh: string
  example_en: string
  example_zh: string
}

export interface GrammarExample {
  en: string
  zh: string
}

export interface GrammarNote {
  point_en: string
  explanation_zh: string
  examples: GrammarExample[]
}

export interface DictationItem {
  sentence: string // contains ____ for the blank
  answer: string
}

export interface QA {
  q: string
  a: string
}

export interface ListeningSection {
  title: string
  script: string
  dictation: DictationItem[]
  comprehension: QA[]
}

export interface ShadowingItem {
  text: string
  tip: string
}

export interface DialogueLine {
  speaker: string
  line: string
}

export interface SpeakingSection {
  targetSounds: string[]
  shadowing: ShadowingItem[]
  miniDialogue: DialogueLine[]
  speakingTask: string
}

export interface GlossaryItem {
  word: string
  meaning_zh: string
}

export interface ReadingSection {
  title: string
  passage: string
  glossary: GlossaryItem[]
  comprehension: QA[]
}

export interface WritingSection {
  prompt: string
  usefulPhrases: string[]
  modelAnswer: string
  selfCheck: string[]
}

export interface DayLesson {
  day: number
  phase: number
  theme: string
  title_en: string
  title_zh: string
  goals: string[]
  grammarNote: GrammarNote
  vocabulary: VocabItem[]
  listening: ListeningSection
  speaking: SpeakingSection
  reading: ReadingSection
  writing: WritingSection
  reviewFocus: string
  dailyTip_zh: string
}

// ---- The five daily study blocks, in scientifically-scheduled order ----
export type BlockKey = 'listening' | 'vocab' | 'speaking' | 'reading' | 'writing'

export interface BlockMeta {
  key: BlockKey
  icon: string
  slot: string // time-of-day label (Chinese)
  minutes: number
  title_zh: string
  subtitle_zh: string
}

// ---- Progress persisted in localStorage ----
export interface BlockProgress {
  listening: boolean
  vocab: boolean
  speaking: boolean
  reading: boolean
  writing: boolean
}

export interface DayProgress {
  completedBlocks: BlockProgress
  completedAt?: string // ISO date when all blocks done
}

// SM-2 spaced-repetition card state (keyed by "day:word")
export interface SrsCard {
  id: string
  word: string
  ipa: string
  meaning_zh: string
  example_en: string
  day: number
  // SM-2 fields
  repetitions: number
  interval: number // days
  easeFactor: number
  dueDate: string // ISO date (yyyy-mm-dd)
}

export interface AppState {
  startDate: string | null // ISO date the learner started day 1
  currentDay: number
  days: Record<number, DayProgress>
  cards: Record<string, SrsCard>
  streak: number
  lastStudyDate: string | null
  writings: Record<number, string> // day -> learner's written text
  guideDismissed?: boolean // whether the first-run method guide was closed
  unlockAll?: boolean // learners with a foundation can unlock all 30 days to jump ahead
}

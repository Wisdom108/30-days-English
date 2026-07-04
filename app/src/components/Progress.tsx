import { useRef, useState } from 'react'
import { Download, Upload, CalendarClock, AlertTriangle, Check, Zap, Sparkles } from 'lucide-react'
import { BlockIcon } from './blockicons'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { useApp } from '../state'
import { CURRICULUM, TOTAL_DAYS } from '../data/curriculum'
import { exportState, parseImport } from '../lib/storage'
import type { AppState } from '../types'
import { BLOCKS } from '../blocks'
import { todayISO } from '../lib/srs'
import { buildIcs, downloadIcs } from '../lib/calendar'
import { getVoiceMode, setVoiceMode, hdVoiceAvailable, type VoiceMode } from '../lib/speech'
import { Button, Cells, SectionLabel, ConfirmDialog, Select, Collapse } from './ui'
import { cn } from '../lib/utils'

const REMINDER_HOURS = [6, 7, 8, 9, 12, 18, 20, 21]

// Voice preference — system (instant, default) vs HD neural (natural, ~2s + login).
function VoiceSetting() {
  const [mode, setMode] = useState<VoiceMode>(getVoiceMode)
  const hd = hdVoiceAvailable()
  const pick = (m: VoiceMode) => { setVoiceMode(m); setMode(m) }
  const opts: { v: VoiceMode; icon: typeof Zap; title: string; sub: string; disabled?: boolean }[] = [
    { v: 'system', icon: Zap, title: '即时', sub: '手机系统语音 · 0 延迟 · 离线' },
    { v: 'hd', icon: Sparkles, title: 'HD 神经', sub: hd ? '更自然 · 约 2s · 需登录' : '需先登录后端', disabled: !hd },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {opts.map((o) => {
        const active = mode === o.v
        const Icon = o.icon
        return (
          <button
            key={o.v}
            disabled={o.disabled}
            onClick={() => pick(o.v)}
            className={cn(
              'press rounded-xl border p-3 text-left transition-colors disabled:opacity-45',
              active ? 'border-fg bg-surface-2' : 'border-border hover:border-border-strong',
            )}
          >
            <div className="flex items-center gap-1.5">
              <Icon size={14} className={active ? 'text-fg' : 'text-fg-muted'} />
              <span className="text-body font-semibold text-fg">{o.title}</span>
              {active && <Check size={13} strokeWidth={3} className="ml-auto text-fg" />}
            </div>
            <div className="mt-1 text-meta text-fg-muted">{o.sub}</div>
          </button>
        )
      })}
    </div>
  )
}

// 数据与设置页：只留 Dashboard 不画的那张图（每日模块打卡），其余是工具折叠行。
export default function Progress() {
  const { state, reset, importAll } = useApp()
  const [hour, setHour] = useState(7)
  const [pendingImport, setPendingImport] = useState<AppState | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const doExport = () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `30days-english-backup-${todayISO()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const doImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const next = parseImport(String(reader.result))
      if (!next) return setImportError('文件格式不正确，无法导入。')
      setImportError(null)
      setPendingImport(next)
    }
    reader.readAsText(file)
  }

  const matured = Object.values(state.cards).filter((c) => c.repetitions >= 2).length
  const blockCounts = BLOCKS.map((b) => ({
    ...b,
    count: Object.values(state.days).filter((d) => d.completedBlocks[b.key]).length,
  }))

  return (
    <div className="space-y-2 animate-in-up">
      <h1 className="text-title font-semibold">数据</h1>
      <p className="text-meta text-fg-muted">每日打卡明细 · 提醒 · 备份</p>
      <div className="border-b border-border pb-1" />

      {/* Skill blocks */}
      <SectionLabel>每日模块打卡</SectionLabel>
      <div className="space-y-3">
        {blockCounts.map((b) => (
          <div key={b.key}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-fg">
                <BlockIcon k={b.key} size={15} className="text-fg-secondary" />
                {b.title_zh}
              </span>
              <span className="inline-flex items-center gap-1 text-fg-muted">{b.count === TOTAL_DAYS && <Check size={13} className="text-fg" strokeWidth={3} />}<span className="t-tab">{b.count}/{TOTAL_DAYS}</span></span>
            </div>
            <Cells value={b.count} max={TOTAL_DAYS} height={7} className="mt-2" />
          </div>
        ))}
      </div>
      <p className="pt-1 text-meta text-fg-muted">
        已掌握 <span className="t-tab text-fg-secondary">{matured}</span> 张词卡（复习两次以上）
      </p>

      {/* Voice preference */}
      <SectionLabel>语音</SectionLabel>
      <VoiceSetting />

      {/* Utilities — quiet folds */}
      <div className="space-y-2 pt-4">
        <Collapse label="日历提醒" hint="导出 .ics，每天固定时间提醒">
          <div className="space-y-2.5 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-sm text-fg-muted">提醒时间</span>
              <Select
                ariaLabel="提醒时间"
                value={String(hour)}
                onValueChange={(v) => setHour(Number(v))}
                options={REMINDER_HOURS.map((h) => ({
                  value: String(h),
                  label: `${String(h).padStart(2, '0')}:00`,
                }))}
                className="w-24"
              />
              <Button onClick={() => downloadIcs(buildIcs(CURRICULUM, state.startDate || todayISO(), hour))}>
                <CalendarClock size={15} /> 导出日历提醒
              </Button>
            </div>
            <p className="text-meta text-fg-muted">
              从{state.startDate ? ` ${state.startDate} ` : '今天'}起 30 天，可导入 Google / Apple / Outlook 日历。
            </p>
          </div>
        </Collapse>

        <Collapse label="备份与恢复" hint="导出 / 导入 JSON 进度文件">
          <div className="space-y-2.5 px-5 py-4">
            <p className="text-sm text-fg-muted">
              进度存于本浏览器。换设备或清缓存前请导出备份，在新设备导入即可继续。
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Button variant="secondary" onClick={doExport}><Download size={15} /> 导出备份</Button>
              <Button variant="secondary" onClick={() => importRef.current?.click()}><Upload size={15} /> 导入备份</Button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label="导入备份文件"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) doImport(f)
                  e.target.value = ''
                }}
              />
            </div>
            {importError && <p role="alert" className="text-sm text-danger">{importError}</p>}
          </div>
        </Collapse>

        <Collapse label="危险操作" hint="清空全部进度（不可撤销）">
          <div className="px-5 py-4">
            <ConfirmDialog
              title="清空全部进度？"
              description="这将删除所有打卡记录、词卡进度和写作内容，且无法撤销。建议先导出备份。"
              confirmLabel="确认清空"
              destructive
              onConfirm={reset}
              trigger={
                <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger">
                  <AlertTriangle size={13} /> 清空全部进度
                </Button>
              }
            />
          </div>
        </Collapse>
      </div>

      {/* Import confirmation (controlled) */}
      <AlertDialogPrimitive.Root open={!!pendingImport} onOpenChange={(o) => !o && setPendingImport(null)}>
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in-up" />
          <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-popover)] data-[state=open]:animate-in-up">
            <AlertDialogPrimitive.Title className="text-h2 font-semibold text-fg">导入备份？</AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description className="mt-1.5 text-sm leading-relaxed text-fg-secondary">
              导入将覆盖当前所有进度，无法撤销。确定继续？
            </AlertDialogPrimitive.Description>
            <div className="mt-5 flex justify-end gap-2.5">
              <AlertDialogPrimitive.Cancel asChild>
                <Button variant="secondary" size="sm">取消</Button>
              </AlertDialogPrimitive.Cancel>
              <AlertDialogPrimitive.Action asChild>
                <Button size="sm" onClick={() => { if (pendingImport) importAll(pendingImport); setPendingImport(null) }}>
                  确认导入
                </Button>
              </AlertDialogPrimitive.Action>
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      </AlertDialogPrimitive.Root>
    </div>
  )
}

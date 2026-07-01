import { useState } from 'react'
import { Download, Upload, CalendarClock, AlertTriangle, Flame } from 'lucide-react'
import { BlockIcon } from './blockicons'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { useApp } from '../state'
import { CURRICULUM, TOTAL_DAYS } from '../data/curriculum'
import { isDayComplete, exportState, parseImport } from '../lib/storage'
import type { AppState } from '../types'
import { BLOCKS, PHASE_INFO } from '../blocks'
import { todayISO } from '../lib/srs'
import { buildIcs, downloadIcs } from '../lib/calendar'
import { Button, Progress as Bar, SectionLabel, ConfirmDialog } from './ui'

export default function Progress() {
  const { state, reset, importAll } = useApp()
  const [hour, setHour] = useState(7)
  const [pendingImport, setPendingImport] = useState<AppState | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

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

  const completedDays = Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).filter((d) =>
    isDayComplete(state, d),
  )
  const today = todayISO()
  const matured = Object.values(state.cards).filter((c) => c.repetitions >= 2).length
  const dueToday = Object.values(state.cards).filter((c) => c.dueDate <= today).length
  const blockCounts = BLOCKS.map((b) => ({
    ...b,
    count: Object.values(state.days).filter((d) => d.completedBlocks[b.key]).length,
  }))

  const metrics: { k: string; v: React.ReactNode }[] = [
    { k: '连续天数', v: <span className="inline-flex items-center gap-1"><Flame size={17} className="text-warning" />{state.streak}</span> },
    { k: '完成天数', v: completedDays.length },
    { k: '词卡总数', v: Object.keys(state.cards).length },
    { k: '已掌握', v: matured },
    { k: '待复习', v: dueToday },
  ]

  return (
    <div className="space-y-2 animate-in-up">
      <h1 className="text-[26px] font-semibold tracking-tight">学习进度</h1>
      <div className="border-b border-border pb-1" />

      {/* Metrics strip */}
      <div className="grid grid-cols-2 divide-x divide-border rounded-[8px] border border-border bg-surface sm:grid-cols-5">
        {metrics.map((m, i) => (
          <div key={i} className="px-3 py-4 text-center">
            <div className="text-[20px] font-semibold leading-none">{m.v}</div>
            <div className="mt-1.5 text-[11px] text-fg-muted">{m.k}</div>
          </div>
        ))}
      </div>
      {state.startDate && <p className="pt-1 text-[12px] text-fg-muted">开始日期：{state.startDate}</p>}

      {/* Phase progress */}
      <SectionLabel>各阶段完成度</SectionLabel>
      <div className="space-y-3.5">
        {Object.entries(PHASE_INFO).map(([k, v]) => {
          const days = CURRICULUM.filter((l) => l.phase === Number(k)).map((l) => l.day)
          const doneCount = days.filter((d) => completedDays.includes(d)).length
          const pct = days.length ? Math.round((doneCount / days.length) * 100) : 0
          return (
            <div key={k}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: v.color }} />
                  <span className="font-medium text-fg">阶段 {k}</span>
                  <span className="text-fg-muted">{v.name_zh} · {v.range}</span>
                </span>
                <span className="text-fg-muted">{doneCount}/{days.length}</span>
              </div>
              <Bar value={pct} color={v.color} className="mt-1.5" />
            </div>
          )
        })}
      </div>

      {/* Skill progress */}
      <SectionLabel>四项技能打卡</SectionLabel>
      <div className="space-y-3">
        {blockCounts.map((b) => (
          <div key={b.key}>
            <div className="flex items-center justify-between text-[13px]">
              <span className="flex items-center gap-2">
                <BlockIcon k={b.key} size={15} className="text-fg-secondary" />
                {b.title_zh}
              </span>
              <span className="text-fg-muted">{b.count === TOTAL_DAYS ? '✓ ' : ''}{b.count}/{TOTAL_DAYS}</span>
            </div>
            <Bar value={Math.round((b.count / TOTAL_DAYS) * 100)} className="mt-1.5" />
          </div>
        ))}
      </div>

      {/* Calendar companion */}
      <SectionLabel>每日定时陪跑 · 日历提醒</SectionLabel>
      <p className="text-[13px] text-fg-muted">
        导出 30 天每日提醒，导入 Google / Apple / Outlook 日历即可定时提醒（从
        {state.startDate ? ` ${state.startDate}` : '今天'} 起 30 天）。
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2.5">
        <span className="text-[13px] text-fg-muted">提醒时间</span>
        <select
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          className="rounded-[8px] border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand"
        >
          {[6, 7, 8, 9, 12, 18, 20, 21].map((h) => (
            <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
          ))}
        </select>
        <Button onClick={() => downloadIcs(buildIcs(CURRICULUM, state.startDate || todayISO(), hour))}>
          <CalendarClock size={15} /> 导出日历 (.ics)
        </Button>
      </div>

      {/* Backup */}
      <SectionLabel>进度备份 / 恢复</SectionLabel>
      <p className="text-[13px] text-fg-muted">
        进度存于本浏览器。换设备或清缓存前请导出备份，在新设备导入即可继续。
      </p>
      <div className="mt-2 flex flex-wrap gap-2.5">
        <Button variant="secondary" onClick={doExport}><Download size={15} /> 导出备份</Button>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[8px] border border-border bg-surface px-4 text-[14px] font-medium text-fg transition-colors hover:bg-hover">
          <Upload size={15} /> 导入备份
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) doImport(f)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {importError && <p className="text-[12px] text-danger">{importError}</p>}

      <div className="pt-4">
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

      {/* Import confirmation (controlled) */}
      <AlertDialogPrimitive.Root open={!!pendingImport} onOpenChange={(o) => !o && setPendingImport(null)}>
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[1px] data-[state=open]:animate-in-up" />
          <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-border bg-surface p-5 shadow-[var(--shadow-popover)] data-[state=open]:animate-in-up">
            <AlertDialogPrimitive.Title className="text-[16px] font-semibold">导入备份？</AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description className="mt-1.5 text-[13px] leading-relaxed text-fg-secondary">
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

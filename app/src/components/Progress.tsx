import { useState } from 'react'
import { Download, Upload, CalendarClock, AlertTriangle } from 'lucide-react'
import { useApp } from '../state'
import { CURRICULUM, TOTAL_DAYS } from '../data/curriculum'
import { isDayComplete, exportState, parseImport } from '../lib/storage'
import { BLOCKS, PHASE_INFO } from '../blocks'
import { todayISO } from '../lib/srs'
import { buildIcs, downloadIcs } from '../lib/calendar'
import { Button, Card, CardBody, Progress as Bar } from './ui'

export default function Progress() {
  const { state, reset, importAll } = useApp()
  const [hour, setHour] = useState(7)

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
      if (!next) return alert('导入失败：文件格式不正确。')
      if (confirm('导入将覆盖当前进度，确定继续？')) importAll(next)
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

  return (
    <div className="space-y-4">
      <Card className="animate-in-up">
        <CardBody>
          <h2 className="text-[16px]">📈 学习进度</h2>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            <Metric v={`🔥 ${state.streak}`} k="连续天数" />
            <Metric v={completedDays.length} k="完成天数" />
            <Metric v={Object.keys(state.cards).length} k="词卡总数" />
            <Metric v={matured} k="已掌握词" />
            <Metric v={dueToday} k="待复习" />
          </div>
          {state.startDate && <p className="mt-3 text-[12px] text-fg-dim">开始日期：{state.startDate}</p>}
        </CardBody>
      </Card>

      <Card className="animate-in-up">
        <CardBody>
          <h2 className="text-[16px]">🧭 各阶段完成度</h2>
          <div className="mt-3 space-y-3.5">
            {Object.entries(PHASE_INFO).map(([k, v]) => {
              const days = CURRICULUM.filter((l) => l.phase === Number(k)).map((l) => l.day)
              const doneCount = days.filter((d) => completedDays.includes(d)).length
              const pct = days.length ? Math.round((doneCount / days.length) * 100) : 0
              return (
                <div key={k}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span><b style={{ color: v.color }}>阶段 {k}</b> <span className="text-fg-muted">{v.name_zh} · {v.range}</span></span>
                    <span className="text-fg-dim">{doneCount}/{days.length}</span>
                  </div>
                  <Bar value={pct} className="mt-1.5" />
                </div>
              )
            })}
          </div>
        </CardBody>
      </Card>

      <Card className="animate-in-up">
        <CardBody>
          <h2 className="text-[16px]">🎯 四项技能打卡</h2>
          <div className="mt-3 space-y-3">
            {blockCounts.map((b) => (
              <div key={b.key}>
                <div className="flex items-center justify-between text-[13px]">
                  <span>{b.icon} {b.title_zh}</span>
                  <span className="text-fg-dim">{b.count}/{TOTAL_DAYS}</span>
                </div>
                <Bar value={Math.round((b.count / TOTAL_DAYS) * 100)} className="mt-1.5" />
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card className="animate-in-up">
        <CardBody>
          <div className="flex items-center gap-2">
            <CalendarClock size={17} className="text-brand" />
            <h2 className="text-[16px]">每日定时陪跑 · 日历提醒</h2>
          </div>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            导出 30 天每日提醒，导入 Google / Apple / Outlook 日历即可定时提醒（从
            {state.startDate ? ` ${state.startDate}` : '今天'} 起 30 天）。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <span className="text-[13px] text-fg-muted">提醒时间</span>
            <select
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-brand"
            >
              {[6, 7, 8, 9, 12, 18, 20, 21].map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
            <Button onClick={() => downloadIcs(buildIcs(CURRICULUM, state.startDate || todayISO(), hour))}>
              <Download size={15} /> 导出日历 (.ics)
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="animate-in-up">
        <CardBody>
          <h2 className="text-[16px]">💾 进度备份 / 恢复</h2>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            进度存于本浏览器。换设备或清缓存前请导出备份，在新设备导入即可继续。
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Button variant="secondary" onClick={doExport}><Download size={15} /> 导出备份</Button>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[8px] border border-border bg-surface-2 px-4 text-sm font-medium text-fg transition-colors hover:bg-elevated">
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
        </CardBody>
      </Card>

      <div className="text-center">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] text-danger/80 transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <AlertTriangle size={13} /> 清空全部进度
        </button>
      </div>
    </div>
  )
}

function Metric({ v, k }: { v: React.ReactNode; k: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2.5 text-center">
      <div className="text-[18px] font-semibold leading-none">{v}</div>
      <div className="mt-1 text-[11px] text-fg-dim">{k}</div>
    </div>
  )
}

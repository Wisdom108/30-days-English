export default function BlockFooter({
  done,
  onComplete,
}: {
  done: boolean
  onComplete: () => void
}) {
  return (
    <div className="row spread" style={{ marginTop: 20 }}>
      {done ? (
        <span className="pill" style={{ color: '#86efac', borderColor: '#22c55e55' }}>✓ 本模块已完成</span>
      ) : (
        <span className="small muted">完成后点击右侧按钮打卡</span>
      )}
      <button onClick={onComplete} disabled={done} style={{ background: done ? 'var(--card-2)' : undefined }}>
        {done ? '已打卡 ✓' : '标记完成 ✓'}
      </button>
    </div>
  )
}

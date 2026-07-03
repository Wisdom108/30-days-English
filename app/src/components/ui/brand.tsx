// 5x7 dot-matrix bitmaps — the same glyphs as the app icon / favicon, so the
// dot-matrix "30" mark is identical across favicon, PWA icon and in-app header.
const GLYPHS: Record<string, string[]> = {
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
}

/** Inline dot-matrix "30" mark with a single red full-stop dot. */
export function LogoMark({ size = 28, tile = true }: { size?: number; tile?: boolean }) {
  const cols = 11 // '3'(5) + gap(1) + '0'(5)
  const rows = 7
  const pad = tile ? 2.4 : 0.6
  const vb = 24
  const bw = vb - pad * 2
  const cell = Math.min(bw / cols, (vb - pad * 2) / rows)
  const gridW = cols * cell
  const gridH = rows * cell
  const ox = (vb - gridW) / 2
  const oy = (vb - gridH) / 2
  const r = cell * 0.4
  const dots: { x: number; y: number }[] = []
  ;['3', '0'].forEach((ch, ci) => {
    const pat = GLYPHS[ch]
    const colOff = ci * 6
    for (let ry = 0; ry < rows; ry++)
      for (let rx = 0; rx < 5; rx++)
        if (pat[ry][rx] === '1')
          dots.push({ x: ox + (colOff + rx + 0.5) * cell, y: oy + (ry + 0.5) * cell })
  })
  const dotR = cell * 0.55
  const dcx = ox + gridW - dotR
  const dcy = oy + gridH + cell * 0.55

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${vb} ${vb}`}
      aria-hidden="true"
      className="shrink-0"
    >
      {tile && <rect width={vb} height={vb} rx={5.5} fill="var(--color-bg)" stroke="var(--color-border-strong)" strokeWidth={0.6} />}
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={r} fill="var(--color-fg)" />
      ))}
      <circle cx={dcx} cy={dcy} r={dotR} fill="var(--color-red)" />
    </svg>
  )
}


import { useRef, useState } from 'react'
import { useStore, haptic } from '../state/store'
import { KIT_MAP, KITS } from '../audio/kits'

export default function Header() {
  const name = useStore((s) => s.project.name)
  const bpm = useStore((s) => s.project.bpm)
  const kitId = useStore((s) => s.project.kitId)
  const setName = useStore((s) => s.setName)
  const setBpm = useStore((s) => s.setBpm)
  const setSheet = useStore((s) => s.setSheet)
  const kit = KIT_MAP[kitId] ?? KITS[0]

  const [editingName, setEditingName] = useState(false)
  const taps = useRef<number[]>([])
  const drag = useRef<{ y: number; bpm: number; moved: boolean } | null>(null)

  const onBpmDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, bpm, moved: false }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onBpmMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = d.y - e.clientY
    if (Math.abs(dy) > 6) d.moved = true
    if (d.moved) setBpm(d.bpm + Math.round(dy / 3))
  }
  const onBpmUp = () => {
    const d = drag.current
    drag.current = null
    if (d && !d.moved) {
      // tap tempo
      const now = performance.now()
      taps.current = taps.current.filter((t) => now - t < 2200)
      taps.current.push(now)
      haptic(6)
      if (taps.current.length >= 3) {
        const ts = taps.current
        const avg = (ts[ts.length - 1] - ts[0]) / (ts.length - 1)
        setBpm(Math.round(60000 / avg))
      }
    }
  }

  return (
    <header className="header">
      {editingName ? (
        <input
          className="name-input"
          autoFocus
          defaultValue={name}
          maxLength={40}
          onBlur={(e) => {
            setName(e.target.value || name)
            setEditingName(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <button className="name" onClick={() => setEditingName(true)} aria-label="Rename beat">
          {name}
        </button>
      )}
      <div className="header-controls">
        <button className="chip" onClick={() => setSheet('projects')} aria-label="Beats library">
          ≡
        </button>
        <button className="chip kit-chip" onClick={() => setSheet('kit')} aria-label="Change kit">
          <span className="kit-dot" />
          {kit.name}
        </button>
        <button
          className="chip bpm-chip"
          onPointerDown={onBpmDown}
          onPointerMove={onBpmMove}
          onPointerUp={onBpmUp}
          onPointerCancel={onBpmUp}
          aria-label={`Tempo ${bpm} BPM — tap for tap-tempo, drag to adjust`}
        >
          {bpm}
        </button>
        <button className="chip chip-accent" onClick={() => setSheet('share')} aria-label="Share beat">
          ↗
        </button>
      </div>
    </header>
  )
}

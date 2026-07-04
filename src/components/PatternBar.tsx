import { useRef } from 'react'
import { useStore, haptic } from '../state/store'

const NAMES = ['A', 'B', 'C', 'D']

export default function PatternBar() {
  const current = useStore((s) => s.project.current)
  const playingPattern = useStore((s) => s.playingPattern)
  const chainOn = useStore((s) => s.project.chainOn)
  const playing = useStore((s) => s.playing)
  const patterns = useStore((s) => s.project.patterns)
  const selectPattern = useStore((s) => s.selectPattern)
  const copyPatternTo = useStore((s) => s.copyPatternTo)
  const toggleChain = useStore((s) => s.toggleChain)
  const setSheet = useStore((s) => s.setSheet)
  const holdTimer = useRef<number | null>(null)
  const held = useRef(false)

  const hasContent = (i: number) => patterns[i].tracks.some((t) => t.steps.some((s) => s.on))

  const down = (i: number) => () => {
    held.current = false
    holdTimer.current = window.setTimeout(() => {
      held.current = true
      // hold an empty slot: copy the current pattern into it — instant song building
      if (i !== current) {
        copyPatternTo(i)
        haptic(20)
      }
    }, 500)
  }
  const up = (i: number) => () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
    if (!held.current) {
      selectPattern(i)
      haptic(8)
    }
  }

  return (
    <div className="pattern-bar">
      {NAMES.map((n, i) => (
        <button
          key={n}
          className={[
            'pat',
            i === current ? 'sel' : '',
            playing && i === playingPattern ? 'live' : '',
            hasContent(i) ? 'filled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onPointerDown={down(i)}
          onPointerUp={up(i)}
          onPointerCancel={up(i)}
          aria-label={`Pattern ${n}${i === current ? ', selected' : ''} — hold to copy current pattern here`}
        >
          {n}
        </button>
      ))}
      <button
        className={`chip${chainOn ? ' chip-accent' : ''}`}
        onClick={() => {
          toggleChain()
          haptic(10)
        }}
        aria-label="Chain patterns into a song"
      >
        Chain
      </button>
      <div className="spacer" />
      <button className="chip" onClick={() => setSheet('mixer')} aria-label="Mixer and FX">
        Mix
      </button>
    </div>
  )
}

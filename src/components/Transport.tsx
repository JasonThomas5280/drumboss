import { useRef } from 'react'
import { useStore, haptic } from '../state/store'

export default function Transport() {
  const playing = useStore((s) => s.playing)
  const swing = useStore((s) => s.project.swing)
  const mode = useStore((s) => s.mode)
  const togglePlay = useStore((s) => s.togglePlay)
  const dice = useStore((s) => s.dice)
  const setSwing = useStore((s) => s.setSwing)
  const setMode = useStore((s) => s.setMode)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)

  const diceTimer = useRef<number | null>(null)
  const diceHeld = useRef(false)

  const diceDown = () => {
    diceHeld.current = false
    diceTimer.current = window.setTimeout(() => {
      diceHeld.current = true
      dice(true) // hold = re-roll only hats & percs, keep your foundation
    }, 450)
  }
  const diceUp = () => {
    if (diceTimer.current) window.clearTimeout(diceTimer.current)
    if (!diceHeld.current) dice(false)
  }

  return (
    <div className="transport">
      <button
        className={`play${playing ? ' playing' : ''}`}
        onClick={() => {
          togglePlay()
          haptic(12)
        }}
        aria-label={playing ? 'Stop' : 'Play'}
      >
        {playing ? '■' : '▶'}
      </button>
      <button
        className="dice"
        onPointerDown={diceDown}
        onPointerUp={diceUp}
        onPointerCancel={diceUp}
        aria-label="Dice — new groove. Hold to re-roll only the fills."
      >
        🎲
      </button>
      <label className="swing" aria-label="Swing">
        <span>swing</span>
        <input
          type="range"
          min={0}
          max={0.75}
          step={0.01}
          value={swing}
          onChange={(e) => setSwing(Number(e.target.value))}
        />
      </label>
      <button
        className={`chip${mode === 'pads' ? ' chip-accent' : ''}`}
        onClick={() => {
          setMode(mode === 'grid' ? 'pads' : 'grid')
          haptic(10)
        }}
        aria-label="Toggle perform pads"
      >
        Pads
      </button>
      <button className="chip" onClick={undo} aria-label="Undo">
        ↶
      </button>
      <button className="chip" onClick={redo} aria-label="Redo">
        ↷
      </button>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { ROLE_LABELS, type Role } from '../model'
import { KIT_MAP, KITS } from '../audio/kits'
import { useStore, haptic } from '../state/store'
import { engine } from '../audio/engine'

const SOUND_ROLES: Role[] = ['kick', 'snare', 'hatC', 'hatO', 'perc1', 'perc2', 'bass', 'loop']
const REPEATS = [
  { label: 'off', div: 0 },
  { label: '1/8', div: 2 },
  { label: '1/16', div: 1 },
  { label: '1/32', div: 0.5 },
]

/** velocity from tap position: dead center = 1, edges ≈ 0.55 */
function velFromEvent(e: React.PointerEvent): number {
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2)
  const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2)
  const d = Math.min(1, Math.hypot(dx, dy))
  return 1 - d * 0.45
}

export default function PadMode() {
  const kitId = useStore((s) => s.project.kitId)
  const playing = useStore((s) => s.playing)
  const bpm = useStore((s) => s.project.bpm)
  const recording = useStore((s) => s.recording)
  const setRecording = useStore((s) => s.setRecording)
  const recordHit = useStore((s) => s.recordHit)
  const kit = KIT_MAP[kitId] ?? KITS[0]
  const [repeatDiv, setRepeatDiv] = useState(0)
  const fallbackTimer = useRef<number | null>(null)

  // 8 bass-note pads: two deep sub notes below the root, then the kit's scale
  const bassNotes = [kit.scale[3] - 12, kit.scale[4] - 12, ...kit.scale].slice(0, 8)

  useEffect(() => () => stopRepeat(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const stopRepeat = () => {
    engine.setRepeat(null)
    if (fallbackTimer.current) {
      window.clearInterval(fallbackTimer.current)
      fallbackTimer.current = null
    }
  }

  const hit = (role: Role, vel: number, pitch: number) => {
    engine.trigger(role, vel, pitch)
    if (recording) recordHit(role, vel, pitch)
    haptic(8)
  }

  const padDown = (role: Role, pitch: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    const vel = velFromEvent(e)
    hit(role, vel, pitch)
    if (repeatDiv > 0) {
      if (playing) {
        // sample-tight: the sequencer's scheduler plays the repeats
        engine.setRepeat({ role, vel, pitch, div: repeatDiv })
      } else {
        const ms = ((60 / bpm / 4) * repeatDiv || 60 / bpm / 8) * 1000
        fallbackTimer.current = window.setInterval(() => hit(role, vel * 0.85, pitch), ms)
      }
    }
  }
  const padUp = () => stopRepeat()

  return (
    <div className="pads-wrap">
      <div className="pads" role="group" aria-label="Perform pads">
        {SOUND_ROLES.map((role) => (
          <button
            key={role}
            className="pad"
            onPointerDown={padDown(role, 0)}
            onPointerUp={padUp}
            onPointerCancel={padUp}
            onPointerLeave={padUp}
            aria-label={`Pad ${ROLE_LABELS[role]}`}
          >
            {ROLE_LABELS[role]}
          </button>
        ))}
        {bassNotes.map((n, i) => (
          <button
            key={`b${i}`}
            className="pad pad-bass"
            onPointerDown={padDown('bass', n)}
            onPointerUp={padUp}
            onPointerCancel={padUp}
            onPointerLeave={padUp}
            aria-label={`808 note ${n >= 0 ? '+' : ''}${n}`}
          >
            {n === 0 ? '808' : n > 0 ? `+${n}` : n}
          </button>
        ))}
      </div>
      <div className="pad-side">
        <button
          className={`chip rec${recording ? ' armed' : ''}`}
          onClick={() => {
            setRecording(!recording)
            haptic(12)
          }}
          aria-label="Record pad hits into the pattern"
        >
          ●{recording ? ' REC' : ' rec'}
        </button>
        {REPEATS.map((r) => (
          <button
            key={r.label}
            className={`chip${repeatDiv === r.div ? ' chip-accent' : ''}`}
            onClick={() => setRepeatDiv(r.div)}
            aria-label={`Note repeat ${r.label}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {recording && !playing && <div className="rec-hint">Press ▶ to record your taps into the loop</div>}
    </div>
  )
}

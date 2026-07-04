import { useEffect, useRef } from 'react'
import { ROLES, ROLE_LABELS, type Role } from '../model'
import { useStore, haptic } from '../state/store'
import { engine } from '../audio/engine'

const HOLD_MS = 450

export default function Grid() {
  const pattern = useStore((s) => s.project.patterns[s.project.current])
  const currentStep = useStore((s) => s.currentStep)
  const playingCurrent = useStore((s) => s.playingPattern === s.project.current)
  const toggleStep = useStore((s) => s.toggleStep)
  const setEditing = useStore((s) => s.setEditing)
  const setTrackSheet = useStore((s) => s.setTrackSheet)
  const hintsSeen = useStore((s) => s.hintsSeen)
  const markHintsSeen = useStore((s) => s.markHintsSeen)

  const rootRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{
    t: number
    s: number
    paint: boolean
    painted: boolean
    timer: number
  } | null>(null)

  // hit blooms: direct DOM class flips driven by engine events — no re-render
  useEffect(() => {
    const onHit = (e: Event) => {
      const { role, step } = (e as CustomEvent).detail as { role: Role; step?: number }
      if (typeof step !== 'number') return
      const cell = rootRef.current?.querySelector(`[data-cell="${ROLES.indexOf(role)}-${step}"]`)
      if (cell) {
        cell.classList.remove('bloom')
        void (cell as HTMLElement).offsetWidth
        cell.classList.add('bloom')
      }
      const label = rootRef.current?.querySelector(`[data-label="${ROLES.indexOf(role)}"]`)
      if (label) {
        label.classList.remove('bloom')
        void (label as HTMLElement).offsetWidth
        label.classList.add('bloom')
      }
    }
    window.addEventListener('db:hit', onHit)
    return () => window.removeEventListener('db:hit', onHit)
  }, [])

  const cancelHold = () => {
    if (gesture.current) window.clearTimeout(gesture.current.timer)
  }

  const onCellDown = (t: number, s: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    const wasOn = pattern.tracks[t].steps[s].on
    if (!hintsSeen) markHintsSeen()
    toggleStep(t, s)
    haptic(8)
    const timer = window.setTimeout(() => {
      // hold: open the step editor (the step is on by now either way)
      if (!wasOn) {
        // we just turned it on — keep it on and edit
      } else {
        // we toggled it off; holding means "edit", so restore it
        toggleStep(t, s, true)
      }
      setEditing([t, s])
      haptic(15)
      gesture.current = null
    }, HOLD_MS)
    gesture.current = { t, s, paint: !wasOn, painted: false, timer }
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

  const onGridMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g) return
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const cell = el?.closest('[data-cell]') as HTMLElement | null
    if (!cell) return
    const [t, s] = cell.dataset.cell!.split('-').map(Number)
    if (t === g.t && s === g.s) return
    // finger moved to a new cell: this is a paint, not a hold
    cancelHold()
    g.painted = true
    g.t = t
    g.s = s
    toggleStep(t, s, g.paint)
    haptic(5)
  }

  const onGridUp = () => {
    cancelHold()
    gesture.current = null
  }

  const onLabelDown = (t: number) => () => {
    engine.trigger(ROLES[t])
    haptic(8)
    const timer = window.setTimeout(() => {
      setTrackSheet(t)
      haptic(15)
      gesture.current = null
    }, HOLD_MS)
    gesture.current = { t, s: -1, paint: false, painted: false, timer }
  }

  return (
    <div
      className="grid"
      ref={rootRef}
      onPointerMove={onGridMove}
      onPointerUp={onGridUp}
      onPointerCancel={onGridUp}
      role="grid"
      aria-label="Step sequencer"
    >
      {!hintsSeen && (
        <div className="hints" onClick={markHintsSeen}>
          Tap squares to make heat · hold one for power · 🎲 rolls a fresh groove
        </div>
      )}
      {pattern.tracks.map((track, t) => (
        <div className="row" key={t}>
          <button
            className={`label${track.mute ? ' muted' : ''}${track.solo ? ' soloed' : ''}`}
            data-label={t}
            onPointerDown={onLabelDown(t)}
            onPointerUp={onGridUp}
            aria-label={`${ROLE_LABELS[track.role]} — tap to hear, hold for options`}
          >
            {ROLE_LABELS[track.role]}
            {track.sound && <span className="swap-dot" title="borrowed sound" />}
          </button>
          {track.steps.map((step, s) => {
            const isNow = playingCurrent && s === currentStep
            const cls = [
              'cell',
              step.on ? 'on' : '',
              isNow ? 'now' : '',
              s % 4 === 0 ? 'beat' : '',
              step.ratchet > 1 ? 'ratchet' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={s}
                className={cls}
                data-cell={`${t}-${s}`}
                onPointerDown={onCellDown(t, s)}
                style={step.on ? { opacity: 0.45 + step.vel * 0.55 } : undefined}
                aria-label={`${ROLE_LABELS[track.role]} step ${s + 1}${step.on ? ' on' : ''}`}
              >
                {step.pitch !== 0 && step.on && (track.role === 'bass' || track.role === 'loop') && (
                  <span className="pitch-tag">{step.pitch > 0 ? `+${step.pitch}` : step.pitch}</span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

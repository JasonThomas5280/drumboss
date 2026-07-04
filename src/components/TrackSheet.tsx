import { ROLES, ROLE_LABELS } from '../model'
import { KITS } from '../audio/kits'
import { useStore, haptic } from '../state/store'
import { engine } from '../audio/engine'

export default function TrackSheet() {
  const t = useStore((s) => s.trackSheet)!
  const setTrackSheet = useStore((s) => s.setTrackSheet)
  const track = useStore((s) => s.project.patterns[s.project.current].tracks[t])
  const setVol = useStore((s) => s.setVol)
  const toggleMute = useStore((s) => s.toggleMute)
  const toggleSolo = useStore((s) => s.toggleSolo)
  const setRowSound = useStore((s) => s.setRowSound)
  const clearRow = useStore((s) => s.clearRow)
  const role = ROLES[t]

  return (
    <div className="sheet-backdrop" onClick={() => setTrackSheet(null)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">
          {ROLE_LABELS[role]}
          <button className="chip" onClick={() => setTrackSheet(null)}>Done</button>
        </div>
        <label className="slider-row">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1.2}
            step={0.02}
            value={track.vol}
            onChange={(e) => setVol(t, Number(e.target.value))}
          />
        </label>
        <div className="btn-row">
          <button className={`chip${track.mute ? ' chip-accent' : ''}`} onClick={() => toggleMute(t)}>
            Mute
          </button>
          <button className={`chip${track.solo ? ' chip-accent' : ''}`} onClick={() => toggleSolo(t)}>
            Solo
          </button>
          <button
            className="chip"
            onClick={() => {
              clearRow(t)
              haptic(10)
            }}
          >
            Clear row
          </button>
        </div>
        <div className="sheet-subtitle">Sound from</div>
        <div className="btn-row wrap">
          <button
            className={`chip${track.sound === null ? ' chip-accent' : ''}`}
            onClick={() => {
              setRowSound(t, null)
              engine.trigger(role, 1, 0, null)
            }}
          >
            Project kit
          </button>
          {KITS.map((k) => (
            <button
              key={k.id}
              className={`chip${track.sound === k.id ? ' chip-accent' : ''}`}
              onClick={() => {
                setRowSound(t, k.id)
                window.setTimeout(() => engine.trigger(role, 1, 0, k.id), 60)
              }}
            >
              {k.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

import { ROLES, ROLE_LABELS } from '../model'
import { useStore } from '../state/store'

export default function StepEditor() {
  const editing = useStore((s) => s.editing)!
  const setEditing = useStore((s) => s.setEditing)
  const updateStep = useStore((s) => s.updateStep)
  const step = useStore((s) => s.project.patterns[s.project.current].tracks[editing[0]].steps[editing[1]])
  const [t, si] = editing
  const role = ROLES[t]
  const melodic = role === 'bass' || role === 'loop'

  return (
    <div className="popover-backdrop" onClick={() => setEditing(null)}>
      <div className="step-editor" onClick={(e) => e.stopPropagation()}>
        <div className="editor-title">
          {ROLE_LABELS[role]} · step {si + 1}
          <button className="chip" onClick={() => setEditing(null)} aria-label="Done">
            Done
          </button>
        </div>
        <label className="slider-row">
          <span>Velocity</span>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.01}
            value={step.vel}
            onChange={(e) => updateStep(t, si, { vel: Number(e.target.value) })}
          />
          <b>{Math.round(step.vel * 100)}</b>
        </label>
        {melodic && (
          <label className="slider-row">
            <span>Pitch</span>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={step.pitch}
              onChange={(e) => updateStep(t, si, { pitch: Number(e.target.value) })}
            />
            <b>{step.pitch > 0 ? `+${step.pitch}` : step.pitch}</b>
          </label>
        )}
        <div className="slider-row">
          <span>Roll</span>
          <div className="seg">
            {[1, 2, 3, 4].map((r) => (
              <button
                key={r}
                className={`seg-btn${step.ratchet === r ? ' active' : ''}`}
                onClick={() => updateStep(t, si, { ratchet: r })}
              >
                {r === 1 ? '—' : `×${r}`}
              </button>
            ))}
          </div>
        </div>
        <label className="slider-row">
          <span>Nudge</span>
          <input
            type="range"
            min={-0.4}
            max={0.4}
            step={0.02}
            value={step.nudge}
            onChange={(e) => updateStep(t, si, { nudge: Number(e.target.value) })}
          />
          <b>{step.nudge === 0 ? 'on grid' : `${step.nudge > 0 ? 'late' : 'early'}`}</b>
        </label>
      </div>
    </div>
  )
}

import { useState, type ReactNode } from 'react'
import { ROLES, ROLE_LABELS } from '../model'
import { KITS, KIT_MAP } from '../audio/kits'
import { useStore, haptic, type SavedBeat } from '../state/store'
import { engine } from '../audio/engine'
import { renderProjectWav } from '../export/render'

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">
          {title}
          <button className="chip" onClick={onClose}>Done</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function KitSheet() {
  const kitId = useStore((s) => s.project.kitId)
  const setKit = useStore((s) => s.setKit)
  const setBpm = useStore((s) => s.setBpm)
  const setSheet = useStore((s) => s.setSheet)
  const playing = useStore((s) => s.playing)

  return (
    <Sheet title="Kits — swap while it plays" onClose={() => setSheet(null)}>
      <div className="kit-cards">
        {KITS.map((k) => (
          <button
            key={k.id}
            className={`kit-card${k.id === kitId ? ' sel' : ''}`}
            style={{ ['--accent' as string]: k.accent, ['--accent-soft' as string]: k.accentSoft }}
            onClick={() => {
              setKit(k.id)
              if (!playing) setBpm(k.bpm)
              haptic(12)
            }}
          >
            <span className="kit-card-dot" />
            <b>{k.name}</b>
            <small>
              {k.genre} · {k.bpm} bpm
            </small>
          </button>
        ))}
      </div>
      <p className="sheet-note">Tip: hold a track name on the grid to borrow a single sound from another kit.</p>
    </Sheet>
  )
}

export function MixerSheet() {
  const pattern = useStore((s) => s.project.patterns[s.project.current])
  const bpm = useStore((s) => s.project.bpm)
  const setVol = useStore((s) => s.setVol)
  const toggleMute = useStore((s) => s.toggleMute)
  const toggleSolo = useStore((s) => s.toggleSolo)
  const setSheet = useStore((s) => s.setSheet)

  return (
    <Sheet title="Mixer" onClose={() => setSheet(null)}>
      {pattern.tracks.map((track, t) => (
        <div className="mixer-row" key={t}>
          <span className="mixer-label">{ROLE_LABELS[ROLES[t]]}</span>
          <input
            type="range"
            min={0}
            max={1.2}
            step={0.02}
            value={track.vol}
            onChange={(e) => setVol(t, Number(e.target.value))}
            aria-label={`${ROLE_LABELS[ROLES[t]]} volume`}
          />
          <button className={`mini${track.mute ? ' active' : ''}`} onClick={() => toggleMute(t)} aria-label="Mute">
            M
          </button>
          <button className={`mini${track.solo ? ' active' : ''}`} onClick={() => toggleSolo(t)} aria-label="Solo">
            S
          </button>
        </div>
      ))}
      <div className="sheet-subtitle">Hold for FX</div>
      <div className="btn-row">
        <button
          className="fx-btn"
          onPointerDown={() => engine.filterHold(true)}
          onPointerUp={() => engine.filterHold(false)}
          onPointerCancel={() => engine.filterHold(false)}
          onPointerLeave={() => engine.filterHold(false)}
        >
          Filter dive
        </button>
        <button
          className="fx-btn"
          onPointerDown={() => engine.stutterHold(true, bpm)}
          onPointerUp={() => engine.stutterHold(false, bpm)}
          onPointerCancel={() => engine.stutterHold(false, bpm)}
          onPointerLeave={() => engine.stutterHold(false, bpm)}
        >
          Stutter
        </button>
      </div>
    </Sheet>
  )
}

export function ProjectsSheet() {
  const setSheet = useStore((s) => s.setSheet)
  const saveToLibrary = useStore((s) => s.saveToLibrary)
  const loadFromLibrary = useStore((s) => s.loadFromLibrary)
  const deleteFromLibrary = useStore((s) => s.deleteFromLibrary)
  const library = useStore((s) => s.library)
  const newProject = useStore((s) => s.newProject)
  const playDaily = useStore((s) => s.playDaily)
  const name = useStore((s) => s.project.name)
  const [, poke] = useState(0)
  const beats: SavedBeat[] = library()

  return (
    <Sheet title="Beats" onClose={() => setSheet(null)}>
      <div className="btn-row">
        <button
          className="chip chip-accent"
          onClick={() => {
            saveToLibrary()
            poke((n) => n + 1)
            haptic(12)
          }}
        >
          Save “{name}”
        </button>
        <button
          className="chip"
          onClick={() => {
            newProject()
            setSheet(null)
          }}
        >
          New beat
        </button>
        <button
          className="chip"
          onClick={() => {
            playDaily()
            setSheet(null)
            haptic(15)
          }}
        >
          ✦ Today’s seed
        </button>
      </div>
      {beats.length === 0 && <p className="sheet-note">Saved beats live here — on this device, no account needed.</p>}
      {beats.map((b) => (
        <div className="beat-row" key={b.id}>
          <button
            className="beat-load"
            onClick={() => {
              loadFromLibrary(b.id)
              setSheet(null)
            }}
          >
            <b>{b.name}</b>
            <small>
              {KIT_MAP[b.project.kitId]?.name ?? b.project.kitId} · {b.project.bpm} bpm
            </small>
          </button>
          <button
            className="mini"
            onClick={() => {
              deleteFromLibrary(b.id)
              poke((n) => n + 1)
            }}
            aria-label={`Delete ${b.name}`}
          >
            ✕
          </button>
        </div>
      ))}
    </Sheet>
  )
}

export function ShareSheet() {
  const setSheet = useStore((s) => s.setSheet)
  const shareURL = useStore((s) => s.shareURL)
  const project = useStore((s) => s.project)
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)

  const doShare = async () => {
    const url = shareURL()
    haptic(12)
    if (navigator.share) {
      try {
        await navigator.share({ title: `${project.name} — made in DrumBoss`, url })
        return
      } catch { /* user cancelled — fall through to copy */ }
    }
    await navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const doExport = async () => {
    setExporting(true)
    try {
      const blob = await renderProjectWav(project, 2)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${project.name.replace(/[^\w\- ]+/g, '')}.wav`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Sheet title="Share the heat" onClose={() => setSheet(null)}>
      <p className="sheet-note">
        The whole beat is packed into the link — no account, no upload. Whoever opens it hears your loop instantly and
        can remix it.
      </p>
      <div className="btn-row">
        <button className="chip chip-accent big" onClick={doShare}>
          {copied ? 'Link copied ✓' : 'Share link'}
        </button>
        <button className="chip big" onClick={doExport} disabled={exporting}>
          {exporting ? 'Rendering…' : 'Export .wav'}
        </button>
      </div>
    </Sheet>
  )
}

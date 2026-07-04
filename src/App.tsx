import { useEffect, useRef } from 'react'
import { useStore, drainEngineEvents, haptic } from './state/store'
import { KIT_MAP, KITS } from './audio/kits'
import Header from './components/Header'
import Grid from './components/Grid'
import PatternBar from './components/PatternBar'
import Transport from './components/Transport'
import PadMode from './components/PadMode'
import StepEditor from './components/StepEditor'
import TrackSheet from './components/TrackSheet'
import { KitSheet, MixerSheet, ProjectsSheet, ShareSheet } from './components/Sheets'

export default function App() {
  const kitId = useStore((s) => s.project.kitId)
  const mode = useStore((s) => s.mode)
  const sheet = useStore((s) => s.sheet)
  const editing = useStore((s) => s.editing)
  const trackSheet = useStore((s) => s.trackSheet)
  const fromShare = useStore((s) => s.fromShare)
  const remix = useStore((s) => s.remix)
  const play = useStore((s) => s.play)
  const togglePlay = useStore((s) => s.togglePlay)
  const kit = KIT_MAP[kitId] ?? KITS[0]
  const wrapRef = useRef<HTMLDivElement>(null)

  // one rAF loop drains scheduled engine events into playhead updates,
  // hit blooms, and the sidechain pump
  useEffect(() => {
    let raf = 0
    const loop = () => {
      drainEngineEvents()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onDuck = () => {
      el.classList.remove('pump')
      void el.offsetWidth // restart the animation
      el.classList.add('pump')
    }
    window.addEventListener('db:duck', onDuck)
    return () => window.removeEventListener('db:duck', onDuck)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest('input')) {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay])

  return (
    <div
      className="app"
      style={{ ['--accent' as string]: kit.accent, ['--accent-soft' as string]: kit.accentSoft }}
    >
      <Header />
      {fromShare && (
        <div className="share-banner" role="status">
          <span>You’re playing a shared beat</span>
          <button
            className="chip chip-accent"
            onClick={() => {
              remix()
              haptic(12)
              play()
            }}
          >
            Remix it
          </button>
        </div>
      )}
      <div className="grid-wrap" ref={wrapRef}>
        {mode === 'grid' ? <Grid /> : <PadMode />}
      </div>
      <PatternBar />
      <Transport />
      {editing && <StepEditor />}
      {trackSheet !== null && <TrackSheet />}
      {sheet === 'kit' && <KitSheet />}
      {sheet === 'mixer' && <MixerSheet />}
      {sheet === 'projects' && <ProjectsSheet />}
      {sheet === 'share' && <ShareSheet />}
    </div>
  )
}

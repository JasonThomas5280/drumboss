import { create } from 'zustand'
import {
  ROLES, cloneProject, emptyPattern, starterProject,
  type Project, type Role, type Step,
} from '../model'
import { engine } from '../audio/engine'
import { dicePattern, dailySeed } from '../audio/groove'
import { KIT_MAP, KITS } from '../audio/kits'
import { warmKit } from '../audio/synth'
import { decodeShareHash, encodeShareURL } from '../share/url'

export type SheetName = 'kit' | 'mixer' | 'projects' | 'share' | null

export interface SavedBeat {
  id: string
  name: string
  savedAt: number
  project: Project
}

interface State {
  project: Project
  playing: boolean
  mode: 'grid' | 'pads'
  sheet: SheetName
  /** step being edited in the hold-editor: [trackIdx, stepIdx] */
  editing: [number, number] | null
  trackSheet: number | null
  recording: boolean
  fromShare: boolean
  currentStep: number
  playingPattern: number
  diceSeed: number
  hintsSeen: boolean

  play: () => void
  stop: () => void
  togglePlay: () => void
  toggleStep: (t: number, s: number, on?: boolean) => void
  updateStep: (t: number, s: number, patch: Partial<Step>) => void
  clearRow: (t: number) => void
  dice: (fillsOnly?: boolean) => void
  setKit: (kitId: string) => void
  setRowSound: (t: number, kitId: string | null) => void
  setBpm: (bpm: number) => void
  setSwing: (swing: number) => void
  setName: (name: string) => void
  setVol: (t: number, vol: number) => void
  toggleMute: (t: number) => void
  toggleSolo: (t: number) => void
  selectPattern: (idx: number) => void
  copyPatternTo: (idx: number) => void
  clearPattern: (idx: number) => void
  toggleChain: () => void
  setMode: (mode: 'grid' | 'pads') => void
  setSheet: (sheet: SheetName) => void
  setEditing: (e: [number, number] | null) => void
  setTrackSheet: (t: number | null) => void
  setRecording: (r: boolean) => void
  recordHit: (role: Role, vel: number, pitch: number) => void
  undo: () => void
  redo: () => void
  shareURL: () => string
  remix: () => void
  newProject: (kitId?: string) => void
  saveToLibrary: () => void
  loadFromLibrary: (id: string) => void
  deleteFromLibrary: (id: string) => void
  library: () => SavedBeat[]
  playDaily: () => void
  markHintsSeen: () => void
}

const CURRENT_KEY = 'drumboss.current'
const LIBRARY_KEY = 'drumboss.library'
const HINTS_KEY = 'drumboss.hints'

let undoHistory: string[] = []
let redoStack: string[] = []
let saveTimer: number | undefined

function loadInitial(): { project: Project; fromShare: boolean } {
  const shared = typeof location !== 'undefined' ? decodeShareHash(location.hash) : null
  if (shared) return { project: shared, fromShare: true }
  try {
    const raw = localStorage.getItem(CURRENT_KEY)
    if (raw) return { project: JSON.parse(raw) as Project, fromShare: false }
  } catch { /* corrupted save — fall through to starter */ }
  return { project: starterProject(), fromShare: false }
}

function readLibrary(): SavedBeat[] {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]') as SavedBeat[]
  } catch {
    return []
  }
}

function writeLibrary(lib: SavedBeat[]) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib))
}

function nonEmptyPatterns(p: Project): number[] {
  const idx = p.patterns
    .map((pat, i) => (pat.tracks.some((t) => t.steps.some((s) => s.on)) ? i : -1))
    .filter((i) => i >= 0)
  return idx.length ? idx : [p.current]
}

const ADJECTIVES = ['Violet', 'Midnight', 'Golden', 'Smoky', 'Electric', 'Velvet', 'Frozen', 'Neon', 'Dusty', 'Silk']
const NOUNS = ['Bounce', 'Pocket', 'Drip', 'Groove', 'Static', 'Motion', 'Heat', 'Echo', 'Shuffle', 'Knock']

let wakeLock: { release: () => Promise<void> } | null = null
async function requestWakeLock() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }
    if (nav.wakeLock) wakeLock = await nav.wakeLock.request('screen')
  } catch { /* not supported / denied — fine */ }
}
function releaseWakeLock() {
  void wakeLock?.release().catch(() => {})
  wakeLock = null
}

export const haptic = (ms = 8) => {
  try { navigator.vibrate?.(ms) } catch { /* unsupported */ }
}

export const useStore = create<State>((set, get) => {
  const initial = loadInitial()

  const persist = (project: Project) => {
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      try { localStorage.setItem(CURRENT_KEY, JSON.stringify(project)) } catch { /* storage full */ }
    }, 400)
  }

  /** Every mutation goes through here: history push + persist. */
  const mutate = (fn: (p: Project) => void) => {
    const next = cloneProject(get().project)
    fn(next)
    undoHistory.push(JSON.stringify(get().project))
    if (undoHistory.length > 64) undoHistory.shift()
    redoStack = []
    persist(next)
    set({ project: next })
  }

  engine.bind(
    () => get().project,
    (idx) => set({ playingPattern: idx }),
  )

  return {
    project: initial.project,
    playing: false,
    mode: 'grid',
    sheet: null,
    editing: null,
    trackSheet: null,
    recording: false,
    fromShare: initial.fromShare,
    currentStep: -1,
    playingPattern: initial.project.current,
    diceSeed: (Date.now() ^ 0x9e3779b9) >>> 0,
    hintsSeen: typeof localStorage !== 'undefined' && localStorage.getItem(HINTS_KEY) === '1',

    play: () => {
      void engine.start()
      void requestWakeLock()
      set({ playing: true, playingPattern: get().project.chainOn ? get().project.chain[0] : get().project.current })
    },
    stop: () => {
      engine.stop()
      releaseWakeLock()
      set({ playing: false, currentStep: -1, recording: false })
    },
    togglePlay: () => (get().playing ? get().stop() : get().play()),

    toggleStep: (t, s, on) =>
      mutate((p) => {
        const step = p.patterns[p.current].tracks[t].steps[s]
        step.on = on ?? !step.on
        if (step.on && step.vel === 0) step.vel = 1
      }),

    updateStep: (t, s, patch) =>
      mutate((p) => {
        Object.assign(p.patterns[p.current].tracks[t].steps[s], patch)
      }),

    clearRow: (t) =>
      mutate((p) => {
        p.patterns[p.current].tracks[t].steps.forEach((s) => (s.on = false))
      }),

    dice: (fillsOnly = false) => {
      const seed = (get().diceSeed * 1664525 + 1013904223) >>> 0
      set({ diceSeed: seed })
      mutate((p) => {
        const kit = KIT_MAP[p.kitId] ?? KITS[0]
        p.patterns[p.current] = dicePattern({ seed, kit, fillsOnly, base: p.patterns[p.current] })
      })
      haptic(15)
    },

    setKit: (kitId) => {
      void warmKit(KIT_MAP[kitId] ?? KITS[0])
      mutate((p) => { p.kitId = kitId })
    },

    setRowSound: (t, kitId) => {
      if (kitId) void warmKit(KIT_MAP[kitId] ?? KITS[0])
      mutate((p) => {
        for (const pat of p.patterns) pat.tracks[t].sound = kitId
      })
    },

    setBpm: (bpm) => mutate((p) => { p.bpm = Math.round(Math.min(220, Math.max(40, bpm))) }),
    setSwing: (swing) => mutate((p) => { p.swing = Math.min(0.75, Math.max(0, swing)) }),
    setName: (name) => mutate((p) => { p.name = name.slice(0, 40) }),

    setVol: (t, vol) => {
      engine.setTrackVolume(ROLES[t], vol)
      mutate((p) => {
        for (const pat of p.patterns) pat.tracks[t].vol = vol
      })
    },
    toggleMute: (t) =>
      mutate((p) => {
        for (const pat of p.patterns) pat.tracks[t].mute = !pat.tracks[t].mute
      }),
    toggleSolo: (t) =>
      mutate((p) => {
        for (const pat of p.patterns) pat.tracks[t].solo = !pat.tracks[t].solo
      }),

    selectPattern: (idx) => mutate((p) => { p.current = idx }),
    copyPatternTo: (idx) =>
      mutate((p) => {
        p.patterns[idx] = JSON.parse(JSON.stringify(p.patterns[p.current]))
      }),
    clearPattern: (idx) => mutate((p) => { p.patterns[idx] = emptyPattern() }),
    toggleChain: () =>
      mutate((p) => {
        p.chainOn = !p.chainOn
        if (p.chainOn) p.chain = nonEmptyPatterns(p)
      }),

    setMode: (mode) => set({ mode }),
    setSheet: (sheet) => set({ sheet }),
    setEditing: (editing) => set({ editing }),
    setTrackSheet: (trackSheet) => set({ trackSheet }),
    setRecording: (recording) => set({ recording }),

    recordHit: (role, vel, pitch) => {
      const { playing, project } = get()
      if (!playing) return
      const stepIdx = engine.quantizeNow(project.bpm)
      const t = ROLES.indexOf(role)
      mutate((p) => {
        const step = p.patterns[p.current].tracks[t].steps[stepIdx]
        step.on = true
        step.vel = vel
        if (role === 'bass') step.pitch = Math.max(-12, Math.min(12, pitch))
      })
    },

    undo: () => {
      const prev = undoHistory.pop()
      if (!prev) return
      redoStack.push(JSON.stringify(get().project))
      const project = JSON.parse(prev) as Project
      persist(project)
      set({ project })
    },
    redo: () => {
      const next = redoStack.pop()
      if (!next) return
      undoHistory.push(JSON.stringify(get().project))
      const project = JSON.parse(next) as Project
      persist(project)
      set({ project })
    },

    shareURL: () => encodeShareURL(get().project),

    remix: () => {
      mutate((p) => { p.name = `${p.name} (remix)`.slice(0, 40) })
      set({ fromShare: false })
      // drop the share payload from the address bar so reload keeps the fork
      try { window.history.replaceState(null, '', location.pathname + location.search) } catch { /* iframe */ }
    },

    newProject: (kitId) => {
      get().stop()
      const kit = KIT_MAP[kitId ?? 'trap'] ?? KITS[0]
      const rnd = () => Math.floor(Math.random() * 10)
      const project: Project = {
        ...starterProject(),
        name: `${ADJECTIVES[rnd()]} ${NOUNS[rnd()]}`,
        kitId: kit.id,
        bpm: kit.bpm,
        patterns: [emptyPattern(), emptyPattern(), emptyPattern(), emptyPattern()],
        current: 0,
        chain: [0],
        chainOn: false,
        swing: 0,
      }
      undoHistory = []
      redoStack = []
      persist(project)
      set({ project, fromShare: false, playingPattern: 0 })
    },

    saveToLibrary: () => {
      const p = get().project
      const lib = readLibrary().filter((b) => b.name !== p.name)
      lib.unshift({ id: `${Date.now().toString(36)}`, name: p.name, savedAt: Date.now(), project: cloneProject(p) })
      writeLibrary(lib.slice(0, 50))
      set({}) // poke subscribers so the sheet re-reads the library
    },
    loadFromLibrary: (id) => {
      const beat = readLibrary().find((b) => b.id === id)
      if (!beat) return
      get().stop()
      undoHistory = []
      redoStack = []
      persist(beat.project)
      set({ project: cloneProject(beat.project), fromShare: false, playingPattern: beat.project.current })
    },
    deleteFromLibrary: (id) => {
      writeLibrary(readLibrary().filter((b) => b.id !== id))
      set({})
    },
    library: readLibrary,

    playDaily: () => {
      const daily = dailySeed()
      const kit = KIT_MAP[daily.kitId]
      mutate((p) => {
        p.kitId = daily.kitId
        p.bpm = daily.bpm
        p.name = `Daily ${daily.label}`
        p.patterns[p.current] = dicePattern({ seed: daily.seed, kit })
      })
      void warmKit(kit)
      if (!get().playing) get().play()
    },

    markHintsSeen: () => {
      try { localStorage.setItem(HINTS_KEY, '1') } catch { /* private mode */ }
      set({ hintsSeen: true })
    },
  }
})

// currentStep + hit blooms are driven by a rAF loop in App that drains
// engine events; exposed here so components stay dumb.
export function drainEngineEvents() {
  if (!engine.playing) return
  const events = engine.drainEvents(engine.now())
  for (const ev of events) {
    if (ev.type === 'step' && typeof ev.step === 'number') {
      useStore.setState({ currentStep: ev.step, playingPattern: ev.pattern ?? useStore.getState().playingPattern })
    } else if (ev.type === 'hit' && ev.role) {
      window.dispatchEvent(new CustomEvent('db:hit', { detail: { role: ev.role, vel: ev.vel ?? 1, step: ev.step } }))
    } else if (ev.type === 'duck') {
      window.dispatchEvent(new CustomEvent('db:duck'))
    }
  }
}

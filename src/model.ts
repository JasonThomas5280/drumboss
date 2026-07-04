export const NUM_STEPS = 16
export const NUM_PATTERNS = 4

export const ROLES = ['kick', 'snare', 'hatC', 'hatO', 'perc1', 'perc2', 'bass', 'loop'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hatC: 'Hat',
  hatO: 'Open',
  perc1: 'Perc 1',
  perc2: 'Perc 2',
  bass: '808',
  loop: 'Loop',
}

export interface Step {
  on: boolean
  /** 0..1 */
  vel: number
  /** semitones, -12..12 (bass and loop rows) */
  pitch: number
  /** sub-hits per step, 1..4 */
  ratchet: number
  /** -0.5..0.5 fraction of a step, micro-timing */
  nudge: number
}

export interface Track {
  role: Role
  /** kit id to borrow this row's sound from; null = project kit */
  sound: string | null
  vol: number
  mute: boolean
  solo: boolean
  steps: Step[]
}

export interface Pattern {
  tracks: Track[]
}

export interface Project {
  name: string
  bpm: number
  /** 0..0.75 */
  swing: number
  kitId: string
  patterns: Pattern[]
  /** index of the pattern being edited/played */
  current: number
  /** pattern indices to cycle when chainOn */
  chain: number[]
  chainOn: boolean
}

export function emptyStep(): Step {
  return { on: false, vel: 1, pitch: 0, ratchet: 1, nudge: 0 }
}

export function emptyPattern(): Pattern {
  return {
    tracks: ROLES.map((role) => ({
      role,
      sound: null,
      vol: role === 'loop' ? 0.85 : 1,
      mute: false,
      solo: false,
      steps: Array.from({ length: NUM_STEPS }, emptyStep),
    })),
  }
}

/** Compact hand-written starter groove so the app opens playing-ready. */
export function starterProject(): Project {
  const p = emptyPattern()
  const set = (role: Role, idx: number, vel = 1, pitch = 0, ratchet = 1) => {
    const t = p.tracks[ROLES.indexOf(role)]
    t.steps[idx] = { on: true, vel, pitch, ratchet, nudge: 0 }
  }
  // Trap groove in ~140: sparse kick, backbeat snare, rolling hats, 808 melody
  set('kick', 0)
  set('kick', 6, 0.9)
  set('kick', 10, 0.95)
  set('snare', 4)
  set('snare', 12)
  for (let i = 0; i < 16; i++) set('hatC', i, i % 4 === 0 ? 0.9 : i % 2 === 1 ? 0.7 : 0.55)
  const hat = p.tracks[ROLES.indexOf('hatC')]
  hat.steps[7].ratchet = 2
  hat.steps[15].ratchet = 3
  set('hatO', 14, 0.7)
  set('perc1', 3, 0.6)
  set('perc1', 11, 0.6)
  set('bass', 0, 1, 0)
  set('bass', 6, 0.9, 0)
  set('bass', 10, 0.95, 3)
  set('bass', 13, 0.8, 5)
  set('loop', 0, 0.9)
  set('loop', 8, 0.9)
  return {
    name: 'First Heat',
    bpm: 140,
    swing: 0.08,
    kitId: 'trap',
    patterns: [p, emptyPattern(), emptyPattern(), emptyPattern()],
    current: 0,
    chain: [0],
    chainOn: false,
  }
}

export function cloneProject(p: Project): Project {
  return JSON.parse(JSON.stringify(p))
}

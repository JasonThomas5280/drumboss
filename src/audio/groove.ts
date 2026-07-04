// The Dice: seeded, genre-aware groove generation. Same seed → same beat,
// so diced grooves are reproducible and shareable (and power the Daily Seed).
import { NUM_STEPS, ROLES, emptyStep, type Pattern, type Role } from '../model'
import { KIT_MAP, type KitDef } from './kits'

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

interface Grammar {
  /** per-role, per-step on-probability (16 entries) */
  p: Partial<Record<Role, number[]>>
  /** probability that a hat step gets a ratchet */
  ratchet: number
  hatContour: 'roll' | 'off' | 'even'
  bassFollowsKick: number
  loopChops: number[]
}

const G = (arr: number[]) => arr
// prettier-ignore
const GRAMMARS: Record<string, Grammar> = {
  trap: {
    p: {
      kick:  G([1, 0, 0, .25, 0, 0, .55, .2, 0, 0, .6, .35, 0, .2, .15, 0]),
      snare: G([0, 0, 0, 0, 1, 0, 0, .08, 0, 0, 0, .05, 1, 0, 0, .1]),
      hatC:  G([.95, .8, .9, .8, .95, .8, .9, .85, .95, .8, .9, .8, .95, .8, .9, .9]),
      hatO:  G([0, 0, .12, 0, 0, 0, .18, 0, 0, 0, .12, 0, 0, 0, .3, 0]),
      perc1: G([0, 0, .12, .18, 0, .1, 0, .12, 0, .12, 0, .18, 0, .1, .12, 0]),
      perc2: G([0, .06, 0, .1, 0, 0, .1, 0, .06, 0, .1, 0, 0, .1, 0, .12]),
    },
    ratchet: 0.16, hatContour: 'roll', bassFollowsKick: 0.75, loopChops: [0, 8],
  },
  boombap: {
    p: {
      kick:  G([1, 0, 0, .3, 0, 0, .2, .6, 0, .35, .55, 0, 0, .25, 0, .15]),
      snare: G([0, 0, 0, .06, 1, 0, 0, .12, 0, .08, 0, 0, 1, 0, .1, .06]),
      hatC:  G([.9, .15, .85, .15, .9, .15, .85, .2, .9, .15, .85, .15, .9, .2, .85, .25]),
      hatO:  G([0, 0, 0, 0, 0, 0, .15, 0, 0, 0, 0, 0, 0, 0, .22, 0]),
      perc1: G([0, .1, 0, .12, 0, .1, 0, .12, 0, .1, 0, .12, 0, .1, 0, .12]),
      perc2: G([0, 0, 0, 0, 0, 0, .12, 0, 0, 0, .1, 0, 0, 0, 0, .1]),
    },
    ratchet: 0.05, hatContour: 'even', bassFollowsKick: 0.65, loopChops: [0, 8],
  },
  house: {
    p: {
      kick:  G([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
      snare: G([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, .15]),
      hatC:  G([.3, .25, .3, .3, .3, .25, .3, .3, .3, .25, .3, .3, .3, .25, .3, .35]),
      hatO:  G([0, 0, .95, 0, 0, 0, .95, 0, 0, 0, .95, 0, 0, 0, .95, 0]),
      perc1: G([0, 0, 0, .2, 0, 0, .15, 0, 0, .2, 0, 0, 0, .15, 0, .2]),
      perc2: G([0, .12, 0, 0, 0, .15, 0, 0, 0, .12, 0, 0, 0, .15, 0, 0]),
    },
    ratchet: 0.03, hatContour: 'off', bassFollowsKick: 0.4, loopChops: [2, 6, 10, 14],
  },
  lofi: {
    p: {
      kick:  G([1, 0, 0, 0, 0, 0, .5, .3, 0, 0, .55, 0, 0, .3, 0, 0]),
      snare: G([0, 0, 0, 0, 1, 0, 0, .06, 0, 0, 0, 0, 1, 0, 0, .08]),
      hatC:  G([.85, .1, .8, .1, .85, .1, .8, .2, .85, .1, .8, .1, .85, .1, .8, .2]),
      hatO:  G([0, 0, 0, 0, 0, 0, .1, 0, 0, 0, 0, 0, 0, 0, .15, 0]),
      perc1: G([0, .08, 0, .1, 0, .08, 0, .1, 0, .08, 0, .1, 0, .08, 0, .1]),
      perc2: G([0, 0, .08, 0, 0, 0, 0, .08, 0, 0, .08, 0, 0, 0, 0, .08]),
    },
    ratchet: 0.04, hatContour: 'even', bassFollowsKick: 0.7, loopChops: [0, 8],
  },
}

const FILL_ROLES: Role[] = ['hatC', 'hatO', 'perc1', 'perc2']

export interface DiceOptions {
  seed: number
  kit: KitDef
  /** regenerate only hats + percs, keep kick/snare/bass/loop */
  fillsOnly?: boolean
  base?: Pattern
}

export function dicePattern(opts: DiceOptions): Pattern {
  const rnd = mulberry32(opts.seed)
  const grammar = GRAMMARS[opts.kit.id] ?? GRAMMARS.trap
  const base = opts.base
  const pattern: Pattern = {
    tracks: ROLES.map((role, ti) => ({
      role,
      sound: base?.tracks[ti].sound ?? null,
      vol: base?.tracks[ti].vol ?? (role === 'loop' ? 0.85 : 1),
      mute: base?.tracks[ti].mute ?? false,
      solo: base?.tracks[ti].solo ?? false,
      steps: Array.from({ length: NUM_STEPS }, emptyStep),
    })),
  }

  const track = (r: Role) => pattern.tracks[ROLES.indexOf(r)]

  const keep = (r: Role) => opts.fillsOnly && !FILL_ROLES.includes(r) && base
  for (const role of ['kick', 'snare', 'hatC', 'hatO', 'perc1', 'perc2'] as Role[]) {
    if (keep(role)) {
      track(role).steps = base!.tracks[ROLES.indexOf(role)].steps.map((s) => ({ ...s }))
      continue
    }
    const probs = grammar.p[role]
    if (!probs) continue
    for (let i = 0; i < NUM_STEPS; i++) {
      if (rnd() < probs[i]) {
        const s = track(role).steps[i]
        s.on = true
        const downbeat = i % 4 === 0
        s.vel = clamp((downbeat ? 0.95 : 0.65) + (rnd() - 0.5) * 0.25, 0.25, 1)
        if (role === 'hatC') {
          if (grammar.hatContour === 'roll' && rnd() < grammar.ratchet && i % 4 === 3) {
            s.ratchet = rnd() < 0.4 ? 3 : 2
          }
          if (grammar.hatContour === 'off' && i % 2 === 1) s.vel *= 0.7
        }
      }
    }
  }
  // kick step 0 is non-negotiable: a groove always lands
  if (!keep('kick')) track('kick').steps[0] = { on: true, vel: 1, pitch: 0, ratchet: 1, nudge: 0 }

  // 808 shadows the kick, walking the kit's scale root-heavy
  if (keep('bass')) {
    track('bass').steps = base!.tracks[ROLES.indexOf('bass')].steps.map((s) => ({ ...s }))
  } else {
    const kickSteps = track('kick').steps
    const scale = opts.kit.scale
    for (let i = 0; i < NUM_STEPS; i++) {
      if (kickSteps[i].on && rnd() < grammar.bassFollowsKick) {
        const s = track('bass').steps[i]
        s.on = true
        s.vel = clamp(0.8 + (rnd() - 0.5) * 0.2, 0.4, 1)
        s.pitch = rnd() < 0.55 ? 0 : scale[Math.floor(rnd() * scale.length)]
      }
    }
  }

  if (keep('loop')) {
    track('loop').steps = base!.tracks[ROLES.indexOf('loop')].steps.map((s) => ({ ...s }))
  } else {
    for (const c of grammar.loopChops) {
      if (rnd() < 0.75) {
        const s = track('loop').steps[c]
        s.on = true
        s.vel = 0.85
      }
    }
  }
  return pattern
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** One shared canvas per day, no server: seed + kit + bpm derived from the date. */
export function dailySeed(date = new Date()): { seed: number; kitId: string; bpm: number; label: string } {
  const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const seed = hashString(`drumboss:${label}`)
  const kits = Object.keys(KIT_MAP)
  const kitId = kits[seed % kits.length]
  const kit = KIT_MAP[kitId]
  const bpm = kit.bpm + ((seed >> 8) % 9) - 4
  return { seed, kitId, bpm, label }
}

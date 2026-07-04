// Beats travel as URLs: the whole project is packed into a sparse, compact
// structure and compressed into the hash fragment — no backend, and shared
// links open playing.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { NUM_STEPS, ROLES, emptyPattern, type Pattern, type Project } from '../model'
import { KITS, KIT_MAP } from '../audio/kits'

const VERSION = 2

// packed shapes: numbers only, sparse steps → lz-string gets very short output
type PackedStep = [i: number, vel: number, pitch: number, ratchet: number, nudge: number]
type PackedTrack = [sound: number, vol: number, mute: number, solo: number, steps: PackedStep[]]
type PackedPattern = 0 | PackedTrack[]
interface Packed {
  v: number
  n: string
  b: number
  s: number
  k: number
  cur: number
  ch: number[]
  co: number
  p: PackedPattern[]
}

const kitIndex = (id: string | null): number => (id === null ? 0 : KITS.findIndex((k) => k.id === id) + 1)
const kitFromIndex = (i: number): string | null => (i >= 1 && i <= KITS.length ? KITS[i - 1].id : null)

function pack(project: Project): Packed {
  return {
    v: VERSION,
    n: project.name,
    b: project.bpm,
    s: Math.round(project.swing * 100),
    k: Math.max(0, KITS.findIndex((k) => k.id === project.kitId)),
    cur: project.current,
    ch: project.chain,
    co: project.chainOn ? 1 : 0,
    p: project.patterns.map((pat): PackedPattern => {
      const hasNotes = pat.tracks.some((t) => t.steps.some((s) => s.on))
      const hasTweaks = pat.tracks.some((t) => t.sound !== null || t.mute || t.solo || t.vol !== 1)
      if (!hasNotes && !hasTweaks) return 0
      return pat.tracks.map((t): PackedTrack => [
        kitIndex(t.sound),
        Math.round(t.vol * 100),
        t.mute ? 1 : 0,
        t.solo ? 1 : 0,
        t.steps
          .map((s, i): PackedStep => [i, Math.round(s.vel * 100), s.pitch, s.ratchet, Math.round(s.nudge * 100)])
          .filter((_, i) => t.steps[i].on),
      ])
    }),
  }
}

const clamp = (v: unknown, lo: number, hi: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt

function unpack(data: Packed): Project {
  const kitId = KITS[Math.round(clamp(data.k, 0, KITS.length - 1, 0))].id
  const patterns = Array.from({ length: 4 }, (_, pi): Pattern => {
    const pat = emptyPattern()
    const src = Array.isArray(data.p) ? data.p[pi] : 0
    if (!src || !Array.isArray(src)) return pat
    for (let t = 0; t < ROLES.length; t++) {
      const st = src[t]
      if (!Array.isArray(st)) continue
      const dst = pat.tracks[t]
      dst.sound = kitFromIndex(Math.round(clamp(st[0], 0, KITS.length, 0)))
      dst.sound = dst.sound && KIT_MAP[dst.sound] ? dst.sound : null
      dst.vol = clamp(st[1], 0, 120, 100) / 100
      dst.mute = st[2] === 1
      dst.solo = st[3] === 1
      const steps = Array.isArray(st[4]) ? st[4] : []
      for (const ps of steps) {
        if (!Array.isArray(ps)) continue
        const i = Math.round(clamp(ps[0], 0, NUM_STEPS - 1, 0))
        dst.steps[i] = {
          on: true,
          vel: clamp(ps[1], 5, 100, 100) / 100,
          pitch: Math.round(clamp(ps[2], -12, 12, 0)),
          ratchet: Math.round(clamp(ps[3], 1, 4, 1)),
          nudge: clamp(ps[4], -50, 50, 0) / 100,
        }
      }
    }
    return pat
  })
  const chain = (Array.isArray(data.ch) ? data.ch : [0]).map((c) => Math.round(clamp(c, 0, 3, 0))).slice(0, 16)
  return {
    name: typeof data.n === 'string' && data.n.trim() ? data.n.slice(0, 40) : 'Shared Beat',
    bpm: Math.round(clamp(data.b, 40, 220, 120)),
    swing: clamp(data.s, 0, 75, 0) / 100,
    kitId,
    patterns,
    current: Math.round(clamp(data.cur, 0, 3, 0)),
    chain: chain.length ? chain : [0],
    chainOn: data.co === 1,
  }
}

export function encodeShareURL(project: Project, base = location.href): string {
  const payload = compressToEncodedURIComponent(JSON.stringify(pack(project)))
  const url = new URL(base)
  url.hash = `b=${payload}`
  return url.toString()
}

export function decodeShareHash(hash: string): Project | null {
  const m = /[#&]b=([^&]+)/.exec(hash)
  if (!m) return null
  try {
    const json = decompressFromEncodedURIComponent(m[1])
    if (!json) return null
    const data = JSON.parse(json) as Packed
    if (!data || data.v !== VERSION) return null
    return unpack(data)
  } catch {
    return null
  }
}

import { describe, expect, it } from 'vitest'
import { dicePattern, dailySeed, mulberry32, hashString } from '../src/audio/groove'
import { KIT_MAP, KITS } from '../src/audio/kits'
import { ROLES } from '../src/model'

describe('dice groove generator', () => {
  it('is deterministic: same seed → identical pattern', () => {
    for (const kit of KITS) {
      const a = dicePattern({ seed: 12345, kit })
      const b = dicePattern({ seed: 12345, kit })
      expect(a).toEqual(b)
    }
  })

  it('different seeds → different patterns', () => {
    const kit = KIT_MAP.trap
    const a = dicePattern({ seed: 1, kit })
    const b = dicePattern({ seed: 2, kit })
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it('always lands: kick on step 0, non-empty groove, valid steps', () => {
    for (const kit of KITS) {
      for (let seed = 0; seed < 25; seed++) {
        const p = dicePattern({ seed, kit })
        const kick = p.tracks[ROLES.indexOf('kick')]
        expect(kick.steps[0].on).toBe(true)
        const total = p.tracks.reduce((n, t) => n + t.steps.filter((s) => s.on).length, 0)
        expect(total).toBeGreaterThan(4)
        for (const t of p.tracks) {
          for (const s of t.steps) {
            expect(s.vel).toBeGreaterThan(0)
            expect(s.vel).toBeLessThanOrEqual(1)
            expect(s.ratchet).toBeGreaterThanOrEqual(1)
            expect(s.ratchet).toBeLessThanOrEqual(4)
          }
        }
      }
    }
  })

  it('house kicks four-on-the-floor', () => {
    const p = dicePattern({ seed: 7, kit: KIT_MAP.house })
    const kick = p.tracks[ROLES.indexOf('kick')]
    for (const i of [0, 4, 8, 12]) expect(kick.steps[i].on).toBe(true)
  })

  it('fillsOnly keeps the foundation rows from base', () => {
    const kit = KIT_MAP.trap
    const base = dicePattern({ seed: 99, kit })
    const rolled = dicePattern({ seed: 100, kit, fillsOnly: true, base })
    for (const role of ['kick', 'snare', 'bass', 'loop'] as const) {
      expect(rolled.tracks[ROLES.indexOf(role)].steps).toEqual(base.tracks[ROLES.indexOf(role)].steps)
    }
  })

  it('daily seed is stable for a given date and picks a real kit', () => {
    const d = new Date(2026, 6, 4)
    const a = dailySeed(d)
    const b = dailySeed(d)
    expect(a).toEqual(b)
    expect(KIT_MAP[a.kitId]).toBeDefined()
    expect(a.bpm).toBeGreaterThan(40)
    expect(a.bpm).toBeLessThan(220)
    const other = dailySeed(new Date(2026, 6, 5))
    expect(other.seed).not.toBe(a.seed)
  })

  it('prng and hash are stable', () => {
    const r = mulberry32(42)
    const seq = [r(), r(), r()]
    const r2 = mulberry32(42)
    expect([r2(), r2(), r2()]).toEqual(seq)
    expect(hashString('drumboss')).toBe(hashString('drumboss'))
  })
})

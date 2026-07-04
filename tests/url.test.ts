import { describe, expect, it } from 'vitest'
import { decodeShareHash, encodeShareURL } from '../src/share/url'
import { starterProject } from '../src/model'

describe('share URL codec', () => {
  it('round-trips a project through the hash fragment', () => {
    const project = starterProject()
    project.name = 'Round Trip'
    project.bpm = 133
    project.swing = 0.22
    project.patterns[0].tracks[6].steps[3] = { on: true, vel: 0.7, pitch: -5, ratchet: 2, nudge: 0.1 }
    const url = encodeShareURL(project, 'https://example.com/drumboss/')
    const hash = new URL(url).hash
    const decoded = decodeShareHash(hash)
    expect(decoded).toEqual(project)
  })

  it('keeps links compact enough to paste anywhere', () => {
    const url = encodeShareURL(starterProject(), 'https://example.com/drumboss/')
    expect(url.length).toBeLessThan(2000)
  })

  it('rejects garbage without throwing', () => {
    expect(decodeShareHash('')).toBeNull()
    expect(decodeShareHash('#b=!!!not-a-payload!!!')).toBeNull()
    expect(decodeShareHash('#other=1')).toBeNull()
  })

  it('clamps hostile values back into range', async () => {
    const evil = {
      v: 2,
      n: 'x'.repeat(500),
      b: 99999,
      s: 4200,
      k: 999,
      cur: 77,
      ch: [9, -3],
      co: 'yes',
      p: [[[999, 9000, 1, 1, [[999, 90000, 300, 99, 1200]]]], 'junk', null, 0],
    }
    const { compressToEncodedURIComponent } = await import('lz-string')
    const decoded = decodeShareHash(`#b=${compressToEncodedURIComponent(JSON.stringify(evil))}`)
    expect(decoded).not.toBeNull()
    expect(decoded!.bpm).toBeLessThanOrEqual(220)
    expect(decoded!.name.length).toBeLessThanOrEqual(40)
    expect(decoded!.kitId).toBe('lofi')
    const step = decoded!.patterns[0].tracks[0].steps[0]
    expect(step.vel).toBeLessThanOrEqual(1)
    expect(step.pitch).toBeLessThanOrEqual(12)
    expect(step.ratchet).toBeLessThanOrEqual(4)
    expect(decoded!.chain.every((c) => c >= 0 && c <= 3)).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import type { VoiceGateSettings } from './levelMeter'
import { effectiveThreshold, createPeakHold, createVoiceGate, thresholdAt, gateLineLeft, AUTO_THRESHOLD, PEAK_HOLD_MS } from './levelMeter'

describe('effectiveThreshold', () => {
  it('uses the fixed auto value when auto sensitivity is on', () => {
    expect(effectiveThreshold({ autoSensitivity: true, sensitivityThreshold: 80 })).toBe(AUTO_THRESHOLD)
  })

  it('uses the slider value otherwise, also when stored as a string', () => {
    expect(effectiveThreshold({ autoSensitivity: false, sensitivityThreshold: '62' })).toBe(62)
  })
})

describe('thresholdAt', () => {
  const bar = { left: 100, width: 216 }

  it('puts the pointer on the gate line, and clamps at the ends', () => {
    expect(thresholdAt(108, bar)).toBe(0)
    expect(thresholdAt(208, bar)).toBe(50)
    expect(thresholdAt(308, bar)).toBe(100)
    expect(thresholdAt(0, bar)).toBe(0)
    expect(thresholdAt(400, bar)).toBe(100)
  })

  it('reports zero when the bar is narrower than the handle', () => {
    expect(thresholdAt(50, { left: 0, width: 10 })).toBe(0)
  })

  it('places the line on the same scale', () => {
    expect(gateLineLeft(50)).toBe('calc(8px + (100% - 16px) * 0.5)')
  })
})

describe('createPeakHold', () => {
  it('rises immediately with the level', () => {
    const peak = createPeakHold()
    expect(peak(10, 0)).toBe(10)
    expect(peak(55, 50)).toBe(55)
  })

  it('holds the peak for the hold time, then falls back to the level', () => {
    const peak = createPeakHold()
    peak(70, 0)
    expect(peak(20, PEAK_HOLD_MS - 1)).toBe(70)
    expect(peak(20, PEAK_HOLD_MS + 1)).toBe(20)
  })

  it('restarts the hold when a new peak arrives', () => {
    const peak = createPeakHold()
    peak(70, 0)
    expect(peak(75, PEAK_HOLD_MS - 10)).toBe(75)
    expect(peak(30, PEAK_HOLD_MS + 10)).toBe(75)
    expect(peak(30, PEAK_HOLD_MS * 2)).toBe(30)
  })
})

describe('createVoiceGate', () => {
  it('opens above the threshold and holds for the hangover time', () => {
    let clock = 1000
    const s: VoiceGateSettings = { inputMode: 'activity', isPttPressed: false, autoSensitivity: false, sensitivityThreshold: 40, hangoverMs: 300 }
    const open = createVoiceGate(s, () => clock)
    expect(open(10)).toBe(false)
    expect(open(50)).toBe(true)
    clock += 200
    expect(open(10)).toBe(true)
    clock += 200
    expect(open(10)).toBe(false)
  })

  it('uses the automatic threshold', () => {
    const open = createVoiceGate({ inputMode: 'activity', isPttPressed: false, autoSensitivity: true, sensitivityThreshold: 90, hangoverMs: 0 })
    expect(open(AUTO_THRESHOLD)).toBe(true)
  })

  it('follows the push-to-talk key in ptt mode', () => {
    const s: VoiceGateSettings = { inputMode: 'ptt', autoSensitivity: true, sensitivityThreshold: 25, isPttPressed: false, hangoverMs: 300 }
    const open = createVoiceGate(s)
    expect(open(100)).toBe(false)
    s.isPttPressed = true
    expect(open(0)).toBe(true)
  })
})

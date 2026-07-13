import { describe, expect, it } from 'vitest';
import { ApiException } from '../common/api-exception';
import {
  JOB_STATUS_TO_DELIVERY,
  aggregateOrderStatus,
  etaFrom,
  nextStatus,
  remainingMinutes,
} from './warming.logic';
import type { StageSnapshot } from './warming.logic';

const STAGES: StageSnapshot[] = [
  { order: 0, name: 'Prep', expectedMinutes: 240 },
  { order: 1, name: 'Setup', expectedMinutes: 240 },
  { order: 2, name: 'Rest', expectedMinutes: 4320 },
  { order: 3, name: 'QC', expectedMinutes: 480 },
];

describe('warming ETA helpers', () => {
  it('sums every stage duration from the start', () => {
    expect(remainingMinutes(STAGES)).toBe(240 + 240 + 4320 + 480);
  });

  it('sums only the stages still to run from the current one', () => {
    expect(remainingMinutes(STAGES, 2)).toBe(4320 + 480);
    expect(remainingMinutes(STAGES, 4)).toBe(0);
  });

  it('turns a duration into a future date', () => {
    const base = new Date('2026-07-13T00:00:00.000Z');
    expect(etaFrom(base, 60).toISOString()).toBe('2026-07-13T01:00:00.000Z');
  });
});

describe('warming state machine (nextStatus)', () => {
  it('walks the happy path queued→…→delivered', () => {
    expect(nextStatus('assigned', 'start')).toBe('in_progress');
    expect(nextStatus('in_progress', 'qc')).toBe('qc');
    expect(nextStatus('qc', 'ready')).toBe('ready');
    expect(nextStatus('ready', 'deliver')).toBe('delivered');
  });

  it('supports hold/resume and fail branches', () => {
    expect(nextStatus('in_progress', 'hold')).toBe('on_hold');
    expect(nextStatus('on_hold', 'resume')).toBe('in_progress');
    expect(nextStatus('qc', 'fail')).toBe('failed');
    expect(nextStatus('on_hold', 'fail')).toBe('failed');
  });

  it('rejects an illegal move with a 409', () => {
    expect(() => nextStatus('queued', 'deliver')).toThrow(ApiException);
    expect(() => nextStatus('delivered', 'start')).toThrow(ApiException);
    try {
      nextStatus('ready', 'start');
    } catch (error) {
      expect((error as ApiException).getStatus()).toBe(409);
      expect((error as ApiException).code).toBe('CONFLICT');
    }
  });
});

describe('job → line status mapping', () => {
  it('mirrors every job status onto a delivery status', () => {
    expect(JOB_STATUS_TO_DELIVERY.queued).toBe('queued');
    expect(JOB_STATUS_TO_DELIVERY.in_progress).toBe('in_progress');
    expect(JOB_STATUS_TO_DELIVERY.delivered).toBe('delivered');
    expect(JOB_STATUS_TO_DELIVERY.refunded).toBe('refunded');
    // Exhaustive: no status maps to undefined.
    for (const value of Object.values(JOB_STATUS_TO_DELIVERY)) {
      expect(value).toBeTruthy();
    }
  });
});

describe('order status aggregate', () => {
  it('is delivered only when every line is delivered', () => {
    expect(aggregateOrderStatus(['delivered', 'delivered'])).toBe('delivered');
    expect(aggregateOrderStatus(['delivered', 'replaced'])).toBe('delivered');
  });

  it('is partially_delivered on a mix', () => {
    expect(aggregateOrderStatus(['delivered', 'queued'])).toBe('partially_delivered');
    expect(aggregateOrderStatus(['delivered', 'refunded'])).toBe('partially_delivered');
  });

  it('is refunded when all lines are refunded, else paid', () => {
    expect(aggregateOrderStatus(['refunded', 'refunded'])).toBe('refunded');
    expect(aggregateOrderStatus(['queued', 'in_progress'])).toBe('paid');
  });
});

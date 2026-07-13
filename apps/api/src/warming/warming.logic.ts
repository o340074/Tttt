import { ApiException } from '../common/api-exception';
import type { OrderItemDeliveryStatus, WarmingJobAction, WarmingJobStatus } from '@advault/types';

/** A stage as snapshotted onto a job (survives later plan edits). */
export interface StageSnapshot {
  order: number;
  name: string;
  expectedMinutes: number;
}

/**
 * ETA is the sum of the expected durations of the stages still to run,
 * counting from `fromStageOrder` (0-based). At creation that is every stage;
 * on hold/resume it is the remaining ones — so ETA shrinks as work advances.
 */
export function remainingMinutes(stages: StageSnapshot[], fromStageOrder = 0): number {
  return stages
    .filter((stage) => stage.order >= fromStageOrder)
    .reduce((sum, stage) => sum + stage.expectedMinutes, 0);
}

/** `base` plus `minutes`, as a Date (used to turn a duration into an etaAt). */
export function etaFrom(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

/**
 * Warming Job → OrderItem.deliveryStatus (docs/14). The line mirrors the job so
 * the buyer's order reflects warming progress without a second source of truth.
 */
export const JOB_STATUS_TO_DELIVERY: Record<WarmingJobStatus, OrderItemDeliveryStatus> = {
  queued: 'queued',
  assigned: 'assigned',
  in_progress: 'in_progress',
  qc: 'qc',
  ready: 'ready',
  delivered: 'delivered',
  on_hold: 'on_hold',
  failed: 'failed',
  refunded: 'refunded',
};

/**
 * Allowed non-money status moves (docs/12, docs/14). `assign` is handled
 * separately (it also sets the operator); `fail` resolution (reassign/refund)
 * lives in resolveFailed. `resume` returns a held job to active work.
 */
const TRANSITIONS: Record<WarmingJobAction, { from: WarmingJobStatus[]; to: WarmingJobStatus }> = {
  start: { from: ['assigned'], to: 'in_progress' },
  hold: { from: ['assigned', 'in_progress', 'qc'], to: 'on_hold' },
  resume: { from: ['on_hold'], to: 'in_progress' },
  qc: { from: ['in_progress'], to: 'qc' },
  ready: { from: ['qc'], to: 'ready' },
  deliver: { from: ['ready'], to: 'delivered' },
  fail: { from: ['assigned', 'in_progress', 'qc', 'on_hold'], to: 'failed' },
};

/**
 * The status a job moves to for `action`, or a 409 if the move is not allowed
 * from the current status. Keeps the state machine honest server-side.
 */
export function nextStatus(current: WarmingJobStatus, action: WarmingJobAction): WarmingJobStatus {
  const rule = TRANSITIONS[action];
  if (!rule || !rule.from.includes(current)) {
    throw new ApiException('CONFLICT', `Cannot ${action} a warming job in status ${current}`, 409, {
      status: current,
      action,
    });
  }
  return rule.to;
}

/**
 * Order status as an aggregate of its line delivery states (docs/14):
 * every line delivered → delivered; every line refunded → refunded;
 * some delivered → partially_delivered; otherwise still paid.
 */
export function aggregateOrderStatus(
  statuses: OrderItemDeliveryStatus[],
): 'paid' | 'partially_delivered' | 'delivered' | 'refunded' {
  const total = statuses.length;
  const delivered = statuses.filter((s) => s === 'delivered' || s === 'replaced').length;
  const refunded = statuses.filter((s) => s === 'refunded').length;
  if (total > 0 && delivered === total) return 'delivered';
  if (total > 0 && refunded === total) return 'refunded';
  if (delivered > 0) return 'partially_delivered';
  return 'paid';
}

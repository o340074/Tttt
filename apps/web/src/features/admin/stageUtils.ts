import type { WarmingStageInput } from '@advault/types';

/** ETA of a warming plan = sum of its stage durations (docs/13 §6). */
export function totalEta(stages: WarmingStageInput[]): number {
  return stages.reduce((sum, s) => sum + (Number(s.expectedMinutes) || 0), 0);
}

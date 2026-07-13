import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LocaleQueryDto } from '../../catalog/dto/catalog.dto';
import type {
  WarmingFailResolution,
  WarmingJobAction,
  WarmingJobStatus,
  WarmingTaskStatus,
} from '@advault/types';

const JOB_STATUSES = [
  'queued',
  'assigned',
  'in_progress',
  'qc',
  'ready',
  'delivered',
  'on_hold',
  'failed',
  'refunded',
] as const;

const JOB_ACTIONS = ['start', 'hold', 'resume', 'qc', 'ready', 'deliver', 'fail'] as const;

const TASK_STATUSES = ['pending', 'in_progress', 'done', 'skipped', 'blocked'] as const;

export class WarmingQueueDto extends LocaleQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: WarmingJobStatus;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  goal?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;
}

export class AssignWarmingJobBody {
  @IsUUID()
  operatorId!: string;
}

export class WarmingTransitionBody {
  @IsIn(JOB_ACTIONS)
  action!: WarmingJobAction;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class UpdateWarmingTaskBody {
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: WarmingTaskStatus;

  @IsOptional()
  @IsObject()
  checklistState?: Record<string, unknown>;
}

export class SetAccountAssetBody {
  @IsString()
  @MaxLength(20000)
  payload!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  recovery?: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class ResolveWarmingJobBody {
  @IsIn(['reassign', 'refund'])
  resolution!: WarmingFailResolution;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

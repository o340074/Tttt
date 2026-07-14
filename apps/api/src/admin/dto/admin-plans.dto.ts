import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { BundleComponentType, WarmingStageInput } from '@advault/types';

const COMPONENT_TYPES = [
  'ACCOUNT',
  'PROXY',
  'OCTO_PROFILE',
  'RECOVERY',
  'SECRETS',
  'GUIDE',
  'WARRANTY',
] as const;

export class WarmingStageInputDto implements WarmingStageInput {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  /** Minutes; capped at ~60 days to keep ETA sane. */
  @IsInt()
  @Min(1)
  @Max(86_400)
  expectedMinutes!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  checklist?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsIn(COMPONENT_TYPES, { each: true })
  requiredComponents?: BundleComponentType[];
}

export class CreateWarmingPlanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  goal!: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(64)
  tier?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsObject()
  qcRules?: Record<string, unknown>;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => WarmingStageInputDto)
  stages!: WarmingStageInputDto[];
}

export class UpdateWarmingPlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  goal?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(64)
  tier?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  qcRules?: Record<string, unknown>;

  /** When present, replaces the stage list and bumps the plan version. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => WarmingStageInputDto)
  stages?: WarmingStageInputDto[];
}

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type {
  OctoProfileStatus,
  ProxyStatus,
  ProxyType,
  UpdateOctoProfileRequest,
} from '@advault/types';

const PROXY_TYPES = ['residential', 'mobile', 'isp', 'datacenter'] as const;
const PROXY_STATUSES = ['available', 'assigned', 'expired', 'disabled'] as const;
const OCTO_STATUSES = ['draft', 'ready', 'delivered'] as const;

export class CreateProxyBody {
  @IsIn(PROXY_TYPES)
  type!: ProxyType;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  geo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  credentials!: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class ProxyQueryDto {
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
  @IsIn(PROXY_STATUSES)
  status?: ProxyStatus;

  @IsOptional()
  @IsIn(PROXY_TYPES)
  type?: ProxyType;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unassigned?: boolean;
}

export class OctoQueryDto {
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
  @IsIn(OCTO_STATUSES)
  status?: OctoProfileStatus;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unassigned?: boolean;
}

export class CreateOctoBody {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalId?: string | null;

  @IsOptional()
  @IsUUID()
  proxyItemId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  exportRef?: string | null;

  @IsOptional()
  @IsObject()
  fingerprintRef?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class UpdateOctoBody implements UpdateOctoProfileRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalId?: string | null;

  @IsOptional()
  @IsUUID()
  proxyItemId?: string | null;

  @IsOptional()
  @IsIn(OCTO_STATUSES)
  status?: OctoProfileStatus;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  exportRef?: string | null;

  @IsOptional()
  @IsObject()
  fingerprintRef?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class BindProxyBody {
  @IsUUID()
  jobId!: string;
}

export class BindOctoBody {
  @IsUUID()
  jobId!: string;

  @IsOptional()
  @IsUUID()
  proxyItemId?: string | null;
}

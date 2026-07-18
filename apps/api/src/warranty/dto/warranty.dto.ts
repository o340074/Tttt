import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { CreateWarrantyClaimRequest, WarrantyClaimType } from '@advault/types';

const CLAIM_TYPES: WarrantyClaimType[] = ['replace', 'refund'];

export class CreateWarrantyClaimDto implements CreateWarrantyClaimRequest {
  @IsUUID()
  orderItemId!: string;

  @IsIn(CLAIM_TYPES)
  type!: WarrantyClaimType;

  /** Required human reason (what is wrong); shown to staff, no secrets. */
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;
}

export class MyWarrantyClaimsQueryDto {
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
}

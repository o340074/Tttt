import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { ResolveWarrantyClaimRequest, WarrantyClaimStatus } from '@advault/types';

const CLAIM_STATUSES: WarrantyClaimStatus[] = [
  'requested',
  'approved',
  'rejected',
  'replaced',
  'refunded',
];

export class AdminWarrantyClaimsQueryDto {
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
  @IsIn(CLAIM_STATUSES)
  status?: WarrantyClaimStatus;
}

export class ResolveWarrantyClaimDto implements ResolveWarrantyClaimRequest {
  /** Optional staff note; shown to the buyer on the resolution. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

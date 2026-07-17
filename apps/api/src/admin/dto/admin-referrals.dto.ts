import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { CancelReferralRequest, ReferralStatus } from '@advault/types';

export class AdminReferralsQueryDto {
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

  /** Filter by status; omit for all. */
  @IsOptional()
  @IsIn(['pending', 'qualified', 'cancelled'])
  status?: ReferralStatus;
}

export class CancelReferralDto implements CancelReferralRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

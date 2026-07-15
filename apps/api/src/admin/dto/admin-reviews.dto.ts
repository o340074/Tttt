import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { ModerateReviewRequest } from '@advault/types';

export class AdminReviewsQueryDto {
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

  /** Filter by visibility; omit for all. `?hidden=true` / `?hidden=false`. */
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  hidden?: boolean;
}

export class ModerateReviewDto implements ModerateReviewRequest {
  @IsBoolean()
  hidden!: boolean;
}

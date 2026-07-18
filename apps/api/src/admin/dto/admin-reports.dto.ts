import { IsISO8601, IsOptional } from 'class-validator';

/** Period filter for reports: [from, to) as ISO-8601 dates. */
export class ReportPeriodDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { PromoType } from '@advault/types';

const PROMO_TYPES = ['percent', 'fixed'] as const;

export class CreatePromoCodeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  code!: string;

  @IsIn(PROMO_TYPES)
  type!: PromoType;

  /** Money string; validated per type in the service (percent 1–100, fixed >0). */
  @IsString()
  @MaxLength(20)
  value!: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  maxUses?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  expiresAt?: string | null;
}

export class UpdatePromoCodeDto {
  @IsOptional()
  @IsIn(PROMO_TYPES)
  type?: PromoType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  value?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  maxUses?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  expiresAt?: string | null;
}

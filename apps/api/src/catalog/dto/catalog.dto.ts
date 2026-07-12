import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { FulfillmentType, Locale, ProductSort } from '@advault/types';

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

export class LocaleQueryDto {
  @IsOptional()
  @IsIn(['en', 'ru'])
  locale?: Locale;
}

export class ListProductsDto extends LocaleQueryDto {
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
  @IsUUID()
  categoryId?: string;

  /** Category slug; includes products of child categories. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Matches(MONEY_PATTERN)
  minPrice?: string;

  @IsOptional()
  @Matches(MONEY_PATTERN)
  maxPrice?: string;

  @IsOptional()
  @IsIn(['READY_STOCK', 'MADE_TO_ORDER'])
  fulfillment?: FulfillmentType;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  goal?: string;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  inStock?: boolean;

  @IsOptional()
  @IsIn(['price_asc', 'price_desc', 'rating', 'newest'])
  sort?: ProductSort;
}

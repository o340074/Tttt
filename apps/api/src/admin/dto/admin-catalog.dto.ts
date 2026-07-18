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
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type {
  BundleComponent,
  BundleComponentType,
  FulfillmentType,
  Locale,
  ProductStatus,
  TranslationInput,
} from '@advault/types';

const LOCALES = ['en', 'ru'] as const;
const FULFILLMENT_TYPES = ['READY_STOCK', 'MADE_TO_ORDER'] as const;
const PRODUCT_STATUSES = ['draft', 'published', 'hidden'] as const;
const COMPONENT_TYPES = [
  'ACCOUNT',
  'PROXY',
  'OCTO_PROFILE',
  'RECOVERY',
  'SECRETS',
  'GUIDE',
  'WARRANTY',
] as const;

export class TranslationInputDto implements TranslationInput {
  @IsIn(LOCALES)
  locale!: Locale;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  description?: string | null;
}

export class BundleComponentDto implements BundleComponent {
  @IsIn(COMPONENT_TYPES)
  type!: BundleComponentType;

  /** Typed params validated in catalog.logic (proxyType/geo/term/hours/…). */
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

// ---------- Categories ----------

export class CreateCategoryDto {
  @IsString()
  @MaxLength(64)
  slug!: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => TranslationInputDto)
  translations!: TranslationInputDto[];
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  slug?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => TranslationInputDto)
  translations?: TranslationInputDto[];
}

// ---------- Products ----------

export class ProductQueryDto {
  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class CreateProductDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @MaxLength(64)
  slug!: string;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => TranslationInputDto)
  translations!: TranslationInputDto[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  slug?: string;

  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status?: ProductStatus;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => TranslationInputDto)
  translations?: TranslationInputDto[];
}

// ---------- Variants ----------

export class CreateVariantDto {
  @IsString()
  @MaxLength(64)
  sku!: string;

  /** Money string; parsed to Decimal in the service. */
  @IsString()
  @MaxLength(20)
  price!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsIn(FULFILLMENT_TYPES)
  fulfillmentType!: FulfillmentType;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(64)
  goal?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(64)
  tier?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  warmingPlanId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  etaMinutes?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  warrantyHours?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => BundleComponentDto)
  bundle?: BundleComponentDto[];

  @IsOptional()
  @IsObject()
  names?: Partial<Record<Locale, string>>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  price?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsIn(FULFILLMENT_TYPES)
  fulfillmentType?: FulfillmentType;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(64)
  goal?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(64)
  tier?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  warmingPlanId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  etaMinutes?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  warrantyHours?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => BundleComponentDto)
  bundle?: BundleComponentDto[];

  @IsOptional()
  @IsObject()
  names?: Partial<Record<Locale, string>>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

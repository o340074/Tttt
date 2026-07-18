import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** Per-line quantity ceiling; stock imposes the real limit for READY_STOCK. */
export const MAX_QUANTITY = 99;

export class AddCartItemDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity!: number;
}

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity!: number;
}

export class CheckoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  promoCode?: string;
}

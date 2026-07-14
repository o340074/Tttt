import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class RefundDto {
  /** Refund just this line; omit to refund the whole order. */
  @IsOptional()
  @IsUUID()
  orderItemId?: string;

  /** Required human reason, stored in the audit trail. */
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ManualDeliverDto {
  /** Freeform delivery text handed to the buyer (encrypted at rest). */
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  payload!: string;

  /** Optional non-secret note kept in the audit trail. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

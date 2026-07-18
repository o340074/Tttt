import { IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import type { ChangePasswordRequest, Locale, UpdateMeRequest } from '@advault/types';

export class UpdateMeDto implements UpdateMeRequest {
  @IsOptional()
  @IsIn(['en', 'ru'])
  locale?: Locale;
}

export class ChangePasswordDto implements ChangePasswordRequest {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

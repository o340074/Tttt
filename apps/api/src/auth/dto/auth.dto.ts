import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import type {
  ForgotPasswordRequest,
  LoginRequest,
  Locale,
  RegisterRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
} from '@advault/types';

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto implements RegisterRequest {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsIn(['en', 'ru'])
  locale?: Locale;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  referralCode?: string;
}

export class LoginDto implements LoginRequest {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class VerifyEmailDto implements VerifyEmailRequest {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class ForgotPasswordDto implements ForgotPasswordRequest {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto implements ResetPasswordRequest {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

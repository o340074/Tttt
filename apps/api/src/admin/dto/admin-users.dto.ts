import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Role, UserStatus } from '@advault/types';

const USER_STATUSES = ['active', 'blocked'] as const;
const ROLES = ['user', 'support', 'operator', 'manager', 'admin'] as const;

export class AdminUserQueryDto {
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

  /** Free-text: buyer email (contains, case-insensitive). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatus;

  @IsOptional()
  @IsIn(ROLES)
  role?: Role;
}

export class BlockUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class UpdateUserRoleDto {
  @IsIn(ROLES)
  role!: Role;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

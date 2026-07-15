import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { Locale, NotificationTemplate } from '@advault/types';

const LOCALES = ['en', 'ru'] as const;

class NotificationTemplateDto implements NotificationTemplate {
  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MaxLength(2000)
  body!: string;
}

class NotificationsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationTemplateDto)
  orderPaid?: NotificationTemplateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationTemplateDto)
  warmingReady?: NotificationTemplateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationTemplateDto)
  ticketReply?: NotificationTemplateDto;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  storeName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  supportEmail?: string;

  @IsOptional()
  @IsIn(LOCALES)
  defaultLocale?: Locale;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(LOCALES, { each: true })
  enabledLocales?: Locale[];

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationsDto)
  notifications?: NotificationsDto;
}

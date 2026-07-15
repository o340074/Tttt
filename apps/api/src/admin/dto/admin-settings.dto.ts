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

/** A template patch per locale (E9): any subset of enabled locales. */
class LocalizedTemplateDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationTemplateDto)
  en?: NotificationTemplateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationTemplateDto)
  ru?: NotificationTemplateDto;
}

class NotificationsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTemplateDto)
  orderPaid?: LocalizedTemplateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTemplateDto)
  warmingReady?: LocalizedTemplateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTemplateDto)
  ticketReply?: LocalizedTemplateDto;
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

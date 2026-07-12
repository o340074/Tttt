import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import { ChangePasswordDto, UpdateMeDto } from './dto/users.dto';
import { UsersService } from './users.service';
import type { AccessPayload } from '../auth/token.service';
import type { User } from '@advault/types';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async getMe(@CurrentUser() user: AccessPayload): Promise<User> {
    return this.users.getMe(user.sub);
  }

  @Patch()
  async updateMe(@CurrentUser() user: AccessPayload, @Body() dto: UpdateMeDto): Promise<User> {
    return this.users.updateMe(user.sub, dto);
  }

  @HttpCode(204)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AccessPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.users.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }
}

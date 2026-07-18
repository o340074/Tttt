import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiException } from '../common/api-exception';
import { IS_PUBLIC_KEY } from './decorators';
import { TokenService } from './token.service';

/** Global bearer guard; opt out per route with @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const payload = token ? this.tokens.verifyAccess(token) : null;
    if (!payload) {
      throw new ApiException('UNAUTHORIZED', 'Missing or invalid access token', 401);
    }
    request.user = payload;
    return true;
  }
}

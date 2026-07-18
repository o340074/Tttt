import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../common/api-exception';
import { ROLES_KEY } from './decorators';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Role } from '@advault/types';
import type { AccessPayload } from './token.service';

/**
 * RBAC for @Roles()-marked routes (docs/09). Runs after JwtAuthGuard, so
 * request.user is set; an authenticated user without a required role gets
 * 403 FORBIDDEN. Routes without @Roles() are unaffected.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AccessPayload }>();
    if (!request.user || !required.includes(request.user.role)) {
      throw new ApiException('FORBIDDEN', 'Insufficient permissions', 403);
    }
    return true;
  }
}

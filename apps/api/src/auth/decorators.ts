import { SetMetadata, createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Role } from '@advault/types';
import type { AccessPayload } from './token.service';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as reachable without a bearer token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';

/** Restricts a route to the given roles (checked by RolesGuard after auth). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the verified access-token payload set by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: AccessPayload }>();
    return request.user;
  },
);

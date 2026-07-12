import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { HealthResponse } from '@advault/types';
import { Public } from '../auth/decorators';
import { HealthService } from './health.service';

@ApiTags('System')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ description: 'Service is up; dependency states inside.' })
  @ApiServiceUnavailableResponse({ description: 'A dependency is down (degraded).' })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const health = await this.healthService.check();
    res.status(health.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return health;
  }
}

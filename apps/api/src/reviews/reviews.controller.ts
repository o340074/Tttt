import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../auth/decorators';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, ReviewsQueryDto } from './dto/reviews.dto';
import type { ProductReview, ProductReviewsResponse } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

/**
 * Product reviews (E11). Listing a product's reviews is public; writing one
 * requires auth and is validated against a delivered order line the caller owns.
 */
@ApiTags('Reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('products/:slug/reviews')
  async list(
    @Param('slug') slug: string,
    @Query() query: ReviewsQueryDto,
  ): Promise<ProductReviewsResponse> {
    return this.reviews.listForProduct(slug, query.page, query.limit);
  }

  @ApiBearerAuth()
  @Post('reviews')
  async create(
    @CurrentUser() user: AccessPayload,
    @Body() dto: CreateReviewDto,
  ): Promise<ProductReview> {
    return this.reviews.create(user.sub, dto);
  }
}

import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { CatalogService } from './catalog.service';
import { ListProductsDto, LocaleQueryDto } from './dto/catalog.dto';
import { resolveLocale } from './locale';
import type { Category, Paginated, Product, ProductListItem } from '@advault/types';

@ApiTags('Catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('categories')
  async getCategories(
    @Query() query: LocaleQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<Category[]> {
    return this.catalog.getCategories(resolveLocale(query.locale, acceptLanguage));
  }

  @Public()
  @Get('products')
  async listProducts(
    @Query() query: ListProductsDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<Paginated<ProductListItem>> {
    return this.catalog.listProducts(query, resolveLocale(query.locale, acceptLanguage));
  }

  @Public()
  @Get('products/:slug')
  async getProduct(
    @Param('slug') slug: string,
    @Query() query: LocaleQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<Product> {
    return this.catalog.getProductBySlug(slug, resolveLocale(query.locale, acceptLanguage));
  }
}

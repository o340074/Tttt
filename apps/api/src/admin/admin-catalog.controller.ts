import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiException } from '../common/api-exception';
import { CurrentUser, Roles } from '../auth/decorators';
import { CATALOG_STAFF } from '../auth/roles';
import { AdminCatalogService } from './admin-catalog.service';
import {
  CreateCategoryDto,
  CreateProductDto,
  CreateVariantDto,
  ProductQueryDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './dto/admin-catalog.dto';
import type {
  AdminCategory,
  AdminProductDetail,
  AdminProductListItem,
  AdminVariant,
} from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApiException('VALIDATION_ERROR', 'id must be a UUID', 400),
});

/**
 * Catalog & bundles CRUD (docs/13 §5). Managers/admins only; the storefront
 * read surface (E2) is unchanged. Every mutation is audited.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...CATALOG_STAFF)
@Controller('admin')
export class AdminCatalogController {
  constructor(private readonly catalog: AdminCatalogService) {}

  // ----- Categories -----

  @Get('categories')
  async listCategories(): Promise<AdminCategory[]> {
    return this.catalog.listCategories();
  }

  @Post('categories')
  @HttpCode(201)
  async createCategory(
    @CurrentUser() actor: AccessPayload,
    @Body() dto: CreateCategoryDto,
  ): Promise<AdminCategory> {
    return this.catalog.createCategory(actor.sub, dto);
  }

  @Patch('categories/:id')
  async updateCategory(
    @CurrentUser() actor: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<AdminCategory> {
    return this.catalog.updateCategory(actor.sub, id, dto);
  }

  // ----- Products -----

  @Get('products')
  async listProducts(@Query() query: ProductQueryDto): Promise<AdminProductListItem[]> {
    return this.catalog.listProducts(query);
  }

  @Get('products/:id')
  async getProduct(@Param('id', uuidPipe) id: string): Promise<AdminProductDetail> {
    return this.catalog.getProduct(id);
  }

  @Post('products')
  @HttpCode(201)
  async createProduct(
    @CurrentUser() actor: AccessPayload,
    @Body() dto: CreateProductDto,
  ): Promise<AdminProductDetail> {
    return this.catalog.createProduct(actor.sub, dto);
  }

  @Patch('products/:id')
  async updateProduct(
    @CurrentUser() actor: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<AdminProductDetail> {
    return this.catalog.updateProduct(actor.sub, id, dto);
  }

  // ----- Variants -----

  @Post('products/:id/variants')
  @HttpCode(201)
  async createVariant(
    @CurrentUser() actor: AccessPayload,
    @Param('id', uuidPipe) productId: string,
    @Body() dto: CreateVariantDto,
  ): Promise<AdminVariant> {
    return this.catalog.createVariant(actor.sub, productId, dto);
  }

  @Patch('variants/:id')
  async updateVariant(
    @CurrentUser() actor: AccessPayload,
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateVariantDto,
  ): Promise<AdminVariant> {
    return this.catalog.updateVariant(actor.sub, id, dto);
  }
}

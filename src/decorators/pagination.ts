import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Pagination = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const { page, sort, limit, filter } = request.query;

    return {
      page: page ? parseInt(page as string) : undefined,
      sort: sort ? parseInt(sort as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      filter: filter ? (filter as string) : undefined,
    };
  },
);

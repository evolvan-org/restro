/** Standard pagination primitives shared across API responses. */

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function buildPageMeta(page: number, pageSize: number, total: number): PageMeta {
  const safeSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
  return {
    page,
    pageSize: safeSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / safeSize)),
  };
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';
import { reconcileRestaurantTableStatuses } from '../common/database/table-lifecycle';

export type TodaySummaryRecord = {
  revenue: string;
  currency: string;
  orders: number;
  completedOrders: number;
  activeTables: number;
};

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  todaySummary(restaurantId: string): Promise<TodaySummaryRecord | null> {
    return this.prisma.$transaction(
      async (tx) => {
        await reconcileRestaurantTableStatuses(tx, restaurantId);

        const rows = await tx.$queryRaw<TodaySummaryRecord[]>`
          WITH restaurant_context AS (
            SELECT
              r.id,
              r.currency,
              date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE r.timezone)
                AT TIME ZONE r.timezone AS day_start,
              (date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE r.timezone) + INTERVAL '1 day')
                AT TIME ZONE r.timezone AS day_end
            FROM restaurants r
            WHERE r.id = ${restaurantId}::uuid
          )
          SELECT
            COALESCE((
              SELECT SUM(b.total_amount)
              FROM bills b
              WHERE b.restaurant_id = context.id
                AND b.status = 'PAID'
                AND b.paid_at >= context.day_start
                AND b.paid_at < context.day_end
            ), 0)::decimal(20, 2)::text AS revenue,
            context.currency,
            (
              SELECT COUNT(*)
              FROM orders o
              WHERE o.restaurant_id = context.id
                AND o.created_at >= context.day_start
                AND o.created_at < context.day_end
            )::integer AS orders,
            (
              SELECT COUNT(*)
              FROM orders o
              WHERE o.restaurant_id = context.id
                AND o.status = 'COMPLETED'
                AND o.completed_at >= context.day_start
                AND o.completed_at < context.day_end
            )::integer AS "completedOrders",
            (
              SELECT COUNT(*)
              FROM restaurant_tables table_record
              JOIN table_statuses table_status
                ON table_status.id = table_record.current_status_id
                AND table_status.restaurant_id = context.id
              WHERE table_record.restaurant_id = context.id
                AND table_record.is_active = true
                AND table_status.code = 'OCCUPIED'
            )::integer AS "activeTables"
          FROM restaurant_context context
        `;

        return rows[0] ?? null;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}

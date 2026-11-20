import { Injectable } from '@nestjs/common';
import {
  type DailySalesReport,
  type GstReport,
  REPORT_DEFAULT_DAYS,
  type ReportDateRangeQuery,
} from '@rms/api-contract';

import { PrismaService } from '../common/database/prisma.service';

type PaidBillReport = Pick<DailySalesReport, 'range' | 'currency'> & {
  rows: Array<DailySalesReport['rows'][number] & GstReport['rows'][number]>;
  total: DailySalesReport['total'] & GstReport['total'];
};

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async paidBills(
    restaurantId: string,
    range: ReportDateRangeQuery,
  ): Promise<PaidBillReport | null> {
    const [report] = await this.prisma.$queryRaw<PaidBillReport[]>`
      WITH restaurant_context AS (
        SELECT id, timezone, currency, (CURRENT_TIMESTAMP AT TIME ZONE timezone)::date AS today
        FROM restaurants
        WHERE id = ${restaurantId}::uuid
      ),
      report_range AS (
        SELECT id, timezone, currency,
          COALESCE(${range.from ?? null}::date, today - ${REPORT_DEFAULT_DAYS - 1}::integer) AS first_day,
          COALESCE(${range.to ?? null}::date, today) AS last_day
        FROM restaurant_context
      ),
      daily AS (
        SELECT (bill.paid_at AT TIME ZONE report_range.timezone)::date AS day,
          SUM(bill.total_amount) AS revenue,
          COUNT(*)::integer AS orders,
          SUM(bill.subtotal - bill.discount_amount) AS taxable_value,
          SUM(bill.gst_amount) AS gst_collected
        FROM report_range
        JOIN bills bill ON bill.restaurant_id = report_range.id
          AND bill.status = 'PAID'
          -- Keep the index usable, then check exact local dates for zones with ambiguous midnight.
          AND bill.paid_at >= ((report_range.first_day - 1)::timestamp AT TIME ZONE 'UTC')
          AND bill.paid_at < ((report_range.last_day + 2)::timestamp AT TIME ZONE 'UTC')
        WHERE (bill.paid_at AT TIME ZONE report_range.timezone)::date
          BETWEEN report_range.first_day AND report_range.last_day
        GROUP BY day
      )
      SELECT report_range.currency,
        jsonb_build_object(
          'from', TO_CHAR(report_range.first_day, 'YYYY-MM-DD'),
          'to', TO_CHAR(report_range.last_day, 'YYYY-MM-DD')
        ) AS range,
        COALESCE(jsonb_agg(jsonb_build_object(
          'date', TO_CHAR(daily.day, 'YYYY-MM-DD'),
          'revenue', daily.revenue::text,
          'orders', daily.orders,
          'taxableValue', daily.taxable_value::text,
          'gstCollected', daily.gst_collected::text
        ) ORDER BY daily.day) FILTER (WHERE daily.day IS NOT NULL), '[]'::jsonb) AS rows,
        jsonb_build_object(
          'revenue', COALESCE(SUM(daily.revenue), 0.00)::text,
          'orders', COALESCE(SUM(daily.orders), 0),
          'taxableValue', COALESCE(SUM(daily.taxable_value), 0.00)::text,
          'gstCollected', COALESCE(SUM(daily.gst_collected), 0.00)::text
        ) AS total
      FROM report_range
      LEFT JOIN daily ON true
      GROUP BY report_range.currency, report_range.first_day, report_range.last_day
    `;

    return report ?? null;
  }
}

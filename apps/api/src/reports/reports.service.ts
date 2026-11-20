import { Injectable, NotFoundException } from '@nestjs/common';
import type { DailySalesReport, GstReport, ReportDateRangeQuery } from '@rms/api-contract';

import type { Actor } from '../common/auth/authenticated-request';
import { ReportsRepository } from './reports.repository';

@Injectable()
export class ReportsService {
  constructor(private readonly repository: ReportsRepository) {}

  async dailySales(actor: Actor, query: ReportDateRangeQuery): Promise<DailySalesReport> {
    const { range, currency, rows, total } = await this.paidBills(actor, query);
    return {
      range,
      currency,
      rows: rows.map(({ date, revenue, orders }) => ({ date, revenue, orders })),
      total: { revenue: total.revenue, orders: total.orders },
    };
  }

  async gst(actor: Actor, query: ReportDateRangeQuery): Promise<GstReport> {
    const { range, currency, rows, total } = await this.paidBills(actor, query);
    return {
      range,
      currency,
      rows: rows.map(({ date, taxableValue, gstCollected }) => ({
        date,
        taxableValue,
        gstCollected,
      })),
      total: { taxableValue: total.taxableValue, gstCollected: total.gstCollected },
    };
  }

  private async paidBills(actor: Actor, query: ReportDateRangeQuery) {
    const report = await this.repository.paidBills(actor.restaurantId, query);
    if (!report) throw new NotFoundException('Restaurant not found');
    return report;
  }
}

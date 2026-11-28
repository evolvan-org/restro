import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './common';

export const QR_FEEDBACK_COMMENT_MAX = 500;
const qrFeedbackRatingSchema = z.number().int().min(1).max(5);

export const qrFeedbackRequestSchema = z
  .object({
    submissionId: z.string().uuid(),
    rating: qrFeedbackRatingSchema,
    comment: z.string().trim().max(QR_FEEDBACK_COMMENT_MAX).optional(),
  })
  .strict();

export const qrFeedbackListQuerySchema = paginationQuerySchema.extend({
  rating: z.coerce.number().pipe(qrFeedbackRatingSchema).optional(),
});

export const qrFeedbackListResponseSchema = paginatedResponseSchema(
  z
    .object({
      id: z.string().uuid(),
      rating: qrFeedbackRatingSchema,
      comment: z.string().nullable(),
      tableNumber: z.string(),
      section: z.string(),
      createdAt: z.string().datetime(),
    })
    .strict(),
);

export type QrFeedbackRequest = z.infer<typeof qrFeedbackRequestSchema>;
export type QrFeedbackListQuery = z.infer<typeof qrFeedbackListQuerySchema>;
export type QrFeedbackListResponse = z.infer<typeof qrFeedbackListResponseSchema>;

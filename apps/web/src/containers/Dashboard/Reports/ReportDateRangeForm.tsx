import { zodResolver } from '@hookform/resolvers/zod';
import { type ReportDateRange, reportDateRangeSchema } from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type ReportDateRangeFormProps = {
  range?: ReportDateRange;
  onApply: (range: ReportDateRange) => void;
};

export default function ReportDateRangeForm({
  range,
  onApply,
}: ReportDateRangeFormProps): ReactElement {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ReportDateRange>({
    resolver: zodResolver(reportDateRangeSchema),
    defaultValues: { from: '', to: '' },
  });

  useEffect(() => {
    if (range && !isDirty) reset(range);
  }, [isDirty, range, reset]);

  return (
    <form
      aria-label="Report date range"
      className="grid items-start gap-x-2.5 gap-y-3 @xs:grid-cols-2 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] @4xl:w-[27rem] @4xl:shrink-0"
      noValidate
      onSubmit={handleSubmit(onApply)}
    >
      <Field className="min-w-0 gap-1.5">
        <FieldLabel htmlFor="report-from" className="text-xs leading-4 text-muted-foreground">
          Start date
        </FieldLabel>
        <Input
          id="report-from"
          type="date"
          className="rounded-lg bg-background px-2 text-sm shadow-none"
          required
          aria-invalid={Boolean(errors.from)}
          aria-describedby={errors.from ? 'report-from-error' : undefined}
          {...register('from')}
        />
        <FieldError id="report-from-error" errors={[errors.from]} />
      </Field>
      <Field className="min-w-0 gap-1.5">
        <FieldLabel htmlFor="report-to" className="text-xs leading-4 text-muted-foreground">
          End date
        </FieldLabel>
        <Input
          id="report-to"
          type="date"
          className="rounded-lg bg-background px-2 text-sm shadow-none"
          required
          aria-invalid={Boolean(errors.to)}
          aria-describedby={errors.to ? 'report-to-error' : undefined}
          {...register('to')}
        />
        <FieldError id="report-to-error" errors={[errors.to]} />
      </Field>
      <Button className="rounded-lg px-4 @xs:col-span-2 @lg:col-span-1 @lg:mt-[22px]" type="submit">
        Apply range
      </Button>
    </form>
  );
}

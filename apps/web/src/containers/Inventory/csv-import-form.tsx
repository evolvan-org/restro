'use client';

import { INVENTORY_CSV_MAX_BYTES, INVENTORY_CSV_MAX_ROWS } from '@rms/api-contract';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { useImportInventoryCsv } from '@/services/api/requests/inventory';

import { InventoryDialog, InventoryInput, InventorySubmit } from './form-controls';

export default function CsvImportForm({ onClose }: { onClose: () => void }): ReactElement {
  const { mutateAsync: importCsv, isPending, isSuccess } = useImportInventoryCsv();
  const form = useForm<{ csv: FileList }>();
  const { errors } = form.formState;

  return (
    <InventoryDialog title="Import inventory CSV" {...{ onClose, isPending, isSuccess }}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async ({ csv }) => {
          const file = csv?.[0];
          if (!file?.size || !file.name.toLowerCase().endsWith('.csv')) {
            form.setError('csv', { message: 'Select a nonempty .csv file' });
            return;
          }
          if (file.size > INVENTORY_CSV_MAX_BYTES) {
            form.setError('csv', {
              message: `Choose a file up to ${INVENTORY_CSV_MAX_BYTES / 1024} KB`,
            });
            return;
          }
          try {
            await importCsv(file);
          } catch {
            // The request hook reports failures and the file remains selected.
          }
        })}
      >
        <p className="text-sm text-muted-foreground">
          Use an export for the column headers. Keep <code>ingredient_id</code> to update an
          ingredient or leave it blank to add one. Each file can contain up to{' '}
          {INVENTORY_CSV_MAX_ROWS} ingredient rows.
        </p>
        <p className="text-sm text-muted-foreground">
          For a first physical count, fill <code>opening_quantity</code>,{' '}
          <code>opening_unit_cost</code>, and <code>opening_reason</code> together. Current stock,
          average unit cost, and status are report columns.
        </p>
        <InventoryInput
          label="CSV file"
          type="file"
          accept=".csv,text/csv"
          error={errors.csv?.message}
          {...form.register('csv')}
        />
        <InventorySubmit pending={isPending} label="Import CSV" onClose={onClose} />
      </form>
    </InventoryDialog>
  );
}

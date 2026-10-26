'use client';

import type { RestaurantTable } from '@rms/api-contract';
import { type ReactElement, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useAssignTableCaptain, useCaptainOptions } from '@/services/api/requests/tables';

const UNASSIGNED_LABEL = 'Unassigned';

/**
 * Row action that reads "Add captain" / "Update captain" and, once clicked, turns into a
 * searchable captain dropdown. Picking a captain saves immediately; "Unassigned" clears it.
 */
export default function TableCaptainAction({ table }: { table: RestaurantTable }): ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const captains = useCaptainOptions(isEditing);
  const { mutateAsync: assignCaptain, isPending } = useAssignTableCaptain();

  const options = useMemo(() => {
    const list = (captains.data ?? []).map((captain) => ({
      value: captain.id,
      label: captain.name,
    }));
    // Keep a no-longer-eligible current captain visible so the select reflects the saved state.
    if (table.captain && !list.some((option) => option.value === table.captain?.id)) {
      list.unshift({ value: table.captain.id, label: table.captain.name });
    }
    return table.captainUserId ? [{ value: '', label: UNASSIGNED_LABEL }, ...list] : list;
  }, [captains.data, table.captain, table.captainUserId]);

  const onChange = async (next: string): Promise<void> => {
    if (next === (table.captainUserId ?? '')) return;
    setIsEditing(false);
    try {
      const updated = await assignCaptain({ id: table.id, input: { captainUserId: next || null } });
      toast.success(
        updated.captain
          ? `Assigned captain ${updated.captain.name}.`
          : 'Captain assignment cleared.',
      );
    } catch {
      // The mutation hook reports the error through useShowApiError.
    }
  };

  // The trigger button always keeps its fixed width in the row; the dropdown is overlaid on top
  // of it (absolutely positioned) so switching to edit mode never reflows the table.
  const label = isPending
    ? 'Saving...'
    : !isEditing || captains.isSuccess
      ? table.captainUserId
        ? 'Update captain'
        : 'Add captain'
      : captains.isPending
        ? 'Loading captains...'
        : 'Retry loading captains';

  return (
    <div className="relative h-8 w-36 shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full"
        disabled={isPending || (isEditing && captains.isPending)}
        onClick={() => (isEditing ? void captains.refetch() : setIsEditing(true))}
        aria-label={`${table.captainUserId ? 'Update' : 'Add'} captain for table ${table.tableNumber}`}
      >
        {label}
      </Button>
      {isEditing && captains.isSuccess && (
        <div className="absolute inset-x-0 top-0 z-20 text-left">
          <SearchableSelect
            autoOpen
            dropdownInBody
            value={table.captainUserId ?? ''}
            options={options}
            placeholder="Search captains..."
            aria-label={`Captain for table ${table.tableNumber}`}
            onChange={(next) => void onChange(next)}
            onClose={() => setIsEditing(false)}
          />
        </div>
      )}
    </div>
  );
}

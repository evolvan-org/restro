'use client';

import type { AssignTablesCaptainResponse, RestaurantTable, TableCaptain } from '@rms/api-contract';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { shortNameOf } from '@/lib/qr';
import { useAssignTablesCaptain } from '@/services/api/requests/tables';

const UNDO_TOAST_MS = 8_000;
const JUST_ASSIGNED_MS = 3_000;

/** A captain, or `null` for "No captain" (clears the assignment). */
export type AssignTarget = TableCaptain | null;

export type AssignConflicts = {
  target: AssignTarget;
  /** Skipped tables as the server returned them (with their current captain). */
  tables: RestaurantTable[];
  appliedCount: number;
  requestedCount: number;
};

export type PendingTakeover = {
  target: TableCaptain;
  /** Every table being assigned; some currently belong to another captain. */
  tables: RestaurantTable[];
};

export type CaptainAssignment = ReturnType<typeof useCaptainAssignment>;

function tableCount(count: number): string {
  return `${count} ${count === 1 ? 'table' : 'tables'}`;
}

function tableList(tables: readonly RestaurantTable[]): string {
  return tables.map((table) => table.tableNumber).join(', ');
}

/**
 * Assign-captains mode for the floor board (REST-99): selection, drag state, the eye filter, and
 * bulk assignment with takeover confirmation, undo and conflict reporting.
 */
export default function useCaptainAssignment(rows: readonly RestaurantTable[]) {
  const [active, setActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusCaptainId, setFocusCaptainId] = useState<string | null>(null);
  const [dragCount, setDragCount] = useState(0);
  const [justAssigned, setJustAssigned] = useState<{ targetId: string | null; count: number }>();
  const [conflicts, setConflicts] = useState<AssignConflicts | null>(null);
  const [pendingTakeover, setPendingTakeover] = useState<PendingTakeover | null>(null);
  const { mutateAsync: assignTables, isPending } = useAssignTablesCaptain();

  // Board order; tables that left the board (deactivated) drop out of the selection naturally.
  const selected = useMemo(
    () => rows.filter((table) => selectedIds.has(table.id)),
    [rows, selectedIds],
  );
  const conflictIds = useMemo(
    () => new Set(conflicts?.tables.map((table) => table.id)),
    [conflicts],
  );

  const clear = useCallback((): void => {
    setSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  useEffect(() => {
    if (!justAssigned) return;
    const timer = setTimeout(() => setJustAssigned(undefined), JUST_ASSIGNED_MS);
    return () => clearTimeout(timer);
  }, [justAssigned]);

  // Esc clears the selection; open menus, dialogs and the search box keep their own Esc.
  useEffect(() => {
    if (!active || selectedIds.size === 0 || pendingTakeover) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="menu"], [role="dialog"]')) return;
      clear();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, selectedIds.size, pendingTakeover, clear]);

  const enter = (): void => setActive(true);

  const exit = (): void => {
    setActive(false);
    clear();
    setFocusCaptainId(null);
    setDragCount(0);
    setJustAssigned(undefined);
    setConflicts(null);
    setPendingTakeover(null);
  };

  /** Click toggles one table; shift-click selects the range from the last clicked table. */
  const toggle = (
    tableId: string,
    shiftKey: boolean,
    orderedVisibleIds: readonly string[],
  ): void => {
    const from = anchorId ? orderedVisibleIds.indexOf(anchorId) : -1;
    const to = orderedVisibleIds.indexOf(tableId);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (shiftKey && from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        for (const id of orderedVisibleIds.slice(start, end + 1)) next.add(id);
      } else if (next.has(tableId)) {
        next.delete(tableId);
      } else {
        next.add(tableId);
      }
      return next;
    });
    setAnchorId(tableId);
  };

  const selectMany = (tableIds: readonly string[], select: boolean): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of tableIds) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  /** Starts a drag from `tableId`; an unselected tile replaces the selection. */
  const startDrag = (tableId: string): void => {
    if (!selectedIds.has(tableId)) {
      setSelectedIds(new Set([tableId]));
      setAnchorId(tableId);
    }
    setDragCount(selectedIds.has(tableId) ? selectedIds.size : 1);
  };

  const endDrag = (): void => setDragCount(0);

  const send = async (
    assignments: { captainUserId: string | null; tables: readonly RestaurantTable[] }[],
  ): Promise<AssignTablesCaptainResponse | null> => {
    try {
      return await assignTables({
        assignments: assignments.map(({ captainUserId, tables }) => ({
          captainUserId,
          tables: tables.map((table) => ({
            tableId: table.id,
            expectedCaptainUserId: table.captainUserId,
          })),
        })),
      });
    } catch {
      // The mutation hook rolls the board back and reports the error.
      return null;
    }
  };

  const undo = async (
    target: AssignTarget,
    previous: readonly RestaurantTable[],
  ): Promise<void> => {
    const groups = new Map<string | null, RestaurantTable[]>();
    for (const table of previous) {
      // Expected is the captain we just set; the target is the table's earlier captain.
      const asAssigned = { ...table, captainUserId: target?.id ?? null };
      groups.set(table.captainUserId, [...(groups.get(table.captainUserId) ?? []), asAssigned]);
    }
    const result = await send(
      [...groups].map(([captainUserId, tables]) => ({ captainUserId, tables })),
    );
    if (!result) return;
    if (result.conflicts.length > 0) {
      toast.warning(
        `${tableCount(result.conflicts.length)} changed since and ${result.conflicts.length === 1 ? 'was' : 'were'} left as is: ${tableList(result.conflicts)}`,
      );
    } else {
      toast.success('Captain changes undone');
    }
  };

  /** Sends one bulk request; `tables` carry the captain the user saw as the expected value. */
  const commit = async (
    target: AssignTarget,
    tables: readonly RestaurantTable[],
  ): Promise<void> => {
    setPendingTakeover(null);
    setConflicts(null);
    clear();
    const result = await send([{ captainUserId: target?.id ?? null, tables }]);
    if (!result) return;

    const appliedIds = new Set(result.updated.map((table) => table.id));
    const applied = tables.filter((table) => appliedIds.has(table.id));
    if (applied.length > 0)
      setJustAssigned({ targetId: target?.id ?? null, count: applied.length });

    if (result.conflicts.length > 0) {
      setConflicts({
        target,
        tables: result.conflicts,
        appliedCount: applied.length,
        requestedCount: tables.length,
      });
      return;
    }
    toast.success(
      target
        ? `${tableCount(applied.length)} assigned to ${shortNameOf(target.name)}`
        : `Captain removed from ${tableCount(applied.length)}`,
      {
        description: tableList(applied),
        duration: UNDO_TOAST_MS,
        action: { label: 'Undo', onClick: () => void undo(target, applied) },
      },
    );
  };

  /** Assigns the selection; asks first when it would take tables from another captain. */
  const assign = (target: AssignTarget): void => {
    const targetId = target?.id ?? null;
    const tables = selected.filter((table) => table.captainUserId !== targetId);
    if (tables.length === 0) {
      if (selected.length > 0) {
        toast.info(
          target
            ? `Already assigned to ${shortNameOf(target.name)}`
            : 'These tables have no captain',
        );
      }
      clear();
      return;
    }
    if (target && tables.some((table) => table.captainUserId !== null)) {
      setPendingTakeover({ target, tables });
      return;
    }
    void commit(target, tables);
  };

  return {
    active,
    selected,
    selectedIds,
    focusCaptainId,
    dragCount,
    justAssigned,
    conflicts,
    conflictIds,
    pendingTakeover,
    isPending,
    enter,
    exit,
    toggle,
    selectMany,
    clear,
    startDrag,
    endDrag,
    assign,
    setFocusCaptainId,
    confirmTakeover: (): void => {
      if (pendingTakeover) void commit(pendingTakeover.target, pendingTakeover.tables);
    },
    cancelTakeover: (): void => setPendingTakeover(null),
    /** Retries only the skipped tables, against the captain they have now. */
    moveAnyway: (): void => {
      if (conflicts) void commit(conflicts.target, conflicts.tables);
    },
    dismissConflicts: (): void => setConflicts(null),
  };
}

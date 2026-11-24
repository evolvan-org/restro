'use client';

import { Info } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { firstNameOf, initialsOf } from '@/lib/qr';
import { useAssignQrCaptain, useQrCaptains } from '@/services/api/requests/qr-orders';

/**
 * Assign / reassign a table's captain (M3). Shows each captain's load with a "Lightest load" hint;
 * captains who are logged out are listed but can't be picked. Reassigning can move the waiting
 * order to the new captain (on by default), which restarts its timer.
 */
export function AssignCaptainSheet({
  open,
  onOpenChange,
  table,
  currentCaptain,
  waitingText,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: { id: string; number: string } | null;
  currentCaptain: string | null;
  /** e.g. "1 order waiting 3:41" when a round is waiting. */
  waitingText: string | null;
}): ReactElement {
  const captains = useQrCaptains(open ? (table?.id ?? null) : null);
  const assign = useAssignQrCaptain();
  const [selected, setSelected] = useState<string | null>(null);
  const [move, setMove] = useState(true);
  const options = captains.data?.data ?? [];
  const maxLoad = Math.max(1, ...options.map((option) => option.activeTables));
  const chosen =
    options.find((option) => option.id === selected) ??
    options.find((o) => o.lightestLoad && o.available && !o.isCurrent) ??
    null;
  const reassign = currentCaptain !== null;

  async function submit(): Promise<void> {
    if (!table || !chosen) return;
    try {
      await assign.mutateAsync({
        tableId: table.id,
        input: { captainUserId: chosen.id, moveWaitingOrders: move },
      });
      toast.success(`${firstNameOf(chosen.name)} is now captain of Table ${table.number}`);
      onOpenChange(false);
      setSelected(null);
    } catch {
      // Hook shows the error.
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[88svh] max-w-xl overflow-y-auto rounded-t-2xl px-4 pt-2.5 pb-4"
      >
        <div className="mx-auto mb-1 h-[5px] w-10 rounded-full bg-border" aria-hidden />
        <SheetTitle className="text-[19px] font-bold">
          {reassign
            ? `Reassign Table ${table?.number ?? ''}`
            : `Assign captain · Table ${table?.number ?? ''}`}
        </SheetTitle>
        <SheetDescription>
          {reassign
            ? `Currently ${firstNameOf(currentCaptain ?? '')}${waitingText ? ` · ${waitingText}` : ''}`
            : 'Pick who looks after this table. It applies to every future order.'}
        </SheetDescription>
        {captains.isPending ? (
          <div className="flex flex-col gap-2.5" aria-busy="true">
            {[0, 1, 2].map((key) => (
              <div key={key} className="qr-skeleton h-[72px] w-full" />
            ))}
          </div>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No one can be a captain yet. Give a role “Can be assigned as table captain” in Settings
            → Roles.
          </p>
        ) : (
          <div role="radiogroup" aria-label="Captain" className="flex flex-col gap-2.5">
            {options.map((option) => {
              const checked = chosen?.id === option.id;
              const disabled = !option.available;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-disabled={disabled}
                  disabled={disabled}
                  onClick={() => setSelected(option.id)}
                  className="flex min-h-[72px] items-center gap-3 rounded-[10px] px-3 py-2 text-left disabled:opacity-50"
                  style={{
                    border: checked ? '2px solid var(--primary)' : '1px solid var(--border)',
                  }}
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full"
                    style={{
                      boxShadow: `inset 0 0 0 2px ${checked ? 'var(--primary)' : 'var(--muted-foreground)'}`,
                    }}
                    aria-hidden
                  >
                    {checked && <span className="size-3 rounded-full bg-primary" />}
                  </span>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-bold">
                    {initialsOf(option.name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <b>
                        {option.name}
                        {option.isCurrent && ' (current)'}
                      </b>
                      {option.lightestLoad && option.available && (
                        <span
                          className="inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-semibold"
                          style={{ borderColor: 'var(--qs-rd)', color: 'var(--qs-rd-f)' }}
                        >
                          Lightest load
                        </span>
                      )}
                      {!option.available && (
                        <span className="inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-semibold">
                          Logged out
                        </span>
                      )}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {option.available
                        ? `${option.activeTables} active ${option.activeTables === 1 ? 'table' : 'tables'} · ${option.pendingOrders} pending ${option.pendingOrders === 1 ? 'order' : 'orders'}`
                        : 'Not available'}
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span
                        className="block h-1.5 bg-foreground"
                        style={{
                          width: option.available
                            ? `${Math.round((option.activeTables / maxLoad) * 84)}%`
                            : '0%',
                        }}
                      />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {reassign && waitingText && chosen && (
          <label className="flex cursor-pointer items-center gap-3 rounded-[9px] bg-muted p-3">
            <input
              type="checkbox"
              role="switch"
              checked={move}
              onChange={(event) => setMove(event.target.checked)}
              className="peer sr-only"
            />
            <span
              className="relative h-[26px] w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
              style={{ background: move ? 'var(--primary)' : 'var(--border)' }}
              aria-hidden
            >
              <span
                className="absolute top-[3px] size-5 rounded-full transition-all"
                style={{
                  left: move ? 21 : 3,
                  background: move ? 'var(--primary-foreground)' : '#fff',
                }}
              />
            </span>
            <span className="flex flex-col">
              <b className="text-sm">Move the waiting order to {firstNameOf(chosen.name)}</b>
              <span className="text-xs text-muted-foreground">
                Future orders always go to the table’s captain
              </span>
            </span>
          </label>
        )}
        {chosen && (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Info className="size-4 shrink-0" aria-hidden />
            The guest’s phone will show “{firstNameOf(chosen.name)} is now looking after your
            table”.
          </p>
        )}
        <Button
          className="min-h-14 w-full text-base"
          disabled={!chosen || assign.isPending}
          onClick={() => void submit()}
        >
          {chosen
            ? `Assign ${firstNameOf(chosen.name)} to Table ${table?.number ?? ''}`
            : 'Choose a captain'}
        </Button>
      </SheetContent>
    </Sheet>
  );
}

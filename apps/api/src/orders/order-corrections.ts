export function canVoidTicketLines(
  lines: readonly { status: string; kot: { status: string; source: string } }[],
): boolean {
  return (
    lines.length > 0 &&
    lines.every(
      ({ status, kot }) =>
        status === 'PENDING' && kot.status === 'PENDING' && kot.source === 'STAFF',
    )
  );
}

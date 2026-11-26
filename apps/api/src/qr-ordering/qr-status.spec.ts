import {
  escalationDeadline,
  firstName,
  initials,
  isCaptainAvailable,
  roundDisplayStatus,
} from './qr-status';

describe('roundDisplayStatus', () => {
  const awaiting = { status: 'AWAITING_APPROVAL' as const, escalatedAt: null };
  const approved = { status: 'APPROVED' as const, escalatedAt: null };

  it('maps approval states', () => {
    expect(roundDisplayStatus(awaiting, [])).toBe('awaiting');
    expect(roundDisplayStatus({ ...awaiting, escalatedAt: new Date() }, [])).toBe('escalated');
    expect(roundDisplayStatus({ status: 'REJECTED', escalatedAt: null }, [])).toBe('rejected');
    expect(roundDisplayStatus(approved, [{ status: 'PENDING' }])).toBe('approved');
  });

  it('derives kitchen progress from every ticket of the round', () => {
    expect(roundDisplayStatus(approved, [{ status: 'PREPARING' }, { status: 'PENDING' }])).toBe(
      'preparing',
    );
    // Bar is ready but the kitchen is still cooking: not "on its way" yet.
    expect(roundDisplayStatus(approved, [{ status: 'READY' }, { status: 'PREPARING' }])).toBe(
      'preparing',
    );
    expect(roundDisplayStatus(approved, [{ status: 'READY' }, { status: 'COMPLETED' }])).toBe(
      'ready',
    );
    expect(roundDisplayStatus(approved, [{ status: 'COMPLETED' }])).toBe('served');
  });
});

describe('escalation and availability', () => {
  it('computes the deadline from the setting, clamped to 1–15 minutes', () => {
    const at = new Date('2026-11-24T10:00:00Z');
    expect(escalationDeadline(at, 3).toISOString()).toBe('2026-11-24T10:03:00.000Z');
    expect(escalationDeadline(at, 0).toISOString()).toBe('2026-11-24T10:01:00.000Z');
    expect(escalationDeadline(at, 99).toISOString()).toBe('2026-11-24T10:15:00.000Z');
  });

  it('treats inactive, never-seen or long-idle captains as unavailable', () => {
    const now = new Date('2026-11-24T10:00:00Z');
    const recent = new Date('2026-11-24T09:50:00Z');
    const stale = new Date('2026-11-24T09:30:00Z');
    expect(isCaptainAvailable({ status: 'ACTIVE', lastSeenAt: recent }, now)).toBe(true);
    expect(isCaptainAvailable({ status: 'ACTIVE', lastSeenAt: stale }, now)).toBe(false);
    expect(isCaptainAvailable({ status: 'ACTIVE', lastSeenAt: null }, now)).toBe(false);
    expect(isCaptainAvailable({ status: 'INACTIVE', lastSeenAt: recent }, now)).toBe(false);
    expect(isCaptainAvailable(null, now)).toBe(false);
  });

  it('formats guest-facing names', () => {
    expect(firstName('Arjun Mehta')).toBe('Arjun');
    expect(initials('The Spice Room')).toBe('SR');
    expect(initials('Masala Lane')).toBe('ML');
  });
});

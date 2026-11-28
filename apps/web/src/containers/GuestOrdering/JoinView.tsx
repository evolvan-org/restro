'use client';

import { qrJoinRequestSchema } from '@rms/api-contract';
import { type FormEvent, type ReactElement, useEffect, useState } from 'react';

import { guestErrorMessage, readProfile, useJoin } from './api';
import GuestFeedback from './GuestFeedback';
import { type Brand, BrandHeader } from './parts';

/**
 * Before ordering, each phone gives a name and phone number (both required). The server keeps the
 * phone on the restaurant's guest record; on the table the name labels what this phone added.
 */
export default function JoinView({
  token,
  brand,
  tableNumber,
  captainName,
}: {
  token: string;
  brand: Brand;
  tableNumber: string;
  captainName: string | null;
}): ReactElement {
  const join = useJoin(token);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string; form?: string }>({});

  useEffect(() => {
    const profile = readProfile();
    if (profile) {
      setName(profile.name);
      setPhone(profile.phone);
    }
  }, []);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const parsed = qrJoinRequestSchema.safeParse({ name, phone });
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      setErrors({ name: issues.name?.[0], phone: issues.phone?.[0] });
      return;
    }
    setErrors({});
    try {
      await join.mutateAsync(parsed.data);
    } catch (error) {
      setErrors({ form: guestErrorMessage(error) });
    }
  }

  return (
    <div>
      <BrandHeader
        brand={brand}
        sub={
          <>
            Table {tableNumber}
            {captainName && (
              <>
                {' '}
                · Your server: <b style={{ color: '#2B1A12' }}>{captainName}</b>
              </>
            )}
          </>
        }
      />
      <form
        className="col"
        style={{ padding: '18px 20px 24px', gap: 16 }}
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <div className="col" style={{ gap: 6 }}>
          <h2 className="fr" style={{ fontSize: 26, lineHeight: 1.15 }}>
            Welcome! Who’s ordering?
          </h2>
          <p className="gm" style={{ fontSize: 15 }}>
            {captainName ?? 'Your server'} uses this to find you at the table.
          </p>
        </div>
        <label className="col" style={{ gap: 6, fontWeight: 700, fontSize: 14 }}>
          Your name
          <input
            className="gfield"
            name="name"
            autoComplete="given-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'join-name-error' : undefined}
            required
          />
          {errors.name && (
            <span
              id="join-name-error"
              style={{ color: 'var(--qs-rj-f)', fontWeight: 500, fontSize: 13 }}
            >
              {errors.name}
            </span>
          )}
        </label>
        <label className="col" style={{ gap: 6, fontWeight: 700, fontSize: 14 }}>
          Phone number
          <input
            className="gfield"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            maxLength={20}
            onChange={(event) => setPhone(event.target.value)}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? 'join-phone-error' : undefined}
            required
          />
          {errors.phone && (
            <span
              id="join-phone-error"
              style={{ color: 'var(--qs-rj-f)', fontWeight: 500, fontSize: 13 }}
            >
              {errors.phone}
            </span>
          )}
        </label>
        {errors.form && (
          <p role="alert" style={{ color: 'var(--qs-rj-f)', fontWeight: 600 }}>
            {errors.form}
          </p>
        )}
        <button type="submit" className="gb" disabled={join.isPending}>
          {join.isPending ? 'One moment…' : 'Start ordering'}
        </button>
        <p className="gm" style={{ fontSize: 13, textAlign: 'center' }}>
          No app, no login. Everyone at the table can order from their own phone.
        </p>
      </form>
      <div className="px-5 pb-6">
        <GuestFeedback token={token} />
      </div>
    </div>
  );
}

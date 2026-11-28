'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  authenticatorDisableSchema,
  authenticatorEnableSchema,
  authenticatorPasswordSchema,
} from '@rms/api-contract';
import Image from 'next/image';
import { toDataURL } from 'qrcode';
import { type ReactElement, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  useAuthenticatorSetup,
  useAuthenticatorStatus,
  useDisableAuthenticator,
  useEnableAuthenticator,
} from '@/services/api/requests/authenticator';

function SetupCode({ uri }: { uri: string }): ReactElement {
  const [dataUrl, setDataUrl] = useState('');
  useEffect(() => {
    let active = true;
    void toDataURL(uri, { width: 192, margin: 3 }).then(
      (url) => {
        if (active) setDataUrl(url);
      },
      () => {
        if (active) setDataUrl('');
      },
    );
    return () => {
      active = false;
    };
  }, [uri]);
  return dataUrl ? (
    <Image
      unoptimized
      src={dataUrl}
      alt="Scan in your authenticator app"
      width={192}
      height={192}
    />
  ) : (
    <p className="text-sm">You can enter the setup key manually.</p>
  );
}

export default function Authenticator(): ReactElement {
  const status = useAuthenticatorStatus();
  const {
    mutateAsync: start,
    data: setup,
    reset: resetSetup,
    isPending: starting,
  } = useAuthenticatorSetup();
  const {
    mutateAsync: enable,
    data: recoveryCodes,
    reset: hideCodes,
    isPending: enabling,
  } = useEnableAuthenticator();
  const { mutateAsync: disable, isPending: disabling } = useDisableAuthenticator();
  const startForm = useForm({
    resolver: zodResolver(authenticatorPasswordSchema),
    defaultValues: { password: '' },
  });
  const enableForm = useForm({
    resolver: zodResolver(authenticatorEnableSchema),
    defaultValues: { code: '' },
  });
  const disableForm = useForm({
    resolver: zodResolver(authenticatorDisableSchema),
    defaultValues: { password: '', code: '' },
  });

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isPending && <p role="status">Checking your authenticator settings…</p>}
        {status.isError && (
          <Button variant="outline" onClick={() => void status.refetch()}>
            Retry authenticator settings
          </Button>
        )}
        {status.data?.enabled && (
          <p>Enabled · {status.data.recoveryCodesRemaining} recovery codes remaining</p>
        )}
        {recoveryCodes && (
          <section className="space-y-3 rounded-md border p-4" aria-label="Recovery codes">
            <h3 className="font-semibold">Save your recovery codes</h3>
            <p>Store these somewhere safe. Each code works once and is shown only now.</p>
            <ul className="grid gap-2 font-mono sm:grid-cols-2">
              {recoveryCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
            <Button onClick={() => hideCodes()}>I’ve saved the codes</Button>
          </section>
        )}
        {status.data && !status.data.enabled && !setup && (
          <form
            className="space-y-2"
            onSubmit={startForm.handleSubmit(async (values) => {
              try {
                await start(values);
                startForm.reset();
              } catch {
                /* The request hook reports the error. */
              }
            })}
          >
            <label className="block text-sm" htmlFor="authenticator-setup-password">
              Current password
            </label>
            <Input
              id="authenticator-setup-password"
              type="password"
              autoComplete="current-password"
              {...startForm.register('password')}
            />
            <FieldError>{startForm.formState.errors.password?.message}</FieldError>
            <Button disabled={starting} type="submit">
              Set up authenticator
            </Button>
          </form>
        )}
        {setup && !status.data?.enabled && (
          <form
            className="space-y-2"
            onSubmit={enableForm.handleSubmit(async (values) => {
              try {
                await enable(values);
                resetSetup();
                enableForm.reset();
              } catch {
                /* The request hook reports the error. */
              }
            })}
          >
            <p>Scan the QR code or enter the setup key in your authenticator app.</p>
            <SetupCode uri={setup.uri} />
            <code className="block break-all rounded border p-2">{setup.secret}</code>
            <label className="block text-sm" htmlFor="authenticator-enable-code">
              Six-digit code
            </label>
            <Input
              id="authenticator-enable-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              {...enableForm.register('code')}
            />
            <FieldError>{enableForm.formState.errors.code?.message}</FieldError>
            <div className="flex gap-2">
              <Button disabled={enabling} type="submit">
                Enable two-factor authentication
              </Button>
              <Button
                disabled={enabling}
                type="button"
                variant="outline"
                onClick={() => {
                  resetSetup();
                  enableForm.reset();
                }}
              >
                Start over
              </Button>
            </div>
          </form>
        )}
        {status.data?.enabled && !recoveryCodes && (
          <form
            className="space-y-2"
            onSubmit={disableForm.handleSubmit(async (values) => {
              try {
                await disable(values);
                disableForm.reset();
              } catch {
                /* The request hook reports the error. */
              }
            })}
          >
            <label className="block text-sm" htmlFor="authenticator-disable-password">
              Current password
            </label>
            <Input
              id="authenticator-disable-password"
              type="password"
              autoComplete="current-password"
              {...disableForm.register('password')}
            />
            <FieldError>{disableForm.formState.errors.password?.message}</FieldError>
            <label className="block text-sm" htmlFor="authenticator-disable-code">
              Authenticator or recovery code
            </label>
            <Input
              id="authenticator-disable-code"
              autoComplete="one-time-code"
              {...disableForm.register('code')}
            />
            <FieldError>{disableForm.formState.errors.code?.message}</FieldError>
            <Button disabled={disabling} type="submit" variant="outline">
              Disable two-factor authentication
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

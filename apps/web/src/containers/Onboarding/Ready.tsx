'use client';

import { BarChart3, BookOpen, Check, Info, MailWarning, Store } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect, useState } from 'react';

import { formatRoleLabel } from '@/lib/utils';

import { plural } from './format';
import { useOnboarding } from './OnboardingProvider';
import { FooterBar, TopBar } from './Shell';
import { Alert, btn, Card, Chip } from './ui/kit';

const CONFETTI_COLORS = ['#4338ca', '#16803c', '#b45309', '#0a0a0a', '#b3261e'];

/** Counts up to `value` once (instantly when motion is reduced). */
function CountUp({ value, suffix = '' }: { value: number; suffix?: string }): ReactElement {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    let current = 0;
    const step = Math.max(1, Math.round(value / 18));
    const timer = window.setInterval(() => {
      current = Math.min(value, current + step);
      setShown(current);
      if (current >= value) window.clearInterval(timer);
    }, 40);
    return () => window.clearInterval(timer);
  }, [value]);
  return (
    <>
      {shown}
      {suffix}
    </>
  );
}

/** Ready (board "Ready"): the payoff, entry points and what's still to do. */
export default function Ready(): ReactElement | null {
  const router = useRouter();
  const { result } = useOnboarding();

  useEffect(() => {
    if (!result) router.replace('/dashboard');
  }, [result, router]);
  if (!result) return null;

  const { counts, invitations, invitationsHeld } = result;
  const unsent = invitations.filter((person) => !person.emailSent);
  const stillToDo = [
    !counts.tables && 'floor and tables',
    !counts.menuItems && 'your menu',
    !counts.teamMembers && 'team',
  ].filter(Boolean) as string[];

  const stats: [number | null, string, string?][] = [
    [counts.menuItems, 'dishes'],
    [counts.recipes, 'recipes'],
    [counts.stockItems, 'ingredients'],
  ];
  const links = [
    {
      icon: <Store aria-hidden />,
      title: 'Floor board',
      detail: counts.tables
        ? `${plural(counts.tables, 'table')} ready for service`
        : 'Add your sections and tables',
      href: '/dashboard',
    },
    {
      icon: <BookOpen aria-hidden />,
      title: 'Menu',
      detail: `See your ${plural(counts.menuItems, 'dish', 'dishes')} live`,
      href: '/menu/items',
    },
    {
      icon: <BarChart3 aria-hidden />,
      title: 'Margin report',
      detail: 'Food cost per dish, filling in as you scan supplier invoices',
      href: '/margins',
    },
  ];

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <TopBar savedLabel="All saved" />
      <main className="flex-1 overflow-auto px-4 py-6 sm:px-8">
        <div className="relative mx-auto w-full max-w-[1100px]">
          <div
            className="pointer-events-none absolute inset-x-0 -top-5 h-[380px] overflow-hidden motion-reduce:hidden"
            aria-hidden
          >
            {Array.from({ length: 46 }, (_, i) => {
              const r = (a: number, b: number, s: number): number =>
                a + ((((Math.sin(i * 12.9 + s) * 43758.5453) % 1) + 1) % 1) * (b - a);
              return (
                <i
                  key={i}
                  className="absolute animate-[ready-fall_1.6s_ease-out_forwards] opacity-0"
                  style={{
                    left: `${r(2, 98, 1)}%`,
                    top: `${r(-20, 300, 2)}px`,
                    width: `${r(5, 9, 3)}px`,
                    height: `${r(8, 14, 4)}px`,
                    background: CONFETTI_COLORS[Math.floor(r(0, 5, 5))],
                    borderRadius: i % 2 ? '2px' : '50%',
                    animationDelay: `${(i % 12) * 60}ms`,
                  }}
                />
              );
            })}
          </div>

          <div className="relative flex flex-col items-center gap-3.5 pt-8 text-center">
            <span className="flex size-[76px] animate-[ready-pop_.5s_cubic-bezier(.2,1.4,.4,1)] items-center justify-center rounded-full bg-emerald-700 text-white shadow-[0_0_0_10px_#f0fdf4] motion-reduce:animate-none dark:shadow-[0_0_0_10px_#052e16]">
              <Check className="size-10" strokeWidth={2.5} aria-hidden />
            </span>
            <h1 className="mt-2 text-[40px] leading-tight font-bold tracking-[-0.03em]">
              Your restaurant is ready.
            </h1>
            <p className="text-[17px] text-muted-foreground">
              {result.restaurantName} is set up and live.
            </p>
          </div>

          <div className="relative mt-8 grid grid-cols-3 gap-4">
            {stats.map(([value, label, suffix]) => (
              <Card key={label} className="p-5 text-center">
                <div className="text-[44px] leading-tight font-bold tracking-[-0.03em] tabular-nums">
                  {value === null ? '—' : <CountUp value={value} suffix={suffix} />}
                </div>
                <div className="text-sm text-muted-foreground">{label}</div>
              </Card>
            ))}
          </div>

          <div className="relative mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            {links.map((link) => (
              <Card key={link.title} className="flex items-center gap-3.5 p-[18px]">
                <span className="flex size-11 flex-none items-center justify-center rounded-[10px] border border-border bg-muted [&_svg]:size-5">
                  {link.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{link.title}</div>
                  <div className="text-[13px] text-muted-foreground">{link.detail}</div>
                </div>
                <button
                  type="button"
                  className={btn('default', 'sm')}
                  onClick={() => router.replace(link.href)}
                >
                  Open
                </button>
              </Card>
            ))}
          </div>

          {stillToDo.length > 0 && (
            <Alert tone="warn" icon={<Info aria-hidden />} className="relative mt-5 items-center">
              <b>Still to do:</b> {stillToDo.join(', ')}.
            </Alert>
          )}

          {invitations.length > 0 && (
            <Card as="section" className="relative mt-5 flex flex-col gap-3 p-5">
              <div>
                <h2 className="text-base font-semibold">Team invitations</h2>
                <p className="text-sm text-muted-foreground">
                  {unsent.length === 0
                    ? 'Each person got an email with a link to set their password.'
                    : 'Their accounts are created. Invitations that were not sent can be resent from the Staff page.'}
                </p>
              </div>
              {unsent.length > 0 && (
                <Alert tone="warn" role="status" icon={<MailWarning aria-hidden />}>
                  {invitationsHeld
                    ? 'Invitations are waiting because your own email isn’t verified yet. Verify it, then use Resend invitation on the Staff page.'
                    : 'Some invitation emails could not be sent. Use Resend invitation on the Staff page.'}
                </Alert>
              )}
              <ul className="flex flex-col divide-y divide-border rounded-[10px] border border-border">
                {invitations.map((person) => (
                  <li key={person.userId} className="flex items-center justify-between gap-3 p-4">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-semibold">
                        {person.name} · {formatRoleLabel(person.role)}
                      </span>
                      <span className="truncate text-sm text-muted-foreground">{person.email}</span>
                    </div>
                    <Chip tone={person.emailSent ? 'ok' : 'warn'}>
                      {person.emailSent ? 'Invitation sent' : 'Not sent yet'}
                    </Chip>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <style>{`
          @keyframes ready-fall { 0% { opacity: 0; transform: translateY(-30px) rotate(0); } 20% { opacity: .85; } 100% { opacity: .75; transform: translateY(40px) rotate(160deg); } }
          @keyframes ready-pop { from { transform: scale(.4); opacity: 0; } to { transform: none; opacity: 1; } }
        `}</style>
      </main>
      <FooterBar
        center
        footer={{
          primary: (
            <button
              type="button"
              className={btn('primary', 'lg')}
              onClick={() => router.replace('/dashboard')}
            >
              Go to dashboard
            </button>
          ),
        }}
      />
    </div>
  );
}

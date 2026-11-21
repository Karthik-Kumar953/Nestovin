'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from '../lib/router';
import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { Button, ErrorBanner, InfoBanner, TextInput } from '../components/ui';
import { useAuth } from './AuthProvider';

/** Run-sheet bar in the decorative aside. */
const LANE = 'absolute top-[3px] bottom-[3px] rounded-[4px] bg-teal-mid/55';
/** Secondary text link under the form ("Forgot password?", "Back to sign in"). */
const SUBTLE_LINK = 'self-center text-[13.5px]';

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-2 bg-surface max-[901px]:grid-cols-1">
      <aside className="relative flex flex-col justify-between overflow-hidden bg-shell p-12 text-shell-ink max-[901px]:hidden" aria-hidden>
        <div className="row" style={{ gap: 10 }}>
          <Image src="/nestovin-logo.png" alt="" className="sidebar-logo" width={30} height={30} />
          <span className="sidebar-brand-name" style={{ color: '#fff' }}>
            Nestovin
          </span>
        </div>
        <div>
          <h2 className="max-w-[18ch] text-[30px] leading-[38px] font-semibold text-white">Every visit, every community, one run sheet.</h2>
          <p className="mt-3 mb-0 max-w-[44ch] text-[15px] leading-[23px] text-shell-muted">Onboard communities, take demand, allocate workers, verify attendance and run payroll from the admin portal.</p>
          <div className="mt-10 grid gap-2.5">
            {[
              [6, 14, 30, 18, 58, 12],
              [12, 20, 40, 14, 70, 16],
              [4, 10, 24, 22, 52, 20],
              [18, 16, 46, 12, 66, 14],
            ].map((l, i) => (
              <div key={i} className="relative h-[22px] rounded-control-sm bg-white/6">
                <span className={LANE} style={{ left: `${l[0]}%`, width: `${l[1]}%` }} />
                <span className={LANE} style={{ left: `${l[2]}%`, width: `${l[3]}%` }} />
                <span className={LANE} style={{ left: `${l[4]}%`, width: `${l[5]}%` }} />
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 mb-0 max-w-[44ch] text-[15px] leading-[23px] text-shell-muted" style={{ fontSize: 12.5 }}>Access is by invitation only. Every action is recorded.</p>
      </aside>
      <main className="grid place-items-center px-5 py-8">
        <div className="flex w-full max-w-[400px] flex-col gap-[18px]">
          <Image src="/nestovin-logo.png" alt="Nestovin" className="h-10 w-auto self-start" width={45} height={40} priority />
          <h1 className="text-[26px] leading-[34px] font-bold">{title}</h1>
          {subtitle ? <p className="mx-0 -mt-2 mb-1 text-ink-quiet">{subtitle}</p> : null}
          {children}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- sign in

export function LoginPage() {
  const { status } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'ready') return <Navigate to="/" replace />;
  if (status === 'needsMfa') return <Navigate to="/mfa" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    // Generic message: never reveal whether the email exists.
    if (err) setError(new Error('Email or password is incorrect.'));
  }

  return (
    <AuthShell title="Sign in to Nestovin Admin" subtitle="Admin access is by invitation only.">
      {!supabaseConfigured ? (
        <InfoBanner tone="warning">
          The portal is not configured. Copy <code>apps/web/.env.example</code> to <code>apps/web/.env.local</code>.
        </InfoBanner>
      ) : null}
      <form onSubmit={submit} className="stack" noValidate>
        <ErrorBanner error={error} />
        <TextInput
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextInput
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" busy={busy} disabled={!email || !password}>
          Sign in
        </Button>
        <Link to="/forgot-password" className={SUBTLE_LINK}>
          Forgot password?
        </Link>
      </form>
    </AuthShell>
  );
}

// ------------------------------------------------------- forgot password

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin/accept-invite?mode=reset`,
    });
    setBusy(false);
    // Always show the same confirmation, whether or not the account exists.
    setSent(true);
  }

  return (
    <AuthShell title="Reset your password">
      {sent ? (
        <InfoBanner tone="success">If this email belongs to an admin account, a reset link is on its way.</InfoBanner>
      ) : (
        <form onSubmit={submit} className="stack">
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" busy={busy} disabled={!email}>
            Send reset link
          </Button>
        </form>
      )}
      <Link to="/login" className={SUBTLE_LINK}>
        Back to sign in
      </Link>
    </AuthShell>
  );
}

// ------------------------------------------- invite acceptance / new password

function passwordProblem(p: string): string | undefined {
  if (p.length < 12) return 'Use at least 12 characters';
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/[0-9]/.test(p)) return 'Include upper- and lower-case letters and a number';
  return undefined;
}

export function SetPasswordPage() {
  const { session, status } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const isReset = search.get('mode') === 'reset';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const problem = password ? passwordProblem(password) : undefined;

  if (status === 'loading') return null;
  if (!session) {
    return (
      <AuthShell title="This link has expired">
        <p>Invitation and reset links can be used once and expire. Ask your Super Admin for a new invitation, or request a new reset link.</p>
        <Link to="/forgot-password" className={SUBTLE_LINK}>
          Request a reset link
        </Link>
      </AuthShell>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (problem || password !== confirm) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(new Error(err.message));
      return;
    }
    navigate('/mfa', { replace: true });
  }

  return (
    <AuthShell
      title={isReset ? 'Choose a new password' : 'Welcome to Nestovin Admin'}
      subtitle={isReset ? undefined : 'Set a password, then secure your account with an authenticator app.'}
    >
      <form onSubmit={submit} className="stack">
        <ErrorBanner error={error} />
        <TextInput
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={problem}
          hint="At least 12 characters, with upper- and lower-case letters and a number."
          required
        />
        <TextInput
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={confirm && confirm !== password ? 'Passwords do not match' : undefined}
          required
        />
        <Button type="submit" busy={busy} disabled={!password || Boolean(problem) || password !== confirm}>
          Save password
        </Button>
      </form>
    </AuthShell>
  );
}

// ------------------------------------------------------------------- MFA

/**
 * TOTP is mandatory for every admin (ADR-008). First sign-in enrols an
 * authenticator app; later sign-ins answer a challenge. Until this succeeds the
 * session is aal1 and the API rejects every admin call.
 */
export function MfaPage() {
  const { status, refresh, signOut } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrolment, setEnrolment] = useState<{ uri: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(true);

  useEffect(() => {
    if (status !== 'needsMfa') return;
    let cancelled = false;
    void (async () => {
      setPreparing(true);
      const { data, error: err } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (err) {
        setError(new Error(err.message));
        setPreparing(false);
        return;
      }
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) {
        setFactorId(verified.id);
        setEnrolment(null);
      } else {
        // Clean up abandoned, unverified enrolments, then start a fresh one.
        for (const f of data.all.filter((x) => x.status === 'unverified')) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        const { data: en, error: enErr } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
        });
        if (cancelled) return;
        if (enErr || !en) setError(new Error(enErr?.message ?? 'Could not start enrolment'));
        else {
          setFactorId(en.id);
          setEnrolment({ uri: en.totp.uri, secret: en.totp.secret });
        }
      }
      setPreparing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === 'signedOut') return <Navigate to="/login" replace />;
  if (status === 'ready') return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (err) {
      setError(new Error('That code did not work. Check the time on your phone and try the latest code.'));
      return;
    }
    await refresh();
  }

  return (
    <AuthShell
      title={enrolment ? 'Set up two-factor verification' : 'Two-factor verification'}
      subtitle={
        enrolment
          ? 'Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), then enter the 6-digit code.'
          : 'Enter the 6-digit code from your authenticator app.'
      }
    >
      {preparing ? <p>Preparing…</p> : null}
      {enrolment ? (
        <div className="flex flex-col items-center gap-2 rounded-panel border border-rule p-4">
          <QRCodeSVG value={enrolment.uri} size={176} marginSize={2} title="Authenticator QR code" />
          <p className="field-hint">
            Can’t scan? Enter this key manually: <code className="secret">{enrolment.secret}</code>
          </p>
        </div>
      ) : null}
      <form onSubmit={submit} className="stack">
        <ErrorBanner error={error} />
        <TextInput
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          required
        />
        <Button type="submit" busy={busy} disabled={code.length !== 6 || !factorId}>
          Verify
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </form>
    </AuthShell>
  );
}

// ------------------------------------------------------------ denied state

export function AccessDeniedPage() {
  const { deniedReason, signOut, status } = useAuth();
  if (status !== 'denied') return <Navigate to="/" replace />;
  return (
    <AuthShell title="No admin access">
      <p>{deniedReason ?? 'This account does not have access to the Admin Portal.'}</p>
      <p className="field-hint">If you believe this is a mistake, contact your Super Admin.</p>
      <Button variant="secondary" onClick={() => void signOut()}>
        Sign out
      </Button>
    </AuthShell>
  );
}

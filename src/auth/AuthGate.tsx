import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configureAccessTokenProvider, fetchSession } from '../api.ts';
import { supabase } from './supabase.ts';

type AuthStage = 'loading' | 'sign-in' | 'enroll' | 'challenge' | 'ready' | 'error';

interface Enrollment {
  id: string;
  totp: {
    qrCode: string;
    secret: string;
  };
}

interface AuthGateProps {
  children: (onDirtyChange: (dirty: boolean) => void) => ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [stage, setStage] = useState<AuthStage>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasEnteredApp, setHasEnteredApp] = useState(false);
  const [dirty, setDirty] = useState(false);
  const evaluationId = useRef(0);

  const evaluateSession = useCallback(async () => {
    const id = ++evaluationId.current;
    setError(null);

    const [{ data: factors, error: factorsError }, { data: assurance, error: assuranceError }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (id !== evaluationId.current) return;
    if (factorsError || assuranceError) {
      setError(factorsError?.message ?? assuranceError?.message ?? 'Authentication could not be verified.');
      setStage('sign-in');
      return;
    }

    const verifiedFactor = factors.totp.find((factor) => factor.status === 'verified');
    if (!verifiedFactor) {
      setFactorId(null);
      setStage('enroll');
      return;
    }

    if (assurance.currentLevel === 'aal2') {
      try {
        await fetchSession();
      } catch (sessionError) {
        if (id !== evaluationId.current) return;
        setError(sessionError instanceof Error ? sessionError.message : 'The API rejected this session.');
        setStage('error');
        return;
      }
      if (id !== evaluationId.current) return;
      setFactorId(verifiedFactor.id);
      setEnrollment(null);
      setStage('ready');
      setHasEnteredApp(true);
      return;
    }

    if (assurance.nextLevel === 'aal2') {
      setFactorId(verifiedFactor.id);
      setStage('challenge');
      return;
    }

    setError('This account cannot satisfy the required multi-factor authentication policy.');
    setStage('sign-in');
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  useEffect(() => {
    configureAccessTokenProvider(async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    });

    let active = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      if (!data.session) setStage('sign-in');
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setStage('sign-in');
    });

    const onAuthenticationRequired = () => {
      supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    };
    window.addEventListener('notes:authentication-required', onAuthenticationRequired);

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      window.removeEventListener('notes:authentication-required', onAuthenticationRequired);
      configureAccessTokenProvider(null);
    };
  }, []);

  useEffect(() => {
    if (session) void evaluateSession();
    else evaluationId.current += 1;
  }, [evaluateSession, session]);

  const blocked = stage !== 'ready';
  useEffect(() => {
    if (!blocked || !hasEnteredApp) return;
    const blockKeyboard = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', blockKeyboard, true);
    return () => window.removeEventListener('keydown', blockKeyboard, true);
  }, [blocked, hasEnteredApp]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    setSession(data.session);
  };

  const beginEnrollment = async () => {
    setBusy(true);
    setError(null);
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      setBusy(false);
      setError(factorsError.message);
      return;
    }
    for (const factor of factors.all) {
      if (factor.status !== 'unverified') continue;
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) {
        setBusy(false);
        setError(unenrollError.message);
        return;
      }
    }
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Notes authenticator',
    });
    setBusy(false);
    if (enrollError) {
      setError(enrollError.message);
      return;
    }
    if (data.type !== 'totp') {
      setError('Supabase returned an unexpected MFA factor type.');
      return;
    }
    setEnrollment({
      id: data.id,
      totp: {
        qrCode: `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`,
        secret: data.totp.secret,
      },
    });
    setFactorId(data.id);
  };

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const activeFactorId = enrollment?.id ?? factorId;
    if (!activeFactorId) return;

    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const code = String(form.get('code') ?? '').trim();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: activeFactorId,
    });
    if (challengeError) {
      setBusy(false);
      setError(challengeError.message);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: activeFactorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      setBusy(false);
      setError(verifyError.message);
      return;
    }
    const { data: refreshed, error: refreshError } = await supabase.auth.getSession();
    setBusy(false);
    if (refreshError || !refreshed.session) {
      setError(refreshError?.message ?? 'The verified session could not be restored.');
      return;
    }
    setSession(refreshed.session);
  };

  const signOut = async () => {
    if (dirty && !window.confirm('This note has unsaved changes. Sign out and discard them?')) return;
    setHasEnteredApp(false);
    setDirty(false);
    setStage('loading');
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      setHasEnteredApp(true);
      setStage('ready');
    }
  };

  return (
    <div className="relative h-screen w-screen">
      {hasEnteredApp && (
        <div aria-hidden={blocked} inert={blocked ? true : undefined} className={blocked ? 'pointer-events-none h-full' : 'h-full'}>
          {children(setDirty)}
        </div>
      )}

      {stage === 'ready' && (
        <button
          type="button"
          onClick={() => void signOut()}
          className="fixed right-4 top-4 z-40 rounded border border-[#d0d7de] bg-white px-3 py-1.5 font-mono text-xs text-[#24292e] shadow-sm hover:bg-[#f6f8fa]"
        >
          Sign out
        </button>
      )}

      {blocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 p-6">
          <div className="w-full max-w-sm rounded-lg border border-[#d0d7de] bg-white p-6 shadow-lg">
            <h1 className="mb-1 text-xl font-semibold text-[#24292e]">Notes</h1>
            <p className="mb-5 text-sm text-[#57606a]">
              {hasEnteredApp ? 'Your editor is preserved. Authenticate again to continue.' : 'Sign in with multi-factor authentication to continue.'}
            </p>

            {stage === 'loading' && <p className="font-mono text-sm">Restoring session…</p>}

            {stage === 'error' && (
              <AuthButton busy={busy} onClick={() => void evaluateSession()}>Retry authentication</AuthButton>
            )}

            {stage === 'sign-in' && (
              <form onSubmit={(event) => void signIn(event)} className="space-y-3">
                <label className="block text-sm">
                  <span className="mb-1 block">Email</span>
                  <input name="email" type="email" autoComplete="username" required autoFocus className="w-full rounded border border-[#d0d7de] px-3 py-2" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block">Password</span>
                  <input name="password" type="password" autoComplete="current-password" required className="w-full rounded border border-[#d0d7de] px-3 py-2" />
                </label>
                <AuthButton busy={busy}>Sign in</AuthButton>
              </form>
            )}

            {stage === 'enroll' && !enrollment && (
              <div className="space-y-4">
                <p className="text-sm text-[#57606a]">No authenticator is enrolled for this account.</p>
                <AuthButton busy={busy} onClick={() => void beginEnrollment()}>Enroll authenticator</AuthButton>
              </div>
            )}

            {stage === 'enroll' && enrollment && (
              <div className="space-y-4">
                <p className="text-sm text-[#57606a]">Scan this code with your authenticator, then enter its six-digit code.</p>
                <img src={enrollment.totp.qrCode} alt="TOTP enrollment QR code" className="mx-auto h-48 w-48" />
                <details className="text-xs text-[#57606a]">
                  <summary>Cannot scan?</summary>
                  <code className="mt-2 block break-all select-all">{enrollment.totp.secret}</code>
                </details>
                <CodeForm busy={busy} onSubmit={verifyCode} label="Finish enrollment" />
              </div>
            )}

            {stage === 'challenge' && (
              <div className="space-y-4">
                <p className="text-sm text-[#57606a]">Enter the current code from your authenticator.</p>
                <CodeForm busy={busy} onSubmit={verifyCode} label="Verify" />
              </div>
            )}

            {error && <p role="alert" className="mt-4 text-sm text-[#cf222e]">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function AuthButton({
  busy,
  children,
  onClick,
}: {
  busy: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type={onClick ? 'button' : 'submit'}
      disabled={busy}
      onClick={onClick}
      className="w-full rounded bg-[#24292e] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {busy ? 'Working…' : children}
    </button>
  );
}

function CodeForm({
  busy,
  label,
  onSubmit,
}: {
  busy: boolean;
  label: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block">Authentication code</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          required
          autoFocus
          className="w-full rounded border border-[#d0d7de] px-3 py-2 font-mono tracking-[0.3em]"
        />
      </label>
      <AuthButton busy={busy}>{label}</AuthButton>
    </form>
  );
}

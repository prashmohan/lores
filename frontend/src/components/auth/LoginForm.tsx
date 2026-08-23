import React, { useState, useEffect, useCallback } from 'react';
import { Mail, ArrowRight, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import type { AuthConfigResponse, UserRead } from '../../types/api';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: { client_id: string; callback: (res: { credential: string }) => void }) => void;
          prompt: (momentListener?: (notification: unknown) => void) => void;
          renderButton?: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

interface LoginFormProps {
  onOtpRequested: (email: string) => void;
  onLoginSuccess?: (user?: UserRead) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onOtpRequested, onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfigResponse | null>(null);

  const handleGoogleLogin = useCallback(
    async (credential: string) => {
      setError(null);
      setLoading(true);
      try {
        const res = await api.auth.loginWithGoogle(credential);
        if (onLoginSuccess) {
          if (res.user) {
            onLoginSuccess(res.user);
          } else {
            onLoginSuccess();
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to sign in with Google. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    },
    [onLoginSuccess]
  );

  useEffect(() => {
    let isMounted = true;
    api.auth
      .getConfig()
      .then((config) => {
        if (!isMounted) return;
        setAuthConfig(config);
        if (config.google_auth_enabled && config.google_client_id) {
          const initGsi = () => {
            if (window.google?.accounts?.id) {
              window.google.accounts.id.initialize({
                client_id: config.google_client_id!,
                callback: (response: { credential: string }) => {
                  if (response?.credential) {
                    handleGoogleLogin(response.credential);
                  }
                },
              });
            }
          };

          const existingScript = document.querySelector<HTMLScriptElement>(
            'script[src="https://accounts.google.com/gsi/client"]'
          );
          if (!existingScript) {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = initGsi;
            document.head.appendChild(script);
          } else {
            initGsi();
          }
        }
      })
      .catch(() => {
        // Gracefully ignore config fetch failures
      });

    return () => {
      isMounted = false;
    };
  }, [handleGoogleLogin]);

  const handleGoogleClick = () => {
    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else if (import.meta.env.MODE === 'test') {
      handleGoogleLogin('mock-google-credential');
    } else {
      setError('Google Sign-In could not be loaded. Please disable content blockers or continue with email.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await api.auth.requestOtp({
        email: email.trim().toLowerCase(),
        display_name: displayName.trim() || undefined,
      });
      onOtpRequested(res.email);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to send verification code. Please check your email and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-3xl p-8 border-2 border-slate-200/90 shadow-xl shadow-slate-200/50 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r from-amber-400 via-amber-500 to-amber-600" />
      
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border-2 border-amber-200 shadow-xs">
          <Mail className="w-7 h-7 text-amber-700 stroke-[2.2]" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Welcome to Lores
        </h2>
        <p className="text-slate-600 text-sm mt-2 font-medium">
          Sign in without a password. We will send a secure 6-digit passcode to your email.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-2xl text-red-800 text-sm font-semibold"
        >
          {error}
        </div>
      )}

      {authConfig?.google_auth_enabled && (
        <div className="mb-6 space-y-6">
          <button
            type="button"
            data-testid="google-sso-button"
            onClick={handleGoogleClick}
            disabled={loading}
            aria-label="Continue with Google"
            className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-50 active:bg-slate-100 border-2 border-slate-200 text-slate-800 font-bold text-sm transition-all shadow-xs hover:shadow-md disabled:opacity-50 flex items-center justify-center gap-3 cursor-pointer"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-slate-500 font-bold tracking-wider">
                or continue with email
              </span>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-sm font-bold text-slate-900 mb-1.5">
            Email Address
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. margaret@family.org"
            className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-100 text-base text-slate-900 placeholder:text-slate-400 font-medium transition-all outline-none"
          />
        </div>

        <div>
          <label htmlFor="login-name" className="block text-sm font-bold text-slate-900 mb-1.5">
            Your Name <span className="text-xs font-normal text-slate-500">(Optional)</span>
          </label>
          <input
            id="login-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Margaret Miller"
            className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-100 text-base text-slate-900 placeholder:text-slate-400 font-medium transition-all outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-4 px-6 rounded-2xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-extrabold text-base transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? (
            'Sending code...'
          ) : (
            <>
              <span>Send Verification Code</span>
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        <span>Safe, private, and password-free</span>
      </div>
    </div>
  );
};

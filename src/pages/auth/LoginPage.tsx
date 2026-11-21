import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, ShieldAlert, UserPlus } from 'lucide-react';
import { DEMO_ACCOUNTS, useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import type { UserRole } from '../../types';

export function LoginPage() {
  const {
    session,
    authError,
    clearAuthError,
    loginWithGoogle,
    loginWithDemoAccount,
    loginWithCredentials,
    registerCustomer,
  } = useAuth();
  const { state } = useNetwork();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectFrom = (location.state as { from?: string } | null)?.from;

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('customer@synapse.demo');
  const [password, setPassword] = useState('synapse-customer-2026');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regCity, setRegCity] = useState('Bengaluru');
  const [regStoreId, setRegStoreId] = useState('indiranagar');
  const [formError, setFormError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const routeForRole = (role: UserRole) => {
    if (redirectFrom && !redirectFrom.startsWith('/login')) {
      if (role === 'CUSTOMER' && !redirectFrom.startsWith('/manager') && !redirectFrom.startsWith('/admin')) {
        return redirectFrom;
      }
    }
    if (role === 'STORE_MANAGER') return '/manager';
    if (role === 'NETWORK_ADMIN') return '/admin';
    return '/';
  };

  const handleGoogleSignIn = async () => {
    setFormError(null);
    setGoogleLoading(true);
    const next = await loginWithGoogle();
    setGoogleLoading(false);
    if (next) {
      navigate(routeForRole(next.role), { replace: true });
    }
  };

  const handleDemoQuickLogin = (accountId: string) => {
    setFormError(null);
    const next = loginWithDemoAccount(accountId);
    navigate(routeForRole(next.role), { replace: true });
  };

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearAuthError();
    if (!email.trim() || !password.trim()) {
      setFormError('Enter both demo email and password.');
      return;
    }
    const next = loginWithCredentials(email, password);
    if (next) {
      navigate(routeForRole(next.role), { replace: true });
    }
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!regName.trim() || !regEmail.trim() || !regEmail.includes('@')) {
      setFormError('Please provide your full name and a valid email address.');
      return;
    }
    const next = registerCustomer({
      displayName: regName,
      email: regEmail,
      city: regCity,
      preferredStoreId: regStoreId,
    });
    navigate(routeForRole(next.role), { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left column: Authentication Form */}
        <div className="lg:col-span-7 bg-white border border-[#E1E5E4] rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between gap-4 border-b border-[#EEF1F0] pb-4">
            <div>
              <span className="text-lg font-bold tracking-tight text-[#264C4F]">SYNAPSE</span>
              <h1 className="text-xl font-semibold text-[#1A2022] mt-1">
                {mode === 'login' ? 'Sign in to the Retail Network' : 'Create Customer Demo Account'}
              </h1>
            </div>
            <div className="flex items-center gap-1 p-1 bg-[#F0F2F1] rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setFormError(null);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  mode === 'login' ? 'bg-white text-[#1A2022] shadow-xs' : 'text-[#526063]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setFormError(null);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  mode === 'register' ? 'bg-white text-[#1A2022] shadow-xs' : 'text-[#526063]'
                }`}
              >
                Register
              </button>
            </div>
          </div>

          {session && (
            <div className="p-3.5 bg-[#E7F0EE] border border-[#C9DBD7] rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[#1A2022]">
                Currently signed in as <strong>{session.displayName}</strong> ({session.role})
              </span>
              <button
                type="button"
                onClick={() => navigate(routeForRole(session.role))}
                className="font-semibold text-[#264C4F] hover:underline"
              >
                Continue to Portal
              </button>
            </div>
          )}

          {(authError || formError) && (
            <div
              role="alert"
              className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2"
            >
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{formError || authError}</span>
            </div>
          )}

          {mode === 'login' ? (
            <div className="space-y-5">
              {/* Firebase Google Sign-In */}
              <div>
                <button
                  type="button"
                  disabled={googleLoading}
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 border border-[#D4DAD8] bg-white hover:bg-[#F7F7F5] text-sm font-medium text-[#1A2022] rounded-lg transition-colors disabled:opacity-60"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.3 0 6.08-1.09 8.11-2.95l-3.88-3.05c-1.1.74-2.51 1.18-4.23 1.18-3.25 0-6-2.2-6.98-5.15H1.01v3.14C3.05 21.22 7.21 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.02 14.03c-.25-.74-.39-1.53-.39-2.34s.14-1.6.39-2.34V6.21H1.01C.37 7.49 0 8.95 0 11.69s.37 4.2 1.01 5.48l4.01-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.79 0 3.4.62 4.67 1.83l3.5-3.5C18.08 1.19 15.3 0 12 0 7.21 0 3.05 2.78 1.01 6.81l4.01 3.14c.98-2.95 3.73-5.2 6.98-5.2Z"
                    />
                  </svg>
                  <span>{googleLoading ? 'Connecting Google Sign-In...' : 'Continue with Google (Firebase Auth)'}</span>
                </button>
              </div>

              <div className="relative flex items-center">
                <div className="flex-grow border-t border-[#E1E5E4]" />
                <span className="px-3 text-xs text-[#526063] bg-white">or use demo credentials</span>
                <div className="flex-grow border-t border-[#E1E5E4]" />
              </div>

              <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                <div>
                  <label htmlFor="demo-email" className="block text-xs font-medium text-[#1A2022] mb-1.5">
                    Demo Account Email
                  </label>
                  <input
                    id="demo-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
                    placeholder="customer@synapse.demo"
                  />
                </div>
                <div>
                  <label htmlFor="demo-password" className="block text-xs font-medium text-[#1A2022] mb-1.5">
                    Demo Password
                  </label>
                  <input
                    id="demo-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg transition-colors"
                >
                  <KeyRound className="w-4 h-4" aria-hidden="true" />
                  Sign In with Demo Credentials
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label htmlFor="reg-name" className="block text-xs font-medium text-[#1A2022] mb-1.5">
                  Full Name
                </label>
                <input
                  id="reg-name"
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Priya Krishnan"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
                />
              </div>
              <div>
                <label htmlFor="reg-email" className="block text-xs font-medium text-[#1A2022] mb-1.5">
                  Email Address
                </label>
                <input
                  id="reg-email"
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="priya@example.com"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reg-city" className="block text-xs font-medium text-[#1A2022] mb-1.5">
                    City
                  </label>
                  <input
                    id="reg-city"
                    type="text"
                    value={regCity}
                    onChange={(e) => setRegCity(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
                  />
                </div>
                <div>
                  <label htmlFor="reg-store" className="block text-xs font-medium text-[#1A2022] mb-1.5">
                    Preferred Store
                  </label>
                  <select
                    id="reg-store"
                    value={regStoreId}
                    onChange={(e) => setRegStoreId(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
                  >
                    {state.stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg transition-colors"
              >
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                Register Demo Customer Account
              </button>
            </form>
          )}

          <p className="text-xs text-[#526063] pt-2 border-t border-[#EEF1F0] leading-relaxed">
            Each Bengaluru branch (Indiranagar, Whitefield, Koramangala, and Jayanagar) has a dedicated branch-scoped manager login alongside Customer and Network Admin portals.
          </p>
        </div>

        {/* Right column: One-click Demo Portal Switcher */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[#1A2022]">Role-Based Portal Access</h2>
              <p className="text-xs text-[#526063] mt-1">
                Launch any branch or network portal directly to test cross-store holds, pick reassignments, and transfers.
              </p>
            </div>

            <div className="space-y-3">
              {DEMO_ACCOUNTS.map((acct) => (
                <div
                  key={acct.id}
                  className="p-4 border border-[#E1E5E4] rounded-lg bg-[#F8FAF9] space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-semibold text-[#264C4F]">{acct.role.replace('_', ' ')}</p>
                        {acct.storeLabel && (
                          <span className="text-[11px] font-medium px-1.5 py-0.5 bg-[#E7F0EE] text-[#264C4F] rounded">
                            {acct.storeLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-[#1A2022] mt-0.5">{acct.displayName}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDemoQuickLogin(acct.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-md whitespace-nowrap transition-colors"
                    >
                      Enter Portal
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="text-xs text-[#526063] leading-relaxed">{acct.description}</p>
                  <div className="text-[11px] font-mono-tabular text-[#526063] pt-1 border-t border-[#E6ECEA] flex flex-wrap gap-x-3 gap-y-1">
                    <span>{acct.email}</span>
                    <span>pw: {acct.passwordHint}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

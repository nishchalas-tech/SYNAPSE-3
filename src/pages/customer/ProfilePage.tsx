import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';

export function ProfilePage() {
  const { session, updateProfile } = useAuth();
  const { state } = useNetwork();

  const [displayName, setDisplayName] = useState(session?.displayName || '');
  const [city, setCity] = useState(session?.city || 'Bengaluru');
  const [preferredStoreId, setPreferredStoreId] = useState(session?.preferredStoreId || 'indiranagar');
  const [saved, setSaved] = useState(false);

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <User className="w-8 h-8 text-[#264C4F] mx-auto" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-[#1A2022]">Sign in to manage your profile</h1>
        <p className="text-sm text-[#526063]">
          Sign in with Google or a demo role account to save your preferred Bengaluru store node.
        </p>
        <Link
          to="/login"
          className="inline-flex px-5 py-2.5 text-sm font-medium text-white bg-[#264C4F] rounded-lg"
        >
          Go to Sign In
        </Link>
      </div>
    );
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({
      displayName: displayName.trim() || session.displayName,
      city: city.trim() || 'Bengaluru',
      preferredStoreId,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1A2022]">Customer Profile</h1>
        <p className="text-sm text-[#526063] mt-1">
          Configure your preferred Bengaluru fulfilment store for availability and Product Rescue checks.
        </p>
      </div>

      <form onSubmit={handleSave} className="bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-[#EEF1F0] text-xs">
          <div>
            <span className="text-[#526063]">Signed-in Email</span>
            <p className="font-medium text-[#1A2022] mt-0.5">{session.email}</p>
          </div>
          <div>
            <span className="text-[#526063]">Session Mode</span>
            <p className="font-medium text-[#264C4F] mt-0.5">
              {session.authMode === 'FIREBASE_GOOGLE' ? 'Firebase Google Auth' : 'Demo Local Session'} · {session.role}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="prof-name" className="block text-xs font-medium text-[#1A2022] mb-1.5">
            Display Name
          </label>
          <input
            id="prof-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3.5 py-2 text-sm border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="prof-city" className="block text-xs font-medium text-[#1A2022] mb-1.5">
              City
            </label>
            <input
              id="prof-city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
            />
          </div>
          <div>
            <label htmlFor="prof-store" className="block text-xs font-medium text-[#1A2022] mb-1.5">
              Preferred Store Node
            </label>
            <select
              id="prof-store"
              value={preferredStoreId}
              onChange={(e) => setPreferredStoreId(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-[#D4DAD8] rounded-lg bg-white focus:outline-none focus:border-[#264C4F]"
            >
              {state.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.distanceKm.toFixed(1)} km)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          {saved ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              Preferences saved
            </span>
          ) : (
            <span />
          )}

          <button
            type="submit"
            className="px-5 py-2.5 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg transition-colors"
          >
            Save Preferences
          </button>
        </div>
      </form>
    </div>
  );
}

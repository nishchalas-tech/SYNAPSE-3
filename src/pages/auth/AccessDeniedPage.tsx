import { Link, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../types';

export function AccessDeniedPage() {
  const { session } = useAuth();
  const location = useLocation();
  const requiredRoles = (location.state as { requiredRoles?: UserRole[] } | null)?.requiredRoles;

  const homePath =
    session?.role === 'STORE_MANAGER'
      ? '/manager'
      : session?.role === 'NETWORK_ADMIN'
        ? '/admin'
        : '/';

  return (
    <div className="min-h-screen bg-[#F7F7F5] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-[#E1E5E4] rounded-xl p-8 space-y-4">
        <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-700">
          <ShieldAlert className="w-5 h-5" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-[#1A2022]">Portal Access Restricted</h1>
        <p className="text-sm text-[#526063] leading-relaxed">
          Your current session ({session?.role || 'Unauthenticated'}) does not have access to this portal
          {requiredRoles ? ` (requires ${requiredRoles.join(' or ')})` : ''}.
        </p>
        <p className="text-xs text-[#526063]">
          Note: Frontend route protection guards demo navigation; production authorization is enforced server-side in FastAPI and Firestore security rules.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            to={homePath}
            className="px-4 py-2 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg transition-colors"
          >
            Go to Your Portal
          </Link>
          <Link
            to="/login"
            className="px-4 py-2 text-sm font-medium text-[#1A2022] border border-[#D4DAD8] hover:bg-[#F7F7F5] rounded-lg transition-colors"
          >
            Switch Account
          </Link>
        </div>
      </div>
    </div>
  );
}

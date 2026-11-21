import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../types';

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { session, authReady } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F7F7F5] flex items-center justify-center p-6">
        <div className="text-sm text-[#526063]">Loading session...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!allowedRoles.includes(session.role)) {
    return <Navigate to="/access-denied" state={{ requiredRoles: allowedRoles }} replace />;
  }

  return <>{children}</>;
}

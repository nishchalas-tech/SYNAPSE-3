import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowLeftRight,
  Boxes,
  Building2,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Radar,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkContext';

export function AdminLayout() {
  const { session, logout } = useAuth();
  const { state, resetDemoData } = useNetwork();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const pendingTransfers = state.transferRecommendations.filter((r) => r.status === 'PENDING').length;

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
      isActive
        ? 'bg-[#264C4F] text-white'
        : 'text-[#3E4B4E] hover:bg-[#F0F2F1] hover:text-[#1A2022]'
    }`;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getBreadcrumb = () => {
    if (location.pathname.includes('/stores')) return 'Store Network';
    if (location.pathname.includes('/inventory')) return 'Network Inventory';
    if (location.pathname.includes('/demand-radar')) return 'Demand Radar';
    if (location.pathname.includes('/surplus-exchange')) return 'Surplus Exchange';
    if (location.pathname.includes('/transfers/history')) return 'Transfer Decision History';
    if (location.pathname.includes('/transfers')) return 'Transfer Recommendations';
    if (location.pathname.includes('/activity')) return 'Network Activity';
    return 'Network Overview';
  };

  const navItems = (
    <>
      <NavLink to="/admin" end onClick={() => setSidebarOpen(false)} className={navClass}>
        <span className="inline-flex items-center gap-2.5">
          <LayoutDashboard className="w-4 h-4 shrink-0" aria-hidden="true" />
          Overview
        </span>
      </NavLink>
      <NavLink to="/admin/stores" onClick={() => setSidebarOpen(false)} className={navClass}>
        <span className="inline-flex items-center gap-2.5">
          <Building2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          Store Network
        </span>
      </NavLink>
      <NavLink to="/admin/inventory" onClick={() => setSidebarOpen(false)} className={navClass}>
        <span className="inline-flex items-center gap-2.5">
          <Boxes className="w-4 h-4 shrink-0" aria-hidden="true" />
          Network Inventory
        </span>
      </NavLink>
      <NavLink to="/admin/demand-radar" onClick={() => setSidebarOpen(false)} className={navClass}>
        <span className="inline-flex items-center gap-2.5">
          <Radar className="w-4 h-4 shrink-0" aria-hidden="true" />
          Demand Radar
        </span>
      </NavLink>
      <NavLink to="/admin/surplus-exchange" onClick={() => setSidebarOpen(false)} className={navClass}>
        <span className="inline-flex items-center gap-2.5">
          <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
          Surplus Exchange
        </span>
      </NavLink>
      <NavLink to="/admin/transfers" end onClick={() => setSidebarOpen(false)} className={navClass}>
        <span className="inline-flex items-center gap-2.5">
          <ArrowLeftRight className="w-4 h-4 shrink-0" aria-hidden="true" />
          Transfer Queue
        </span>
        {pendingTransfers > 0 && (
          <span className="font-mono-tabular text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
            {pendingTransfers}
          </span>
        )}
      </NavLink>
      <NavLink to="/admin/transfers/history" onClick={() => setSidebarOpen(false)} className={navClass}>
        <span className="inline-flex items-center gap-2.5">
          <History className="w-4 h-4 shrink-0" aria-hidden="true" />
          Decision History
        </span>
      </NavLink>
      <NavLink to="/admin/activity" onClick={() => setSidebarOpen(false)} className={navClass}>
        <span className="inline-flex items-center gap-2.5">
          <Activity className="w-4 h-4 shrink-0" aria-hidden="true" />
          Network Activity
        </span>
      </NavLink>
    </>
  );

  return (
    <div className="min-h-screen flex bg-[#F7F7F5] text-[#1A2022]">
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-white border-r border-[#E1E5E4]">
        <div className="h-16 px-5 flex items-center justify-between border-b border-[#E1E5E4]">
          <Link to="/admin" className="text-lg font-bold tracking-tight text-[#264C4F]">
            SYNAPSE
          </Link>
          <span className="text-xs font-medium text-[#526063]">Network Admin</span>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="Network administrator navigation">
          {navItems}
        </nav>

        <div className="p-4 border-t border-[#E1E5E4] space-y-3">
          <button
            type="button"
            onClick={resetDemoData}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[#3E4B4E] bg-[#F0F2F1] hover:bg-[#E2E6E5] rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reset Demo Data
          </button>

          <div className="text-xs pt-1">
            <p className="font-medium text-[#1A2022]">{session?.displayName}</p>
            <p className="text-[#526063] truncate">{session?.email}</p>
          </div>
          <div className="flex items-center justify-between">
            <Link to="/login" className="text-xs font-medium text-[#264C4F] hover:underline">
              Switch Role
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 text-xs text-[#526063] hover:text-[#1A2022]"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-[#E1E5E4] px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open administrator menu"
              className="lg:hidden p-2 rounded-lg border border-[#E1E5E4]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-[#526063] hidden sm:inline">Bengaluru Network</span>
              <span className="text-[#526063] hidden sm:inline" aria-hidden="true">/</span>
              <span className="font-semibold text-[#1A2022] truncate">{getBreadcrumb()}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              to="/"
              className="px-3 py-1.5 text-xs font-medium text-[#264C4F] bg-[#E7F0EE] hover:bg-[#D5E5E2] rounded-md whitespace-nowrap transition-colors"
            >
              View Storefront
            </Link>
          </div>
        </header>

        {sidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden flex">
            <div className="fixed inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
            <div className="relative w-64 bg-white h-full border-r border-[#E1E5E4] p-4 flex flex-col justify-between z-50 overflow-y-auto">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-[#E1E5E4]">
                  <span className="text-lg font-bold text-[#264C4F]">SYNAPSE</span>
                  <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <nav className="mt-4 space-y-1">{navItems}</nav>
              </div>
              <div className="space-y-2 pt-4 border-t border-[#E1E5E4]">
                <button
                  type="button"
                  onClick={() => {
                    resetDemoData();
                    setSidebarOpen(false);
                  }}
                  className="w-full py-2 text-xs font-medium text-[#3E4B4E] bg-[#F0F2F1] rounded-lg"
                >
                  Reset Demo Data
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full py-2 text-xs font-medium text-[#1A2022] border border-[#E1E5E4] rounded-lg"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

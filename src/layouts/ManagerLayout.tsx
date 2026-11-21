import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ClipboardList, LayoutDashboard, LogOut, Menu, PackageCheck, Store, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkContext';

export function ManagerLayout() {
  const { session, logout } = useAuth();
  const { state } = useNetwork();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const assignedStoreId = session?.assignedStoreId || 'indiranagar';
  const assignedStore = state.stores.find((s) => s.id === assignedStoreId) || state.stores[0];
  const pendingCount = state.pickTasks.filter(
    (t) => t.storeId === assignedStoreId && t.status === 'PENDING'
  ).length;
  const pendingTransfersCount = state.transferRecommendations.filter(
    (r) =>
      r.status === 'PENDING' &&
      (r.sourceStoreId === assignedStoreId || r.destinationStoreId === assignedStoreId)
  ).length;

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
      isActive
        ? 'bg-[#264C4F] text-white'
        : 'text-[#3E4B4E] hover:bg-[#F0F2F1] hover:text-[#1A2022]'
    }`;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const breadcrumbTitle = location.pathname.includes('/inventory')
    ? 'Stock Whisperer'
    : location.pathname.includes('/tasks')
      ? 'Adaptive Fulfilment'
      : location.pathname.includes('/transfers')
        ? 'Stock Transfers'
        : 'Store Overview';

  return (
    <div className="min-h-screen flex bg-[#F7F7F5] text-[#1A2022]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-white border-r border-[#E1E5E4]">
        <div className="h-16 px-5 flex items-center justify-between border-b border-[#E1E5E4]">
          <Link to="/manager" className="text-lg font-bold tracking-tight text-[#264C4F]">
            SYNAPSE
          </Link>
          <span className="text-xs font-medium text-[#526063]">Manager</span>
        </div>

        <div className="px-4 py-4 border-b border-[#EEF1F0] bg-[#F8FAF9]">
          <div className="flex items-center gap-2 text-xs text-[#526063] mb-1">
            <Store className="w-3.5 h-3.5 text-[#264C4F]" aria-hidden="true" />
            <span>Assigned Store</span>
          </div>
          <p className="text-sm font-semibold text-[#1A2022]">{assignedStore.name}</p>
          <p className="text-xs text-[#526063] mt-0.5">{assignedStore.locality}, {assignedStore.city}</p>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="Store manager navigation">
          <NavLink to="/manager" end className={navClass}>
            <span className="inline-flex items-center gap-2.5">
              <LayoutDashboard className="w-4 h-4 shrink-0" aria-hidden="true" />
              Overview
            </span>
          </NavLink>
          <NavLink to="/manager/inventory" className={navClass}>
            <span className="inline-flex items-center gap-2.5">
              <PackageCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              Stock Whisperer
            </span>
          </NavLink>
          <NavLink to="/manager/tasks" className={navClass}>
            <span className="inline-flex items-center gap-2.5">
              <ClipboardList className="w-4 h-4 shrink-0" aria-hidden="true" />
              Pick Tasks
            </span>
            {pendingCount > 0 && (
              <span className="font-mono-tabular text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                {pendingCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/manager/transfers" className={navClass}>
            <span className="inline-flex items-center gap-2.5">
              <ArrowLeftRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              Stock Transfers
            </span>
            {pendingTransfersCount > 0 && (
              <span className="font-mono-tabular text-xs px-1.5 py-0.5 rounded bg-[#E7F0EE] text-[#264C4F]">
                {pendingTransfersCount}
              </span>
            )}
          </NavLink>
        </nav>

        <div className="p-4 border-t border-[#E1E5E4] space-y-2">
          <div className="text-xs">
            <p className="font-medium text-[#1A2022]">{session?.displayName}</p>
            <p className="text-[#526063] truncate">{session?.email}</p>
          </div>
          <div className="flex items-center justify-between pt-2">
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

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-[#E1E5E4] px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open manager menu"
              className="lg:hidden p-2 rounded-lg border border-[#E1E5E4]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-[#526063] hidden sm:inline">{assignedStore.name}</span>
              <span className="text-[#526063] hidden sm:inline" aria-hidden="true">/</span>
              <span className="font-semibold text-[#1A2022] truncate">{breadcrumbTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/"
              className="px-3 py-1.5 text-xs font-medium text-[#264C4F] bg-[#E7F0EE] hover:bg-[#D5E5E2] rounded-md whitespace-nowrap transition-colors"
            >
              View Storefront
            </Link>
          </div>
        </header>

        {/* Mobile Sidebar Drawer */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden flex">
            <div className="fixed inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
            <div className="relative w-64 bg-white h-full border-r border-[#E1E5E4] p-4 flex flex-col justify-between z-50">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-[#E1E5E4]">
                  <span className="text-lg font-bold text-[#264C4F]">SYNAPSE</span>
                  <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <nav className="mt-4 space-y-1">
                  <NavLink to="/manager" end onClick={() => setSidebarOpen(false)} className={navClass}>
                    Overview
                  </NavLink>
                  <NavLink to="/manager/inventory" onClick={() => setSidebarOpen(false)} className={navClass}>
                    Stock Whisperer
                  </NavLink>
                  <NavLink to="/manager/tasks" onClick={() => setSidebarOpen(false)} className={navClass}>
                    Pick Tasks ({pendingCount})
                  </NavLink>
                  <NavLink to="/manager/transfers" onClick={() => setSidebarOpen(false)} className={navClass}>
                    Stock Transfers ({pendingTransfersCount})
                  </NavLink>
                </nav>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2 text-xs font-medium text-[#1A2022] border border-[#E1E5E4] rounded-lg"
              >
                Sign Out
              </button>
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

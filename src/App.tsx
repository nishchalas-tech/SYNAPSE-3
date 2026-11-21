import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/shared/ProtectedRoute';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { NetworkProvider } from './context/NetworkContext';
import { AdminLayout } from './layouts/AdminLayout';
import { CustomerLayout } from './layouts/CustomerLayout';
import { ManagerLayout } from './layouts/ManagerLayout';
import { AdminActivityPage } from './pages/admin/AdminActivityPage';
import { AdminDemandRadarPage } from './pages/admin/AdminDemandRadarPage';
import { AdminInventoryPage } from './pages/admin/AdminInventoryPage';
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage';
import { AdminStoreDetailPage } from './pages/admin/AdminStoreDetailPage';
import { AdminStoresPage } from './pages/admin/AdminStoresPage';
import { AdminSurplusExchangePage } from './pages/admin/AdminSurplusExchangePage';
import { AdminTransferHistoryPage } from './pages/admin/AdminTransferHistoryPage';
import { AdminTransfersPage } from './pages/admin/AdminTransfersPage';
import { AccessDeniedPage } from './pages/auth/AccessDeniedPage';
import { LoginPage } from './pages/auth/LoginPage';
import { CartPage } from './pages/customer/CartPage';
import { CataloguePage } from './pages/customer/CataloguePage';
import { CheckoutPage } from './pages/customer/CheckoutPage';
import { HomePage } from './pages/customer/HomePage';
import { MyOrdersPage } from './pages/customer/MyOrdersPage';
import { OrderConfirmationPage } from './pages/customer/OrderConfirmationPage';
import { OrderDetailPage } from './pages/customer/OrderDetailPage';
import { OrderTrackingPage } from './pages/customer/OrderTrackingPage';
import { ProductDetailPage } from './pages/customer/ProductDetailPage';
import { ProfilePage } from './pages/customer/ProfilePage';
import { SearchPage } from './pages/customer/SearchPage';
import { ManagerInventoryDetailPage } from './pages/manager/ManagerInventoryDetailPage';
import { ManagerInventoryPage } from './pages/manager/ManagerInventoryPage';
import { ManagerOverviewPage } from './pages/manager/ManagerOverviewPage';
import { ManagerTaskDetailPage } from './pages/manager/ManagerTaskDetailPage';
import { ManagerTasksPage } from './pages/manager/ManagerTasksPage';
import { ManagerTransfersPage } from './pages/manager/ManagerTransfersPage';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <NetworkProvider>
          <BrowserRouter>
            <Routes>
              {/* Auth */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/access-denied" element={<AccessDeniedPage />} />

              {/* Customer Storefront */}
              <Route element={<CustomerLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/catalogue" element={<CataloguePage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/products/:productId" element={<ProductDetailPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/orders/confirmation/:orderId" element={<OrderConfirmationPage />} />
                <Route path="/orders" element={<MyOrdersPage />} />
                <Route path="/orders/:orderId" element={<OrderDetailPage />} />
                <Route path="/orders/:orderId/track" element={<OrderTrackingPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>

              {/* Store Manager Portal */}
              <Route
                path="/manager"
                element={
                  <ProtectedRoute allowedRoles={['STORE_MANAGER']}>
                    <ManagerLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<ManagerOverviewPage />} />
                <Route path="inventory" element={<ManagerInventoryPage />} />
                <Route path="inventory/:productId" element={<ManagerInventoryDetailPage />} />
                <Route path="tasks" element={<ManagerTasksPage />} />
                <Route path="tasks/:taskId" element={<ManagerTaskDetailPage />} />
                <Route path="transfers" element={<ManagerTransfersPage />} />
              </Route>

              {/* Network Administrator Portal */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['NETWORK_ADMIN']}>
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<AdminOverviewPage />} />
                <Route path="stores" element={<AdminStoresPage />} />
                <Route path="stores/:storeId" element={<AdminStoreDetailPage />} />
                <Route path="inventory" element={<AdminInventoryPage />} />
                <Route path="demand-radar" element={<AdminDemandRadarPage />} />
                <Route path="surplus-exchange" element={<AdminSurplusExchangePage />} />
                <Route path="transfers" element={<AdminTransfersPage />} />
                <Route path="transfers/history" element={<AdminTransferHistoryPage />} />
                <Route path="activity" element={<AdminActivityPage />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </NetworkProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

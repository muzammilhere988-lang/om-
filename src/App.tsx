import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfigRequiredBanner } from './components/common/ConfigRequiredBanner';
import { ProtectedRoute } from './components/common/ProtectedRoute';

import { LandingPage } from './pages/marketplace/LandingPage';
import { MarketplacePage } from './pages/marketplace/MarketplacePage';
import { ProductDetailPage } from './pages/marketplace/ProductDetailPage';
import { WholesalerDirectoryPage } from './pages/marketplace/WholesalerDirectoryPage';
import { WholesalerProfilePage } from './pages/marketplace/WholesalerProfilePage';

import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { AdminLoginPage } from './pages/auth/AdminLoginPage';

import { RetailerDashboard } from './pages/retailer/RetailerDashboard';
import { RetailerEnquiries } from './pages/retailer/RetailerEnquiries';
import { CartCheckoutPage } from './pages/retailer/CartCheckoutPage';

import { WholesalerOverview } from './pages/wholesaler/WholesalerOverview';
import { WholesalerProducts } from './pages/wholesaler/WholesalerProducts';
import { WholesalerInventory } from './pages/wholesaler/WholesalerInventory';
import { WholesalerOrders } from './pages/wholesaler/WholesalerOrders';
import { WholesalerSubscription } from './pages/wholesaler/WholesalerSubscription';
import { WholesalerEnquiries } from './pages/wholesaler/WholesalerEnquiries';

import { AdminOverview } from './pages/admin/AdminOverview';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminProducts } from './pages/admin/AdminProducts';
import { AdminOrders } from './pages/admin/AdminOrders';
import { AdminSubscriptions } from './pages/admin/AdminSubscriptions';
import { AdminModeration } from './pages/admin/AdminModeration';

import { NotificationsPage } from './pages/shared/NotificationsPage';
import { ProfileSettingsPage } from './pages/shared/ProfileSettingsPage';

function AppRoutes() {
  const { isConfigured } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === '/' && location.hash) {
      const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
      if (hashParams.get('error_code') || hashParams.get('error')) {
        navigate(`/login${location.hash}`, { replace: true });
      } else if (hashParams.get('type') === 'recovery') {
        navigate(`/reset-password${location.hash}`, { replace: true });
      }
    }
  }, [location.hash, location.pathname, navigate]);

  if (!isConfigured) {
    return <ConfigRequiredBanner />;
  }

  return (
    <Routes>
      {/* Common Marketplace & Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/marketplace" element={<MarketplacePage />} />
      <Route path="/products" element={<MarketplacePage />} />
      <Route path="/products/:id" element={<ProductDetailPage />} />
      <Route path="/wholesalers" element={<WholesalerDirectoryPage />} />
      <Route path="/wholesalers/:id" element={<WholesalerProfilePage />} />

      {/* Authentication Routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />

      {/* Retailer Routes */}
      <Route
        path="/cart"
        element={
          <ProtectedRoute allowedRoles={['RETAILER']}>
            <CartCheckoutPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/retailer"
        element={
          <ProtectedRoute allowedRoles={['RETAILER']}>
            <RetailerDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/retailer/enquiries"
        element={
          <ProtectedRoute allowedRoles={['RETAILER']}>
            <RetailerEnquiries />
          </ProtectedRoute>
        }
      />

      {/* Wholesaler Routes */}
      <Route
        path="/wholesaler"
        element={
          <ProtectedRoute allowedRoles={['WHOLESALER']}>
            <WholesalerOverview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wholesaler/products"
        element={
          <ProtectedRoute allowedRoles={['WHOLESALER']}>
            <WholesalerProducts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wholesaler/inventory"
        element={
          <ProtectedRoute allowedRoles={['WHOLESALER']}>
            <WholesalerInventory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wholesaler/orders"
        element={
          <ProtectedRoute allowedRoles={['WHOLESALER']}>
            <WholesalerOrders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wholesaler/subscription"
        element={
          <ProtectedRoute allowedRoles={['WHOLESALER']}>
            <WholesalerSubscription />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wholesaler/enquiries"
        element={
          <ProtectedRoute allowedRoles={['WHOLESALER']}>
            <WholesalerEnquiries />
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminOverview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminUsers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/products"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminProducts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/orders"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminOrders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/subscriptions"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminSubscriptions />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/moderation"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminModeration />
          </ProtectedRoute>
        }
      />

      {/* Shared Authenticated Routes */}
      <Route
        path="/notifications"
        element={
          <ProtectedRoute allowedRoles={['ADMIN', 'WHOLESALER', 'RETAILER']}>
            <NotificationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute allowedRoles={['ADMIN', 'WHOLESALER', 'RETAILER']}>
            <ProfileSettingsPage />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

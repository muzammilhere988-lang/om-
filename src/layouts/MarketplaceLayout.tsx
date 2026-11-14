import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, ShoppingCart, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, unreadNotifications, cartCount, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const dashboardPath =
    profile?.role === 'ADMIN'
      ? '/admin'
      : profile?.role === 'WHOLESALER'
      ? '/wholesaler'
      : '/retailer';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium whitespace-nowrap shrink-0 transition-colors pb-0.5 border-b-2 ${
      isActive
        ? 'text-slate-900 border-slate-900'
        : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line brand wordmark */}
          <Link
            to="/"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            OM – Open Market
          </Link>

          {/* Zone 2: Clean single-line navigation links */}
          <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/marketplace" className={navLinkClass}>
              Products
            </NavLink>
            <NavLink to="/wholesalers" className={navLinkClass}>
              Suppliers
            </NavLink>
            {user && profile ? (
              <>
                <NavLink to={dashboardPath} className={navLinkClass}>
                  Dashboard
                </NavLink>
                {profile.role === 'RETAILER' && (
                  <NavLink to="/cart" className={navLinkClass}>
                    Cart ({cartCount})
                  </NavLink>
                )}
              </>
            ) : (
              <NavLink to="/login" className={navLinkClass}>
                Sign In
              </NavLink>
            )}
          </nav>

          {/* Zone 3: Primary action */}
          <div className="flex items-center gap-3 shrink-0">
            {user && profile ? (
              <>
                {profile.role === 'RETAILER' && (
                  <Link
                    to="/cart"
                    className="md:hidden relative p-2 text-slate-700 hover:text-slate-900 rounded-lg border border-slate-200"
                    aria-label="Shopping cart"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    {cartCount > 0 && (
                      <span className="ml-1 text-xs font-mono font-semibold">{cartCount}</span>
                    )}
                  </Link>
                )}
                <Link
                  to="/notifications"
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4" />
                  <span className="font-mono tabular-nums">{unreadNotifications}</span>
                </Link>
                <Link
                  to={dashboardPath}
                  className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>{profile.role === 'ADMIN' ? 'Admin Console' : 'My Account'}</span>
                </Link>
              </>
            ) : (
              <Link
                to="/register"
                className="hidden sm:inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Register Business
              </Link>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-2 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile navigation drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-2">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 text-sm font-medium text-slate-800 rounded-lg hover:bg-slate-50"
            >
              Home
            </Link>
            <Link
              to="/marketplace"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 text-sm font-medium text-slate-800 rounded-lg hover:bg-slate-50"
            >
              Products
            </Link>
            <Link
              to="/wholesalers"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 text-sm font-medium text-slate-800 rounded-lg hover:bg-slate-50"
            >
              Suppliers
            </Link>
            {user && profile ? (
              <>
                <Link
                  to={dashboardPath}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-2.5 text-sm font-medium text-slate-800 rounded-lg hover:bg-slate-50"
                >
                  Dashboard
                </Link>
                {profile.role === 'RETAILER' && (
                  <Link
                    to="/cart"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2.5 text-sm font-medium text-slate-800 rounded-lg hover:bg-slate-50"
                  >
                    Cart ({cartCount})
                  </Link>
                )}
                <Link
                  to="/notifications"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-2.5 text-sm font-medium text-slate-800 rounded-lg hover:bg-slate-50"
                >
                  Notifications ({unreadNotifications})
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignOut();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-rose-700 rounded-lg hover:bg-rose-50"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-2.5 text-sm font-medium text-slate-800 rounded-lg hover:bg-slate-50"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg text-center"
                >
                  Register Business
                </Link>
              </>
            )}
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-white border-t border-slate-200 mt-16">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <p className="font-display font-bold text-slate-900">OM – Open Market</p>
            <p className="mt-1 text-xs text-slate-500">
              Centralized B2B Wholesale Marketplace connecting verified wholesalers and retailers.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-slate-600">
            <Link to="/" className="hover:text-slate-900">
              Home
            </Link>
            <Link to="/marketplace" className="hover:text-slate-900">
              All Products
            </Link>
            <Link to="/wholesalers" className="hover:text-slate-900">
              Verified Suppliers
            </Link>
            <Link to="/register" className="hover:text-slate-900">
              Register Business
            </Link>
            <Link to="/admin/login" className="hover:text-slate-900">
              Admin Login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

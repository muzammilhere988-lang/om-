import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Bell,
  Boxes,
  Flag,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  ShoppingBag,
  ShoppingCart,
  Store,
  UserCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  end?: boolean;
}

export function DashboardLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { profile, business, unreadNotifications, cartCount, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const role = profile?.role || 'RETAILER';

  const navItems: NavItem[] =
    role === 'ADMIN'
      ? [
          { label: 'Overview', to: '/admin', icon: <LayoutDashboard className="w-4 h-4" />, end: true },
          { label: 'User & Seller Approvals', to: '/admin/users', icon: <Users className="w-4 h-4" /> },
          { label: 'Products & Categories', to: '/admin/products', icon: <Package className="w-4 h-4" /> },
          { label: 'Platform Orders', to: '/admin/orders', icon: <ShoppingBag className="w-4 h-4" /> },
          { label: 'Moderation & Reports', to: '/admin/moderation', icon: <Flag className="w-4 h-4" /> },
          { label: 'Notifications', to: '/notifications', icon: <Bell className="w-4 h-4" /> },
        ]
      : role === 'WHOLESALER'
      ? [
          { label: 'Overview', to: '/wholesaler', icon: <LayoutDashboard className="w-4 h-4" />, end: true },
          { label: 'Products', to: '/wholesaler/products', icon: <Package className="w-4 h-4" /> },
          { label: 'Inventory & Logs', to: '/wholesaler/inventory', icon: <Boxes className="w-4 h-4" /> },
          { label: 'Supplier Orders', to: '/wholesaler/orders', icon: <ShoppingBag className="w-4 h-4" /> },
          { label: 'Retailer Enquiries', to: '/wholesaler/enquiries', icon: <MessageSquare className="w-4 h-4" /> },
          { label: 'Notifications', to: '/notifications', icon: <Bell className="w-4 h-4" /> },
          { label: 'Business Profile', to: '/profile', icon: <UserCog className="w-4 h-4" /> },
        ]
      : [
          { label: 'Overview & Orders', to: '/retailer', icon: <LayoutDashboard className="w-4 h-4" />, end: true },
          { label: 'Browse Marketplace', to: '/marketplace', icon: <Store className="w-4 h-4" /> },
          { label: `Shopping Cart (${cartCount})`, to: '/cart', icon: <ShoppingCart className="w-4 h-4" /> },
          { label: 'My Enquiries', to: '/retailer/enquiries', icon: <MessageSquare className="w-4 h-4" /> },
          { label: 'Notifications', to: '/notifications', icon: <Bell className="w-4 h-4" /> },
          { label: 'Shop Profile', to: '/profile', icon: <UserCheck className="w-4 h-4" /> },
        ];

  const handleSignOut = async () => {
    await signOut();
    navigate(role === 'ADMIN' ? '/admin/login' : '/login');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
      isActive
        ? 'bg-slate-900 text-white'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    }`;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between">
        <Link to="/" className="font-display font-bold text-base tracking-tight text-slate-900">
          OM – Open Market
        </Link>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-800"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-4 border-b border-slate-200 bg-slate-50/70">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{role} Portal</p>
        <p className="mt-1 text-sm font-semibold text-slate-900 truncate">
          {business?.business_name || profile?.full_name || 'Account'}
        </p>
        <p className="text-xs text-slate-500 truncate">{profile?.email}</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Dashboard navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setSidebarOpen(false)}
            className={linkClass}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-200 space-y-1">
        <Link
          to="/marketplace"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100"
        >
          <Store className="w-4 h-4" />
          <span>Common Marketplace</span>
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-rose-700 hover:bg-rose-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 bg-white border-r border-slate-200 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full border-r border-slate-200 z-10">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 truncate">OM – Open Market / {role}</p>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/notifications"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Bell className="w-4 h-4" />
              <span className="font-mono tabular-nums">{unreadNotifications}</span>
            </Link>
            <Link
              to="/marketplace"
              className="hidden sm:inline-flex items-center px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              View Marketplace
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1320px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

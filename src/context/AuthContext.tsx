import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { Business, Profile, Subscription } from '../types/database';

interface AuthContextValue {
  isConfigured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  business: Business | null;
  activeSubscription: Subscription | null;
  unreadNotifications: number;
  cartCount: number;
  refreshProfile: () => Promise<void>;
  refreshCounts: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [activeSubscription, setActiveSubscription] = useState<Subscription | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);
  const [cartCount, setCartCount] = useState<number>(0);

  const loadUserData = useCallback(async (uid: string) => {
    if (!supabase) return;

    const [{ data: profileData }, { data: businessData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('businesses').select('*').eq('owner_id', uid).maybeSingle(),
    ]);

    const typedProfile = (profileData as Profile | null) ?? null;
    setProfile(typedProfile);
    setBusiness((businessData as Business | null) ?? null);

    if (typedProfile?.role === 'WHOLESALER') {
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('*, subscription_plans(*)')
        .eq('wholesaler_id', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setActiveSubscription((subData as Subscription | null) ?? null);
    } else {
      setActiveSubscription(null);
    }

    // Load unread notifications
    const { count: notifCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('is_read', false);
    setUnreadNotifications(notifCount ?? 0);

    // Load cart item count for retailers
    if (typedProfile?.role === 'RETAILER') {
      const { data: cartRow } = await supabase
        .from('carts')
        .select('id')
        .eq('retailer_id', uid)
        .maybeSingle();
      if (cartRow?.id) {
        const { count: itemsCount } = await supabase
          .from('cart_items')
          .select('id', { count: 'exact', head: true })
          .eq('cart_id', cartRow.id);
        setCartCount(itemsCount ?? 0);
      } else {
        setCartCount(0);
      }
    } else {
      setCartCount(0);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!supabase) return;
    let uid = user?.id;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id;
    }
    if (!uid) return;
    await loadUserData(uid);
  }, [loadUserData, user?.id]);

  const refreshCounts = useCallback(async () => {
    if (!supabase || !user?.id) return;
    const { count: notifCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    setUnreadNotifications(notifCount ?? 0);

    if (profile?.role === 'RETAILER') {
      const { data: cartRow } = await supabase
        .from('carts')
        .select('id')
        .eq('retailer_id', user.id)
        .maybeSingle();
      if (cartRow?.id) {
        const { count: itemsCount } = await supabase
          .from('cart_items')
          .select('id', { count: 'exact', head: true })
          .eq('cart_id', cartRow.id);
        setCartCount(itemsCount ?? 0);
      }
    }
  }, [profile?.role, user?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const currentSession = data.session ?? null;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user?.id) {
        await loadUserData(currentSession.user.id);
      }
      if (mounted) setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user?.id) {
        setLoading(true);
        loadUserData(nextSession.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setProfile(null);
        setBusiness(null);
        setActiveSubscription(null);
        setUnreadNotifications(0);
        setCartCount(0);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadUserData]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setBusiness(null);
    setActiveSubscription(null);
    setUnreadNotifications(0);
    setCartCount(0);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isConfigured: isSupabaseConfigured,
        loading,
        session,
        user,
        profile,
        business,
        activeSubscription,
        unreadNotifications,
        cartCount,
        refreshProfile,
        refreshCounts,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}

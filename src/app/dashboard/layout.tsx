'use client';

// ==============================================================================
// app/dashboard/layout.tsx — Structure du back-office (admin)
// ------------------------------------------------------------------------------
// Layout CLIENT compatible export statique : il embarque la sidebar de
// navigation, l'interrupteur de thème et un portail d'authentification admin.
//
// Sécurité : les écritures (CRUD produits, commandes) sont protégées par les
// policies RLS ; ce layout ne fait qu'ouvrir une session Supabase (sign in) via
// createBrowserClient. Seul un utilisateur dont le profil a le rôle 'admin'
// peut réellement modifier les données (RLS tranche, pas le frontend).
// ==============================================================================

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { createBrowserClient } from '@/lib/supabase/client';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { DashboardAuthContext, useDashboardAuth, type DashboardAuth } from '@/components/dashboard/auth';
import './dashboard.css';

/** Icône SVG minimale. */
function Icon({ d, className = '' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/** Lien du menu latéral. */
interface DashLink {
  href: string;
  label: string;
  icon: string;
}

const MENU: DashLink[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: 'M3 3v18h18' },
  { href: '/dashboard/products', label: 'Produits', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { href: '/dashboard/orders', label: 'Commandes', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  { href: '/', label: 'Voir la boutique', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
];

/** Formulaire de connexion administrateur. */
function LoginForm() {
  const { signIn } = useDashboardAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // En cas de succès, onAuthStateChange (dans le layout) met la session à jour.
      const err = await signIn(email, password);
      if (err) setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Connexion administrateur</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Accédez au back-office pour gérer le catalogue, les prix, les stocks et les commandes.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="dash-email" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              E-mail
            </label>
            <input
              id="dash-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-card border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label htmlFor="dash-password" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Mot de passe
            </label>
            <input
              id="dash-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-card border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-card border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-card bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-4 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
          Compte requis : un utilisateur Supabase Auth dont le profil a le rôle{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-700">admin</code> (table{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-700">profiles</code>). Les droits réels
          sont appliqués par la sécurité RLS, pas par cette interface.
        </p>
      </div>
    </div>
  );
}

/**
 * Layout du dashboard : authentification + navigation latérale.
 *
 * @param children - Contenu de la route active (/dashboard, /products, /orders).
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    const client = createBrowserClient();
    let active = true;

    client.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    const client = createBrowserClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    await createBrowserClient().auth.signOut();
  }, []);

  const auth: DashboardAuth = { session, loading, signIn, signOut };

  return (
    <DashboardAuthContext.Provider value={auth}>
      <div className="dash-layout">
        {/* ---------- Sidebar ---------------- */}
        <aside className="dash-sidebar p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between px-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Navigation</p>
            <ThemeToggle />
          </div>
          <nav aria-label="Menu du tableau de bord">
            <ul className="space-y-1">
              {MENU.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 rounded-card px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-green-50 text-brand-dark dark:bg-green-900/30 dark:text-green-300'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-brand-dark dark:text-gray-300 dark:hover:bg-gray-700'
                      }`}
                    >
                      <Icon d={item.icon} className="h-5 w-5 shrink-0 text-gray-400" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-6 rounded-card border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Devise</p>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Dollar Américain ($)</p>
          </div>

          {session && (
            <div className="mt-4 rounded-card border border-gray-200 p-3 dark:border-gray-700">
              <p className="truncate text-xs font-medium text-gray-600 dark:text-gray-300">
                {session.user.email}
              </p>
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-2 w-full rounded-card border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-gray-600 dark:text-gray-300"
              >
                Se déconnecter
              </button>
            </div>
          )}
        </aside>

        {/* ---------- Contenu ---------------- */}
        <main className="p-4 md:p-8">
          {loading ? (
            <p className="text-sm text-gray-400" role="status">
              Chargement de la session…
            </p>
          ) : session ? (
            children
          ) : (
            <LoginForm />
          )}
        </main>
      </div>
    </DashboardAuthContext.Provider>
  );
}

'use client';

// ==============================================================================
// app/dashboard/page.tsx — Vue d'ensemble (KPI) du back-office
// ------------------------------------------------------------------------------
// Composant CLIENT compatible export statique (GitHub Pages) : les statistiques
// sont calculées côté navigateur via createBrowserClient. La structure
// (sidebar + authentification) est portée par app/dashboard/layout.tsx.
//
// KPI : Ventes totales, Commandes en cours, Inventaire, Valeur du stock.
// Avec la clé publique / un compte non-admin, les KPI commandes indiquent
// « non accessible » (RLS) ; le catalogue, lui, est toujours remonté.
// ==============================================================================

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils/formatters';
import { getDashboardStats, type DashboardStats } from '@/services/data/dashboard.repository';

/** Icône SVG minimale (aucune dépendance externe). */
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

/** Carte de statistique du dashboard. */
interface StatCard {
  key: string;
  label: string;
  value: string;
  sub?: string;
  icon: string;
  accent: string;
}

/**
 * Construit les cartes de KPI à partir des statistiques.
 *
 * @param stats - Indicateurs calculés côté client.
 * @returns La liste des cartes à afficher.
 */
function buildCards(stats: DashboardStats | null): StatCard[] {
  if (!stats) {
    return [
      { key: 'sales', label: 'Ventes totales', value: '—', icon: 'M12 8c-2 0-3 1-3 2s2 1 3 2 3 1 3 2-1 2-3 2m0-8V5m0 6v3', accent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
      { key: 'pending', label: 'Commandes en cours', value: '—', icon: 'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', accent: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
      { key: 'stock', label: 'Inventaire (produits)', value: '—', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10', accent: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
      { key: 'value', label: 'Valeur du stock', value: '—', icon: 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6', accent: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
    ];
  }

  return [
    {
      key: 'sales',
      label: 'Ventes totales',
      value: formatMoney(stats.totalSales),
      sub: stats.ordersAccessible ? 'Commandes payées' : 'Non accessible sans rôle admin',
      icon: 'M12 8c-2 0-3 1-3 2s2 1 3 2 3 1 3 2-1 2-3 2m0-8V5m0 6v3',
      accent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    },
    {
      key: 'pending',
      label: 'Commandes en cours',
      value: String(stats.pendingOrders),
      sub: stats.ordersAccessible ? `${stats.ordersCount} au total` : 'Non accessible sans rôle admin',
      icon: 'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
      accent: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    },
    {
      key: 'stock',
      label: 'Inventaire',
      value: `${stats.activeProducts} produits`,
      sub: `${stats.totalStock} unités en stock`,
      icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10',
      accent: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    },
    {
      key: 'value',
      label: 'Valeur du stock',
      value: formatMoney(stats.stockValue),
      sub: `${stats.activeZones} zones de livraison`,
      icon: 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6',
      accent: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    },
  ];
}

/**
 * Page Tableau de bord : cartes de statistiques (sidebar dans le layout).
 *
 * @returns La vue KPI du back-office.
 */
export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getDashboardStats(createBrowserClient());
        if (!cancelled) setStats(result);
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = buildCards(stats);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tableau de bord</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Vue d&apos;ensemble de votre boutique
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article
            key={card.key}
            className="rounded-card border border-gray-200 bg-white p-5 shadow-card dark:border-gray-700 dark:bg-gray-800"
          >
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${card.accent}`}>
              <Icon d={card.icon} className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{card.value}</p>
            {card.sub && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{card.sub}</p>}
          </article>
        ))}
      </div>

      {loading && (
        <p className="mt-6 text-sm text-gray-400" role="status">
          Chargement des données…
        </p>
      )}

      {!loading && stats && !stats.ordersAccessible && (
        <p className="mt-6 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Les indicateurs « Ventes » et « Commandes en cours » nécessitent une session dont le profil a le
          rôle admin (les commandes sont protégées par la sécurité RLS). Le catalogue et
          l&apos;inventaire sont, eux, en lecture publique.
        </p>
      )}
    </>
  );
}
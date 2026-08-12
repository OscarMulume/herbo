// ==============================================================================
// services/data/dashboard.repository.ts — Dépôt de données : tableau de bord
// ------------------------------------------------------------------------------
// Agrège des statistiques pour le Dashboard. 100 % compatible export statique :
// les requêtes sont exécutées côté client via le client navigateur injecté
// (createBrowserClient). Aucune requête serveur.
//
// Note RLS : avec la clé anon (visiteur non connecté), les commandes ne sont
// pas lisibles (le client ne voit que SES commandes). La lecture échoue donc
// proprement -> les KPI commandes/ventes reviennent à 0 avec un indicateur
// `accessible: false` affiché dans l'interface. Les données du catalogue et des
// zones (lecture publique) sont toujours remontées.
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { clientLogger } from '@/lib/utils/logger';

/** KPI du tableau de bord. */
export interface DashboardStats {
  /** Nombre de produits actifs au catalogue. */
  activeProducts: number;
  /** Nombre total d'unités en stock (somme de stock_quantity). */
  totalStock: number;
  /** Valeur théorique du stock (somme price x stock_quantity), en USD. */
  stockValue: number;
  /** Nombre de zones de livraison actives. */
  activeZones: number;
  /** (RLS) Nombre total de commandes ; 0 si non lisible par anon. */
  ordersCount: number;
  /** (RLS) Commandes en statut pending ; 0 si non lisible par anon. */
  pendingOrders: number;
  /** (RLS) Montant cumulé des commandes payées, en USD. */
  totalSales: number;
  /** (RLS) true si la lecture des commandes a réussi (rôle autorisé). */
  ordersAccessible: boolean;
}

/** Valeur neutre renvoyée quand une lecture échoue (KPI indisponible). */
const EMPTY: DashboardStats = {
  activeProducts: 0,
  totalStock: 0,
  stockValue: 0,
  activeZones: 0,
  ordersCount: 0,
  pendingOrders: 0,
  totalSales: 0,
  ordersAccessible: false,
};

/**
 * Calcule les statistiques du tableau de bord.
 *
 * @param client - Client Supabase injecté (navigateur en export statique).
 * @returns Les indicateurs calculés (jamais de throw : les échecs de lecture
 *          aboutissent à des KPI à 0, tolérés pour un backend non configuré).
 */
export async function getDashboardStats(client: SupabaseClient): Promise<DashboardStats> {
  const stats: DashboardStats = { ...EMPTY };

  try {
    const { data: products, error: productsError } = await client
      .from('products')
      .select('price, stock_quantity')
      .eq('is_active', true);

    if (!productsError && Array.isArray(products)) {
      stats.activeProducts = products.length;
      stats.totalStock = products.reduce((sum, p) => sum + (Number(p.stock_quantity) || 0), 0);
      stats.stockValue = products.reduce(
        (sum, p) => sum + (Number(p.price) || 0) * (Number(p.stock_quantity) || 0),
        0,
      );
    }
  } catch (error) {
    clientLogger.warn('dashboardRepository.products', { error });
  }

  try {
    const { count: zonesCount, error: zonesError } = await client
      .from('delivery_zones')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    if (!zonesError && typeof zonesCount === 'number') {
      stats.activeZones = zonesCount;
    }
  } catch (error) {
    clientLogger.warn('dashboardRepository.zones', { error });
  }

  // Lecture des commandes : réussit uniquement si le rôle a le droit (RLS).
  try {
    const { data: orders, error: ordersError } = await client
      .from('orders')
      .select('status, total_amount');

    if (!ordersError && Array.isArray(orders)) {
      stats.ordersAccessible = true;
      stats.ordersCount = orders.length;
      stats.pendingOrders = orders.filter((o) => o.status === 'pending').length;
      stats.totalSales = orders
        .filter((o) => o.status === 'paid')
        .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    }
  } catch (error) {
    clientLogger.warn('dashboardRepository.orders', { error });
  }

  return stats;
}
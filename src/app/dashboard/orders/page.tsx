'use client';

// ==============================================================================
// app/dashboard/orders/page.tsx — Gestion des commandes & livraison
// ------------------------------------------------------------------------------
// Vue d'ensemble des commandes client : changement de statut (En attente,
// Payée, En cours, En livraison, Livrée, Annulée) et rédaction d'un message
// personnalisé d'instructions de livraison destiné à l'acheteur.
//
// Compatible export statique : exécuté côté navigateur via createBrowserClient.
// Les écritures réussissent uniquement pour une session dont le profil a le
// rôle admin (RLS) ; sinon une erreur explicite est affichée.
// ==============================================================================

import { useCallback, useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils/formatters';
import type { Order, OrderStatus } from '@/types';

/** Libellés lisibles des statuts (triés du plus récent au plus ancien). */
const STATUS_ORDER: OrderStatus[] = [
  'pending',
  'paid',
  'processing',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'En attente',
  paid: 'Payée',
  processing: 'En cours',
  out_for_delivery: 'En livraison',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  paid: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  processing: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  out_for_delivery: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

const inputClass =
  'w-full rounded-card border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';

/** Donnée enrichie d'une commande pour l'affichage. */
interface OrderRow extends Order {
  customerName?: string;
  customerPhone?: string;
  itemCount?: number;
}

/**
 * Carte d'une commande : statut éditable + message de livraison.
 *
 * @param props - La commande et les callbacks de sauvegarde.
 */
function OrderCard({
  order,
  onStatusChange,
  onMessageSave,
  busy,
}: {
  order: OrderRow;
  onStatusChange: (id: string, status: OrderStatus) => Promise<void>;
  onMessageSave: (id: string, message: string) => Promise<void>;
  busy: boolean;
}) {
  const [message, setMessage] = useState(order.deliveryMessage ?? '');

  return (
    <article className="rounded-card border border-gray-200 bg-white p-4 shadow-card dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            {order.orderNumber}
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[order.status]}`}
            >
              {STATUS_LABELS[order.status]}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            {new Date(order.createdAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
          {formatMoney(order.totalAmount)}
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-2">
          <dt className="text-gray-400">Articles</dt>
          <dd className="font-medium text-gray-700 dark:text-gray-300">{order.itemCount ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-400">Client</dt>
          <dd className="truncate font-medium text-gray-700 dark:text-gray-300">
            {order.customerName || '—'} {order.customerPhone ? `· ${order.customerPhone}` : ''}
          </dd>
        </div>
        <div className="flex justify-between gap-2 sm:col-span-2">
          <dt className="shrink-0 text-gray-400">Adresse</dt>
          <dd className="text-right font-medium text-gray-700 dark:text-gray-300">{order.deliveryAddress}</dd>
        </div>
      </dl>

      {/* Changement de statut */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Statut</label>
        <select
          className={`${inputClass} w-auto`}
          value={order.status}
          onChange={(e) => void onStatusChange(order.id, e.target.value as OrderStatus)}
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {/* Message d'instructions de livraison destiné à l'acheteur */}
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Message d&apos;instructions de livraison (destiné à l&apos;acheteur)
        </label>
        <textarea
          className={`${inputClass} min-h-[64px]`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="ex. Livraison prévue entre 14h et 17h, appeler à l'arrivée…"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onMessageSave(order.id, message)}
            className="rounded-card bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? 'Enregistrement…' : 'Enregistrer le message'}
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * Page Commandes & Livraison.
 */
export default function OrdersPage() {
  const client = createBrowserClient();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingMessage, setSavingMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: ordersError } = await client
        .from('orders')
        .select('*, order_items(quantity)')
        .order('created_at', { ascending: false });

      if (ordersError) {
        setError(
          ordersError.code === '42501'
            ? 'Lecture des commandes refusée : rôle admin requis.'
            : (ordersError.message ?? 'Impossible de charger les commandes.'),
        );
        setOrders([]);
        return;
      }

      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const userIds = [...new Set(rows.map((r) => r.user_id as string))];

      // Noms/téléphones clients (RLS autorise l'admin à lire tous les profils).
      let profileMap: Record<string, { full_name?: string; phone?: string }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await client
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', userIds);
        if (Array.isArray(profiles)) {
          profileMap = Object.fromEntries(
            profiles.map((p) => [p.id as string, { full_name: p.full_name, phone: p.phone }]),
          );
        }
      }

      setOrders(
        rows.map((row) => ({
          id: row.id as string,
          orderNumber: row.order_number as string,
          userId: row.user_id as string,
          status: row.status as OrderStatus,
          itemsTotal: Number(row.items_total),
          deliveryFee: Number(row.delivery_fee),
          totalAmount: Number(row.total_amount),
          currency: row.currency as string,
          paymentMethod: (row.payment_method as Order['paymentMethod']) ?? null,
          deliveryAddress: row.delivery_address as string,
          deliveryLat: Number(row.delivery_lat),
          deliveryLng: Number(row.delivery_lng),
          driverId: (row.driver_id as string | null) ?? null,
          deliveryMessage: (row.delivery_message as string | null) ?? null,
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
          customerName: profileMap[row.user_id as string]?.full_name ?? undefined,
          customerPhone: profileMap[row.user_id as string]?.phone ?? undefined,
          itemCount: Array.isArray(row.order_items) ? (row.order_items as Array<{ quantity: number }>).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0) : undefined,
        })),
      );
    } catch {
      setError('Une erreur inattendue est survenue.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (id: string, status: OrderStatus) => {
    setError(null);
    setSavingStatus(true);
    try {
      const { error: updateError } = await client
        .from('orders')
        .update({ status, status_changed_at: new Date().toISOString() })
        .eq('id', id);
      if (updateError) {
        setError(updateError.code === '42501' ? 'Refusé par la sécurité : rôle admin requis.' : (updateError.message ?? 'Impossible de changer le statut.'));
        return;
      }
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    } catch {
      setError('Une erreur inattendue est survenue.');
    } finally {
      setSavingStatus(false);
    }
  };

  const saveMessage = async (id: string, message: string) => {
    setError(null);
    setSavingMessage(id);
    try {
      const { error: updateError } = await client
        .from('orders')
        .update({ delivery_message: message.trim() || null })
        .eq('id', id);
      if (updateError) {
        setError(updateError.code === '42501' ? 'Refusé par la sécurité : rôle admin requis.' : (updateError.message ?? 'Impossible d’enregistrer le message.'));
        return;
      }
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, deliveryMessage: message.trim() || null } : o)));
    } catch {
      setError('Une erreur inattendue est survenue.');
    } finally {
      setSavingMessage(null);
    }
  };

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Commandes &amp; Livraison</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Suivi des commandes, changement de statut et message d&apos;instructions destiné à l&apos;acheteur.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-400" role="status">
          Chargement des commandes…
        </p>
      ) : orders.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
          Aucune commande pour le moment.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={savingMessage === order.id || savingStatus}
              onStatusChange={changeStatus}
              onMessageSave={saveMessage}
            />
          ))}
        </div>
      )}
    </>
  );
}
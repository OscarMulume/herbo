'use client';

// ==============================================================================
// app/dashboard/products/page.tsx — Gestion du catalogue (CMS)
// ------------------------------------------------------------------------------
// Module « Catalogue » du back-office : créer, modifier et supprimer des
// articles. La gestion des prix (USD, $) et de la quantité en stock se fait
// en édition directe dans le formulaire.
//
// Compatible export statique : tout est exécuté côté navigateur via
// createBrowserClient. Les écritures réussissent uniquement pour une session
// dont le profil a le rôle admin (RLS) ; sinon une erreur explicite est
// affichée.
// ==============================================================================

import { useCallback, useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils/formatters';
import type { Product, Category } from '@/types';

/** État du formulaire produit. */
interface ProductDraft {
  name: string;
  slug: string;
  description: string;
  price: string;
  stockQuantity: string;
  categoryId: string;
  isActive: boolean;
}

const EMPTY_DRAFT: ProductDraft = {
  name: '',
  slug: '',
  description: '',
  price: '',
  stockQuantity: '0',
  categoryId: '',
  isActive: true,
};

/** Slugifie un nom (slug lisible). */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Ligne d'entrée réutilisable du formulaire. */
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-card border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';

/**
 * Formulaire produit : création / modification (avec prix et stock).
 *
 * @param props - Produit à éditer (null => création) + callbacks.
 */
function ProductForm({
  product,
  categories,
  onSaved,
  onCancel,
}: {
  product: Product | null;
  categories: Category[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ProductDraft>(() =>
    product
      ? {
          name: product.name,
          slug: product.slug,
          description: product.description ?? '',
          price: String(product.price),
          stockQuantity: String(product.stockQuantity),
          categoryId: product.categoryId,
          isActive: product.isActive,
        }
      : EMPTY_DRAFT,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const client = createBrowserClient();
      const row = {
        name: draft.name.trim(),
        slug: draft.slug.trim() || slugify(draft.name),
        description: draft.description.trim() || null,
        price: Number(draft.price),
        stock_quantity: Math.max(0, Math.floor(Number(draft.stockQuantity) || 0)),
        category_id: draft.categoryId,
        is_active: draft.isActive,
      };

      if (!row.name) {
        setError('Le nom du produit est obligatoire.');
        return;
      }
      if (!Number.isFinite(row.price) || row.price < 0) {
        setError('Le prix doit être un montant positif (en dollars, ex. 10).');
        return;
      }

      const { error: saveError } = product
        ? await client.from('products').update(row).eq('id', product.id)
        : await client.from('products').insert(row);

      if (saveError) {
        setError(
          saveError.code === '42501'
            ? "Refusé par la sécurité : seul un utilisateur avec le rôle admin peut modifier le catalogue."
            : (saveError.message ?? 'Enregistrement impossible.'),
        );
        return;
      }
      onSaved();
    } catch {
      setError('Une erreur inattendue est survenue.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-gray-200 bg-white p-5 shadow-card dark:border-gray-700 dark:bg-gray-800"
    >
      <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-gray-100">
        {product ? 'Modifier le produit' : 'Ajouter un produit'}
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nom du produit *">
          <input
            className={inputClass}
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="ex. Huile de coco"
            required
          />
        </Field>
        <Field label="Slug (identifiant URL)" hint="Laissé vide = généré automatiquement">
          <input className={inputClass} value={draft.slug} onChange={(e) => set('slug', e.target.value)} placeholder="huile-de-coco" />
        </Field>
        <Field label="Prix ($) *" hint="Dollar américain, ex. 10">
          <input
            className={inputClass}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={draft.price}
            onChange={(e) => set('price', e.target.value)}
            placeholder="0.00"
            required
          />
        </Field>
        <Field label="Stock (unités) *">
          <input
            className={inputClass}
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={draft.stockQuantity}
            onChange={(e) => set('stockQuantity', e.target.value)}
            required
          />
        </Field>
        <Field label="Catégorie *">
          <select
            className={inputClass}
            value={draft.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
            required
          >
            <option value="" disabled>
              Choisir une catégorie…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Visibilité">
          <label className="mt-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
            />
            Produit actif (visible en boutique)
          </label>
        </Field>
      </div>

      <Field label="Description">
        <textarea
          className={`${inputClass} mt-3 min-h-[80px]`}
          value={draft.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Courte description commerciale du produit…"
        />
      </Field>

      {error && (
        <p className="mt-3 rounded-card border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-card bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? 'Enregistrement…' : product ? 'Enregistrer les modifications' : 'Créer le produit'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-card border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

/**
 * Page Gestion du catalogue : liste + formulaire CRUD.
 */
export default function ProductsPage() {
  const client = createBrowserClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        client
          .from('products')
          .select('*, categories(name, slug)')
          .order('name', { ascending: true }),
        client.from('categories').select('id, name, slug, parent_id').order('name', { ascending: true }),
      ]);

      if (productsRes.error) {
        setError(productsRes.error.code === '42501' ? 'Lecture refusée par la sécurité (rôle admin requis).' : (productsRes.error.message ?? 'Impossible de charger les produits.'));
      } else {
        setProducts((productsRes.data ?? []).map((row) => ({
          id: row.id,
          categoryId: row.category_id,
          name: row.name,
          slug: row.slug,
          description: row.description,
          benefits: row.benefits,
          dosage: row.dosage,
          price: Number(row.price),
          stockQuantity: Number(row.stock_quantity),
          images: row.images ?? [],
          isActive: Boolean(row.is_active),
          category: row.categories
            ? { name: row.categories.name ?? '', slug: row.categories.slug ?? '' }
            : undefined,
        })));
      }

      if (categoriesRes.error) {
        setError(categoriesRes.error.message ?? 'Impossible de charger les catégories.');
      } else {
        setCategories((categoriesRes.data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          parentId: row.parent_id,
        })));
      }
    } catch {
      setError('Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeProduct = async (product: Product) => {
    const confirmed = window.confirm(`Supprimer définitivement « ${product.name} » ?`);
    if (!confirmed) return;
    setError(null);
    const { error: delError } = await client.from('products').delete().eq('id', product.id);
    if (delError) {
      setError(
        delError.code === '42501'
          ? 'Refusé par la sécurité : rôle admin requis pour supprimer.'
          : (delError.message ?? 'Suppression impossible.'),
      );
      return;
    }
    await load();
  };

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Catalogue</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Ajouter, modifier ou supprimer des articles — prix en dollars ($) et gestion du stock.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="rounded-card bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
        >
          + Ajouter un produit
        </button>
      </header>

      {formOpen && (
        <div className="mb-6">
          <ProductForm
            product={editing}
            categories={categories}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
            }}
            onSaved={() => {
              setFormOpen(false);
              setEditing(null);
              void load();
            }}
          />
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-400" role="status">
          Chargement du catalogue…
        </p>
      ) : products.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
          Aucun produit. Cliquez sur « + Ajouter un produit » pour commencer.
        </p>
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-200 bg-white shadow-card dark:border-gray-700 dark:bg-gray-800">
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {products.map((product) => (
              <li key={product.id} className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
                    {product.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {product.category?.name ?? 'Sans catégorie'} · {product.slug}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {formatMoney(product.price)}
                  </p>
                  <p
                    className={`text-xs tabular-nums ${
                      product.stockQuantity > 0 ? 'text-gray-500 dark:text-gray-400' : 'text-rose-500'
                    }`}
                  >
                    {product.stockQuantity} en stock
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    product.isActive
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  {product.isActive ? 'Actif' : 'Inactif'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(product);
                      setFormOpen(true);
                    }}
                    className="rounded-card border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-brand hover:text-brand-dark dark:border-gray-600 dark:text-gray-300"
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeProduct(product)}
                    className="rounded-card border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950"
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
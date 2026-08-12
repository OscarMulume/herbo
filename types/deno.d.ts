// ==============================================================================
// types/deno.d.ts — Déclaration minimale de l'environnement Deno pour TypeScript
// ------------------------------------------------------------------------------
// Les Edge Functions Supabase tournent sous Deno (imports `.ts` et objet global
// `Deno`). Les tests Vitest importent les modules partagés (`_shared/*`) en
// Node : cette déclaration permet à `tsc --noEmit` de typer ce code sans lancer
// un runtime Deno.
// ==============================================================================

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};
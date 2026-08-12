/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export 100% statique (indispensable pour GitHub Pages) : plus de serveur Node.
  output: 'export',

  // Le site est hébergé sous https://OscarMulume.github.io/herbo/ :
  // toutes les routes et assets sont préfixés par /herbo.
  basePath: '/herbo',
  assetPrefix: '/herbo/',

  // Génère des URLs avec trailing slash (recommandé pour les hébergeurs statiques).
  trailingSlash: true,

  // L'optimisation next/image requiert un serveur : désactivée pour l'export statique.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

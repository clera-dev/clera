/**
 * Webpack configuration utilities for Next.js
 * Extracted from next.config.mjs to maintain separation of concerns
 */

/**
 * Applies production optimizations to the Webpack configuration
 * @param {Object} config - The Webpack configuration object
 * @param {Object} options - Build options from Next.js
 * @param {boolean} options.dev - Whether this is a development build
 * @param {boolean} options.isServer - Whether this is a server-side build
 * @returns {Object} The modified Webpack configuration
 */
const applyProductionOptimizations = (config, { dev, isServer }) => {
  // Only apply optimizations for production client builds
  if (!dev && !isServer) {
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    };
  }
  
  return config;
};

/**
 * Main Webpack configuration function
 * @param {Object} config - The Webpack configuration object
 * @param {Object} options - Build options from Next.js
 * @returns {Object} The modified Webpack configuration
 */
const configureWebpack = (config, options) => {
  return applyProductionOptimizations(config, options);
};

module.exports = {
  configureWebpack,
  applyProductionOptimizations,
}; 
/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'hebbkx1anhila5yf.public.blob.vercel-storage.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Configure webpack for missing modules
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Add module resolution aliases
    config.resolve.alias = {
      ...config.resolve.alias,
      'lib': path.resolve(__dirname, 'lib'),
      'components': path.resolve(__dirname, 'components'),
      'data': path.resolve(__dirname, 'data'),
      'app': path.resolve(__dirname, 'app'),
      'styles': path.resolve(__dirname, 'styles'),
      '@babel/runtime/helpers/esm/extends': path.resolve(__dirname, 'extend-helper.js'),
      // Add other helpers as needed
    };
    
    // Add a rule to handle imports from @react-three/drei and related packages
    config.module.rules.push({
      test: /node_modules\/@react-three\/drei\/.*\.js$/,
      use: [
        defaultLoaders.babel,
        {
          loader: 'string-replace-loader',
          options: {
            search: "import _extends from '@babel/runtime/helpers/esm/extends';",
            replace: "import _extends from '../../../extend-helper.js';",
            flags: 'g'
          }
        }
      ]
    });
    
    return config;
  },
  reactStrictMode: true,
}

module.exports = nextConfig 
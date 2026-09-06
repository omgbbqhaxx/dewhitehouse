/** @type {import('next').NextConfig} */
// GitHub Pages alt yolda (username.github.io/dewhitehouse) yayinlanirken
// basePath gerekir. Ozel alan adi (public/CNAME) eklenirse deploy scriptinden
// NEXT_PUBLIC_BASE_PATH kaldirilmali.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^@react-native-async-storage\/async-storage$/,
        }),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "@react-native-async-storage/async-storage": false,
      };
    }
    return config;
  },
};
export default nextConfig;

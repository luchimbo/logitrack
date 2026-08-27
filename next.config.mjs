/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{
      source: "/transportista/:path*",
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
      ],
    }];
  },
};

export default nextConfig;

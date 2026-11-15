import type { NextConfig } from "next";

// The browser only ever talks to this app: /api/* is proxied to the .NET backend. That
// keeps the STB API bound to loopback and means there is no cross-origin request to
// configure, since the browser sees a single origin.
const API_ORIGIN = process.env.STB_API_ORIGIN ?? "http://127.0.0.1:5080";

const nextConfig: NextConfig = {
  // Next blocks cross-origin requests to dev assets by default. That breaks the whole point
  // of a phone remote: opening the LAN address serves the HTML but 403s every JS chunk, so
  // the page renders and none of the buttons do anything.
  //
  // Setting this replaces the built-in allow-list rather than extending it, and the built-in
  // one only covers `localhost`. Leaving 127.0.0.1 out means typing the numeric form of the
  // same address gives you that same dead page, with no error to explain it.
  //
  // Development only — this setting has no effect on a production build. The private ranges
  // are wildcards rather than one address so a DHCP lease change doesn't silently break it
  // again. Narrow it to your own subnet if you don't want other devices reaching the dev server.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.*.*", "10.*.*.*", "172.16.*.*"],

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

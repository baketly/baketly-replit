// Baketly, as a phone app.
//
// The app ships the built web page inside itself and talks to the deployed API
// over HTTPS. That is why the web build's own /api proxy is irrelevant here:
// the bundle is served from capacitor://localhost, so the API's address is
// given at build time through VITE_API_BASE, and the server allows that origin
// through CORS.
//
// The scheme below is what Google sign-in returns through: Safari finishes the
// round trip by opening baketly://auth?token=…, iOS brings the app forward, and
// the app keeps the session.

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.baketly.app",
  appName: "Baketly",
  // where vite leaves the built page; `cap sync` copies it into the iOS project
  webDir: "dist/public",
  ios: {
    // the page is drawn under the status bar and home indicator, and the CSS
    // keeps content clear of both
    contentInset: "never",
    // a baker checking a market in daylight should not fight a dark shell
    backgroundColor: "#faf6f0",
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#8e9a48",
    },
  },
};

export default config;

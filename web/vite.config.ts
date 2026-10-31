import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Adds the Google Search Console verification tag and the Cloudflare Web Analytics
// beacon to index.html, only when their values are set (repo variables in website.yml).
function siteTags(): Plugin {
  const google = process.env.VITE_GOOGLE_SITE_VERIFICATION?.trim();
  const cf = process.env.VITE_CF_ANALYTICS_TOKEN?.trim();
  return {
    name: 'hearfinch-site-tags',
    transformIndexHtml() {
      const tags = [];
      if (google) {
        tags.push({ tag: 'meta', attrs: { name: 'google-site-verification', content: google }, injectTo: 'head' as const });
      }
      if (cf) {
        tags.push({
          tag: 'script',
          attrs: { defer: true, src: 'https://static.cloudflareinsights.com/beacon.min.js', 'data-cf-beacon': JSON.stringify({ token: cf }) },
          injectTo: 'body' as const,
        });
      }
      return tags;
    },
  };
}

// GitHub Pages serves project sites from /<repo>/; the workflow sets BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), siteTags()],
});

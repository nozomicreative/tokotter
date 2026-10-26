import { defineConfig } from 'wxt';

// tokotter — 100% local build. No identity, no remote host permissions,
// no external server. See src/brand.ts for the design tokens.
export default defineConfig({
  manifest: {
    name: '__MSG_extName__',
    short_name: 'tokotter',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    minimum_chrome_version: '116',
    action: {
      default_title: 'Open tokotter',
      default_icon: {
        '16': 'icons/16.png',
        '32': 'icons/32.png',
        '48': 'icons/48.png',
        '128': 'icons/128.png',
      },
    },
    permissions: ['activeTab', 'scripting', 'sidePanel', 'storage', 'downloads'],
    side_panel: { default_path: 'sidepanel/index.html' },
  },
});

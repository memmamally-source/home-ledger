import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native app shell (iOS and Android) around the same web build that GitHub Pages serves.
 * appId can be changed freely until the first upload to App Store Connect / Google Play; after that it is permanent.
 */
const config: CapacitorConfig = {
  appId: 'com.memmamally.homeledger',
  appName: 'HomeLedger',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#faf7ef',
  },
  android: {
    backgroundColor: '#faf7ef',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#faf7ef',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT',
    },
  },
};

export default config;

import { Capacitor } from '@capacitor/core';
import { Brand } from '@/config/brand';

/** True inside the iOS or Android app; false in a browser. */
export const isNative = Capacitor.isNativePlatform();
export const nativePlatform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';

/**
 * Public address of the web app. Links people share (invitations) must point here, because inside the native
 * app the page address is an internal one (capacitor://localhost) that means nothing to anyone else.
 */
export function publicAppUrl(): string {
  return isNative ? Brand.webUrl : location.href;
}

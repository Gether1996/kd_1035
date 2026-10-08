import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

/** public/push-sw.js – shows the notifications, nothing else (no caching, no fetch handler) */
const WORKER = '/push-sw.js';
/** an unreachable push service would otherwise keep the button busy for minutes */
const TIMEOUT_MS = 20_000;

/**
 * Browser side of web push: notification permission, the service worker and this browser's subscription.
 * The subscription is created with the server's VAPID public key and then stored on the server (RemindersApi).
 */
@Injectable({ providedIn: 'root' })
export class WebPush {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** False in older browsers and on iPhone outside a web app added to the home screen. */
  supported(): boolean {
    return this.isBrowser && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  /** The player blocked notifications for the site – only the browser settings can change that. */
  denied(): boolean {
    return this.supported() && Notification.permission === 'denied';
  }

  /** This browser's subscription made with `key`; one made with an older key is cancelled (→ null). */
  async current(key: string): Promise<PushSubscription | null> {
    const registration = await navigator.serviceWorker.getRegistration(WORKER);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return null;
    const used = subscription.options.applicationServerKey;
    if (used && !sameBytes(new Uint8Array(used), decodeKey(key))) {
      await subscription.unsubscribe();
      return null;
    }
    return subscription;
  }

  /** Asks for permission (call it from a click), registers the worker and subscribes. Rejects when refused. */
  async subscribe(key: string): Promise<PushSubscription> {
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications not allowed');
    await navigator.serviceWorker.register(WORKER);
    const registration = await withTimeout(navigator.serviceWorker.ready);
    return (
      (await this.current(key)) ??
      withTimeout(registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(key) }))
    );
  }

  /** Cancels this browser's subscription; resolves with its endpoint (null when there was none). */
  async unsubscribe(): Promise<string | null> {
    const registration = await navigator.serviceWorker.getRegistration(WORKER);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return null;
    await subscription.unsubscribe();
    return subscription.endpoint;
  }
}

/** VAPID keys travel as base64url without padding. */
export function decodeKey(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Push service timeout')), TIMEOUT_MS)),
  ]);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

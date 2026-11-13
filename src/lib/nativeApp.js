// The Android app (Capacitor, see capacitor.config.json) is a native shell around this site; it adds "UfuqApp" to the user agent.
export const isNativeApp = () => typeof navigator !== 'undefined' && /UfuqApp/.test(navigator.userAgent || '');

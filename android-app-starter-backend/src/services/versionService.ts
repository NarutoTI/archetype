interface PlatformVersionInfo {
  version: string;
  minSupportedVersion: string;
  storeUrl: string;
}

interface AppVersionInfo {
  android: PlatformVersionInfo;
  ios: PlatformVersionInfo;
}

export const getAppVersionInfo = (): AppVersionInfo => ({
  android: {
    version: process.env.ANDROID_APP_VERSION || '1.0.0',
    minSupportedVersion: process.env.ANDROID_MIN_SUPPORTED_VERSION || '1.0.0',
    storeUrl: process.env.ANDROID_STORE_URL || ''
  },
  ios: {
    version: process.env.IOS_APP_VERSION || '1.0.0',
    minSupportedVersion: process.env.IOS_MIN_SUPPORTED_VERSION || '1.0.0',
    storeUrl: process.env.IOS_STORE_URL || ''
  }
});

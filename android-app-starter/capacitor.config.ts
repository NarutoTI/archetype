import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.androidstarter',
  appName: 'Android App Starter',
  webDir: 'www',
  server: {
    
    androidScheme: 'http',
    cleartext: true,
    allowNavigation: [
      'http://10.0.2.2:3000/*',
      'http://localhost:3000/*'
    ]
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: "default",
      backgroundColor: "#00000000"
    },
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: "#00000000",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: true,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
      spinnerColor: "#999999",
      splashFullScreen: false,
      splashImmersive: false,
      layoutName: "launch_screen",
      useDialog: true,
    },
    LocalNotifications: {
      // Define channels at runtime on Android to avoid referencing missing resources here.
      // channel: {
      //   id: "default",
      //   name: "Default Channel",
      //   importance: 4,
      //   description: "A default channel",
      // },
    },
    Camera: {
      iosPermissions: {
        cameraUsageDescription: "Allow access to camera to take photos",
        photoLibraryUsageDescription: "Allow access to photo library to select images"
      }
    }
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    }
  }
};

export default config; 

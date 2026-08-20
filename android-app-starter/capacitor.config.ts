import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.androidstarter',
  appName: 'Android App Starter',
  webDir: 'www',
  server: {
    
    androidScheme: 'http',
    cleartext: true,
    allowNavigation: [
      'http://10.0.2.2:3001/*',
      'http://localhost:3001/*'
    ]
  },
  plugins: {
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
    },
    // OTA / Live Updates (modo manual, self-hosted). Ver docs/native/OTA.md.
    // autoUpdate 'off' = nada acontece sozinho; o app dirige cada passo por JS.
    CapacitorUpdater: {
      autoUpdate: 'off',
      appReadyTimeout: 10000,
      autoDeletePrevious: true,
      // Ao instalar um app nativo MAIS NOVO (update de loja), descarta qualquer OTA
      // aplicado e sobe o builtin novo. Default true; explícito porque a migração
      // key-v2 depende disso — a casca nova assinada tem que partir do próprio
      // builtin, não do bundle OTA plano antigo.
      resetWhenUpdate: true,
      // Assinatura key-v2 (opcional): gere a chave com `@capgo/cli key create` e a
      // publicKey será injetada aqui. Ver docs/native/OTA.md § Ligar a assinatura.
      // publicKey: '-----BEGIN RSA PUBLIC KEY----- ...',
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

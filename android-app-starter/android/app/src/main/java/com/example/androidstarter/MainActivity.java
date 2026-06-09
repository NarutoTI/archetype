package com.example.androidstarter;

import android.content.res.Configuration;
import android.os.Bundle;
import android.view.WindowManager;

import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        EdgeToEdge.enable(this);

        super.onCreate(savedInstanceState);

        ViewCompat.setOnApplyWindowInsetsListener(
                findViewById(android.R.id.content),
                (view, windowInsets) -> {
                    Insets gestureInsets = windowInsets.getInsets(WindowInsetsCompat.Type.systemGestures());
                    Insets systemInsets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
                    Insets imeInsets = windowInsets.getInsets(WindowInsetsCompat.Type.ime());

                    float density = getResources().getDisplayMetrics().density;
                    int topInset = (int) (systemInsets.top / density);
                    int bottomInset = (int) (gestureInsets.bottom / density);

                    int imeHeight = Math.max(0, imeInsets.bottom - systemInsets.bottom);
                    if (imeHeight > 0) {
                        bottomInset = 0;
                    }

                    setSafeAreaInsets(topInset, bottomInset);
                    return WindowInsetsCompat.CONSUMED;
                }
        );

        updateSystemBarAppearance();
    }

    private void setSafeAreaInsets(int top, int bottom) {
        String js = "document.addEventListener('DOMContentLoaded', function() {" +
                "document.documentElement.style.setProperty('--ion-safe-area-top', '" + top + "px');" +
                "document.documentElement.style.setProperty('--ion-safe-area-bottom', '" + bottom + "px');" +
                "});";
        bridge.getWebView().evaluateJavascript(js, null);
    }

    private void updateSystemBarAppearance() {
        boolean isDarkMode = (getResources().getConfiguration().uiMode &
                Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;

        WindowInsetsControllerCompat insetsController =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());

        insetsController.setAppearanceLightStatusBars(!isDarkMode);
        insetsController.setAppearanceLightNavigationBars(!isDarkMode);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
        getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        updateSystemBarAppearance();
    }
}

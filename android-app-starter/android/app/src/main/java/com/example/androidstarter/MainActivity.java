package com.example.androidstarter;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

/**
 * Liga o modo ponta a ponta antes do {@code super.onCreate}, que já infla o layout.
 * No Android 15+ o sistema faz isso sozinho; no 14 para trás só esta chamada.
 * O SystemBars e o Ionic afastam título e menu das faixas.
 * Não registrar listener de insets aqui: devolver CONSUMED impede o SystemBars
 * de aplicar o recuo e o menu volta a ficar atrás da barra. Ver docs/EDGE-TO-EDGE-SAFE-AREA.md.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}

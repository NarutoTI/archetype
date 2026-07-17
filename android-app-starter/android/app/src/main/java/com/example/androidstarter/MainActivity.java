package com.example.androidstarter;

import com.getcapacitor.BridgeActivity;

// Edge-to-edge, insets e aparência das system bars são tratados pelo plugin
// SystemBars embutido no core do Capacitor 8. NÃO adicionar listeners de insets
// aqui: um listener no content view retornando CONSUMED impede o listener do
// SystemBars de receber os insets e quebra o --ion-safe-area-* no cold start.
// Ver docs/EDGE-TO-EDGE-SAFE-AREA.md.
public class MainActivity extends BridgeActivity {}

# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# O WorkManager (OTA, @capgo/capacitor-updater) sobe no boot pelo
# InitializationProvider. O Room instancia WorkDatabase_Impl por reflexão.
# No full mode do R8, o -keep da biblioteca preserva a classe e remove o
# construtor vazio. Sem esta regra o release fecha na abertura:
# NoSuchMethodException: androidx.work.impl.WorkDatabase_Impl.<init> []
-keepclassmembers class * extends androidx.room.RoomDatabase {
    <init>();
}

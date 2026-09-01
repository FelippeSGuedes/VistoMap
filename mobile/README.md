# VistoMap Mobile — APK Android

Wrapper Capacitor do app tecnico (`/app`). Carrega
`https://zabbmap.nansen.com.br/app` dentro de WebView nativo e adiciona:

- **Background GPS** via Foreground Service (rastreia mesmo com tela bloqueada)
- **Push notifications** via FCM (atribuicao de vistoria, deadlines)

## Setup inicial

1. **Pre-requisitos** (ja feitos):
   - Android Studio + JDK 17 (JBR bundled)
   - SDK em `%LOCALAPPDATA%\Android\Sdk`
   - `mobile/android/local.properties` aponta pro SDK
   - `gradle.properties` aponta `org.gradle.java.home` pro JBR
2. **Plugins instalados** (capacitor.config.ts):
   - `@capgo/background-geolocation` (migrado de `@capacitor-community/background-geolocation`
     em 2026-09-01 — o antigo parou na v1.2.26, sem release pra Capacitor 8)
   - `@capgo/capacitor-updater` (atualização OTA do bundle web, ver seção abaixo)
   - `@capacitor/push-notifications`
   - `@capacitor/app`
   - `@capacitor/filesystem`

## Build APK debug (ja funciona — para sideload teste)

```bash
cd mobile/android
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk (~4.4MB)
```

Instala via `adb install` ou copia o APK pro celular + abre o arquivo.

## Build APK release (para distribuir fora da Play Store — sideload)

A assinatura já está permanentemente configurada em
`mobile/android/app/build.gradle` (atrás de um guard `hasKeystoreConfig` —
sem o arquivo abaixo, o build de debug continua funcionando normal, só o de
release fica sem assinar). Só falta o arquivo local:

1. Gera keystore (1 vez, guarda bem — perda = não dá pra atualizar o app
   assinado nunca mais, nem na Play Store):
   ```bash
   keytool -genkey -v -keystore vistomap-release.keystore \
     -alias vistomap -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Cria `mobile/android/keystore.properties` (NAO commitar — já está no
   `.gitignore`):
   ```properties
   storeFile=../vistomap-release.keystore
   storePassword=SENHA_KEYSTORE
   keyAlias=vistomap
   keyPassword=SENHA_KEY
   ```
3. Build (`npx cap sync android` primeiro — sem isso o bundle web empacotado
   pode ficar desatualizado em relação ao código atual):
   ```bash
   node scripts/build-mobile.mjs
   cd mobile && npx cap sync android
   cd android && ./gradlew assembleRelease
   # Output: app/build/outputs/apk/release/app-release.apk
   ```
   Ou, mais simples, o mesmo comando de baixo sem o `bundleRelease` no fim —
   por ora ainda não existe um `npm run apk:release` que encadeia isso, use
   os passos acima.

## Build AAB (Play Store)

A Play Store exige **Android App Bundle (`.aab`)** pra apps novos — não
aceita mais `.apk` no upload. A assinatura é a MESMA do release acima (mesmo
`keystore.properties`, reaproveitada automaticamente pelo Gradle — não
precisa de nenhuma configuração extra pro bundle).

```bash
npm run aab
```

Encadeia `build-mobile.mjs` → `cap sync android` → `gradlew bundleRelease`
num comando só (mesmo padrão do `npm run apk`, que gera o APK de debug).
Falha cedo, com mensagem clara, se `mobile/android/keystore.properties` não
existir — um bundle sem assinatura não serve pra nada no Play Console.

Saída: `mobile/android/app/build/outputs/bundle/release/app-release.aab`.

Antes de subir, confira a assinatura:
```bash
jarsigner -verify -verbose -certs mobile/android/app/build/outputs/bundle/release/app-release.aab
```

## Setup Push notifications (FCM)

1. Cria projeto no [Firebase Console](https://console.firebase.google.com/)
2. Adiciona app Android com package `br.com.nansen.vistomap`
3. Baixa `google-services.json`, coloca em `mobile/android/app/google-services.json`
4. Project Settings → Service Accounts → "Generate new private key"
5. Salva como `/etc/vistomap/firebase-service-account.json` no destino
6. Adiciona env `FIREBASE_PROJECT_ID=seu-projeto-id` em `/etc/vistomap/.env.local`
7. Instala firebase-admin no painel container:
   ```bash
   # Adiciona ao package.json e rebuilda
   npm install firebase-admin
   ```
8. Roda migration:
   ```bash
   mysql -h 127.0.0.1 -P 3307 -u glpi_gioc -p glpi_gioc < mobile/migrations/001_push_tokens.sql
   ```
9. Rebuild APK com `google-services.json` presente

## Permissoes Android solicitadas

| Permissao | Por que |
|-----------|---------|
| ACCESS_FINE_LOCATION | GPS preciso |
| ACCESS_BACKGROUND_LOCATION | rastreio com tela bloqueada |
| FOREGROUND_SERVICE / _LOCATION | servico nativo de localizacao |
| POST_NOTIFICATIONS | push (Android 13+) |
| WAKE_LOCK | mantem CPU ativa durante ping |
| RECEIVE_BOOT_COMPLETED | re-inicia servico apos reboot |

## Endpoints backend

- `POST /api/push/register` — tecnico salva FCM token (chamado automatico pelo app via `usePushRegistration`)
- `POST /api/painel/push/send` (admin) — envia push pra usuario(s)
  ```json
  { "users_id": 2, "title": "Nova vistoria", "body": "AER-S-GE-042", "data": { "url": "/app/vistorias/42" } }
  ```

## Atualizar app web sem republicar APK/AAB (OTA)

O app roda em modo **bundle local** (o front-end vai embutido no APK,
`mobile/www`, e abre 100% offline — não é `server.url` mais). Atualização
sem reinstalar é feita por OTA via `@capgo/capacitor-updater`: um push pro
`main` que toque `src/**`/`public/**`/`mobile/**` (fora de
`src/app/painel/**` e `src/app/api/**`) dispara o workflow
`publish-ota.yml` sozinho, que builda e publica um bundle novo; o app checa
`/ota/latest.json` no cold-start e baixa/aplica sozinho (ver
`src/hooks/useOtaUpdate.ts`).

Só precisa gerar e distribuir um APK/AAB novo quando:

- Adiciona/atualiza plugin Capacitor (a API nativa muda — código JS que
  chama o método novo só pode ir por OTA depois que o plugin novo já
  estiver instalado, senão quebra em quem ainda tem o app antigo)
- Muda permissão Android
- Muda config nativa (ícone, splash, package, SDK/AGP/Gradle)

## Estrutura

```
mobile/
├── capacitor.config.ts       # config server.url + plugins
├── package.json              # deps Capacitor (separado do Next)
├── www/index.html            # dummy (Capacitor exige, mas nao usa em modo server.url)
├── android/                  # projeto Android Studio
│   ├── app/build/outputs/apk/  # APKs gerados
│   ├── app/google-services.json  # Firebase (TODO)
│   ├── app/src/main/AndroidManifest.xml  # permissoes
│   └── local.properties      # sdk.dir (NAO commitar)
└── migrations/
    └── 001_push_tokens.sql
```

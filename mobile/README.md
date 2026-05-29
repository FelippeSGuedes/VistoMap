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
   - `@capacitor-community/background-geolocation`
   - `@capacitor/push-notifications`
   - `@capacitor/app`

## Build APK debug (ja funciona — para sideload teste)

```bash
cd mobile/android
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk (~4.4MB)
```

Instala via `adb install` ou copia o APK pro celular + abre o arquivo.

## Build APK release (para distribuir)

1. Gera keystore (1 vez, guarda bem — perda = nao da pra atualizar APK):
   ```bash
   keytool -genkey -v -keystore vistomap-release.keystore \
     -alias vistomap -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Cria `mobile/android/keystore.properties` (NAO commitar):
   ```properties
   storeFile=../vistomap-release.keystore
   storePassword=SENHA_KEYSTORE
   keyAlias=vistomap
   keyPassword=SENHA_KEY
   ```
3. Edita `mobile/android/app/build.gradle` adicionando `signingConfigs`:
   ```gradle
   android {
     signingConfigs {
       release {
         def kp = new Properties()
         kp.load(new FileInputStream(rootProject.file('keystore.properties')))
         storeFile file(kp.storeFile)
         storePassword kp.storePassword
         keyAlias kp.keyAlias
         keyPassword kp.keyPassword
       }
     }
     buildTypes {
       release {
         signingConfig signingConfigs.release
         minifyEnabled false
       }
     }
   }
   ```
4. Build:
   ```bash
   cd mobile/android && ./gradlew assembleRelease
   # Output: app/build/outputs/apk/release/app-release.apk
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

## Atualizar app web sem republicar APK

Como Capacitor usa `server.url`, qualquer push pro git que atualiza `/app`
fica disponivel instantaneamente nos APKs ja instalados. So precisa
republicar APK quando:

- Adiciona/atualiza plugin Capacitor
- Muda permissao Android
- Muda config nativa (icone, splash, package)

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

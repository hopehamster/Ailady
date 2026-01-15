# Security Notes - API Keys & Credentials

## ⚠️ Important Security Reminders

### Current Status

**Genies Credentials** are currently in code:
- Location: `lib/core/config/genies_config.dart`
- Client ID: `client_01KEZDTFBTMCZTKT2ZYYEFRZ8D`
- Client Secret: `950cba732acd46c598c3f0d51454a2e7d0dfe6852a6a6d0921756187bb0cda37`

### ⚠️ Security Risk

**These credentials are in source code** - this is OK for development but NOT for production!

---

## For Production: Secure Storage Options

### Option 1: Environment Variables (Recommended)

1. **Install flutter_dotenv**:
   ```yaml
   dependencies:
     flutter_dotenv: ^5.1.0
   ```

2. **Create `.env` file** (already in .gitignore):
   ```bash
   GENIES_CLIENT_ID=client_01KEZDTFBTMCZTKT2ZYYEFRZ8D
   GENIES_CLIENT_SECRET=950cba732acd46c598c3f0d51454a2e7d0dfe6852a6a6d0921756187bb0cda37
   ```

3. **Update GeniesConfig**:
   ```dart
   import 'package:flutter_dotenv/flutter_dotenv.dart';
   
   class GeniesConfig {
     static String get clientId => dotenv.env['GENIES_CLIENT_ID'] ?? '';
     static String get clientSecret => dotenv.env['GENIES_CLIENT_SECRET'] ?? '';
   }
   ```

### Option 2: Flutter Secure Storage

1. **Install package**:
   ```yaml
   dependencies:
     flutter_secure_storage: ^9.0.0
   ```

2. **Store credentials securely**:
   ```dart
   final storage = FlutterSecureStorage();
   await storage.write(key: 'genies_client_id', value: '...');
   await storage.write(key: 'genies_client_secret', value: '...');
   ```

### Option 3: Firebase Remote Config

1. **Store in Firebase Remote Config**
2. **Fetch at runtime**
3. **Never in source code**

---

## Current Protection

✅ **`.gitignore`** - `.env` files are ignored
✅ **Credentials in code** - OK for development
⚠️ **Production** - Must move to secure storage

---

## Best Practices

1. **Never commit secrets to git**
2. **Use environment variables** for production
3. **Rotate keys** if exposed
4. **Use different keys** for dev/staging/prod
5. **Monitor API usage** for unauthorized access

---

## Action Items

### For Development (Now):
- ✅ Credentials in code - OK
- ✅ .gitignore configured
- ✅ Can proceed with development

### For Production (Later):
- [ ] Move to environment variables
- [ ] Use flutter_dotenv or secure storage
- [ ] Remove credentials from code
- [ ] Set up CI/CD with env vars
- [ ] Rotate keys before launch

---

## Current Credentials Summary

### Genies:
- Client ID: `client_01KEZDTFBTMCZTKT2ZYYEFRZ8D`
- Client Secret: `950cba732acd46c598c3f0d51454a2e7d0dfe6852a6a6d0921756187bb0cda37`
- Location: `lib/core/config/genies_config.dart`

### Other API Keys:
- OpenAI: In `functions/.env` ✅
- Gemini: In `functions/.env` ✅
- Claude: In `functions/.env` ✅
- Pinecone: In `functions/.env` ✅
- Redis: In `functions/.env` ✅
- ElevenLabs: In `functions/.env` ✅
- Pointagram: In service file ⚠️ (consider moving)

---

## Notes

- Development: Current setup is fine
- Production: Must implement secure storage
- Git: Credentials are in code but .gitignore protects .env files
- Rotation: Rotate all keys before production launch

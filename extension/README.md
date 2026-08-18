# VietCalenAI Chrome Extension

## How to Load (Developer Mode)

### Step 1: Load the extension

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this `extension/` folder
4. Copy your **Extension ID** (shown under the extension name, e.g. `abcdef1234...`)

### Step 2: Register your Extension ID in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select the project for VietCalenAI
3. Go to **APIs & Services → Credentials**
4. Find the OAuth 2.0 Client ID used by the extension
5. Click **Edit** → under **Authorized JavaScript origins**, add:
   ```
   chrome-extension://<your-extension-id>
   ```
6. Click **Save**

### Updating after pulling new code

Go to `chrome://extensions` and click the refresh icon on the VietCalenAI card.

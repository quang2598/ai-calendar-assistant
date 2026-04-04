export const config = {
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  },
  backendUrl: import.meta.env.VITE_BACKEND_URL || "http://localhost:3000",
  ttsUrl: import.meta.env.VITE_TTS_URL || "http://localhost:3000/api/speech/synthesize",
  oauthClientId: import.meta.env.VITE_OAUTH_CLIENT_ID,
  webOauthClientId: import.meta.env.VITE_WEB_OAUTH_CLIENT_ID,
  webOauthClientSecret: import.meta.env.VITE_WEB_OAUTH_CLIENT_SECRET,
  elevenLabsApiKey: import.meta.env.VITE_ELEVENLABS_API_KEY,
  elevenLabsVoiceId: import.meta.env.VITE_ELEVENLABS_VOICE_ID,
  silenceTimeoutMs: 1200,
};

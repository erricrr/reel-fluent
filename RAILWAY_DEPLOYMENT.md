# Railway Deployment Guide

This guide will help you deploy ReelFluent to Railway with all the required environment variables.

## Prerequisites

1. A Railway account ([sign up here](https://railway.app))
2. A Google AI API key ([get one here](https://aistudio.google.com/app/apikey))

## Step-by-Step Deployment

### 1. Get Your Google AI API Key

**This is REQUIRED for AI transcription to work!**

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated API key (starts with `AIza...`)

### 2. Deploy to Railway

1. Fork this repository to your GitHub account
2. Go to [Railway](https://railway.app) and sign in
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your forked repository
5. Railway will automatically start building

### 3. Configure Environment Variables

**CRITICAL**: Before your app will work, you MUST set the environment variables:

1. In your Railway project dashboard, go to the "Variables" tab
2. Add the following environment variable:

```
GOOGLE_API_KEY = your_actual_api_key_here
```

Replace `your_actual_api_key_here` with the API key you got from Google AI Studio.

### 4. Redeploy

After adding the environment variable:
1. Go to the "Deployments" tab
2. Click "Redeploy" on the latest deployment
3. Wait for the deployment to complete

## Verifying Your Deployment

1. Once deployed, visit your Railway app URL
2. Upload a video or paste a YouTube URL
3. Try the "Transcribe Clip" feature
4. If it works, you're all set! 🎉

## Troubleshooting

### AI Transcription Not Working

**Symptoms**:
- "Transcribe Clip" button doesn't work
- No automated transcription appears
- Console errors about API keys

**Solution**:
1. Check that you've set the `GOOGLE_API_KEY` environment variable
2. Verify the API key is correct (starts with `AIza...`)
3. Redeploy after adding the variable

**Mobile Browser Issues**:
- If transcription fails on mobile, the app automatically uses server-side processing
- Look for the "📱 Mobile Device Detected" message
- This requires ffmpeg to be available on the server (included in our Dockerfile)

### YouTube Processing Not Working

**Symptoms**:
- YouTube URLs don't work
- "Failed to download YouTube audio" errors

**Solution**:
- This should work automatically with our Dockerfile
- Check the health endpoint at `/api/health` to verify yt-dlp is installed

### Mobile Browser Support

**Good news!** The app now automatically detects mobile browsers and uses server-side audio processing for better compatibility.

**What this means:**
- ✅ AI transcription works on iOS Safari, Android Chrome, and other mobile browsers
- ✅ Automatic fallback when browser APIs are limited
- ✅ Same functionality across all devices

### Health Check

Visit `your-app-url.railway.app/api/health` to check if all dependencies are working:

```json
{
  "status": "healthy",
  "dependencies": {
    "yt-dlp": "available",
    "ffmpeg": "available"
  },
  "features": {
    "youtube-processing": true,
    "mobile-audio-extraction": true,
    "ai-transcription": "configured"
  }
}
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | **YES** | Google AI API key for transcription |
| `NODE_ENV` | Auto-set | Set to `production` by Railway |
| `PORT` | Auto-set | Set automatically by Railway |

## Support

If you're still having issues:
1. Check the Railway deployment logs
2. Verify your Google AI API key is valid
3. Contact support: voicevoz321@gmail.com

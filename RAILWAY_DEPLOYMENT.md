# Railway Deployment Guide

This guide will help you deploy ReelFluent to Railway with all the required environment variables.

## YouTube Audio Extraction (Railway-Compatible)

ReelFluent now uses a Railway-compatible approach for YouTube audio extraction that doesn't require yt-dlp or Python. This approach:

- ✅ **Works on Railway** without DMCA compliance issues
- ✅ **No yt-dlp installation** required
- ✅ **No Python dependencies** required
- ✅ **Uses Piped and Invidious APIs** for audio streams
- ✅ **Client-side processing** for better reliability

### How It Works

The app uses external APIs (Piped and Invidious) to extract YouTube audio streams, which are then processed client-side. This approach is fully compliant with Railway's terms of service.

### Optional Configuration

To improve YouTube audio extraction reliability, you can configure these optional environment variables:

#### Piped Instance Configuration
- `PIPED_INSTANCE_URLS`: Comma-separated list of Piped instance URLs for fallback downloading
- Example: `https://piped.video,https://pipedapi.kavin.rocks,https://piped-api.orkiv.com`

#### YouTube Data API (Optional)
- `YOUTUBE_API_KEY`: Google YouTube Data API key for enhanced metadata (optional)
- `NEXT_PUBLIC_YOUTUBE_API_KEY`: Public YouTube API key for client-side metadata

#### Temporary Directory
- `TEMP_DIR`: Custom path for temporary file storage (default: /tmp in production)

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

# Netlify Deployment Guide

This guide will help you deploy ReelFluent to Netlify with all the required environment variables.

## YouTube Audio Extraction (Netlify-Compatible)

ReelFluent uses a Netlify-compatible approach for YouTube audio extraction that doesn't require yt-dlp or Python. This approach:

- ✅ **Works on Netlify** without DMCA compliance issues
- ✅ **No yt-dlp installation** required
- ✅ **No Python dependencies** required
- ✅ **Uses Piped and Invidious APIs** for audio streams
- ✅ **Client-side processing** for better reliability

### How It Works

The app uses external APIs (Piped and Invidious) to extract YouTube audio streams, which are then processed client-side. This approach is fully compliant with Netlify's terms of service.

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

1. A Netlify account ([sign up here](https://netlify.com))
2. A Google AI API key ([get one here](https://aistudio.google.com/app/apikey))

## Step-by-Step Deployment

### 1. Get Your Google AI API Key

**This is REQUIRED for AI transcription to work!**

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated API key (starts with `AIza...`)

### 2. Deploy to Netlify

1. Fork this repository to your GitHub account
2. Go to [Netlify](https://netlify.com) and sign in
3. Click "New site from Git"
4. Connect your GitHub account and select your forked repository
5. Netlify will automatically detect the build settings from `netlify.toml`

### 3. Configure Environment Variables

**CRITICAL**: Before your app will work, you MUST set the environment variables:

1. In your Netlify site dashboard, go to "Site settings" → "Environment variables"
2. Add the following environment variable:

```
GOOGLE_API_KEY = your_actual_api_key_here
```

Replace `your_actual_api_key_here` with the API key you got from Google AI Studio.

### 4. Redeploy

After adding the environment variable:
1. Go to the "Deploys" tab
2. Click "Trigger deploy" → "Deploy site"

## Netlify Configuration

The project includes a `netlify.toml` file with the following configuration:

- **Build command**: `npm run build`
- **Publish directory**: `.next`
- **Node version**: 18
- **Function bundler**: esbuild
- **Redirects**: Configured for API routes and SPA routing

This configuration ensures optimal performance and compatibility with Netlify's platform.

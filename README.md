[![Netlify Status](https://api.netlify.com/api/v1/badges/db4eb6cd-b3b1-4e89-a97f-fde678ebfda6/deploy-status)](https://app.netlify.com/projects/reelfluent/deploys)

# ReelFluent

This is a tool I created for myself for Vietnamese listening practice. It's helped from having to go between Google Translate, a video or audio file, and a transcription service. Gemini currently powers it, but it could also use an OpenAI model or an Anthropic model.

## Features

- **File Upload Support** - Upload MP4, MP3, WAV, WebM files directly
- **Direct Media URLs** - Load media from direct URLs (MP4, MP3, etc.)
- **AI-powered audio transcription and segmentation**
- **Multi-language support with translation**
- **Interactive language learning tools**
- **Automatic clip generation** with customizable duration

## Prerequisites

- Node.js 18+
- Google AI API Key

## Local Setup

1. **Clone and install:**
```bash
git clone <your-repo-url>
cd reel-fluent
npm install
```

2. **Create `.env.local` file:**
```env
GOOGLE_GENAI_API_KEY=your_google_ai_api_key_here
```

Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

3. **Start the app:**
```bash
npm run dev
```

Open http://localhost:9002


## Media Sources

ReelFluent supports two ways to load media:

1. **File Upload** - Upload MP4, MP3, WAV, WebM files directly from your device
2. **Direct URLs** - Enter direct links to media files (e.g., `https://example.com/video.mp4`)

For YouTube videos, you can:
- Download the video using external tools (yt-dlp, 4K Video Downloader, etc.)
- Convert to MP4/MP3 format
- Upload the file directly to ReelFluent

## Support

For questions: voicevoz321@gmail.com

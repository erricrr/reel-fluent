# ReelFluent

This is a tool I created for myself for Vietnamese listening practice. It's helped from having to go between Google Translate, a video or audio file, and a transcription service. Gemini currently powers it, but it could also use an OpenAI model or an Anthropic model.

## Features

- YouTube video download and audio extraction (works best locally)
- AI-powered audio transcription and segmentation
- Multi-language support with translation
- Interactive language learning tools

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
GOOGLE_API_KEY=your_google_ai_api_key_here
```

Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

3. **Start the app:**
```bash
npm run dev
```

Open http://localhost:9002

## Deployment on Netlify

This project is deployed on Netlify. For deployment instructions, see [NETLIFY_DEPLOYMENT.md](./NETLIFY_DEPLOYMENT.md).

## Enhanced YouTube Support (Optional)

For better YouTube functionality in local development, install yt-dlp:

```bash
# macOS
brew install yt-dlp

# Linux/Windows
pip3 install yt-dlp
```

Note: YouTube features work best locally. Production deployment has limitations due to external API dependencies.

## Support

For questions: voicevoz321@gmail.com

# ReelFluent

A feature-rich language learning application that allows users to download YouTube videos, transcribe them, and create interactive learning experiences.

## Features

- 🎥 YouTube video download and audio extraction
- 🎯 AI-powered audio transcription and segmentation
- 🌍 Multi-language support with translation
- 🎓 Interactive language learning tools
- 📱 Mobile browser support with server-side audio processing
- 🔒 Privacy-focused (no permanent storage of user content)

## Tech Stack

- **Frontend**: Next.js 15, React 18, TypeScript
- **UI**: Tailwind CSS, Radix UI components
- **Audio Processing**: Railway-compatible YouTube audio extraction (Piped/Invidious APIs)
- **AI**: Google Genkit with Gemini 2.0 Flash for transcription and translation
- **Database**: Firebase (optional)

## Prerequisites

- Node.js 18+
- Node.js 18+ (no Python required)
- FFmpeg
- Google AI API Key (for transcription features)

## Local Development

1. Clone the repository:
```bash
git clone <your-repo-url>
cd lingua-clip
```

2. Install dependencies:
```bash
npm install
```

3. No additional dependencies required - the app uses Railway-compatible YouTube audio extraction.

4. Set up environment variables:
```bash
cp .env.example .env.local
# Edit .env.local with your configuration
```

5. Run the development server:
```bash
npm run dev
```

## Railway Deployment

This project is optimized for Railway deployment with Railway-compatible YouTube audio extraction (no yt-dlp required).

### Quick Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/your-template-id)

### Manual Deployment

1. Connect your GitHub repository to Railway
2. Railway will automatically detect this as a Node.js project
3. **IMPORTANT**: Set your environment variables in Railway dashboard (see below)
4. Deploy! Railway will handle the deployment automatically

### Environment Variables

**Required for Railway deployment:**

- `GOOGLE_API_KEY` - **REQUIRED** for AI transcription features. Get this from [Google AI Studio](https://aistudio.google.com/app/apikey)
- `NODE_ENV=production`

**Optional:**
- `FIREBASE_CONFIG` (if using Firebase authentication)
- `NEXT_PUBLIC_FIREBASE_API_KEY` (if using Firebase)

Railway automatically provides:
- `PORT` (Railway sets this automatically)
- `RAILWAY_ENVIRONMENT`

### Getting Google AI API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key and add it to Railway as `GOOGLE_API_KEY`

**Without this API key, AI transcription will not work!**

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── youtube/
│   │       └── download/
│   │           └── route.ts    # YouTube download API
│   └── health/
│       └── route.ts        # Health check endpoint
├── privacy/
│   └── page.tsx           # Privacy policy
└── ...
```

## License

This project is licensed under the MIT License.

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## Support

For questions or support, contact: voicevoz321@gmail.com

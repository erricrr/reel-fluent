# LinguaClip

A feature-rich language learning application that allows users to download YouTube videos, transcribe them, and create interactive learning experiences.

## Features

- 🎥 YouTube video download and audio extraction
- 🎯 Audio transcription and segmentation
- 🌍 Multi-language support
- 🎓 Interactive language learning tools
- 🔒 Privacy-focused (no permanent storage of user content)

## Tech Stack

- **Frontend**: Next.js 15, React 18, TypeScript
- **UI**: Tailwind CSS, Radix UI components
- **Audio Processing**: yt-dlp, FFmpeg
- **AI**: Google Genkit for transcription and translation
- **Database**: Firebase (optional)

## Prerequisites

- Node.js 18+
- Python 3.x (for yt-dlp)
- FFmpeg

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

3. Install yt-dlp:
```bash
pip install yt-dlp
```

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

This project is optimized for Railway deployment with automatic yt-dlp installation.

### Quick Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/your-template-id)

### Manual Deployment

1. Connect your GitHub repository to Railway
2. Railway will automatically detect this as a Node.js project
3. Set your environment variables in Railway dashboard
4. Deploy! Railway will handle yt-dlp installation automatically

### Environment Variables

Set these in your Railway project:

- `NODE_ENV=production`
- `GOOGLE_API_KEY` (if using Google AI features)
- `FIREBASE_CONFIG` (if using Firebase)

Railway automatically provides:
- `PORT` (Railway sets this automatically)
- `RAILWAY_ENVIRONMENT`

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── youtube/
│   │       └── download/
│   │           └── route.ts    # YouTube download API
│   ├── privacy/
│   │   └── page.tsx           # Privacy policy
│   └── ...
├── components/                 # Reusable UI components
└── ...
```

## License

This project is licensed under the MIT License.

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## Support

For questions or support, contact: voicevoz321@gmail.com

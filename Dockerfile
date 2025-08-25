FROM node:18-alpine

# Install system dependencies (no Python required)
RUN apk add --no-cache \
    ffmpeg \
    curl \
    ca-certificates

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --legacy-peer-deps

# Railway-compatible YouTube audio extraction (no yt-dlp required)
RUN echo "YouTube audio extraction using Piped/Invidious APIs"

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Set environment variables
ENV NODE_ENV=production
ENV PATH="/root/.local/bin:$PATH"
ENV TEMP_DIR="/tmp/temp-downloads"

# Create temp directory for downloads
RUN mkdir -p /tmp/temp-downloads

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

FROM node:18-alpine

# Install system dependencies including Python and ffmpeg
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    && ln -sf python3 /usr/bin/python

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --legacy-peer-deps

# Install/upgrade Python dependencies (yt-dlp)
RUN pip3 install --break-system-packages --upgrade yt-dlp

# Verify yt-dlp installation and version
RUN yt-dlp --version

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

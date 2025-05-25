FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache python3 py3-pip ffmpeg

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Clean npm cache and install dependencies
RUN npm cache clean --force && \
    rm -rf node_modules package-lock.json && \
    npm install --legacy-peer-deps --no-audit --no-fund

# Install Python dependencies
RUN pip3 install --user yt-dlp

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Set environment variables
ENV NODE_ENV=production
ENV PATH="/root/.local/bin:$PATH"

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

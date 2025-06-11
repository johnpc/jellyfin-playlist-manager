#!/bin/bash

# Build script for Jellyfin Playlist Manager Docker image

set -e

# Configuration
IMAGE_NAME="jellyfin-playlist-manager"
DOCKER_USERNAME="${DOCKER_USERNAME:-mrorbitman}"
VERSION="${VERSION:-latest}"

echo "🐳 Building Docker image..."

# Build the image
docker build -t "${IMAGE_NAME}:${VERSION}" .

# Tag for Docker Hub
docker tag "${IMAGE_NAME}:${VERSION}" "${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}"

echo "✅ Build complete!"
echo "📦 Image: ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}"

# Ask if user wants to push
read -p "🚀 Push to Docker Hub? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔐 Logging in to Docker Hub..."
    docker login
    
    echo "📤 Pushing image..."
    docker push "${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}"
    
    echo "🎉 Successfully pushed to Docker Hub!"
    echo "🔗 https://hub.docker.com/r/${DOCKER_USERNAME}/${IMAGE_NAME}"
else
    echo "ℹ️  Image built locally. To push later, run:"
    echo "   docker push ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}"
fi

echo ""
echo "🏃 To run the container:"
echo "   docker run -p 3000:3000 ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}"
echo ""
echo "📖 See DOCKER.md for complete deployment instructions"

#!/bin/bash

# Setup script for git hooks
# Run this after cloning the repository to install git hooks

echo "🔧 Setting up git hooks..."

# Make sure hooks directory exists
mkdir -p .git/hooks

# Copy the pre-push hook
if [ -f ".git/hooks/pre-push" ]; then
    echo "⚠️  pre-push hook already exists. Backing up..."
    cp .git/hooks/pre-push .git/hooks/pre-push.backup
fi

cp scripts/pre-push .git/hooks/pre-push 2>/dev/null || {
    echo "❌ Error: pre-push hook template not found in scripts/"
    echo "   Make sure you're running this from the project root"
    exit 1
}

# Make the hook executable
chmod +x .git/hooks/pre-push

echo "✅ Git hooks installed successfully!"
echo "ℹ️  The pre-push hook will automatically version your package on pushes to main"
echo "ℹ️  To skip versioning for a specific push, use: git push --no-verify"

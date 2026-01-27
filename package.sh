#!/bin/bash
set -e

# Configuration
APP_NAME="student_c"
VERSION=$(date +%Y%m%d_%H%M)
RELEASE_DIR="release_build"
PACKAGE_NAME="${APP_NAME}_deploy_${VERSION}.tar.gz"

echo "📦 Start packaging for ${APP_NAME}..."

# 1. Clean previous build
rm -rf $RELEASE_DIR $PACKAGE_NAME
mkdir -p $RELEASE_DIR

# 2. Build Frontend
echo "🎨 Building Frontend..."
if command -v npm >/dev/null 2>&1; then
    cd frontend
    npm install
    npm run build
    cd ..
else
    echo "❌ Error: npm is not installed. Cannot build frontend."
    exit 1
fi

# 3. Copy Backend
echo "🐍 Copying Backend..."
mkdir -p $RELEASE_DIR/backend
# Copy python files while ignoring venv, cache, and data
rsync -av --progress backend/ $RELEASE_DIR/backend/ \
    --exclude venv \
    --exclude __pycache__ \
    --exclude "*.pyc" \
    --exclude .DS_Store \
    --exclude .git \
    --exclude .gitignore \
    --exclude "data/*" \
    --include "data/.keep" 

# 4. Copy Frontend Assets
echo "📑 Copying Frontend build..."
mkdir -p $RELEASE_DIR/frontend_dist
cp -r frontend/dist/* $RELEASE_DIR/frontend_dist/

# 5. Create Server-Side Install Script
echo "📝 Generating install scripts..."
cat << 'EOF' > $RELEASE_DIR/install.sh
#!/bin/bash
set -e

echo "🚀 Installing Student C Backend..."

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 could not be found. Please install python3 first."
    exit 1
fi

# Setup Virtual Environment
cd backend
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Installing dependencies..."
source venv/bin/activate
pip install -r requirements.txt --upgrade

# Setup Env
if [ ! -f ".env" ]; then
    echo "Creating .env from example..."
    cp .env.example .env
    echo "⚠️  Please edit backend/.env to configure your API KEYS!"
fi

# Ensure data dir
mkdir -p data

echo "✅ Installation Complete!"
echo "To start the backend manually:"
echo "  cd backend && source venv/bin/activate && python main.py"
EOF
chmod +x $RELEASE_DIR/install.sh

# 6. Create Run Script
cat << 'EOF' > $RELEASE_DIR/run_server.sh
#!/bin/bash
cd backend
source venv/bin/activate
# Run with uvicorn in production mode (no reload)
uvicorn main:app --host 0.0.0.0 --port 3002
EOF
chmod +x $RELEASE_DIR/run_server.sh

# 7. Compress
echo "🗜️  Compressing..."
tar -czf $PACKAGE_NAME -C $RELEASE_DIR .

# Cleanup
rm -rf $RELEASE_DIR

echo "✅ Package created: $PACKAGE_NAME"
echo "👉 Upload this file to your server."

#!/bin/bash

# Function to handle kill signal
cleanup() {
    echo "Stopping services..."
    kill $(jobs -p)
    exit
}

trap cleanup SIGINT SIGTERM

# Get the absolute path of the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

echo "Starting Backend..."
cd "$SCRIPT_DIR/backend"
# Check if venv exists
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "Error: Backend venv not found. Please run setup first."
    exit 1
fi

# Start Backend in background
uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "Backend running on port 8000 (PID: $BACKEND_PID)"

cd "$SCRIPT_DIR/frontend"
echo "Starting Frontend..."
# Ensure npm is in PATH (common issue on Apple Silicon Macs)
export PATH=/opt/homebrew/bin:$PATH

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

# Start Frontend in background
npm run dev &
FRONTEND_PID=$!
echo "Frontend running (PID: $FRONTEND_PID)"

echo "Services started."
echo "Press Ctrl+C to stop all services."

# Wait for processes
wait

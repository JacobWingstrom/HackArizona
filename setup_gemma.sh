#!/bin/bash
# Quick setup script for Gemma 4 integration
# Run this once to get everything ready for the hackathon

echo "🚀 CommunityPulse + Gemma 4 Setup"
echo "=================================="

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo ""
    echo "❌ Ollama not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        brew install ollama
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        curl https://ollama.ai/install.sh | sh
    else
        echo "❌ Please install Ollama from https://ollama.ai"
        exit 1
    fi
fi

echo "✅ Ollama found"

# Start Ollama server in background
echo ""
echo "🔧 Starting Ollama server..."
ollama serve &
OLLAMA_PID=$!

# Wait for server to start
sleep 3

# Pull Gemma 4B model
echo ""
echo "📥 Pulling Gemma 4B model (this takes 2-5 min on first run)..."
ollama pull gemma:4b

if [ $? -eq 0 ]; then
    echo "✅ Gemma 4B model ready"
else
    echo "❌ Failed to pull Gemma model"
    kill $OLLAMA_PID
    exit 1
fi

# Test the integration
echo ""
echo "🧪 Testing Gemma integration..."
python3 test_gemma.py

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Keep this terminal running (Ollama server is active)"
    echo "2. In a new terminal: python3 app.py"
    echo "3. In another terminal: cd frontend && npm start"
    echo ""
    echo "The app will be running at http://localhost:3000"
    echo "Gemma predictions are available at http://localhost:5001/api/predict/*"
    echo ""
    wait $OLLAMA_PID
else
    echo "❌ Test failed"
    kill $OLLAMA_PID
    exit 1
fi

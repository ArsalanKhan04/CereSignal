#!/bin/bash
# CereSignal Database Reset Script

echo "🔄 CereSignal Reset Script"
echo "========================="

# Check if we're in the right directory
if [ ! -f "backend/app/main.py" ]; then
    echo "❌ Error: Please run this script from the CereSignal project root directory"
    exit 1
fi

# Activate pyenv environment and run reset
echo "🚀 Running database and file reset..."

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Reset completed successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Start backend:  python -m app.main"
    echo "2. Start frontend: cd frontend && python simple_main.py"
    echo "3. Login with: doctor1 / securepassword123"
else
    echo "❌ Reset failed!"
    exit 1
fi

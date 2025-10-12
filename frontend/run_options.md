# CereSignal Frontend - Running Options

## 🌐 **Option 1: Web Browser (Recommended)**
```bash
# Start the backend first
cd ../
pyenv activate cere_env
python -m app.main

# In another terminal, start the frontend
cd frontend/
pyenv activate cere_env
python simple_main.py
```
- **Access**: Open `http://localhost:3000` in any browser
- **Best for**: Development, testing, sharing with others
- **Works on**: Desktop, mobile, tablet

## 🖥️ **Option 2: Desktop App (Native-like)**
```bash
# Start the backend first
cd ../
pyenv activate cere_env
python -m app.main

# In another terminal, start the desktop app
cd frontend/
pyenv activate cere_env
python desktop_app.py
```
- **Access**: Opens as a native desktop application
- **Best for**: Daily use, professional work
- **Features**: Native window, system integration

## 📱 **Option 3: Mobile App (PWA)**
The web version works great on mobile browsers and can be "installed" as a PWA:
1. Open `http://localhost:3000` on your mobile device
2. Add to home screen (iOS) or Install app (Android)
3. Works like a native app!

## 🔧 **Option 4: Development Mode**
```bash
# For development with auto-reload
cd frontend/
pyenv activate cere_env
python -m nicegui simple_main.py --reload
```

## 🌍 **Option 5: Network Access**
```bash
# Make accessible on local network
python simple_main.py --host 0.0.0.0 --port 3000
```
- **Access**: `http://YOUR_IP:3000` from any device on the network
- **Best for**: Team collaboration, demos

## 📦 **Option 6: Standalone Executable**
You can also create a standalone executable using PyInstaller:
```bash
pip install pyinstaller
pyinstaller --onefile --windowed desktop_app.py
```

## 🚀 **Quick Start (All Options)**
1. **Backend**: `cd ../ && pyenv activate cere_env && python -m app.main`
2. **Frontend**: Choose one of the options above
3. **Access**: Browser at `http://localhost:3000` or native app

## 💡 **Recommendations**
- **Development**: Use web browser option
- **Production**: Use desktop app option
- **Mobile**: Use PWA (Progressive Web App)
- **Team**: Use network access option
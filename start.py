# start.py - Startup script for the Contract Research Tool
import subprocess
import sys
import os
import time
import threading
import webbrowser
from pathlib import Path

def install_python_deps():
    """Install Python dependencies"""
    print("📦 Installing Python dependencies...")
    try:
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", "backend/requirements.txt"], 
                      check=True, cwd=".")
        print("✅ Python dependencies installed successfully")
    except subprocess.CalledProcessError as e:
        print(f"❌ Error installing Python dependencies: {e}")
        return False
    return True

def install_node_deps():
    """Install Node.js dependencies"""
    print("📦 Installing Node.js dependencies...")
    try:
        subprocess.run(["npm", "install"], check=True, cwd="frontend")
        print("✅ Node.js dependencies installed successfully")
    except subprocess.CalledProcessError as e:
        print(f"❌ Error installing Node.js dependencies: {e}")
        print("Make sure Node.js and npm are installed on your system")
        return False
    except FileNotFoundError:
        print("❌ npm not found. Please install Node.js from https://nodejs.org/")
        return False
    return True

def setup_tailwind():
    """Setup Tailwind CSS"""
    print("🎨 Setting up Tailwind CSS...")
    try:
        # Create tailwind.config.js
        tailwind_config = '''/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}'''
        
        with open("frontend/tailwind.config.js", "w") as f:
            f.write(tailwind_config)
        
        # Create postcss.config.js
        postcss_config = '''module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}'''
        
        with open("frontend/postcss.config.js", "w") as f:
            f.write(postcss_config)
            
        print("✅ Tailwind CSS configured successfully")
    except Exception as e:
        print(f"❌ Error setting up Tailwind: {e}")
        return False
    return True

def create_backend_init_files():
    """Create __init__.py files for Python packages"""
    init_files = [
        "backend/app/__init__.py",
        "backend/app/api/__init__.py", 
        "backend/app/services/__init__.py"
    ]
    
    for init_file in init_files:
        Path(init_file).parent.mkdir(parents=True, exist_ok=True)
        Path(init_file).touch()

def start_backend():
    """Start the FastAPI backend"""
    print("🚀 Starting backend server...")
    try:
        # Change to backend directory and start the server
        env = os.environ.copy()
        env['PYTHONPATH'] = os.path.join(os.getcwd(), 'backend')
        
        process = subprocess.Popen([
            sys.executable, "-m", "uvicorn", "app.main:app", 
            "--host", "0.0.0.0", "--port", "8000", "--reload"
        ], cwd="backend", env=env)
        
        return process
    except Exception as e:
        print(f"❌ Error starting backend: {e}")
        return None

def start_frontend():
    """Start the React frontend"""
    print("🚀 Starting frontend server...")
    try:
        process = subprocess.Popen(["npm", "start"], cwd="frontend")
        return process
    except Exception as e:
        print(f"❌ Error starting frontend: {e}")
        return None

def wait_for_server(url, timeout=30):
    """Wait for server to be ready"""
    import urllib.request
    import urllib.error
    
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except urllib.error.URLError:
            time.sleep(1)
    return False

def open_browser():
    """Open browser after a delay"""
    time.sleep(10)  # Wait for servers to start
    print("🌐 Opening browser...")
    webbrowser.open('http://localhost:3000')

def main():
    print("=" * 60)
    print("🏛️  Federal Contract Research Tool - MVP Setup")
    print("=" * 60)
    
    # Create necessary directories and files
    print("📁 Creating project structure...")
    create_backend_init_files()
    
    # Check if dependencies need to be installed
    needs_python_install = not Path("backend/venv").exists() and not Path("backend/.venv").exists()
    needs_node_install = not Path("frontend/node_modules").exists()
    
    if needs_python_install:
        if not install_python_deps():
            print("❌ Failed to install Python dependencies. Exiting...")
            return
    
    if needs_node_install:
        if not install_node_deps():
            print("❌ Failed to install Node.js dependencies. Exiting...")
            return
        
        if not setup_tailwind():
            print("❌ Failed to setup Tailwind CSS. Exiting...")
            return
    
    print("\n" + "=" * 60)
    print("🚀 Starting servers...")
    print("=" * 60)
    
    # Start backend
    backend_process = start_backend()
    if not backend_process:
        print("❌ Failed to start backend server. Exiting...")
        return
    
    # Wait a moment for backend to start
    time.sleep(3)
    
    # Start frontend
    frontend_process = start_frontend()
    if not frontend_process:
        print("❌ Failed to start frontend server. Stopping backend...")
        backend_process.terminate()
        return
    
    # Start browser in a separate thread
    browser_thread = threading.Thread(target=open_browser)
    browser_thread.daemon = True
    browser_thread.start()
    
    print("\n" + "=" * 60)
    print("✅ Servers started successfully!")
    print("=" * 60)
    print("🔗 Frontend: http://localhost:3000")
    print("🔗 Backend API: http://localhost:8000")
    print("📚 API Docs: http://localhost:8000/docs")
    print("\n💡 The application will open in your browser automatically.")
    print("🛑 Press Ctrl+C to stop both servers")
    print("=" * 60)
    
    try:
        # Wait for processes to finish
        frontend_process.wait()
    except KeyboardInterrupt:
        print("\n🛑 Stopping servers...")
        backend_process.terminate()
        frontend_process.terminate()
        
        # Wait for clean shutdown
        try:
            backend_process.wait(timeout=5)
            frontend_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            backend_process.kill()
            frontend_process.kill()
        
        print("✅ Servers stopped successfully")

if __name__ == "__main__":
    main()
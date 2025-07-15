# Gov-Contract-Tool Requirements

## System Requirements

### Python
- Python 3.8 or higher (recommended: Python 3.11+)
- pip (Python package manager)

### Node.js
- Node.js 16.x or higher
- npm (comes with Node.js)

## Backend Dependencies

The backend uses FastAPI and requires the following Python packages:

### Core Dependencies
- **fastapi** (0.109.0) - Modern web framework for building APIs
- **uvicorn** (0.27.0) - ASGI server for FastAPI
- **pydantic** (2.5.3) - Data validation using Python type annotations
- **requests** (2.31.0) - HTTP library for API calls to USASpending.gov
- **pandas** (2.1.4) - Data manipulation and analysis
- **numpy** (1.26.3) - Numerical computing library
- **sqlite3** - Database (included with Python)

### Installation
```bash
cd backend
pip install -r requirements.txt
```

## Frontend Dependencies

The frontend is built with React and requires:

### Core Dependencies
- **react** (18.2.0) - UI library
- **react-dom** (18.2.0) - React DOM bindings
- **react-router-dom** (6.20.1) - Routing for React
- **axios** (1.6.2) - HTTP client
- **recharts** (2.8.0) - Charting library
- **tailwindcss** (3.3.6) - Utility-first CSS framework
- **date-fns** (2.30.0) - Date utility library

### Installation
```bash
cd frontend
npm install
```

## Environment Setup

### Backend Environment Variables
Create a `.env` file in the backend directory:
```env
SAM_GOV_API_KEY=your_api_key_here
```

### Getting a SAM.gov API Key
1. Go to https://sam.gov/data-services
2. Click "Request Public API Key"
3. Fill out the form (it's free)
4. You'll receive your API key via email

## Database

The application uses SQLite, which requires no additional installation. The database file (`contracts.db`) is created automatically when the backend starts.

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/tw33kr/Gov-Contract-Tool.git
   cd Gov-Contract-Tool
   ```

2. **Set up Python virtual environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install backend dependencies**
   ```bash
   pip install -r backend/requirements.txt
   ```

4. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

5. **Run the application**
   ```bash
   python start.py
   ```

   Or run backend and frontend separately:
   ```bash
   # Terminal 1 - Backend
   cd backend
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   
   # Terminal 2 - Frontend
   cd frontend
   npm start
   ```

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Kill process on port 8000 (backend)
   lsof -ti:8000 | xargs kill -9
   
   # Kill process on port 3000 (frontend)
   lsof -ti:3000 | xargs kill -9
   ```

2. **Module not found errors**
   - Make sure your virtual environment is activated
   - Reinstall requirements: `pip install -r backend/requirements.txt`

3. **API key issues**
   - Ensure your SAM.gov API key is set in the environment
   - Export it: `export SAM_GOV_API_KEY=your_key_here`

4. **Database errors**
   - Delete `contracts.db` and restart the backend to recreate it

## Development Tools (Optional)

For development, consider installing:
- **pytest** - Testing framework
- **black** - Code formatter
- **flake8** - Linting tool

These are included in the backend requirements.txt as optional dependencies.
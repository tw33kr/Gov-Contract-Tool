# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import contracts
import uvicorn
import sqlite3
import os

app = FastAPI(
    title="Federal Contract Research API",
    description="API for researching US Federal contract opportunities",
    version="1.0.0"
)

# Initialize database on startup
def init_database():
    """Initialize database with correct schema"""
    db_path = "contracts.db"
    
    # If database exists with wrong schema, remove it
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            # Test if the table has the correct schema
            cursor.execute("SELECT fetched_at FROM contracts LIMIT 1")
            conn.close()
        except sqlite3.OperationalError:
            # Schema is wrong, remove database
            os.remove(db_path)
            print("🔄 Removed old database with incorrect schema")
    
    # Create/recreate database with correct schema
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Create contracts table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            notice_id TEXT UNIQUE,
            title TEXT,
            agency TEXT,
            office TEXT,
            posted_date TEXT,
            response_deadline TEXT,
            naics_code TEXT,
            naics_description TEXT,
            set_aside TEXT,
            description TEXT,
            award_amount REAL,
            place_of_performance TEXT,
            contact_info TEXT,
            solicitation_number TEXT,
            contract_type TEXT,
            search_hash TEXT,
            fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create awards table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS awards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            award_id TEXT,
            recipient_name TEXT,
            description TEXT,
            award_amount REAL,
            awarding_agency TEXT,
            awarding_subagency TEXT,
            start_date TEXT,
            end_date TEXT,
            award_type TEXT,
            search_hash TEXT,
            fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()
    print("✅ Database initialized successfully")

# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    init_database()

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers with both prefixes for compatibility
app.include_router(contracts.router, prefix="/api/contracts", tags=["contracts"])
app.include_router(contracts.router, prefix="/api", tags=["api"])

@app.get("/")
async def root():
    return {"message": "Federal Contract Research API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
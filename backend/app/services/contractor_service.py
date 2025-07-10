import requests
import sqlite3
from datetime import datetime
from typing import List, Dict, Any, Optional
import json
import logging
import time
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ContractorService:
    def __init__(self, database_path: str = "contracts.db"):
        self.database_path = database_path
        self.base_url = "https://api.usaspending.gov/api/v2/search/spending_by_award"
        self.init_database()
    
    def init_database(self):
        """Initialize contractor-specific database tables"""
        conn = sqlite3.connect(self.database_path)
        cursor = conn.cursor()
        
        # Create contractor profiles table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS contractor_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contractor_name TEXT UNIQUE,
                total_awards INTEGER DEFAULT 0,
                total_value REAL DEFAULT 0,
                first_award_date TEXT,
                latest_award_date TEXT,
                primary_agencies TEXT,
                primary_naics TEXT,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create contractor awards table for detailed records
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS contractor_awards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contractor_name TEXT,
                award_id TEXT,
                title TEXT,
                description TEXT,
                award_amount REAL,
                awarding_agency TEXT,
                awarding_subagency TEXT,
                start_date TEXT,
                end_date TEXT,
                award_type TEXT,
                naics_code TEXT,
                place_of_performance TEXT,
                competition_type TEXT,
                fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (contractor_name) REFERENCES contractor_profiles (contractor_name)
            )
        ''')
        
        # Create index for faster searches
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_contractor_name ON contractor_awards (contractor_name)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_contractor_date ON contractor_awards (start_date)')
        
        conn.commit()
        conn.close()
    
    def search_contractors(self, name_query: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Search for contractors with comprehensive data retrieval using pagination
        """
        logger.info(f"🔍 Searching contractors with query: '{name_query}', limit: {limit}")
        
        try:
            # First check if we have cached data for this contractor
            if name_query and len(name_query) > 3:
                cached_contractors = self._get_cached_contractors(name_query, limit)
                if cached_contractors:
                    logger.info(f"💾 Found {len(cached_contractors)} cached contractors")
                    # Return cached data but also trigger background refresh if data is old
                    self._refresh_contractor_data_if_needed(name_query)
                    return cached_contractors
            
            # If no cached data or general search, fetch from API with pagination
            contractors = self._fetch_contractors_paginated(name_query, limit)
            
            # Cache the results
            if contractors:
                self._cache_contractor_profiles(contractors)
            
            return contractors
            
        except Exception as e:
            logger.error(f"❌ Error searching contractors: {str(e)}")
            # Return cached data if available, even if API fails
            return self._get_cached_contractors(name_query or "", limit)
    
    def _fetch_contractors_paginated(self, name_query: Optional[str], limit: int) -> List[Dict[str, Any]]:
        """
        Fetch contractor data using pagination to get complete datasets
        """
        logger.info(f"🔄 Fetching contractors with pagination for query: '{name_query}'")
        
        all_awards = []
        page = 1
        max_pages = 10  # Limit to prevent infinite loops
        
        while page <= max_pages:
            try:
                logger.info(f"📄 Fetching page {page} of contractor data...")
                
                # Build payload for this page
                payload = self._build_contractor_search_payload(name_query, page=page, page_size=100)
                
                response = requests.post(
                    self.base_url,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "Federal-Contract-Research-Tool/1.0"
                    },
                    timeout=30  # Shorter timeout per page
                )
                
                if response.status_code == 200:
                    data = response.json()
                    page_awards = data.get('results', [])
                    
                    if not page_awards:
                        logger.info(f"📄 No more results on page {page}, stopping pagination")
                        break
                    
                    all_awards.extend(page_awards)
                    logger.info(f"📄 Page {page}: Retrieved {len(page_awards)} awards (total: {len(all_awards)})")
                    
                    # Check if we have enough data for specific contractor searches
                    if name_query and len(all_awards) >= 500:  # Reasonable limit for specific searches
                        logger.info(f"📄 Retrieved sufficient data ({len(all_awards)} awards) for contractor '{name_query}'")
                        break
                    
                    # For general searches, limit to prevent too much data
                    if not name_query and len(all_awards) >= 200:
                        logger.info(f"📄 Retrieved sufficient data ({len(all_awards)} awards) for general search")
                        break
                    
                    page += 1
                    time.sleep(0.5)  # Rate limiting
                    
                else:
                    logger.warning(f"⚠️ API error on page {page}: {response.status_code}")
                    break
                    
            except requests.exceptions.Timeout:
                logger.warning(f"⚠️ Timeout on page {page}, continuing with available data")
                break
            except Exception as e:
                logger.warning(f"⚠️ Error on page {page}: {str(e)}")
                break
        
        logger.info(f"✅ Completed pagination: {len(all_awards)} total awards retrieved")
        
        # Process awards into contractor profiles
        return self._process_awards_to_contractors(all_awards, name_query, limit)
    
    def _build_contractor_search_payload(self, name_query: Optional[str], page: int = 1, page_size: int = 100) -> Dict[str, Any]:
        """
        Build USASpending.gov API payload for contractor search with pagination
        """
        payload = {
            "filters": {
                "award_type_codes": ["A", "B", "C", "D"],  # Contract types
                "time_period": [{
                    "start_date": "2020-01-01",  # Extended range for comprehensive data
                    "end_date": datetime.now().strftime("%Y-%m-%d")
                }]
            },
            "fields": [
                "Award ID",
                "Recipient Name",
                "Award Amount",
                "Start Date",
                "End Date",
                "Awarding Agency",
                "Awarding Sub Agency",
                "Award Type",
                "Description",
                "NAICS Code",
                "Place of Performance"
            ],
            "page": page,
            "limit": page_size,
            "sort": "Start Date",
            "order": "desc"
        }
        
        # Add recipient name filter if searching for specific contractor
        if name_query and name_query.strip():
            # USASpending.gov uses recipient filters for contractor searches
            payload["filters"]["recipient_search_text"] = [name_query.strip()]
            logger.info(f"🔍 Added recipient filter: {name_query}")
        
        return payload
    
    def _process_awards_to_contractors(self, awards: List[Dict], name_query: Optional[str], limit: int) -> List[Dict[str, Any]]:
        """
        Process raw awards data into contractor profiles
        """
        logger.info(f"📊 Processing {len(awards)} awards into contractor profiles")
        
        contractor_data = {}
        
        for award in awards:
            recipient_name = award.get("Recipient Name") or award.get("recipient_name", "Unknown Recipient")
            
            # Skip if recipient name doesn't match search query
            if name_query and name_query.lower() not in recipient_name.lower():
                continue
            
            # Initialize contractor entry if not exists
            if recipient_name not in contractor_data:
                contractor_data[recipient_name] = {
                    "name": recipient_name,
                    "total_awards": 0,
                    "total_value": 0.0,
                    "agencies": set(),
                    "award_types": set(),
                    "naics_codes": set(),
                    "locations": set(),
                    "awards": [],
                    "first_award_date": None,
                    "latest_award_date": None
                }
            
            contractor = contractor_data[recipient_name]
            
            # Update totals
            contractor["total_awards"] += 1
            award_amount = award.get("Award Amount") or award.get("award_amount", 0)
            if award_amount:
                try:
                    contractor["total_value"] += float(award_amount)
                except (ValueError, TypeError):
                    pass
            
            # Collect metadata
            if award.get("Awarding Agency"):
                contractor["agencies"].add(award["Awarding Agency"])
            if award.get("Award Type"):
                contractor["award_types"].add(award["Award Type"])
            if award.get("NAICS Code"):
                contractor["naics_codes"].add(award["NAICS Code"])
            if award.get("Place of Performance"):
                contractor["locations"].add(award["Place of Performance"])
            
            # Track date range
            start_date = award.get("Start Date") or award.get("start_date")
            if start_date:
                if not contractor["first_award_date"] or start_date < contractor["first_award_date"]:
                    contractor["first_award_date"] = start_date
                if not contractor["latest_award_date"] or start_date > contractor["latest_award_date"]:
                    contractor["latest_award_date"] = start_date
            
            # Store individual award details (limit to most recent 20 per contractor)
            if len(contractor["awards"]) < 20:
                contractor["awards"].append({
                    "award_id": award.get("Award ID", ""),
                    "title": award.get("Description", "")[:100] if award.get("Description") else "",
                    "amount": award_amount,
                    "agency": award.get("Awarding Agency", ""),
                    "start_date": start_date,
                    "end_date": award.get("End Date") or award.get("end_date"),
                    "award_type": award.get("Award Type", ""),
                    "naics_code": award.get("NAICS Code", "")
                })
        
        # Convert to final format
        contractors = []
        for name, data in contractor_data.items():
            contractors.append({
                "name": data["name"],
                "total_awards": data["total_awards"],
                "total_value": data["total_value"],
                "first_award_date": data["first_award_date"],
                "latest_award_date": data["latest_award_date"],
                "primary_agencies": list(data["agencies"])[:5],  # Top 5 agencies
                "award_types": list(data["award_types"]),
                "naics_codes": list(data["naics_codes"])[:5],  # Top 5 NAICS
                "locations": list(data["locations"])[:5],  # Top 5 locations
                "recent_awards": data["awards"]
            })
        
        # Sort by total value descending
        contractors.sort(key=lambda x: x["total_value"], reverse=True)
        
        # Apply limit
        contractors = contractors[:limit]
        
        logger.info(f"✅ Processed into {len(contractors)} contractor profiles")
        
        return contractors
    
    def get_contractor_profile(self, contractor_name: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed profile for a specific contractor
        """
        logger.info(f"📊 Getting detailed profile for contractor: {contractor_name}")
        
        try:
            # First check cache
            cached_profile = self._get_cached_contractor_profile(contractor_name)
            if cached_profile:
                # Trigger background refresh if data is old
                self._refresh_contractor_data_if_needed(contractor_name)
                return cached_profile
            
            # Fetch comprehensive data for this specific contractor
            contractors = self._fetch_contractors_paginated(contractor_name, limit=1)
            
            if contractors:
                profile = contractors[0]
                # Cache the detailed profile
                self._cache_contractor_profile(profile)
                return profile
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Error getting contractor profile: {str(e)}")
            return self._get_cached_contractor_profile(contractor_name)
    
    def _get_cached_contractors(self, name_query: str, limit: int) -> List[Dict[str, Any]]:
        """
        Get contractors from cache
        """
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            if name_query:
                cursor.execute(
                    "SELECT * FROM contractor_profiles WHERE contractor_name LIKE ? ORDER BY total_value DESC LIMIT ?",
                    (f"%{name_query}%", limit)
                )
            else:
                cursor.execute(
                    "SELECT * FROM contractor_profiles ORDER BY total_value DESC LIMIT ?",
                    (limit,)
                )
            
            rows = cursor.fetchall()
            conn.close()
            
            contractors = []
            for row in rows:
                contractors.append({
                    "name": row[1],
                    "total_awards": row[2],
                    "total_value": row[3],
                    "first_award_date": row[4],
                    "latest_award_date": row[5],
                    "primary_agencies": json.loads(row[6]) if row[6] else [],
                    "naics_codes": json.loads(row[7]) if row[7] else []
                })
            
            return contractors
            
        except Exception as e:
            logger.error(f"❌ Error getting cached contractors: {str(e)}")
            return []
    
    def _get_cached_contractor_profile(self, contractor_name: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed contractor profile from cache
        """
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            # Get basic profile
            cursor.execute(
                "SELECT * FROM contractor_profiles WHERE contractor_name = ?",
                (contractor_name,)
            )
            profile_row = cursor.fetchone()
            
            if not profile_row:
                conn.close()
                return None
            
            # Get recent awards
            cursor.execute(
                "SELECT * FROM contractor_awards WHERE contractor_name = ? ORDER BY start_date DESC LIMIT 20",
                (contractor_name,)
            )
            awards_rows = cursor.fetchall()
            
            conn.close()
            
            recent_awards = []
            for award_row in awards_rows:
                recent_awards.append({
                    "award_id": award_row[2],
                    "title": award_row[3],
                    "amount": award_row[5],
                    "agency": award_row[6],
                    "start_date": award_row[8],
                    "end_date": award_row[9],
                    "award_type": award_row[10]
                })
            
            return {
                "name": profile_row[1],
                "total_awards": profile_row[2],
                "total_value": profile_row[3],
                "first_award_date": profile_row[4],
                "latest_award_date": profile_row[5],
                "primary_agencies": json.loads(profile_row[6]) if profile_row[6] else [],
                "naics_codes": json.loads(profile_row[7]) if profile_row[7] else [],
                "recent_awards": recent_awards
            }
            
        except Exception as e:
            logger.error(f"❌ Error getting cached contractor profile: {str(e)}")
            return None
    
    def _cache_contractor_profiles(self, contractors: List[Dict[str, Any]]) -> None:
        """
        Cache contractor profiles in database
        """
        if not contractors:
            return
        
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            for contractor in contractors:
                cursor.execute(
                    "INSERT OR REPLACE INTO contractor_profiles (contractor_name, total_awards, total_value, first_award_date, latest_award_date, primary_agencies, primary_naics, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        contractor["name"],
                        contractor["total_awards"],
                        contractor["total_value"],
                        contractor.get("first_award_date"),
                        contractor.get("latest_award_date"),
                        json.dumps(contractor.get("primary_agencies", [])),
                        json.dumps(contractor.get("naics_codes", [])),
                        datetime.now().isoformat()
                    )
                )
                
                # Cache individual awards
                for award in contractor.get("recent_awards", []):
                    cursor.execute(
                        "INSERT OR REPLACE INTO contractor_awards (contractor_name, award_id, title, award_amount, awarding_agency, start_date, end_date, award_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            contractor["name"],
                            award.get("award_id"),
                            award.get("title"),
                            award.get("amount"),
                            award.get("agency"),
                            award.get("start_date"),
                            award.get("end_date"),
                            award.get("award_type")
                        )
                    )
            
            conn.commit()
            conn.close()
            
            logger.info(f"💾 Cached {len(contractors)} contractor profiles")
            
        except Exception as e:
            logger.error(f"❌ Error caching contractor profiles: {str(e)}")
    
    def _cache_contractor_profile(self, profile: Dict[str, Any]) -> None:
        """
        Cache single contractor profile
        """
        self._cache_contractor_profiles([profile])
    
    def _refresh_contractor_data_if_needed(self, contractor_name: str) -> None:
        """
        Check if contractor data needs refresh and trigger background update if needed
        """
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            cursor.execute(
                "SELECT last_updated FROM contractor_profiles WHERE contractor_name = ?",
                (contractor_name,)
            )
            row = cursor.fetchone()
            conn.close()
            
            if row:
                last_updated = datetime.fromisoformat(row[0])
                hours_old = (datetime.now() - last_updated).total_seconds() / 3600
                
                # Refresh if data is older than 6 hours
                if hours_old > 6:
                    logger.info(f"🔄 Data for '{contractor_name}' is {hours_old:.1f} hours old, needs refresh")
                    # Could implement background refresh here
                    
        except Exception as e:
            logger.error(f"❌ Error checking refresh need: {str(e)}")

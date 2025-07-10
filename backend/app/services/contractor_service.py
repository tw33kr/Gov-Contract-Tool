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
        # Use the CORRECT USASpending.gov API endpoints
        self.base_url = "https://api.usaspending.gov"
        self.recipient_autocomplete_url = f"{self.base_url}/api/v2/autocomplete/recipient/"
        self.spending_by_award_url = f"{self.base_url}/api/v2/search/spending_by_award/"
        self.spending_by_recipient_url = f"{self.base_url}/api/v2/search/spending_by_category/recipient"
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
                recipient_hash TEXT,
                uei TEXT,
                total_awards INTEGER DEFAULT 0,
                total_value REAL DEFAULT 0,
                first_award_date TEXT,
                latest_award_date TEXT,
                primary_agencies TEXT,
                primary_naics TEXT,
                profile_data TEXT,
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
        Search for contractors using the CORRECT USASpending.gov API approach
        This mimics what the actual USASpending.gov website does for fast results
        """
        logger.info(f"🔍 Searching contractors with query: '{name_query}', limit: {limit}")
        
        try:
            if not name_query or len(name_query.strip()) < 2:
                # Return popular contractors if no specific query
                return self._get_popular_contractors(limit)
            
            # Step 1: Use recipient autocomplete to find contractor quickly (like the website does)
            recipients = self._find_recipients_fast(name_query)
            
            if not recipients:
                logger.warning(f"⚠️ No recipients found for query: '{name_query}'")
                return []
            
            # Step 2: Get spending data for each unique recipient (avoid duplicates)
            contractors = []
            seen_names = set()
            
            for recipient in recipients[:limit * 2]:  # Get extra to account for duplicates
                recipient_name = recipient.get('recipient_name', '').strip()
                
                # Skip duplicates based on normalized name
                normalized_name = self._normalize_contractor_name(recipient_name)
                if normalized_name in seen_names:
                    logger.info(f"🔄 Skipping duplicate: {recipient_name}")
                    continue
                
                seen_names.add(normalized_name)
                
                contractor_data = self._get_contractor_spending_data(recipient)
                if contractor_data:
                    contractors.append(contractor_data)
                    
                    # Cache the contractor profile for fast retrieval later
                    self._cache_contractor_profile(contractor_data)
                
                # Stop when we have enough unique contractors
                if len(contractors) >= limit:
                    break
            
            # Sort by total value descending
            contractors.sort(key=lambda x: x.get('total_value', 0), reverse=True)
            
            logger.info(f"✅ Found {len(contractors)} unique contractors with spending data")
            return contractors[:limit]
            
        except Exception as e:
            logger.error(f"❌ Error searching contractors: {str(e)}")
            return self._get_cached_contractors(name_query or "", limit)
    
    def _normalize_contractor_name(self, name: str) -> str:
        """
        Normalize contractor names to detect duplicates
        """
        if not name:
            return ""
        
        # Convert to uppercase and remove common variations
        normalized = name.upper().strip()
        
        # Remove common suffixes that might cause duplicates
        suffixes_to_remove = [
            ', LLC', ' LLC', ', INC', ' INC', ', CORP', ' CORP', 
            ', CORPORATION', ' CORPORATION', ', LTD', ' LTD',
            ', CO', ' CO', ', COMPANY', ' COMPANY'
        ]
        
        for suffix in suffixes_to_remove:
            if normalized.endswith(suffix):
                normalized = normalized[:-len(suffix)].strip()
                break
        
        # Remove extra spaces and punctuation
        normalized = ' '.join(normalized.split())
        normalized = normalized.replace('.', '').replace(',', '')
        
        return normalized
    
    def _find_recipients_fast(self, search_text: str) -> List[Dict[str, Any]]:
        """
        Use USASpending.gov's recipient autocomplete API for fast contractor lookup
        This is what the actual website uses for instant search results
        """
        logger.info(f"🔍 Using recipient autocomplete for: '{search_text}'")
        
        try:
            payload = {
                "search_text": search_text,
                "limit": 15  # Get more results to account for filtering duplicates
            }
            
            response = requests.post(
                self.recipient_autocomplete_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Federal-Contract-Research-Tool/1.0"
                },
                timeout=15  # Increased timeout to reduce failures
            )
            
            if response.status_code == 200:
                data = response.json()
                recipients = data.get('results', [])
                logger.info(f"📋 Autocomplete found {len(recipients)} recipients")
                
                # Log first few results for debugging
                for i, recipient in enumerate(recipients[:3]):
                    logger.info(f"  {i+1}. {recipient.get('recipient_name', 'Unknown')} (UEI: {recipient.get('recipient_uei', 'N/A')})")
                
                return recipients
            else:
                logger.warning(f"⚠️ Autocomplete API error: {response.status_code}")
                return []
                
        except requests.exceptions.Timeout:
            logger.error(f"❌ Autocomplete timeout for '{search_text}' - using cached data if available")
            return []
        except Exception as e:
            logger.error(f"❌ Error in recipient autocomplete: {str(e)}")
            return []
    
    def _get_contractor_spending_data(self, recipient: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Get comprehensive spending data for a specific recipient
        Uses the spending_by_award endpoint for detailed contract information
        """
        recipient_name = recipient.get('recipient_name', 'Unknown')
        recipient_hash = recipient.get('recipient_hash')
        recipient_uei = recipient.get('recipient_uei')
        
        logger.info(f"📊 Getting spending data for: {recipient_name}")
        
        try:
            # Build filter for this specific recipient
            payload = {
                "filters": {
                    "recipient_search_text": [recipient_name],
                    "award_type_codes": ["A", "B", "C", "D"],  # Contract types
                    "time_period": [{
                        "start_date": "2020-01-01",
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
                    "NAICS Description",
                    "Place of Performance"
                ],
                "page": 1,
                "limit": 100,  # Get up to 100 awards for analysis
                "sort": "Award Amount",
                "order": "desc"
            }
            
            # Add recipient hash if available for more precise matching
            if recipient_hash:
                payload["filters"]["recipient_hash"] = [recipient_hash]
            
            response = requests.post(
                self.spending_by_award_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Federal-Contract-Research-Tool/1.0"
                },
                timeout=20  # Slightly increased timeout for reliability
            )
            
            if response.status_code == 200:
                data = response.json()
                awards = data.get('results', [])
                
                if not awards:
                    logger.warning(f"⚠️ No awards found for {recipient_name}")
                    return None
                
                # Process awards into contractor profile
                contractor_profile = self._process_recipient_awards(recipient, awards)
                
                logger.info(f"✅ Processed {len(awards)} awards for {recipient_name}: ${contractor_profile['total_value']:,.0f} total value")
                return contractor_profile
                
            else:
                logger.warning(f"⚠️ Spending API error for {recipient_name}: {response.status_code}")
                return None
                
        except requests.exceptions.Timeout:
            logger.error(f"❌ Spending data timeout for {recipient_name}")
            return None
        except Exception as e:
            logger.error(f"❌ Error getting spending data for {recipient_name}: {str(e)}")
            return None
    
    def _process_recipient_awards(self, recipient: Dict[str, Any], awards: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Process award data into a comprehensive contractor profile
        """
        recipient_name = recipient.get('recipient_name', 'Unknown')
        
        profile = {
            "name": recipient_name,
            "recipient_hash": recipient.get('recipient_hash'),
            "uei": recipient.get('recipient_uei'),
            "total_awards": len(awards),
            "total_value": 0.0,
            "agencies": set(),
            "award_types": set(),
            "naics_codes": set(),
            "locations": set(),
            "awards": [],
            "first_award_date": None,
            "latest_award_date": None
        }
        
        for award in awards:
            # Process award amount
            award_amount = award.get("Award Amount", 0)
            if award_amount:
                try:
                    profile["total_value"] += float(award_amount)
                except (ValueError, TypeError):
                    pass
            
            # Collect metadata
            if award.get("Awarding Agency"):
                profile["agencies"].add(award["Awarding Agency"])
            if award.get("Award Type"):
                profile["award_types"].add(award["Award Type"])
            if award.get("NAICS Code"):
                naics_display = award.get("NAICS Description", award["NAICS Code"])
                profile["naics_codes"].add(f"{award['NAICS Code']}: {naics_display}")
            if award.get("Place of Performance"):
                profile["locations"].add(award["Place of Performance"])
            
            # Track date range
            start_date = award.get("Start Date")
            if start_date:
                if not profile["first_award_date"] or start_date < profile["first_award_date"]:
                    profile["first_award_date"] = start_date
                if not profile["latest_award_date"] or start_date > profile["latest_award_date"]:
                    profile["latest_award_date"] = start_date
            
            # Store individual award details (limit to most recent 20 per contractor)
            if len(profile["awards"]) < 20:
                profile["awards"].append({
                    "award_id": award.get("Award ID", ""),
                    "title": award.get("Description", "")[:100] if award.get("Description") else "",
                    "amount": award_amount,
                    "agency": award.get("Awarding Agency", ""),
                    "start_date": start_date,
                    "end_date": award.get("End Date"),
                    "award_type": award.get("Award Type", ""),
                    "naics_code": award.get("NAICS Code", "")
                })
        
        # Convert sets to lists for JSON serialization
        return {
            "name": profile["name"],
            "recipient_hash": profile["recipient_hash"],
            "uei": profile["uei"],
            "total_awards": profile["total_awards"],
            "total_value": profile["total_value"],
            "first_award_date": profile["first_award_date"],
            "latest_award_date": profile["latest_award_date"],
            "primary_agencies": list(profile["agencies"])[:5],
            "award_types": list(profile["award_types"]),
            "naics_codes": list(profile["naics_codes"])[:5],
            "locations": list(profile["locations"])[:5],
            "recent_awards": profile["awards"]
        }
    
    def get_contractor_profile(self, contractor_name: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed profile for a specific contractor with smart caching
        """
        logger.info(f"📊 Getting detailed profile for contractor: {contractor_name}")
        
        try:
            # First check if we have this contractor cached from a recent search
            cached_profile = self._get_cached_contractor_profile(contractor_name)
            if cached_profile:
                logger.info(f"📋 Using cached profile for {contractor_name}")
                return cached_profile
            
            # If not cached, search for the contractor
            logger.info(f"🔍 No cached data, searching for: {contractor_name}")
            contractors = self.search_contractors(contractor_name, limit=1)
            
            if contractors:
                profile = contractors[0]
                logger.info(f"✅ Retrieved profile for {contractor_name}: {profile['total_awards']} awards, ${profile['total_value']:,.0f} total value")
                return profile
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Error getting contractor profile: {str(e)}")
            return self._get_cached_contractor_profile(contractor_name)
    
    def _cache_contractor_profile(self, profile: Dict[str, Any]) -> None:
        """
        Cache contractor profile for fast retrieval
        """
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            cursor.execute(
                "INSERT OR REPLACE INTO contractor_profiles (contractor_name, recipient_hash, uei, total_awards, total_value, first_award_date, latest_award_date, primary_agencies, primary_naics, profile_data, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    profile["name"],
                    profile.get("recipient_hash"),
                    profile.get("uei"),
                    profile["total_awards"],
                    profile["total_value"],
                    profile.get("first_award_date"),
                    profile.get("latest_award_date"),
                    json.dumps(profile.get("primary_agencies", [])),
                    json.dumps(profile.get("naics_codes", [])),
                    json.dumps(profile),  # Store complete profile
                    datetime.now().isoformat()
                )
            )
            
            conn.commit()
            conn.close()
            
            logger.info(f"💾 Cached profile for {profile['name']}")
            
        except Exception as e:
            logger.error(f"❌ Error caching contractor profile: {str(e)}")
    
    def _get_cached_contractor_profile(self, contractor_name: str) -> Optional[Dict[str, Any]]:
        """
        Get contractor profile from cache with flexible name matching
        """
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            # Try exact match first
            cursor.execute(
                "SELECT profile_data, last_updated FROM contractor_profiles WHERE contractor_name = ?",
                (contractor_name,)
            )
            row = cursor.fetchone()
            
            # If no exact match, try normalized name matching
            if not row:
                normalized_search = self._normalize_contractor_name(contractor_name)
                cursor.execute(
                    "SELECT profile_data, last_updated FROM contractor_profiles WHERE contractor_name LIKE ?",
                    (f"%{normalized_search}%",)
                )
                row = cursor.fetchone()
            
            conn.close()
            
            if row:
                profile_data, last_updated = row
                
                # Check if cache is recent (less than 1 hour old)
                cache_time = datetime.fromisoformat(last_updated)
                age_hours = (datetime.now() - cache_time).total_seconds() / 3600
                
                if age_hours < 1:  # Use cache if less than 1 hour old
                    logger.info(f"📋 Found cached profile for {contractor_name} (age: {age_hours:.1f} hours)")
                    return json.loads(profile_data)
                else:
                    logger.info(f"🔄 Cached profile for {contractor_name} is {age_hours:.1f} hours old, will refresh")
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Error getting cached contractor profile: {str(e)}")
            return None
    
    def _get_popular_contractors(self, limit: int) -> List[Dict[str, Any]]:
        """
        Get popular contractors when no specific search is provided
        """
        logger.info(f"📋 Getting popular contractors (limit: {limit})")
        
        # List of well-known defense and IT contractors
        popular_contractors = [
            "Lockheed Martin Corporation",
            "Boeing Company",
            "Raytheon Technologies Corporation",
            "General Dynamics Corporation",
            "Northrop Grumman Corporation",
            "Planned Systems International Inc",
            "CACI International Inc",
            "SAIC Inc",
            "Booz Allen Hamilton Inc",
            "Leidos Inc"
        ]
        
        results = []
        for contractor_name in popular_contractors[:limit]:
            try:
                # Check cache first
                cached = self._get_cached_contractor_profile(contractor_name)
                if cached:
                    results.append(cached)
                    continue
                
                # Get spending data for each popular contractor
                recipients = self._find_recipients_fast(contractor_name)
                if recipients:
                    contractor_data = self._get_contractor_spending_data(recipients[0])
                    if contractor_data:
                        results.append(contractor_data)
                        self._cache_contractor_profile(contractor_data)
                        
                # Don't overload the API
                time.sleep(0.3)
                
            except Exception as e:
                logger.warning(f"⚠️ Error getting data for {contractor_name}: {str(e)}")
                continue
        
        return results[:limit]
    
    def _get_cached_contractors(self, name_query: str, limit: int) -> List[Dict[str, Any]]:
        """
        Get contractors from cache (fallback)
        """
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            if name_query:
                cursor.execute(
                    "SELECT profile_data FROM contractor_profiles WHERE contractor_name LIKE ? ORDER BY total_value DESC LIMIT ?",
                    (f"%{name_query}%", limit)
                )
            else:
                cursor.execute(
                    "SELECT profile_data FROM contractor_profiles ORDER BY total_value DESC LIMIT ?",
                    (limit,)
                )
            
            rows = cursor.fetchall()
            conn.close()
            
            contractors = []
            for row in rows:
                try:
                    profile = json.loads(row[0])
                    contractors.append(profile)
                except Exception as e:
                    logger.warning(f"⚠️ Error loading cached profile: {str(e)}")
                    continue
            
            logger.info(f"📋 Returned {len(contractors)} cached contractors")
            return contractors
            
        except Exception as e:
            logger.error(f"❌ Error getting cached contractors: {str(e)}")
            return []
    
    def test_contractor_search(self, contractor_name: str) -> Dict[str, Any]:
        """
        Test endpoint for debugging contractor searches with detailed logging
        """
        logger.info(f"🧪 TESTING contractor search for: {contractor_name}")
        
        try:
            # Step 1: Test autocomplete
            logger.info("Step 1: Testing recipient autocomplete...")
            recipients = self._find_recipients_fast(contractor_name)
            
            if not recipients:
                return {
                    "test_query": contractor_name,
                    "step_1_autocomplete": "FAILED - No recipients found",
                    "step_2_spending": "SKIPPED",
                    "final_result": "FAILED",
                    "message": f"Autocomplete found no recipients for '{contractor_name}'"
                }
            
            # Step 2: Test spending data
            logger.info(f"Step 2: Testing spending data for {len(recipients)} recipients...")
            first_recipient = recipients[0]
            spending_data = self._get_contractor_spending_data(first_recipient)
            
            return {
                "test_query": contractor_name,
                "step_1_autocomplete": f"SUCCESS - Found {len(recipients)} recipients",
                "step_2_spending": f"SUCCESS - Found {spending_data['total_awards'] if spending_data else 0} awards" if spending_data else "FAILED - No spending data",
                "final_result": "SUCCESS" if spending_data else "FAILED",
                "recipients_found": recipients,
                "spending_data": spending_data,
                "message": "Test completed - check backend logs for detailed API information"
            }
            
        except Exception as e:
            logger.error(f"❌ Test failed for {contractor_name}: {str(e)}")
            return {
                "test_query": contractor_name,
                "step_1_autocomplete": "ERROR",
                "step_2_spending": "ERROR",
                "final_result": "ERROR",
                "error": str(e),
                "message": "Test failed - check backend logs for error details"
            }

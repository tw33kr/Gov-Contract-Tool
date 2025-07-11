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
                complete_data_fetched BOOLEAN DEFAULT FALSE,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_complete_fetch TIMESTAMP
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
                recipient_hash TEXT,
                fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (contractor_name) REFERENCES contractor_profiles (contractor_name),
                UNIQUE(contractor_name, award_id)
            )
        ''')
        
        # Create index for faster searches
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_contractor_name ON contractor_awards (contractor_name)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_contractor_date ON contractor_awards (start_date)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_award_id ON contractor_awards (award_id)')
        
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
    
    def get_contractor_profile(self, contractor_name: str, fetch_complete_data: bool = False) -> Optional[Dict[str, Any]]:
        """
        Get detailed profile for a specific contractor with optional complete data fetch
        
        Args:
            contractor_name: Name of the contractor
            fetch_complete_data: If True, fetches ALL awards via pagination (may take longer)
        """
        logger.info(f"📊 Getting profile for contractor: {contractor_name} (complete_data: {fetch_complete_data})")
        
        try:
            # Check if we have complete data cached
            if fetch_complete_data:
                complete_profile = self._get_complete_contractor_profile(contractor_name)
                if complete_profile:
                    logger.info(f"📋 Using complete cached profile for {contractor_name}")
                    return complete_profile
            
            # First check if we have this contractor cached from a recent search
            cached_profile = self._get_cached_contractor_profile(contractor_name)
            if cached_profile and not fetch_complete_data:
                logger.info(f"📋 Using cached profile for {contractor_name}")
                return cached_profile
            
            # If not cached or need complete data, search for the contractor
            logger.info(f"🔍 {'Fetching complete data' if fetch_complete_data else 'No cached data, searching'} for: {contractor_name}")
            
            # First, find the contractor via autocomplete
            recipients = self._find_recipients_fast(contractor_name)
            if not recipients:
                return None
                
            recipient = recipients[0]  # Use the first (best) match
            
            if fetch_complete_data:
                # Fetch ALL awards via pagination
                profile = self._get_complete_contractor_data(recipient)
            else:
                # Get basic data (up to 100 awards)
                profile = self._get_contractor_spending_data(recipient)
            
            if profile:
                logger.info(f"✅ Retrieved {'complete' if fetch_complete_data else 'basic'} profile for {contractor_name}: {profile['total_awards']} awards, ${profile['total_value']:,.0f} total value")
                return profile
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Error getting contractor profile: {str(e)}")
            return self._get_cached_contractor_profile(contractor_name)
    
    def _get_complete_contractor_data(self, recipient: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Fetch ALL awards for a contractor using pagination to get complete dataset
        """
        recipient_name = recipient.get('recipient_name', 'Unknown')
        recipient_hash = recipient.get('recipient_hash')
        
        logger.info(f"🔄 Fetching COMPLETE dataset for: {recipient_name}")
        
        try:
            all_awards = []
            page = 1
            page_size = 100
            total_pages = None
            
            # Check if we already have complete data cached
            cached_complete = self._get_complete_cached_awards(recipient_name)
            if cached_complete:
                logger.info(f"📋 Found complete cached data: {len(cached_complete)} awards")
                return self._build_complete_profile(recipient, cached_complete)
            
            while True:
                logger.info(f"📄 Fetching page {page} for {recipient_name}...")
                
                # Build payload for this page
                payload = {
                    "filters": {
                        "recipient_search_text": [recipient_name],
                        "award_type_codes": ["A", "B", "C", "D"],  # Contract types
                        "time_period": [{
                            "start_date": "2018-01-01",  # Extended date range for complete data
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
                        "Place of Performance",
                        "Competition Type"
                    ],
                    "page": page,
                    "limit": page_size,
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
                    timeout=30  # Longer timeout for pagination
                )
                
                if response.status_code != 200:
                    logger.error(f"❌ API error on page {page}: {response.status_code}")
                    break
                
                data = response.json()
                page_awards = data.get('results', [])
                
                if not page_awards:
                    logger.info(f"📄 No more awards found on page {page}")
                    break
                
                all_awards.extend(page_awards)
                
                # Check if we have more pages
                total_count = data.get('page_metadata', {}).get('total', 0)
                if total_pages is None:
                    total_pages = (total_count + page_size - 1) // page_size  # Ceiling division
                    logger.info(f"📊 Total expected awards: {total_count}, Total pages: {total_pages}")
                
                logger.info(f"📄 Page {page} completed: {len(page_awards)} awards (total so far: {len(all_awards)})")
                
                # Stop if we've reached the end
                if len(page_awards) < page_size or page >= total_pages:
                    break
                
                page += 1
                
                # Rate limiting to avoid overwhelming the API
                time.sleep(0.5)
                
                # Safety limit to prevent infinite loops
                if page > 50:  # Max 5000 awards (50 pages * 100 per page)
                    logger.warning(f"⚠️ Reached safety limit of 50 pages for {recipient_name}")
                    break
            
            logger.info(f"✅ Complete fetch finished: {len(all_awards)} total awards for {recipient_name}")
            
            # Cache all awards for future use
            self._cache_complete_awards(recipient_name, all_awards, recipient_hash)
            
            # Build comprehensive profile
            return self._build_complete_profile(recipient, all_awards)
            
        except Exception as e:
            logger.error(f"❌ Error in complete data fetch for {recipient_name}: {str(e)}")
            return None
    
    def _build_complete_profile(self, recipient: Dict[str, Any], awards: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Build a comprehensive contractor profile from complete awards data
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
            "all_awards": [],  # Store ALL awards for timeline analysis
            "recent_awards": [],  # Store recent 20 for compatibility
            "first_award_date": None,
            "latest_award_date": None,
            "year_breakdown": {},  # Awards by year
            "agency_breakdown": {},  # Awards by agency
            "contract_durations": []  # For timeline analysis
        }
        
        # Process all awards
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
                # Track agency breakdown
                agency = award["Awarding Agency"]
                profile["agency_breakdown"][agency] = profile["agency_breakdown"].get(agency, 0) + 1
            
            if award.get("Award Type"):
                profile["award_types"].add(award["Award Type"])
            if award.get("NAICS Code"):
                naics_display = award.get("NAICS Description", award["NAICS Code"])
                profile["naics_codes"].add(f"{award['NAICS Code']}: {naics_display}")
            if award.get("Place of Performance"):
                profile["locations"].add(award["Place of Performance"])
            
            # Track date range and yearly breakdown
            start_date = award.get("Start Date")
            if start_date:
                try:
                    year = datetime.fromisoformat(start_date.replace('Z', '+00:00')).year
                    profile["year_breakdown"][year] = profile["year_breakdown"].get(year, 0) + 1
                except:
                    pass
                    
                if not profile["first_award_date"] or start_date < profile["first_award_date"]:
                    profile["first_award_date"] = start_date
                if not profile["latest_award_date"] or start_date > profile["latest_award_date"]:
                    profile["latest_award_date"] = start_date
            
            # Store complete award details for timeline analysis
            award_detail = {
                "award_id": award.get("Award ID", ""),
                "title": award.get("Description", "")[:100] if award.get("Description") else "",
                "amount": award_amount,
                "agency": award.get("Awarding Agency", ""),
                "start_date": start_date,
                "end_date": award.get("End Date"),
                "award_type": award.get("Award Type", ""),
                "naics_code": award.get("NAICS Code", ""),
                "place_of_performance": award.get("Place of Performance", ""),
                "competition_type": award.get("Competition Type", "")
            }
            
            profile["all_awards"].append(award_detail)
            
            # Add to contract durations for timeline analysis
            if start_date and award.get("End Date"):
                profile["contract_durations"].append({
                    "start": start_date,
                    "end": award.get("End Date"),
                    "amount": award_amount,
                    "title": award_detail["title"]
                })
        
        # Sort awards by date (most recent first) and take top 20 for recent_awards
        sorted_awards = sorted(profile["all_awards"], 
                             key=lambda x: x.get("start_date", "") or "1900-01-01", 
                             reverse=True)
        profile["recent_awards"] = sorted_awards[:20]
        
        # Convert sets to lists for JSON serialization
        return {
            "name": profile["name"],
            "recipient_hash": profile["recipient_hash"],
            "uei": profile["uei"],
            "total_awards": profile["total_awards"],
            "total_value": profile["total_value"],
            "first_award_date": profile["first_award_date"],
            "latest_award_date": profile["latest_award_date"],
            "primary_agencies": list(profile["agencies"])[:10],
            "award_types": list(profile["award_types"]),
            "naics_codes": list(profile["naics_codes"])[:10],
            "locations": list(profile["locations"])[:10],
            "recent_awards": profile["recent_awards"],
            "all_awards": profile["all_awards"],  # Complete dataset
            "year_breakdown": profile["year_breakdown"],
            "agency_breakdown": profile["agency_breakdown"],
            "contract_durations": profile["contract_durations"],
            "is_complete_data": True
        }
    
    def _cache_complete_awards(self, contractor_name: str, awards: List[Dict[str, Any]], recipient_hash: str = None):
        """
        Cache complete awards dataset for a contractor
        """
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            # Clear existing awards for this contractor
            cursor.execute("DELETE FROM contractor_awards WHERE contractor_name = ?", (contractor_name,))
            
            # Insert all awards
            for award in awards:
                cursor.execute(
                    """INSERT OR REPLACE INTO contractor_awards 
                       (contractor_name, award_id, title, description, award_amount, awarding_agency, 
                        awarding_subagency, start_date, end_date, award_type, naics_code, 
                        place_of_performance, competition_type, recipient_hash) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        contractor_name,
                        award.get("Award ID", ""),
                        award.get("Description", "")[:200] if award.get("Description") else "",
                        award.get("Description", ""),
                        award.get("Award Amount", 0),
                        award.get("Awarding Agency", ""),
                        award.get("Awarding Sub Agency", ""),
                        award.get("Start Date"),
                        award.get("End Date"),
                        award.get("Award Type", ""),
                        award.get("NAICS Code", ""),
                        award.get("Place of Performance", ""),
                        award.get("Competition Type", ""),
                        recipient_hash
                    )
                )
            
            # Update contractor profile to mark complete data as fetched
            cursor.execute(
                """UPDATE contractor_profiles 
                   SET complete_data_fetched = TRUE, last_complete_fetch = ? 
                   WHERE contractor_name = ?""",
                (datetime.now().isoformat(), contractor_name)
            )
            
            conn.commit()
            conn.close()
            
            logger.info(f"💾 Cached {len(awards)} complete awards for {contractor_name}")
            
        except Exception as e:
            logger.error(f"❌ Error caching complete awards: {str(e)}")
    
    def _get_complete_cached_awards(self, contractor_name: str) -> Optional[List[Dict[str, Any]]]:
        """
        Get complete cached awards for a contractor if available and recent
        """
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            # Check if we have complete data and when it was fetched
            cursor.execute(
                """SELECT complete_data_fetched, last_complete_fetch 
                   FROM contractor_profiles 
                   WHERE contractor_name = ?""",
                (contractor_name,)
            )
            row = cursor.fetchone()
            
            if not row or not row[0]:  # No complete data fetched
                conn.close()
                return None
            
            # Check if data is recent (less than 24 hours old)
            last_fetch = row[1]
            if last_fetch:
                try:
                    fetch_time = datetime.fromisoformat(last_fetch)
                    age_hours = (datetime.now() - fetch_time).total_seconds() / 3600
                    
                    if age_hours > 24:  # Data is older than 24 hours
                        logger.info(f"🔄 Complete cached data for {contractor_name} is {age_hours:.1f} hours old, will refresh")
                        conn.close()
                        return None
                except:
                    pass
            
            # Get all cached awards
            cursor.execute(
                """SELECT award_id, title, award_amount, awarding_agency, start_date, end_date, 
                          award_type, naics_code, place_of_performance, competition_type
                   FROM contractor_awards 
                   WHERE contractor_name = ?
                   ORDER BY start_date DESC""",
                (contractor_name,)
            )
            
            rows = cursor.fetchall()
            conn.close()
            
            if rows:
                awards = []
                for row in rows:
                    awards.append({
                        "Award ID": row[0],
                        "Description": row[1],
                        "Award Amount": row[2],
                        "Awarding Agency": row[3],
                        "Start Date": row[4],
                        "End Date": row[5],
                        "Award Type": row[6],
                        "NAICS Code": row[7],
                        "Place of Performance": row[8],
                        "Competition Type": row[9]
                    })
                
                logger.info(f"📋 Retrieved {len(awards)} cached complete awards for {contractor_name}")
                return awards
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Error getting complete cached awards: {str(e)}")
            return None
    
    def _get_complete_contractor_profile(self, contractor_name: str) -> Optional[Dict[str, Any]]:
        """
        Get complete contractor profile from cache if available
        """
        try:
            # Get cached awards
            cached_awards = self._get_complete_cached_awards(contractor_name)
            if not cached_awards:
                return None
            
            # Get basic contractor info
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            cursor.execute(
                "SELECT recipient_hash, uei FROM contractor_profiles WHERE contractor_name = ?",
                (contractor_name,)
            )
            row = cursor.fetchone()
            conn.close()
            
            # Build recipient object
            recipient = {
                "recipient_name": contractor_name,
                "recipient_hash": row[0] if row else None,
                "recipient_uei": row[1] if row else None
            }
            
            # Build complete profile from cached data
            return self._build_complete_profile(recipient, cached_awards)
            
        except Exception as e:
            logger.error(f"❌ Error getting complete contractor profile: {str(e)}")
            return None

    def _normalize_contractor_name(self, name: str) -> str:
        """Normalize contractor names to detect duplicates"""
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
        """Use USASpending.gov's recipient autocomplete API for fast contractor lookup"""
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
        """Get basic spending data for a specific recipient (up to 100 awards)"""
        recipient_name = recipient.get('recipient_name', 'Unknown')
        recipient_hash = recipient.get('recipient_hash')
        recipient_uei = recipient.get('recipient_uei')
        
        logger.info(f"📊 Getting basic spending data for: {recipient_name}")
        
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
                "limit": 100,  # Basic limit for fast searches
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
        """Process award data into a basic contractor profile"""
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
    
    def _cache_contractor_profile(self, profile: Dict[str, Any]) -> None:
        """Cache contractor profile for fast retrieval"""
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
        """Get contractor profile from cache with flexible name matching"""
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
        """Get popular contractors when no specific search is provided"""
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
        """Get contractors from cache (fallback)"""
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
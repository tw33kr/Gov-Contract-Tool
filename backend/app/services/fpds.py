import requests
import sqlite3
from datetime import datetime, date
from typing import List, Dict, Any, Optional
import json
import logging
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FPDSService:
    def __init__(self, database_path: str = "contracts.db"):
        self.database_path = database_path
        # Use the correct USASpending.gov endpoint
        self.base_url = "https://api.usaspending.gov/api/v2/search/spending_by_award"
        self.init_database()
    
    def init_database(self):
        """Initialize the database with awards table"""
        conn = sqlite3.connect(self.database_path)
        cursor = conn.cursor()
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
    
    def search_awards(self, 
                     keywords: Optional[str] = None,
                     awarding_agency: Optional[str] = None,
                     award_date_from: Optional[str] = None,
                     award_date_to: Optional[str] = None,
                     limit: int = 50) -> List[Dict[str, Any]]:
        """
        Search for federal contract awards using USASpending.gov API
        
        Args:
            keywords: Search keywords for award description
            awarding_agency: Name of the awarding agency
            award_date_from: Start date (YYYY-MM-DD format)
            award_date_to: End date (YYYY-MM-DD format)
            limit: Maximum number of results
            
        Returns:
            List of award dictionaries
        """
        logger.info(f"🔍 Searching for awards with params: keywords='{keywords}', agency='{awarding_agency}', limit={limit}")
        logger.info(f"📅 Date range: {award_date_from} to {award_date_to}")
        
        try:
            # Build the request payload according to USASpending API specification
            payload = self._build_payload(keywords, awarding_agency, award_date_from, award_date_to, limit)
            
            logger.info(f"📡 USASpending.gov API request: {self.base_url}")
            logger.info(f"📋 Request payload: {json.dumps(payload, indent=2)}")
            
            # Make the API request with retry logic and shorter timeout
            max_retries = 2
            for attempt in range(max_retries):
                try:
                    response = requests.post(
                        self.base_url,
                        json=payload,
                        headers={
                            "Content-Type": "application/json",
                            "User-Agent": "Federal-Contract-Research-Tool/1.0"
                        },
                        timeout=45  # Reduced timeout to 45 seconds
                    )
                    break  # If successful, break out of retry loop
                except requests.exceptions.Timeout:
                    if attempt < max_retries - 1:
                        logger.warning(f"⚠️ USASpending API timeout, retrying ({attempt + 1}/{max_retries})...")
                        time.sleep(1)  # Wait 1 second before retry
                        continue
                    else:
                        logger.error("❌ USASpending API timeout after all retries")
                        return self._get_sample_awards(keywords, awarding_agency)
                except requests.exceptions.RequestException as e:
                    logger.error(f"❌ USASpending API request failed: {str(e)}")
                    return self._get_sample_awards(keywords, awarding_agency)
            
            logger.info(f"📊 API Response Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                # Handle the actual USASpending.gov response structure
                if 'results' in data:
                    awards_data = data['results']
                elif 'data' in data:
                    awards_data = data['data']
                else:
                    logger.warning(f"⚠️ Unexpected response structure: {list(data.keys())}")
                    awards_data = []
                
                logger.info(f"✅ Successfully fetched {len(awards_data)} awards from USASpending.gov")
                
                # Process and return the awards
                processed_awards = []
                for award in awards_data:
                    processed_award = self._process_award_data(award)
                    if processed_award:
                        processed_awards.append(processed_award)
                
                # If no processed awards, return sample data
                if not processed_awards:
                    logger.info("📋 No awards processed, returning sample data")
                    return self._get_sample_awards(keywords, awarding_agency)
                
                # Cache the results
                self._cache_awards(processed_awards)
                
                return processed_awards
                
            elif response.status_code == 400:
                logger.error(f"❌ USASpending.gov API error 400: {response.text}")
                # Try simplified search
                return self._try_simplified_search(keywords, limit)
            else:
                logger.error(f"❌ USASpending.gov API error: {response.status_code}")
                logger.error(f"Response: {response.text}")
                return self._get_sample_awards(keywords, awarding_agency)
                
        except Exception as e:
            logger.error(f"❌ Error fetching awards: {str(e)}")
            return self._get_sample_awards(keywords, awarding_agency)
    
    def _build_payload(self, keywords: Optional[str], awarding_agency: Optional[str], 
                      award_date_from: Optional[str], award_date_to: Optional[str], 
                      limit: int) -> Dict[str, Any]:
        """
        Build the complete USASpending.gov API payload with proper filter structure
        """
        # Build filters
        filters = self._build_filters(keywords, awarding_agency, award_date_from, award_date_to)
        
        # Build the complete payload
        payload = {
            "filters": filters,
            "fields": [
                "Award ID",
                "Recipient Name", 
                "Award Amount",
                "Start Date",
                "End Date",
                "Awarding Agency",
                "Awarding Sub Agency",
                "Award Type",
                "Description"
            ],
            "page": 1,
            "limit": min(limit, 100),  # USASpending API limits
            "sort": "Award Amount",
            "order": "desc"
        }
        
        # Add keyword search if provided - this is different from the filters
        if keywords and keywords.strip() and keywords.lower() not in ['none', '']:
            # USASpending.gov supports a separate "keywords" parameter for full-text search
            payload["keywords"] = [keywords.strip()]
            logger.info(f"🔍 Added keywords parameter: {keywords}")
        
        return payload
    
    def _try_simplified_search(self, keywords: Optional[str], limit: int) -> List[Dict[str, Any]]:
        """Try a simplified search with minimal filters"""
        logger.info("🔄 Trying simplified USASpending search...")
        
        try:
            # Very simple payload with just basic filters
            payload = {
                "filters": {
                    "award_type_codes": ["A", "B", "C", "D"],  # Contract types
                    "time_period": [{
                        "start_date": "2024-06-01",
                        "end_date": "2025-07-10"
                    }]
                },
                "fields": [
                    "Award ID",
                    "Recipient Name", 
                    "Award Amount",
                    "Start Date",
                    "End Date",
                    "Awarding Agency",
                    "Award Type",
                    "Description"
                ],
                "page": 1,
                "limit": min(limit, 25),  # Smaller limit
                "sort": "Award Amount",
                "order": "desc"
            }
            
            # Add keywords as separate parameter if provided
            if keywords and keywords.strip() and keywords.lower() not in ['none', '']:
                payload["keywords"] = [keywords.strip()]
                logger.info(f"🔍 Simplified search with keywords: {keywords}")
            
            response = requests.post(
                self.base_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Federal-Contract-Research-Tool/1.0"
                },
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                awards_data = data.get('results', data.get('data', []))
                logger.info(f"✅ Simplified search returned {len(awards_data)} awards")
                
                processed_awards = []
                for award in awards_data:
                    processed_award = self._process_award_data(award)
                    if processed_award:
                        processed_awards.append(processed_award)
                
                return processed_awards
            else:
                logger.error(f"Simplified search also failed: {response.status_code}")
                logger.error(f"Response: {response.text}")
                return self._get_sample_awards(keywords, None)
                
        except Exception as e:
            logger.error(f"Simplified search failed: {str(e)}")
            return self._get_sample_awards(keywords, None)
    
    def _get_sample_awards(self, keywords: Optional[str] = None, agency: Optional[str] = None) -> List[Dict[str, Any]]:
        """Return sample awards data for demo/testing purposes"""
        logger.info("📋 Returning sample awards data")
        
        # Create sample data that reflects the search parameters
        keyword_text = keywords if keywords and keywords.lower() not in ['none', ''] else "Technology Services"
        agency_name = agency if agency and agency.lower() not in ['none', ''] else "GENERAL SERVICES ADMINISTRATION"
        
        sample_awards = [
            {
                "award_id": "sample-award-001",
                "title": f"Sample Contract Award - {keyword_text}",
                "recipient_name": "Sample Tech Solutions Inc.",
                "description": f"Sample contract for {keyword_text.lower()}. This is demonstration data reflecting your search criteria.",
                "award_amount": 2500000.0,
                "awarding_agency": agency_name,
                "awarding_subagency": "Federal Acquisition Service",
                "start_date": "2024-03-15",
                "end_date": "2025-03-14",
                "award_type": "Definitive Contract",
                "source": "Sample Data"
            },
            {
                "award_id": "sample-award-002",
                "title": f"Sample Professional Services - {keyword_text}",
                "recipient_name": "Demo Consulting Group LLC",
                "description": f"Professional services contract for {keyword_text.lower()}. Sample data based on your search parameters.",
                "award_amount": 1750000.0,
                "awarding_agency": agency_name,
                "awarding_subagency": "Technology Services Office",
                "start_date": "2024-05-01",
                "end_date": "2025-04-30",
                "award_type": "Delivery Order",
                "source": "Sample Data"
            },
            {
                "award_id": "sample-award-003",
                "title": f"Sample Support Services - {keyword_text}",
                "recipient_name": "Example Operations Corp",
                "description": f"Support services for {keyword_text.lower()}. Demonstration data matching your search criteria.",
                "award_amount": 950000.0,
                "awarding_agency": agency_name,
                "awarding_subagency": "Operations Division",
                "start_date": "2024-07-01",
                "end_date": "2025-06-30",
                "award_type": "Purchase Order",
                "source": "Sample Data"
            }
        ]
        
        return sample_awards
    
    def _build_filters(self, keywords: Optional[str], awarding_agency: Optional[str], 
                      award_date_from: Optional[str], award_date_to: Optional[str]) -> Dict[str, Any]:
        """
        Build the filters object according to USASpending API specification
        FIXED: Proper agency filter format and keyword handling
        """
        filters = {}
        
        # Add agency filter using the correct USASpending.gov format
        if awarding_agency and awarding_agency.strip() and awarding_agency.lower() not in ['none', '']:
            # Use the correct agency filter format for USASpending.gov
            filters["agencies"] = [{
                "type": "awarding",
                "tier": "toptier",
                "name": awarding_agency.strip()
            }]
            logger.info(f"🏛️ Adding agency filter: {awarding_agency}")
        
        # Add time period filter
        if award_date_from or award_date_to:
            if not award_date_from:
                award_date_from = "2024-01-01"  # Extended range for better results
            if not award_date_to:
                award_date_to = datetime.now().strftime("%Y-%m-%d")
            
            filters["time_period"] = [{
                "start_date": award_date_from,
                "end_date": award_date_to
            }]
            logger.info(f"📅 Adding time period filter: {award_date_from} to {award_date_to}")
        else:
            # Default to last 6 months for better results
            filters["time_period"] = [{
                "start_date": "2024-01-01", 
                "end_date": datetime.now().strftime("%Y-%m-%d")
            }]
            logger.info("📅 Using default time period: last 6 months")
        
        # Always include contract award types (A, B, C, D are contract types)
        filters["award_type_codes"] = ["A", "B", "C", "D"]
        
        # Note: Keywords are handled separately in the main payload, not in filters
        # This is because USASpending.gov uses a separate "keywords" parameter for text search
        
        logger.info(f"🔧 Built filters: {json.dumps(filters, indent=2)}")
        return filters
    
    def _process_award_data(self, award: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process raw award data from USASpending API into standardized format"""
        try:
            # Debug: log the structure of the award data
            if not hasattr(self, '_logged_structure'):
                logger.info(f"🔍 Sample award structure: {list(award.keys()) if isinstance(award, dict) else type(award)}")
                if isinstance(award, dict) and award:
                    logger.info(f"🔍 Sample award data: {json.dumps(award, indent=2)[:500]}...")
                self._logged_structure = True
            
            # Handle different possible field names and structures from the API
            award_id = (
                award.get("Award ID") or 
                award.get("award_id") or 
                award.get("generated_internal_id") or 
                award.get("piid") or
                f"award-{id(award)}"
            )
            
            recipient_name = (
                award.get("Recipient Name") or 
                award.get("recipient_name") or
                award.get("recipient", {}).get("name") if isinstance(award.get("recipient"), dict) else None or
                "Unknown Recipient"
            )
            
            description = (
                award.get("Description") or 
                award.get("description") or 
                award.get("Award Description") or
                award.get("award_description") or
                "No description available"
            )
            
            # Create a title from description or award info
            title = description
            if len(title) > 100:
                title = title[:97] + "..."
            elif title == "No description available":
                title = f"Award to {recipient_name}"
            
            # Handle award amount - try different field names
            award_amount = None
            for amount_field in [
                "Award Amount", "award_amount", "Total Award Amount", 
                "total_award_amount", "Current Award Amount", "current_award_amount"
            ]:
                if award.get(amount_field):
                    try:
                        award_amount = float(award[amount_field])
                        break
                    except (ValueError, TypeError):
                        continue
            
            awarding_agency = (
                award.get("Awarding Agency") or 
                award.get("awarding_agency") or
                award.get("awarding_agency_name") or
                "Unknown Agency"
            )
            
            awarding_subagency = (
                award.get("Awarding Sub Agency") or 
                award.get("awarding_sub_agency") or
                award.get("awarding_subagency") or
                ""
            )
            
            # Handle dates
            start_date = self._parse_date(
                award.get("Start Date") or 
                award.get("start_date") or
                award.get("period_of_performance_start_date")
            )
            
            end_date = self._parse_date(
                award.get("End Date") or 
                award.get("end_date") or
                award.get("period_of_performance_current_end_date")
            )
            
            award_type = (
                award.get("Award Type") or 
                award.get("award_type") or
                award.get("Contract Award Type") or
                award.get("type") or
                "Contract"
            )
            
            return {
                "award_id": award_id,
                "title": title,
                "recipient_name": recipient_name,
                "description": description,
                "award_amount": award_amount,
                "awarding_agency": awarding_agency,
                "awarding_subagency": awarding_subagency,
                "start_date": start_date,
                "end_date": end_date,
                "award_type": award_type,
                "source": "USASpending.gov"
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing award data: {str(e)}")
            logger.error(f"Award data: {award}")
            return None
    
    def _parse_date(self, date_str: Optional[str]) -> Optional[str]:
        """Parse various date formats from USASpending API"""
        if not date_str:
            return None
        
        # Try different date formats
        formats = ["%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"]
        
        for fmt in formats:
            try:
                parsed_date = datetime.strptime(date_str, fmt)
                return parsed_date.strftime("%Y-%m-%d")
            except ValueError:
                continue
        
        logger.warning(f"Could not parse date: {date_str}")
        return date_str
    
    def _cache_awards(self, awards: List[Dict[str, Any]]):
        """Cache awards in the database"""
        if not awards:
            return
        
        conn = sqlite3.connect(self.database_path)
        cursor = conn.cursor()
        
        for award in awards:
            cursor.execute('''
                INSERT OR REPLACE INTO awards 
                (award_id, recipient_name, description, award_amount, awarding_agency, 
                 awarding_subagency, start_date, end_date, award_type, search_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                award["award_id"],
                award["recipient_name"],
                award["description"],
                award["award_amount"],
                award["awarding_agency"],
                award["awarding_subagency"],
                award["start_date"],
                award["end_date"],
                award["award_type"],
                "cached"
            ))
        
        conn.commit()
        conn.close()
        logger.info(f"💾 Cached {len(awards)} awards in database")
    
    def get_analytics(self) -> Dict[str, Any]:
        """Get analytics from cached awards data"""
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            # Get basic stats
            cursor.execute("SELECT COUNT(*) FROM awards")
            total_awards = cursor.fetchone()[0]
            
            cursor.execute("SELECT SUM(award_amount) FROM awards WHERE award_amount IS NOT NULL")
            total_value = cursor.fetchone()[0] or 0
            
            # Get top agencies
            cursor.execute("""
                SELECT awarding_agency, COUNT(*) as count, SUM(award_amount) as total_amount
                FROM awards 
                WHERE awarding_agency IS NOT NULL 
                GROUP BY awarding_agency 
                ORDER BY total_amount DESC 
                LIMIT 10
            """)
            top_agencies = cursor.fetchall()
            
            # Get top recipients
            cursor.execute("""
                SELECT recipient_name, COUNT(*) as count, SUM(award_amount) as total_amount
                FROM awards 
                WHERE recipient_name IS NOT NULL 
                GROUP BY recipient_name 
                ORDER BY total_amount DESC 
                LIMIT 10
            """)
            top_recipients = cursor.fetchall()
            
            conn.close()
            
            return {
                "total_awards": total_awards,
                "total_value": total_value,
                "top_agencies": [{"name": row[0], "count": row[1], "total_amount": row[2]} for row in top_agencies],
                "top_recipients": [{"name": row[0], "count": row[1], "total_amount": row[2]} for row in top_recipients]
            }
            
        except Exception as e:
            logger.error(f"❌ Error getting analytics: {str(e)}")
            return {
                "total_awards": 0,
                "total_value": 0,
                "top_agencies": [],
                "top_recipients": []
            }

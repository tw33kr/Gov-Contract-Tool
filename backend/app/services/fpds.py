import requests
import sqlite3
from datetime import datetime, date
from typing import List, Dict, Any, Optional
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FPDSService:
    def __init__(self, database_path: str = "contracts.db"):
        self.database_path = database_path
        self.base_url = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
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
        
        try:
            # Build the request payload according to USASpending API specification
            payload = {
                "filters": self._build_filters(keywords, awarding_agency, award_date_from, award_date_to),
                "fields": [
                    "Award ID",
                    "Recipient Name", 
                    "Description",
                    "Award Amount",
                    "Awarding Agency",
                    "Awarding Sub Agency",
                    "Start Date",
                    "End Date",
                    "Award Type",
                    "Contract Award Type"
                ],
                "sort": "Award Amount",
                "order": "desc",
                "limit": limit,
                "page": 1
            }
            
            logger.info(f"📡 USASpending.gov API request: {self.base_url}")
            logger.info(f"📋 Request payload: {json.dumps(payload, indent=2)}")
            
            # Make the API request
            response = requests.post(
                self.base_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Federal-Contract-Research-Tool/1.0"
                },
                timeout=30
            )
            
            logger.info(f"📊 API Response Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                awards = data.get('results', [])
                logger.info(f"✅ Successfully fetched {len(awards)} awards from USASpending.gov")
                
                # Process and return the awards
                processed_awards = []
                for award in awards:
                    processed_award = self._process_award_data(award)
                    if processed_award:
                        processed_awards.append(processed_award)
                
                # Cache the results
                self._cache_awards(processed_awards)
                
                return processed_awards
            else:
                logger.error(f"❌ USASpending.gov API error: {response.status_code}")
                logger.error(f"Response: {response.text}")
                return []
                
        except Exception as e:
            logger.error(f"❌ Error fetching awards: {str(e)}")
            return []
    
    def _build_filters(self, keywords: Optional[str], awarding_agency: Optional[str], 
                      award_date_from: Optional[str], award_date_to: Optional[str]) -> Dict[str, Any]:
        """Build the filters object according to USASpending API specification"""
        filters = {}
        
        # Add keywords filter (required for many endpoints)
        if keywords:
            filters["keywords"] = [keywords]
        else:
            # If no keywords provided, search for contracts only
            filters["award_type_codes"] = ["A", "B", "C", "D"]  # Contract types
        
        # Add agency filter with proper structure
        if awarding_agency:
            filters["agencies"] = [
                {
                    "type": "awarding",
                    "tier": "toptier", 
                    "name": awarding_agency
                }
            ]
        
        # Add time period filter
        if award_date_from or award_date_to:
            # Default to last 2 years if no dates provided
            if not award_date_from:
                award_date_from = "2022-01-01"
            if not award_date_to:
                award_date_to = datetime.now().strftime("%Y-%m-%d")
            
            filters["time_period"] = [
                {
                    "start_date": award_date_from,
                    "end_date": award_date_to
                }
            ]
        else:
            # Default to last 2 years
            filters["time_period"] = [
                {
                    "start_date": "2022-01-01", 
                    "end_date": datetime.now().strftime("%Y-%m-%d")
                }
            ]
        
        # Always include contract award types
        if "award_type_codes" not in filters:
            filters["award_type_codes"] = ["A", "B", "C", "D"]
        
        logger.info(f"🔧 Built filters: {json.dumps(filters, indent=2)}")
        return filters
    
    def _process_award_data(self, award: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process raw award data from USASpending API into standardized format"""
        try:
            # Handle different possible field names from the API
            award_id = award.get("Award ID") or award.get("generated_internal_id") or "N/A"
            recipient_name = award.get("Recipient Name") or "Unknown Recipient"
            description = award.get("Description") or award.get("Award Description") or "No description available"
            
            # Create a title from description or award info
            title = description
            if len(title) > 100:
                title = title[:97] + "..."
            elif title == "No description available":
                title = f"Award to {recipient_name}"
            
            # Handle award amount - try different field names
            award_amount = None
            for amount_field in ["Award Amount", "Total Award Amount", "Current Award Amount"]:
                if award.get(amount_field):
                    try:
                        award_amount = float(award[amount_field])
                        break
                    except (ValueError, TypeError):
                        continue
            
            awarding_agency = award.get("Awarding Agency") or "Unknown Agency"
            awarding_subagency = award.get("Awarding Sub Agency") or ""
            
            # Handle dates
            start_date = self._parse_date(award.get("Start Date"))
            end_date = self._parse_date(award.get("End Date"))
            
            award_type = award.get("Award Type") or award.get("Contract Award Type") or "Contract"
            
            return {
                "award_id": award_id,
                "title": title,  # Add title field for AwardedContract validation
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
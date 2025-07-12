import requests
import sqlite3
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple
import json
import logging
import time
import re
from difflib import SequenceMatcher

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
    
    def _detect_contract_number(self, keywords: Optional[str]) -> Optional[str]:
        """
        Detect if the search term is likely a contract number (PIID)
        
        Contract numbers typically follow patterns like:
        - W58RGZ-23-C-0001
        - 36C10B23N10010013
        - N00024-21-C-2310
        - GS-35F-0119Y
        - HHSN316201200033W
        """
        if not keywords:
            return None
            
        # Remove any extra whitespace
        search_term = keywords.strip()
        
        # Common patterns for federal contract numbers
        contract_patterns = [
            r'^[A-Z0-9]{2,}-\d{2}-[A-Z]-\d{4}',  # W58RGZ-23-C-0001
            r'^[A-Z0-9]{6,}\d{8,}$',              # 36C10B23N10010013
            r'^[A-Z]{1,6}\d{3,}-\d{2}-[A-Z]-\d{4}',  # N00024-21-C-2310
            r'^[A-Z]{2}-\d{2}[A-Z]-\d{4}[A-Z]?$',    # GS-35F-0119Y
            r'^[A-Z]{4}\d{9}[A-Z]$',              # HHSN316201200033W
            r'^[A-Z0-9]{4,}-\d{2,}-[A-Z0-9]-\d{3,}',  # Generic pattern
            r'^[A-Z0-9]{10,20}$'                  # Long alphanumeric without dashes
        ]
        
        # Check if the search term matches any contract number pattern
        for pattern in contract_patterns:
            if re.match(pattern, search_term, re.IGNORECASE):
                logger.info(f"🔍 Detected contract number pattern: {search_term}")
                return search_term
        
        # Additional check: if it looks like it could be a contract number
        # (contains both letters and numbers, reasonable length)
        if (len(search_term) >= 10 and 
            any(c.isalpha() for c in search_term) and 
            any(c.isdigit() for c in search_term) and
            not ' ' in search_term):  # No spaces in contract numbers
            logger.info(f"🔍 Possible contract number detected: {search_term}")
            return search_term
            
        return None
    
    def _calculate_confidence(self, search_term: str, award: Dict[str, Any]) -> float:
        """
        Calculate confidence score for a search result matching the search term
        Returns a value between 0.0 and 1.0
        """
        award_id = str(award.get('award_id', '')).upper()
        search_upper = search_term.upper()
        
        # Remove common delimiters for comparison
        award_id_clean = award_id.replace('-', '').replace(' ', '')
        search_clean = search_upper.replace('-', '').replace(' ', '')
        
        # Exact match = 100% confidence
        if award_id == search_upper or award_id_clean == search_clean:
            return 1.0
        
        # Check if one contains the other
        if search_upper in award_id or search_clean in award_id_clean:
            return 0.9
        if award_id in search_upper or award_id_clean in search_clean:
            return 0.85
        
        # Use sequence matching for fuzzy comparison
        similarity = SequenceMatcher(None, search_clean, award_id_clean).ratio()
        
        # Also check description for contract number mentions
        description = str(award.get('description', '')).upper()
        if search_upper in description or search_clean in description:
            similarity = max(similarity, 0.7)
        
        return similarity
    
    def search_awards(self, 
                     keywords: Optional[str] = None,
                     awarding_agency: Optional[str] = None,
                     award_date_from: Optional[str] = None,
                     award_date_to: Optional[str] = None,
                     limit: int = 50) -> List[Dict[str, Any]]:
        """
        Search for federal contract awards using USASpending.gov API
        
        Args:
            keywords: Search keywords for award description OR contract number
            awarding_agency: Name of the awarding agency
            award_date_from: Start date (YYYY-MM-DD format)
            award_date_to: End date (YYYY-MM-DD format)
            limit: Maximum number of results
            
        Returns:
            List of award dictionaries
        """
        logger.info(f"🔍 Searching for awards with params: keywords='{keywords}', agency='{awarding_agency}', limit={limit}")
        logger.info(f"📅 Date range: {award_date_from} to {award_date_to}")
        
        # Check if keywords contain a contract number
        contract_number = self._detect_contract_number(keywords)
        
        try:
            # Build the request payload
            payload = self._build_payload(keywords, awarding_agency, award_date_from, award_date_to, limit, contract_number)
            
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
                timeout=60  # Increased timeout
            )
            
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
                        # Add confidence score if searching for contract number
                        if contract_number:
                            processed_award['confidence'] = self._calculate_confidence(contract_number, processed_award)
                        processed_awards.append(processed_award)
                
                # If searching for a contract number, filter and sort by confidence
                if contract_number and processed_awards:
                    # Sort by confidence
                    processed_awards.sort(key=lambda x: x.get('confidence', 0), reverse=True)
                    
                    # If highest confidence is > 0.5, return only that result
                    if processed_awards[0].get('confidence', 0) > 0.5:
                        logger.info(f"🎯 High confidence match found: {processed_awards[0]['award_id']} (confidence: {processed_awards[0]['confidence']:.2f})")
                        return [processed_awards[0]]
                    else:
                        logger.info(f"📋 Multiple potential matches found, returning top {min(10, len(processed_awards))} by confidence")
                        return processed_awards[:10]  # Return top 10 by confidence
                
                # Cache the results
                if processed_awards:
                    self._cache_awards(processed_awards)
                
                return processed_awards
                
            else:
                logger.error(f"❌ USASpending.gov API error: {response.status_code}")
                logger.error(f"Response: {response.text[:500]}")
                return []
                
        except requests.exceptions.Timeout:
            logger.error("❌ USASpending API timeout")
            return []
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ USASpending API request failed: {str(e)}")
            return []
        except Exception as e:
            logger.error(f"❌ Error fetching awards: {str(e)}")
            return []
    
    def _build_payload(self, keywords: Optional[str], awarding_agency: Optional[str], 
                      award_date_from: Optional[str], award_date_to: Optional[str], 
                      limit: int, contract_number: Optional[str] = None) -> Dict[str, Any]:
        """
        Build the complete USASpending.gov API payload with proper filter structure
        """
        # Build filters
        filters = self._build_filters(keywords, awarding_agency, award_date_from, award_date_to, contract_number)
        
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
                "Description",
                "generated_internal_id",
                "piid"
            ],
            "page": 1,
            "limit": min(limit, 100),  # USASpending API limits
            "sort": "Award Amount",
            "order": "desc"
        }
        
        # ALWAYS use keywords for contract numbers since that's what works on the website
        if keywords and keywords.strip() and keywords.lower() not in ['none', '']:
            payload["keywords"] = [keywords.strip()]
            logger.info(f"🔍 Using keywords parameter: {keywords}")
        
        return payload
    
    def _build_filters(self, keywords: Optional[str], awarding_agency: Optional[str], 
                      award_date_from: Optional[str], award_date_to: Optional[str],
                      contract_number: Optional[str] = None) -> Dict[str, Any]:
        """
        Build the filters object according to USASpending API specification
        """
        filters = {}
        
        # Add agency filter using the correct USASpending.gov format
        if awarding_agency and awarding_agency.strip() and awarding_agency.lower() not in ['none', '']:
            filters["agencies"] = [{
                "type": "awarding",
                "tier": "toptier",
                "name": awarding_agency.strip()
            }]
            logger.info(f"🏛️ Adding agency filter: {awarding_agency}")
        
        # Add time period filter
        if contract_number:
            # For contract searches, use wider date range
            filters["time_period"] = [{
                "start_date": "2010-01-01",
                "end_date": datetime.now().strftime("%Y-%m-%d")
            }]
            logger.info("📅 Using extended time period for contract search")
        elif award_date_from or award_date_to:
            if not award_date_from:
                award_date_from = "2023-01-01"
            if not award_date_to:
                award_date_to = datetime.now().strftime("%Y-%m-%d")
            
            filters["time_period"] = [{
                "start_date": award_date_from,
                "end_date": award_date_to
            }]
            logger.info(f"📅 Adding time period filter: {award_date_from} to {award_date_to}")
        else:
            # Default to last 2 years
            filters["time_period"] = [{
                "start_date": "2023-01-01", 
                "end_date": datetime.now().strftime("%Y-%m-%d")
            }]
            logger.info("📅 Using default time period: last 2 years")
        
        # Always include contract award types (A, B, C, D are contract types)
        filters["award_type_codes"] = ["A", "B", "C", "D"]
        
        logger.info(f"🔧 Built filters: {json.dumps(filters, indent=2)}")
        return filters
    
    def _process_award_data(self, award: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process raw award data from USASpending API into standardized format"""
        try:
            # Debug: log the structure of the award data (only once)
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

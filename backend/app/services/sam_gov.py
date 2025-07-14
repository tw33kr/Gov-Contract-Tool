import requests
import sqlite3
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional, Tuple
import hashlib
import json
import logging
import os
import time
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SAMGovService:
    def __init__(self, database_path: str = "contracts.db"):
        self.api_key = os.getenv("SAM_GOV_API_KEY")
        self.database_path = database_path
        self.base_url = "https://api.sam.gov/opportunities/v2/search"
        self.init_database()
        
        # Lazy import to avoid circular dependency
        self._fpds_service = None
    
    @property
    def fpds_service(self):
        """Lazy load FPDS service to avoid circular imports"""
        if self._fpds_service is None:
            from app.services.fpds import FPDSService
            self._fpds_service = FPDSService(self.database_path)
        return self._fpds_service
    
    def init_database(self):
        """Initialize the database with contracts table"""
        conn = sqlite3.connect(self.database_path)
        cursor = conn.cursor()
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
        conn.commit()
        conn.close()
    
    def _detect_contract_number(self, keywords: Optional[str]) -> bool:
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
            return False
            
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
                return True
        
        # Additional check: if it looks like it could be a contract number
        # (contains both letters and numbers, reasonable length)
        if (len(search_term) >= 10 and 
            any(c.isalpha() for c in search_term) and 
            any(c.isdigit() for c in search_term) and
            not ' ' in search_term):  # No spaces in contract numbers
            logger.info(f"🔍 Possible contract number detected: {search_term}")
            return True
            
        return False
    
    def search_contracts(self, 
                        keywords: Optional[str] = None,
                        agency: Optional[str] = None,
                        naics: Optional[str] = None,
                        set_aside: Optional[str] = None,
                        posted_from: Optional[str] = None,
                        posted_to: Optional[str] = None,
                        vendor_name: Optional[str] = None,
                        limit: int = 50,
                        include_awards: bool = False) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Search for federal contract opportunities and optionally include awards
        
        Args:
            keywords: Search keywords
            agency: Agency name
            naics: NAICS code
            set_aside: Set-aside type
            posted_from: Posted from date (YYYY-MM-DD)
            posted_to: Posted to date (YYYY-MM-DD)
            vendor_name: Vendor/recipient name filter
            limit: Maximum number of results
            include_awards: Whether to include awards data
            
        Returns:
            Tuple of (opportunities, awards) lists
        """
        logger.info(f"🔍 Searching contracts with params: keywords='{keywords}', agency='{agency}', vendor='{vendor_name}', limit={limit}, include_awards={include_awards}")
        
        # Auto-detect contract numbers and force awards search
        is_contract_number = self._detect_contract_number(keywords)
        if is_contract_number:
            logger.info("📋 Contract number detected - automatically including awards search")
            include_awards = True
        
        # Search for opportunities
        opportunities = self._search_opportunities(keywords, agency, naics, set_aside, posted_from, posted_to, limit)
        
        # Search for awards if requested or if contract number detected
        awards = []
        if include_awards:
            logger.info("🏆 Awards requested - fetching FPDS data...")
            awards = self._search_awards(keywords, agency, vendor_name, limit)
        
        logger.info(f"🔍 Backend search results:")
        logger.info(f"  - Opportunities: {len(opportunities)}")
        logger.info(f"  - Awards: {len(awards)}")
        logger.info(f"  - Include awards flag: {include_awards}")
        logger.info(f"  - Is contract number: {is_contract_number}")
        
        return opportunities, awards
    
    def _search_opportunities(self, keywords: Optional[str], agency: Optional[str], 
                            naics: Optional[str], set_aside: Optional[str],
                            posted_from: Optional[str], posted_to: Optional[str], 
                            limit: int) -> List[Dict[str, Any]]:
        """Search for opportunities using SAM.gov API"""
        
        # Check cache first
        cache_key = self._generate_cache_key(keywords, agency, naics, set_aside, posted_from, posted_to, limit)
        cached_results = self._get_cached_results(cache_key)
        if cached_results:
            logger.info(f"📋 Returning cached SAM.gov results...")
            return cached_results
        
        # Check if API key exists
        if not self.api_key or self.api_key == "" or self.api_key == "DEMO_KEY":
            logger.error("❌ No valid SAM.gov API key found. Please set SAM_GOV_API_KEY environment variable.")
            logger.error("📋 Get your free API key at: https://sam.gov/data-services")
            # Return sample data for demo purposes
            return self._get_sample_opportunities()
        
        try:
            # Build parameters for SAM.gov API
            params = self._build_sam_params(keywords, agency, naics, set_aside, posted_from, posted_to, limit)
            
            logger.info(f"🌐 Fetching from SAM.gov with API key: {self.api_key[:8]}...")
            logger.info(f"📡 SAM.gov API request: {self.base_url}")
            logger.info(f"📋 Request params: {params}")
            
            # Add retry logic for SAM.gov API
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    response = requests.get(
                        self.base_url,
                        params=params,
                        headers={
                            "X-API-Key": self.api_key,
                            "Content-Type": "application/json"
                        },
                        timeout=120  # Increased timeout to 2 minutes
                    )
                    break  # If successful, break out of retry loop
                except requests.exceptions.Timeout:
                    if attempt < max_retries - 1:
                        logger.warning(f"⚠️ SAM.gov API timeout, retrying ({attempt + 1}/{max_retries})...")
                        time.sleep(2)  # Wait 2 seconds before retry
                        continue
                    else:
                        logger.error("❌ SAM.gov API timeout after all retries")
                        return self._get_sample_opportunities()
                except requests.exceptions.RequestException as e:
                    logger.error(f"❌ SAM.gov API request failed: {str(e)}")
                    return self._get_sample_opportunities()
            
            logger.info(f"📊 API Response Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                opportunities = data.get('opportunitiesData', [])
                logger.info(f"✅ Successfully fetched {len(opportunities)} opportunities from SAM.gov")
                
                # Process the opportunities
                processed_opportunities = []
                for opp in opportunities:
                    processed_opp = self._process_opportunity_data(opp)
                    if processed_opp:
                        processed_opportunities.append(processed_opp)
                
                # Cache the results
                self._cache_results(processed_opportunities, cache_key)
                
                return processed_opportunities
            elif response.status_code == 403:
                logger.error("❌ SAM.gov API key invalid or expired")
                logger.error("📋 Please check your API key at: https://sam.gov/data-services")
                return self._get_sample_opportunities()
            else:
                logger.error(f"❌ SAM.gov API error: {response.status_code}")
                logger.error(f"Response: {response.text}")
                return self._get_sample_opportunities()
                
        except Exception as e:
            logger.error(f"❌ Error fetching opportunities: {str(e)}")
            return self._get_sample_opportunities()
    
    def _get_sample_opportunities(self) -> List[Dict[str, Any]]:
        """Return sample opportunities for demo/testing purposes"""
        logger.info("📋 Returning sample opportunities data for demo")
        return [
            {
                "notice_id": "sample-001",
                "title": "IT Support Services - Sample Opportunity",
                "agency": "GENERAL SERVICES ADMINISTRATION",
                "office": "Federal Acquisition Service",
                "posted_date": "2025-07-10",
                "response_deadline": "2025-08-10",
                "naics_code": "541512",
                "naics_description": "Computer Systems Design Services",
                "set_aside": "SBA",
                "description": "Sample IT support services opportunity for demonstration purposes. This is not a real contract opportunity.",
                "award_amount": 500000.0,
                "place_of_performance": "Washington, DC",
                "contact_info": "contracting.officer@gsa.gov",
                "solicitation_number": "SAMPLE-2025-001",
                "contract_type": "Solicitation"
            },
            {
                "notice_id": "sample-002",
                "title": "Construction Services - Sample Project",
                "agency": "DEPARTMENT OF DEFENSE",
                "office": "Army Corps of Engineers",
                "posted_date": "2025-07-09",
                "response_deadline": "2025-08-15",
                "naics_code": "236220",
                "naics_description": "Commercial and Institutional Building Construction",
                "set_aside": "SDVOSBC",
                "description": "Sample construction project for demonstration purposes. This is not a real contract opportunity.",
                "award_amount": 2500000.0,
                "place_of_performance": "Fort Belvoir, VA",
                "contact_info": "contracting@usace.army.mil",
                "solicitation_number": "SAMPLE-2025-002",
                "contract_type": "Presolicitation"
            }
        ]
    
    def _search_awards(self, keywords: Optional[str], agency: Optional[str], vendor_name: Optional[str], limit: int) -> List[Dict[str, Any]]:
        """Search for awards using FPDS service"""
        try:
            logger.info(f"🔍 Searching for awards with params: keywords='{keywords}', agency='{agency}', vendor='{vendor_name}', limit={limit}")
            
            # Use FPDS service to search awards with proper parameter mapping
            awards = self.fpds_service.search_awards(
                keywords=keywords,
                awarding_agency=agency,  # Map agency to awarding_agency
                vendor_name=vendor_name,  # Pass vendor_name parameter
                limit=limit
            )
            
            logger.info(f"✅ Successfully fetched {len(awards)} awards from USASpending.gov")
            return awards
            
        except Exception as e:
            logger.error(f"❌ Error fetching awards: {str(e)}")
            return []
    
    def _build_sam_params(self, keywords: Optional[str], agency: Optional[str], 
                         naics: Optional[str], set_aside: Optional[str],
                         posted_from: Optional[str], posted_to: Optional[str], 
                         limit: int) -> Dict[str, Any]:
        """Build parameters for SAM.gov API request"""
        params = {
            "limit": min(limit, 1000),  # SAM.gov has limits
            "api_key": self.api_key
        }
        
        # Add search parameters only if they have values
        if keywords and keywords.strip():
            params["q"] = keywords.strip()
        
        if agency and agency.strip():
            params["deptname"] = agency.strip()
        
        if naics and naics.strip():
            params["ncode"] = naics.strip()
        
        if set_aside and set_aside.strip():
            params["typeOfSetAside"] = set_aside.strip()
        
        # Handle date parameters - SAM.gov requires both if either is provided
        if posted_from or posted_to:
            if not posted_from:
                posted_from = (datetime.now() - timedelta(days=90)).strftime("%m/%d/%Y")
            if not posted_to:
                posted_to = datetime.now().strftime("%m/%d/%Y")
            
            # Convert YYYY-MM-DD to MM/DD/YYYY format for SAM.gov
            try:
                if len(posted_from) == 10 and posted_from.count('-') == 2:
                    posted_from = datetime.strptime(posted_from, "%Y-%m-%d").strftime("%m/%d/%Y")
                if len(posted_to) == 10 and posted_to.count('-') == 2:
                    posted_to = datetime.strptime(posted_to, "%Y-%m-%d").strftime("%m/%d/%Y")
            except ValueError:
                pass
            
            params["postedFrom"] = posted_from
            params["postedTo"] = posted_to
        else:
            # Default to last 90 days if no dates provided
            params["postedFrom"] = (datetime.now() - timedelta(days=90)).strftime("%m/%d/%Y")
            params["postedTo"] = datetime.now().strftime("%m/%d/%Y")
        
        return params
    
    def _process_opportunity_data(self, opportunity: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process raw opportunity data from SAM.gov API"""
        try:
            # Skip if opportunity is None or empty
            if not opportunity or opportunity is None:
                logger.warning("⚠️ Skipping None/empty opportunity")
                return None
            
            # Extract place of performance safely
            place_of_performance = ""
            if opportunity.get("placeOfPerformance"):
                pop = opportunity["placeOfPerformance"]
                if isinstance(pop, dict) and pop.get("city"):
                    city = pop["city"]
                    if isinstance(city, dict) and city.get("name"):
                        place_of_performance = city["name"]
                    elif isinstance(city, str):
                        place_of_performance = city
            
            # Extract office address safely
            office = ""
            if opportunity.get("officeAddress"):
                office_addr = opportunity["officeAddress"]
                if isinstance(office_addr, dict) and office_addr.get("city"):
                    office = office_addr["city"]
            
            processed_opportunity = {
                "notice_id": opportunity.get("noticeId", ""),
                "title": opportunity.get("title", "No title available"),
                "agency": opportunity.get("fullParentPathName", ""),
                "office": office,
                "posted_date": self._parse_date(opportunity.get("postedDate")),
                "response_deadline": self._parse_date(opportunity.get("responseDeadLine")),
                "naics_code": opportunity.get("naicsCode", ""),
                "naics_description": opportunity.get("classificationCode", ""),
                "set_aside": opportunity.get("typeOfSetAside", ""),
                "description": opportunity.get("description", ""),
                "award_amount": self._parse_amount(opportunity.get("awardAmount")),
                "place_of_performance": place_of_performance,
                "contact_info": opportunity.get("contactInformation", ""),
                "solicitation_number": opportunity.get("solicitationNumber", ""),
                "contract_type": opportunity.get("type", "")
            }
            
            # Only return if we have at least a notice_id or title
            if processed_opportunity["notice_id"] or processed_opportunity["title"]:
                return processed_opportunity
            else:
                logger.warning("⚠️ Skipping opportunity with no ID or title")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error processing opportunity: {str(e)}")
            logger.error(f"Opportunity data: {opportunity}")
            return None
    
    def _generate_cache_key(self, *args) -> str:
        """Generate a cache key from search parameters"""
        key_string = "|".join(str(arg) for arg in args)
        return hashlib.md5(key_string.encode()).hexdigest()
    
    def _get_cached_results(self, cache_key: str) -> List[Dict[str, Any]]:
        """Get cached results from database"""
        conn = sqlite3.connect(self.database_path)
        cursor = conn.cursor()
        
        # Check for cached results within last 2 hours (extended cache time)
        cursor.execute('''
            SELECT * FROM contracts 
            WHERE search_hash = ? 
            AND fetched_at > datetime('now', '-2 hours')
            ORDER BY posted_date DESC
        ''', (cache_key,))
        
        rows = cursor.fetchall()
        conn.close()
        
        if rows:
            logger.info(f"📋 Found {len(rows)} cached contracts")
            return [self._row_to_dict(row) for row in rows]
        
        return []
    
    def _cache_results(self, results: List[Dict[str, Any]], cache_key: str):
        """Cache results in database"""
        if not results:
            return
        
        conn = sqlite3.connect(self.database_path)
        cursor = conn.cursor()
        
        for result in results:
            cursor.execute('''
                INSERT OR REPLACE INTO contracts 
                (notice_id, title, agency, office, posted_date, response_deadline, 
                 naics_code, naics_description, set_aside, description, award_amount, 
                 place_of_performance, contact_info, solicitation_number, contract_type, search_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                result["notice_id"], result["title"], result["agency"], result["office"],
                result["posted_date"], result["response_deadline"], result["naics_code"],
                result["naics_description"], result["set_aside"], result["description"],
                result["award_amount"], result["place_of_performance"], result["contact_info"],
                result["solicitation_number"], result["contract_type"], cache_key
            ))
        
        conn.commit()
        conn.close()
        logger.info(f"💾 Cached {len(results)} contracts")
    
    def _row_to_dict(self, row) -> Dict[str, Any]:
        """Convert database row to dictionary"""
        return {
            "notice_id": row[1],
            "title": row[2],
            "agency": row[3],
            "office": row[4],
            "posted_date": row[5],
            "response_deadline": row[6],
            "naics_code": row[7],
            "naics_description": row[8],
            "set_aside": row[9],
            "description": row[10],
            "award_amount": row[11],
            "place_of_performance": row[12],
            "contact_info": row[13],
            "solicitation_number": row[14],
            "contract_type": row[15]
        }
    
    def _parse_date(self, date_str: Optional[str]) -> Optional[str]:
        """Parse date string to standard format"""
        if not date_str:
            return None
        
        try:
            if 'T' in date_str:
                return date_str.split('T')[0]
            return date_str
        except:
            return date_str
    
    def _parse_amount(self, amount_str: Optional[str]) -> Optional[float]:
        """Parse amount string to float"""
        if not amount_str:
            return None
        
        try:
            # Remove currency symbols and commas
            clean_amount = str(amount_str).replace('$', '').replace(',', '').strip()
            return float(clean_amount)
        except:
            return None
    
    def get_agencies(self) -> List[str]:
        """Get list of unique agencies from cached data"""
        # First try to get from cached contracts
        conn = sqlite3.connect(self.database_path)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT agency FROM contracts WHERE agency IS NOT NULL AND agency != '' ORDER BY agency")
        agencies = [row[0] for row in cursor.fetchall()]
        conn.close()
        
        # If no cached agencies, return common ones
        if not agencies:
            agencies = [
                "GENERAL SERVICES ADMINISTRATION",
                "DEPARTMENT OF DEFENSE",
                "DEPARTMENT OF HOMELAND SECURITY",
                "DEPARTMENT OF VETERANS AFFAIRS",
                "DEPARTMENT OF HEALTH AND HUMAN SCIENCES",
                "DEPARTMENT OF ENERGY",
                "DEPARTMENT OF TRANSPORTATION",
                "DEPARTMENT OF AGRICULTURE",
                "NATIONAL AERONAUTICS AND SPACE ADMINISTRATION",
                "DEPARTMENT OF JUSTICE"
            ]
        
        return agencies
    
    def get_set_asides(self) -> List[str]:
        """Get list of unique set-aside types from cached data"""
        # First try to get from cached contracts
        conn = sqlite3.connect(self.database_path)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT set_aside FROM contracts WHERE set_aside IS NOT NULL AND set_aside != '' ORDER BY set_aside")
        set_asides = [row[0] for row in cursor.fetchall()]
        conn.close()
        
        # If no cached set-asides, return common ones
        if not set_asides:
            set_asides = [
                "SBA",
                "SDVOSBC", 
                "WOSB",
                "8(a)",
                "HUBZone",
                "AbilityOne"
            ]
        
        return set_asides
    
    def get_analytics(self, include_awards: bool = False) -> Dict[str, Any]:
        """Get analytics from cached data"""
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            # Opportunities analytics
            cursor.execute("SELECT COUNT(*) FROM contracts")
            total_opportunities = cursor.fetchone()[0]
            
            cursor.execute("""
                SELECT agency, COUNT(*) as count 
                FROM contracts 
                WHERE agency IS NOT NULL AND agency != ''
                GROUP BY agency 
                ORDER BY count DESC 
                LIMIT 10
            """)
            top_agencies = [{"name": row[0], "count": row[1]} for row in cursor.fetchall()]
            
            cursor.execute("""
                SELECT naics_code, COUNT(*) as count 
                FROM contracts 
                WHERE naics_code IS NOT NULL AND naics_code != ''
                GROUP BY naics_code 
                ORDER BY count DESC 
                LIMIT 10
            """)
            top_naics = [{"code": row[0], "count": row[1]} for row in cursor.fetchall()]
            
            conn.close()
            
            analytics = {
                "total_opportunities": total_opportunities,
                "top_agencies": top_agencies,
                "top_naics_codes": top_naics
            }
            
            # Add awards analytics if requested
            if include_awards:
                try:
                    awards_analytics = self.fpds_service.get_analytics()
                    analytics.update(awards_analytics)
                except Exception as e:
                    logger.error(f"❌ Error getting awards analytics: {str(e)}")
                    # Add default values if awards analytics fails
                    analytics.update({
                        "total_awards": 0,
                        "total_value": 0,
                        "top_recipients": []
                    })
            
            return analytics
            
        except Exception as e:
            logger.error(f"❌ Error getting analytics: {str(e)}")
            # Return default analytics if everything fails
            return {
                "total_opportunities": 0,
                "total_awards": 0,
                "total_value": 0,
                "top_agencies": [],
                "top_naics_codes": [],
                "top_recipients": []
            }

"""
FPDS Service using USASpending.gov API
Fetches awarded contract data
"""
import os
import json
import sqlite3
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from ..models import AwardedContract

logger = logging.getLogger(__name__)

class FPDSService:
    def __init__(self, database_path: str = "fpds_awards.db"):
        self.base_url = "https://api.usaspending.gov/api/v2"
        self.database_path = database_path
        self.cache_duration = timedelta(hours=1)
        
        # Setup requests session with retry logic
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        
        # Initialize database
        self.init_database()
        
        # Award type mapping
        self.award_type_descriptions = {
            'A': 'BPA Call', 'B': 'Purchase Order', 'C': 'Delivery Order',
            'D': 'Definitive Contract', 'E': 'BPA', 'F': 'Indefinite Delivery Contract',
            'G': 'BOA', 'H': 'Agreement', 'J': 'Indefinite Quantity Contract'
        }

    def init_database(self):
        """Initialize SQLite database for caching awards"""
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS awards (
                    award_id TEXT PRIMARY KEY,
                    awarding_agency TEXT,
                    recipient_name TEXT,
                    title TEXT,
                    award_date TEXT,
                    end_date TEXT,
                    award_amount REAL,
                    naics_code TEXT,
                    naics_description TEXT,
                    set_aside TEXT,
                    place_of_performance TEXT,
                    competition_type TEXT,
                    award_type TEXT,
                    cached_at TEXT
                )
            ''')
            conn.commit()
            conn.close()
            logger.info("✅ FPDS database initialized")
        except Exception as e:
            logger.error(f"❌ Error initializing FPDS database: {str(e)}")

    def search_awards(self, **search_params) -> List[AwardedContract]:
        """Search for awarded contracts with comprehensive filtering"""
        try:
            # Extract search parameters
            keyword = search_params.get('keywords', '')
            agency = search_params.get('awarding_agency', '')
            vendor = search_params.get('vendor_name', '')
            naics_code = search_params.get('naics_code', '')
            set_aside = search_params.get('set_aside', '')
            min_amount = search_params.get('min_award_amount', 0)
            max_amount = search_params.get('max_award_amount', None)
            
            # Date range - default to last 90 days
            date_from = search_params.get('award_date_from')
            date_to = search_params.get('award_date_to')
            
            if not date_from:
                date_from = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')
            if not date_to:
                date_to = datetime.now().strftime('%Y-%m-%d')
            
            limit = min(search_params.get('limit', 50), 100)
            
            logger.info(f"🔍 Searching awards with params: keyword={keyword}, agency={agency}, vendor={vendor}, date_range={date_from} to {date_to}")
            
            # Check cache first
            cache_key = self._generate_cache_key(**search_params)
            cached_results = self._get_cached_results(cache_key)
            if cached_results and not search_params.get('force_refresh'):
                logger.info(f"📋 Returning {len(cached_results)} cached awards")
                return cached_results
            
            # Build search request
            search_request = self._build_search_request(
                keyword=keyword,
                agency=agency, 
                vendor=vendor,
                naics_code=naics_code,
                set_aside=set_aside,
                min_amount=min_amount,
                max_amount=max_amount,
                date_from=date_from,
                date_to=date_to,
                limit=limit
            )
            
            # Fetch from USASpending.gov
            awards = self._fetch_from_usaspending(search_request)
            
            # Cache results
            if awards:
                self._cache_results(awards, cache_key)
            
            return awards
            
        except Exception as e:
            logger.error(f"❌ Error searching awards: {str(e)}")
            return []

    def _build_search_request(self, **params) -> Dict[str, Any]:
        """Build USASpending.gov search request with improved keyword and agency handling"""
        filters = {
            "award_type_codes": ["A", "B", "C", "D", "E", "F", "IDV_A", "IDV_B", "IDV_C", "IDV_D", "IDV_E"],
            "time_period": [{
                "start_date": params['date_from'],
                "end_date": params['date_to']
            }]
        }
        
        # Add keyword search - ensure it's properly included
        if params.get('keyword') and params['keyword'].strip():
            keywords_list = params['keyword'].strip().split()
            filters["keywords"] = keywords_list
            logger.info(f"🔍 Adding keywords filter: {keywords_list}")
        
        # Add agency filter - ensure it's properly formatted
        if params.get('agency') and params['agency'].strip():
            agency_name = params['agency'].strip()
            # Handle common agency name variations
            agency_mapping = {
                'DOD': 'Department of Defense',
                'VA': 'Department of Veterans Affairs',
                'HHS': 'Department of Health and Human Services',
                'NASA': 'National Aeronautics and Space Administration',
                'DHS': 'Department of Homeland Security',
                'DOE': 'Department of Energy',
                'DOT': 'Department of Transportation',
                'DOJ': 'Department of Justice',
                'USDA': 'Department of Agriculture',
                'EPA': 'Environmental Protection Agency'
            }
            
            # Check if we need to map the agency name
            if agency_name.upper() in agency_mapping:
                agency_name = agency_mapping[agency_name.upper()]
                logger.info(f"📌 Mapped agency abbreviation to full name: {agency_name}")
            
            filters["agencies"] = [{
                "type": "funding",
                "tier": "toptier",
                "name": agency_name
            }]
            logger.info(f"🏛️ Adding agency filter: {agency_name}")
        
        # Add vendor filter
        if params.get('vendor') and params['vendor'].strip():
            filters["recipient_search_text"] = params['vendor'].strip()
            logger.info(f"🏢 Adding vendor filter: {params['vendor']}")
        
        # Add NAICS filter
        if params.get('naics_code') and params['naics_code'].strip():
            filters["naics_codes"] = [params['naics_code'].strip()]
            logger.info(f"📊 Adding NAICS filter: {params['naics_code']}")
        
        # Add set-aside filter
        if params.get('set_aside') and params['set_aside'].strip():
            set_aside_map = {
                'SBA': ['SBA', 'SB'],
                'SDVOSBC': ['SDVOSBC', '27'],
                '8(a)': ['8A', '8AN', '8AC'],
                'WOSB': ['WOSB', 'EDWOSB'],
                'HUBZone': ['HZC', 'HZS']
            }
            if params['set_aside'] in set_aside_map:
                filters["type_of_set_aside_code"] = set_aside_map[params['set_aside']]
                logger.info(f"🎯 Adding set-aside filter: {params['set_aside']}")
        
        # Add amount filter
        if params.get('min_amount') or params.get('max_amount'):
            award_amounts = []
            if params.get('min_amount'):
                award_amounts.append({"lower_bound": params['min_amount']})
            if params.get('max_amount'):
                award_amounts.append({"upper_bound": params['max_amount']})
            if award_amounts:
                filters["award_amounts"] = award_amounts
                logger.info(f"💰 Adding amount filter: min={params.get('min_amount')}, max={params.get('max_amount')}")
        
        request = {
            "filters": filters,
            "fields": [
                "Award ID", "Recipient Name", "Award Date", "Award Amount",
                "Total Outlays", "Awarding Agency", "Awarding Sub Agency",
                "Contract Award Type", "Award Type", "Description",
                "primary_place_of_performance_state_name",
                "primary_place_of_performance_city_name",
                "naics_code", "naics_description",
                "type_set_aside_name", "extent_competed_name"
            ],
            "page": 1,
            "limit": params.get('limit', 50),
            "sort": "Award Date",
            "order": "desc"
        }
        
        logger.info(f"📡 Built search request with {len(filters)} filter types")
        logger.debug(f"Full request: {json.dumps(request, indent=2)}")
        
        return request

    def _fetch_from_usaspending(self, search_request: Dict[str, Any]) -> List[AwardedContract]:
        """Fetch awards from USASpending.gov API"""
        try:
            logger.info("🌐 Fetching awarded contracts from USASpending.gov API...")
            
            url = f"{self.base_url}/search/spending_by_award/"
            logger.info(f"📡 USASpending.gov API request: {url}")
            
            # Log the request payload for debugging
            logger.debug(f"Request payload: {json.dumps(search_request, indent=2)}")
            
            response = self.session.post(url, json=search_request)
            logger.info(f"📊 API Response Status: {response.status_code}")
            
            if response.status_code != 200:
                logger.error(f"❌ USASpending API error: {response.text}")
                return []
            
            data = response.json()
            results = data.get('results', [])
            
            logger.info(f"📋 API returned {len(results)} results")
            
            # Process results
            awards = []
            for item in results:
                award = self._process_award_data(item)
                if award:
                    awards.append(award)
            
            logger.info(f"✅ Successfully processed {len(awards)} awards from USASpending.gov")
            return awards
            
        except Exception as e:
            logger.error(f"❌ Error fetching from USASpending.gov: {str(e)}")
            return []

    def _process_award_data(self, item: Dict[str, Any]) -> Optional[AwardedContract]:
        """Process raw award data into AwardedContract model"""
        try:
            # Extract basic fields
            award_id = item.get('Award ID', '')
            if not award_id:
                return None
            
            # Parse dates
            award_date = self._parse_date(item.get('Award Date'))
            
            # Get location
            place_of_performance = self._get_location(
                item.get('primary_place_of_performance_city_name'),
                item.get('primary_place_of_performance_state_name')
            )
            
            # Create award following the model structure
            award = AwardedContract(
                award_id=award_id,
                title=item.get('Description', 'Contract Award') or f"Contract {award_id}",
                recipient_name=item.get('Recipient Name', 'Unknown Vendor'),
                awarding_agency=item.get('Awarding Agency', 'Unknown Agency'),
                awarding_subagency=item.get('Awarding Sub Agency', ''),
                award_amount=float(item.get('Award Amount', 0) or 0),
                award_date=award_date,
                start_date=award_date,  # Use award date as start date
                end_date=None,  # Not available in spending_by_award
                award_type=item.get('Award Type', ''),
                description=item.get('Description', ''),
                naics_code=item.get('naics_code', ''),
                naics_description=item.get('naics_description', ''),
                place_of_performance=place_of_performance,
                contract_type=item.get('Contract Award Type', 'Unknown'),
                set_aside=item.get('type_set_aside_name', 'None'),
                competition_type=item.get('extent_competed_name', 'Unknown')
            )
            
            return award
            
        except Exception as e:
            logger.error(f"❌ Error processing award data: {str(e)}")
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug(f"Award data: {json.dumps(item, indent=2)}")
            return None

    def _parse_date(self, date_str: Optional[str]) -> Optional[str]:
        """Parse date string to standard format"""
        if not date_str:
            return None
        
        # Try multiple date formats
        formats = [
            '%Y-%m-%d',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%dT%H:%M:%SZ',
            '%Y-%m-%dT%H:%M:%S.%fZ'
        ]
        
        for fmt in formats:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.strftime('%Y-%m-%d')
            except ValueError:
                continue
        
        return date_str

    def _get_location(self, city: Optional[str], state: Optional[str]) -> str:
        """Format location string"""
        parts = []
        if city:
            parts.append(city)
        if state:
            parts.append(state)
        return ', '.join(parts) if parts else 'Unknown'

    def _generate_cache_key(self, **params) -> str:
        """Generate cache key from search parameters"""
        # Sort params for consistent keys
        sorted_params = sorted(params.items())
        key_str = json.dumps(sorted_params, sort_keys=True)
        return f"search_{hash(key_str)}"

    def _get_cached_results(self, cache_key: str) -> Optional[List[AwardedContract]]:
        """Get cached search results"""
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            # Check cache age
            cutoff_time = (datetime.now() - self.cache_duration).isoformat()
            
            # For search cache key
            cursor.execute('''
                SELECT * FROM awards 
                WHERE cached_at > ?
                ORDER BY award_date DESC
            ''', (cutoff_time,))
            
            rows = cursor.fetchall()
            
            if not rows:
                conn.close()
                return None
            
            # Convert rows to AwardedContract objects
            awards = []
            for row in rows:
                award = AwardedContract(
                    award_id=row[0],
                    title=row[3],
                    recipient_name=row[2],
                    awarding_agency=row[1],
                    awarding_subagency='',
                    award_amount=row[6],
                    award_date=row[4],
                    start_date=row[4],
                    end_date=row[5],
                    award_type=row[12],
                    description=row[3],
                    naics_code=row[7] or '',
                    naics_description=row[8] or '',
                    place_of_performance=row[10] or 'Unknown',
                    contract_type='Contract',
                    set_aside=row[9] or 'None',
                    competition_type=row[11] or 'Unknown'
                )
                awards.append(award)
            
            conn.close()
            return awards if awards else None
            
        except Exception as e:
            logger.error(f"❌ Error getting cached results: {str(e)}")
            return None

    def _cache_results(self, awards: List[AwardedContract], cache_key: str):
        """Cache search results"""
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            for award in awards:
                cursor.execute('''
                    INSERT OR REPLACE INTO awards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    award.award_id,
                    award.awarding_agency,
                    award.recipient_name,
                    award.title,
                    award.award_date,
                    award.end_date,
                    award.award_amount,
                    award.naics_code,
                    award.naics_description,
                    award.set_aside,
                    award.place_of_performance,
                    award.competition_type,
                    award.award_type,
                    datetime.now().isoformat()
                ))
            
            conn.commit()
            conn.close()
            logger.info(f"✅ Cached {len(awards)} awards")
            
        except Exception as e:
            logger.error(f"❌ Error caching results: {str(e)}")

    def get_analytics(self, **params) -> Dict[str, Any]:
        """Get analytics for awards"""
        try:
            awards = self.search_awards(**params)
            
            if not awards:
                return {
                    'total_awards': 0,
                    'total_value': 0,
                    'average_award': 0,
                    'top_vendors': [],
                    'top_agencies': [],
                    'competition_stats': {},
                    'set_aside_distribution': {}
                }
            
            # Calculate analytics
            total_value = sum(a.award_amount for a in awards)
            
            # Top vendors by award count and value
            vendor_stats = {}
            for award in awards:
                if award.recipient_name not in vendor_stats:
                    vendor_stats[award.recipient_name] = {'count': 0, 'value': 0}
                vendor_stats[award.recipient_name]['count'] += 1
                vendor_stats[award.recipient_name]['value'] += award.award_amount
            
            top_vendors = sorted(
                [{'name': k, **v} for k, v in vendor_stats.items()],
                key=lambda x: x['value'],
                reverse=True
            )[:10]
            
            # Top agencies
            agency_stats = {}
            for award in awards:
                if award.awarding_agency not in agency_stats:
                    agency_stats[award.awarding_agency] = {'count': 0, 'value': 0}
                agency_stats[award.awarding_agency]['count'] += 1
                agency_stats[award.awarding_agency]['value'] += award.award_amount
            
            top_agencies = sorted(
                [{'name': k, **v} for k, v in agency_stats.items()],
                key=lambda x: x['value'],
                reverse=True
            )[:10]
            
            # Competition stats
            competition_stats = {}
            for award in awards:
                comp_type = award.competition_type or 'Unknown'
                if comp_type not in competition_stats:
                    competition_stats[comp_type] = 0
                competition_stats[comp_type] += 1
            
            # Set-aside distribution
            setaside_stats = {}
            for award in awards:
                setaside = award.set_aside or 'None'
                if setaside not in setaside_stats:
                    setaside_stats[setaside] = 0
                setaside_stats[setaside] += 1
            
            return {
                'total_awards': len(awards),
                'total_value': total_value,
                'average_award': total_value / len(awards) if awards else 0,
                'top_vendors': top_vendors,
                'top_agencies': top_agencies,
                'competition_stats': competition_stats,
                'set_aside_distribution': setaside_stats
            }
            
        except Exception as e:
            logger.error(f"❌ Error generating analytics: {str(e)}")
            return {}

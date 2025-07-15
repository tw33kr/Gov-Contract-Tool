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
    def __init__(self):
        self.base_url = "https://api.usaspending.gov/api/v2"
        self.database_path = "fpds_awards.db"
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
                    piid TEXT PRIMARY KEY,
                    agency TEXT,
                    vendor TEXT,
                    title TEXT,
                    award_date TEXT,
                    completion_date TEXT,
                    award_amount REAL,
                    total_value REAL,
                    status TEXT,
                    naics_code TEXT,
                    naics_description TEXT,
                    psc_code TEXT,
                    psc_description TEXT,
                    contract_vehicle TEXT,
                    set_aside TEXT,
                    place_of_performance TEXT,
                    competition_type TEXT,
                    number_of_offers INTEGER,
                    solicitation_id TEXT,
                    parent_piid TEXT,
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
            keyword = search_params.get('keyword', '')
            agency = search_params.get('agency', '')
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
            include_fpds_fields = search_params.get('include_fpds_fields', False)
            
            # Special search modes
            piid = search_params.get('piid', '')
            parent_piid = search_params.get('parent_piid', '')
            
            logger.info(f"🔍 Searching awards with params: keyword={keyword}, agency={agency}, vendor={vendor}, date_range={date_from} to {date_to}")
            
            # Direct PIID search
            if piid:
                return self._search_by_direct_piid(piid, include_fpds_fields)
            
            # Parent PIID search (all child awards)
            if parent_piid:
                return self._search_by_parent_piid(parent_piid, include_fpds_fields)
            
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
            awards = self._fetch_from_usaspending(search_request, include_fpds_fields)
            
            # Cache results
            if awards:
                self._cache_results(awards, cache_key)
            
            return awards
            
        except Exception as e:
            logger.error(f"❌ Error searching awards: {str(e)}")
            return []

    def _search_by_direct_piid(self, piid: str, include_fpds_fields: bool = False) -> List[AwardedContract]:
        """Search for a specific award by PIID"""
        try:
            logger.info(f"🔍 Searching for specific PIID: {piid}")
            
            # Try cache first
            cached = self._get_cached_award(piid)
            if cached and not include_fpds_fields:
                logger.info("📋 Returning cached award")
                return [cached]
            
            # Fetch from USASpending.gov Award Details endpoint
            url = f"{self.base_url}/awards/{piid}/"
            response = self.session.get(url)
            
            if response.status_code == 200:
                data = response.json()
                award = self._process_award_detail(data, include_fpds_fields)
                if award:
                    self._cache_results([award], piid)
                    return [award]
            else:
                logger.warning(f"⚠️ Award not found or API error: {response.status_code}")
                
        except Exception as e:
            logger.error(f"❌ Error searching by PIID: {str(e)}")
        
        return []

    def _search_by_parent_piid(self, parent_piid: str, include_fpds_fields: bool = False) -> List[AwardedContract]:
        """Search for all child awards under a parent PIID"""
        try:
            logger.info(f"🔍 Searching for child awards of parent PIID: {parent_piid}")
            
            # Build request for child awards
            request_data = {
                "filters": {
                    "referenced_idv_agency_iden": parent_piid,
                    "time_period": [{"date_type": "action_date", "date_range": "all"}]
                },
                "fields": self._get_award_fields(include_fpds_fields),
                "page": 1,
                "limit": 100,
                "sort": "Award Date",
                "order": "desc"
            }
            
            url = f"{self.base_url}/search/spending_by_award/"
            response = self.session.post(url, json=request_data)
            
            if response.status_code == 200:
                data = response.json()
                awards = []
                for item in data.get('results', []):
                    award = self._process_award_data(item, include_fpds_fields)
                    if award:
                        awards.append(award)
                
                logger.info(f"✅ Found {len(awards)} child awards")
                return awards
            else:
                logger.warning(f"⚠️ Error fetching child awards: {response.status_code}")
                
        except Exception as e:
            logger.error(f"❌ Error searching by parent PIID: {str(e)}")
        
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
            "fields": self._get_award_fields(params.get('include_fpds_fields', False)),
            "page": 1,
            "limit": params.get('limit', 50),
            "sort": "Award Date",
            "order": "desc"
        }
        
        logger.info(f"📡 Built search request with {len(filters)} filter types")
        logger.debug(f"Full request: {json.dumps(request, indent=2)}")
        
        return request

    def _get_award_fields(self, include_fpds_fields: bool = False) -> List[str]:
        """Get list of fields to request from API"""
        basic_fields = [
            "Award ID", "Recipient Name", "Award Date", "Award Amount",
            "Total Outlays", "Awarding Agency", "Awarding Sub Agency",
            "Contract Award Type", "Award Type", "Description",
            "primary_place_of_performance_state_name",
            "primary_place_of_performance_city_name",
            "naics_code", "naics_description"
        ]
        
        if include_fpds_fields:
            basic_fields.extend([
                "type_of_contract_pricing_name", "extent_competed_name",
                "type_set_aside_name", "product_or_service_code",
                "product_or_service_description", "number_of_offers_received",
                "solicitation_identifier", "parent_award_id"
            ])
        
        return basic_fields

    def _fetch_from_usaspending(self, search_request: Dict[str, Any], include_fpds_fields: bool = False) -> List[AwardedContract]:
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
                award = self._process_award_data(item, include_fpds_fields)
                if award:
                    awards.append(award)
            
            logger.info(f"✅ Successfully processed {len(awards)} awards from USASpending.gov")
            return awards
            
        except Exception as e:
            logger.error(f"❌ Error fetching from USASpending.gov: {str(e)}")
            return []

    def _process_award_data(self, item: Dict[str, Any], include_fpds_fields: bool = False) -> Optional[AwardedContract]:
        """Process raw award data into AwardedContract model"""
        try:
            # Extract basic fields
            piid = item.get('Award ID', '')
            if not piid:
                return None
            
            # Parse dates
            award_date = self._parse_date(item.get('Award Date'))
            
            # Get location
            place_of_performance = self._get_location(
                item.get('primary_place_of_performance_city_name'),
                item.get('primary_place_of_performance_state_name')
            )
            
            # Create base award
            award = AwardedContract(
                piid=piid,
                agency=item.get('Awarding Agency', 'Unknown Agency'),
                sub_agency=item.get('Awarding Sub Agency', ''),
                vendor=item.get('Recipient Name', 'Unknown Vendor'),
                title=item.get('Description', 'Contract Award') or f"Contract {piid}",
                award_date=award_date,
                completion_date=None,  # Not available in spending_by_award
                award_amount=float(item.get('Award Amount', 0) or 0),
                total_value=float(item.get('Total Outlays', 0) or 0),
                status=self._determine_status(award_date, None),
                naics_code=item.get('naics_code', ''),
                naics_description=item.get('naics_description', ''),
                psc_code=item.get('product_or_service_code', ''),
                psc_description=item.get('product_or_service_description', ''),
                contract_vehicle=self._determine_vehicle(
                    item.get('Contract Award Type', ''),
                    item.get('Award Type', '')
                ),
                set_aside=item.get('type_set_aside_name', 'None'),
                place_of_performance=place_of_performance,
                competition_type=item.get('extent_competed_name', 'Unknown'),
                number_of_offers=int(item.get('number_of_offers_received', 0) or 0),
                solicitation_id=item.get('solicitation_identifier', ''),
                parent_piid=item.get('parent_award_id', ''),
                award_type=item.get('Award Type', ''),
                fpds_data=item if include_fpds_fields else None
            )
            
            return award
            
        except Exception as e:
            logger.error(f"❌ Error processing award data: {str(e)}")
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug(f"Award data: {json.dumps(item, indent=2)}")
            return None

    def _process_award_detail(self, data: Dict[str, Any], include_fpds_fields: bool = False) -> Optional[AwardedContract]:
        """Process award detail response into AwardedContract"""
        try:
            # The detail endpoint has a different structure
            piid = data.get('id', '')
            if not piid:
                return None
            
            # Extract dates
            award_date = self._parse_date(data.get('date_signed'))
            completion_date = self._parse_date(data.get('potential_end_date'))
            
            # Get location from detailed data
            place_data = data.get('place_of_performance', {})
            place_of_performance = self._get_location(
                place_data.get('city_name'),
                place_data.get('state_code')
            )
            
            # Extract competition info
            competition = data.get('competition', {})
            
            award = AwardedContract(
                piid=piid,
                agency=data.get('awarding_agency', {}).get('toptier_agency', {}).get('name', 'Unknown Agency'),
                sub_agency=data.get('awarding_agency', {}).get('subtier_agency', {}).get('name', ''),
                vendor=data.get('recipient', {}).get('recipient_name', 'Unknown Vendor'),
                title=data.get('description', f"Contract {piid}"),
                award_date=award_date,
                completion_date=completion_date,
                award_amount=float(data.get('base_obligation_amount', 0) or 0),
                total_value=float(data.get('total_obligation', 0) or 0),
                status=self._determine_status(award_date, completion_date),
                naics_code=data.get('naics_code', ''),
                naics_description=data.get('naics_description', ''),
                psc_code=data.get('product_or_service_code', ''),
                psc_description=data.get('psc_description', ''),
                contract_vehicle=self._determine_vehicle(
                    data.get('type_of_contract_pricing', ''),
                    data.get('award_type', '')
                ),
                set_aside=data.get('type_set_aside', 'None'),
                place_of_performance=place_of_performance,
                competition_type=competition.get('extent_competed', 'Unknown'),
                number_of_offers=int(competition.get('number_of_offers_received', 0) or 0),
                solicitation_id=data.get('solicitation_identifier', ''),
                parent_piid=data.get('parent_award', {}).get('award_id', ''),
                award_type=data.get('award_type', ''),
                fpds_data=data if include_fpds_fields else None
            )
            
            return award
            
        except Exception as e:
            logger.error(f"❌ Error processing award detail: {str(e)}")
            return None

    def _determine_status(self, award_date: Optional[datetime], completion_date: Optional[datetime]) -> str:
        """Determine contract status based on dates"""
        if not award_date:
            return "Unknown"
        
        now = datetime.now()
        if completion_date and completion_date < now:
            return "Completed"
        elif award_date > now:
            return "Pending"
        else:
            return "Active"

    def _determine_vehicle(self, contract_type: str, award_type: str) -> str:
        """Determine contract vehicle from type codes"""
        award_type_upper = (award_type or '').upper()
        
        # Check specific award types
        if award_type_upper in ['A', 'E']:  # BPA or BPA Call
            return "BPA"
        elif award_type_upper in ['B']:  # Purchase Order
            return "Purchase Order"
        elif award_type_upper in ['C', 'D']:  # Delivery Order or Definitive Contract
            return "Definitive Contract"
        elif award_type_upper in ['F', 'G', 'H', 'J']:  # Various IDVs
            return "IDIQ"
        
        # Check contract type description
        contract_type_lower = (contract_type or '').lower()
        if 'idiq' in contract_type_lower or 'indefinite' in contract_type_lower:
            return "IDIQ"
        elif 'bpa' in contract_type_lower:
            return "BPA"
        elif 'purchase order' in contract_type_lower:
            return "Purchase Order"
        elif 'definitive' in contract_type_lower:
            return "Definitive Contract"
        elif 'gsa' in contract_type_lower or 'schedule' in contract_type_lower:
            return "GSA Schedule"
        elif 'gwac' in contract_type_lower:
            return "GWAC"
        
        return "Other"

    def _parse_date(self, date_str: Optional[str]) -> Optional[datetime]:
        """Parse date string to datetime"""
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
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue
        
        return None

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
                SELECT piid FROM awards 
                WHERE piid LIKE ? AND cached_at > ?
                ORDER BY award_date DESC
            ''', (f"{cache_key}%", cutoff_time))
            
            piids = [row[0] for row in cursor.fetchall()]
            
            if not piids:
                return None
            
            # Fetch full records
            awards = []
            for piid in piids:
                award = self._get_cached_award(piid)
                if award:
                    awards.append(award)
            
            conn.close()
            return awards if awards else None
            
        except Exception as e:
            logger.error(f"❌ Error getting cached results: {str(e)}")
            return None

    def _get_cached_award(self, piid: str) -> Optional[AwardedContract]:
        """Get single cached award by PIID"""
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            cursor.execute('SELECT * FROM awards WHERE piid = ?', (piid,))
            row = cursor.fetchone()
            conn.close()
            
            if not row:
                return None
            
            # Map row to AwardedContract
            return AwardedContract(
                piid=row[0],
                agency=row[1],
                vendor=row[2],
                title=row[3],
                award_date=self._parse_date(row[4]),
                completion_date=self._parse_date(row[5]),
                award_amount=row[6],
                total_value=row[7],
                status=row[8] if row[8] else "Unknown",
                naics_code=row[9] or '',
                naics_description=row[10] or '',
                psc_code=row[11] or '',
                psc_description=row[12] or '',
                contract_vehicle=row[13] if row[13] else "Other",
                set_aside=row[14] or 'None',
                place_of_performance=row[15] or 'Unknown',
                competition_type=row[16] or 'Unknown',
                number_of_offers=row[17] or 0,
                solicitation_id=row[18] or '',
                parent_piid=row[19] or '',
                award_type=row[20] or ''
            )
            
        except Exception as e:
            logger.error(f"❌ Error getting cached award: {str(e)}")
            return None

    def _cache_results(self, awards: List[AwardedContract], cache_key: str):
        """Cache search results"""
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            for award in awards:
                cursor.execute('''
                    INSERT OR REPLACE INTO awards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    award.piid,
                    award.agency,
                    award.vendor,
                    award.title,
                    award.award_date.isoformat() if award.award_date else None,
                    award.completion_date.isoformat() if award.completion_date else None,
                    award.award_amount,
                    award.total_value,
                    award.status,
                    award.naics_code,
                    award.naics_description,
                    award.psc_code,
                    award.psc_description,
                    award.contract_vehicle,
                    award.set_aside,
                    award.place_of_performance,
                    award.competition_type,
                    award.number_of_offers,
                    award.solicitation_id,
                    award.parent_piid,
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
                    'vehicle_distribution': {},
                    'set_aside_distribution': {}
                }
            
            # Calculate analytics
            total_value = sum(a.award_amount for a in awards)
            
            # Top vendors by award count and value
            vendor_stats = {}
            for award in awards:
                if award.vendor not in vendor_stats:
                    vendor_stats[award.vendor] = {'count': 0, 'value': 0}
                vendor_stats[award.vendor]['count'] += 1
                vendor_stats[award.vendor]['value'] += award.award_amount
            
            top_vendors = sorted(
                [{'name': k, **v} for k, v in vendor_stats.items()],
                key=lambda x: x['value'],
                reverse=True
            )[:10]
            
            # Top agencies
            agency_stats = {}
            for award in awards:
                if award.agency not in agency_stats:
                    agency_stats[award.agency] = {'count': 0, 'value': 0}
                agency_stats[award.agency]['count'] += 1
                agency_stats[award.agency]['value'] += award.award_amount
            
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
            
            # Vehicle distribution
            vehicle_stats = {}
            for award in awards:
                vehicle = award.contract_vehicle
                if vehicle not in vehicle_stats:
                    vehicle_stats[vehicle] = 0
                vehicle_stats[vehicle] += 1
            
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
                'vehicle_distribution': vehicle_stats,
                'set_aside_distribution': setaside_stats
            }
            
        except Exception as e:
            logger.error(f"❌ Error generating analytics: {str(e)}")
            return {}

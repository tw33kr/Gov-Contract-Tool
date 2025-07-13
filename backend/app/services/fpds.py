import requests
import sqlite3
from datetime import datetime, date, timedelta
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
        # Use the correct USASpending.gov endpoints
        self.base_url = "https://api.usaspending.gov/api/v2/search/spending_by_award"
        self.transaction_url = "https://api.usaspending.gov/api/v2/search/spending_by_transaction"
        # New endpoint for award details
        self.award_url = "https://api.usaspending.gov/api/v2/awards/"
        # Detailed transaction endpoint
        self.detailed_transaction_url = "https://api.usaspending.gov/api/v2/award/transaction/contract/"
        # USASpending API constraints
        self.earliest_searchable_date = "2007-10-01"
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
        piid = str(award.get('piid', '')).upper()
        search_upper = search_term.upper()
        
        # Remove common delimiters for comparison
        award_id_clean = award_id.replace('-', '').replace(' ', '')
        piid_clean = piid.replace('-', '').replace(' ', '')
        search_clean = search_upper.replace('-', '').replace(' ', '')
        
        # Exact match = 100% confidence
        if award_id == search_upper or award_id_clean == search_clean:
            return 1.0
        if piid == search_upper or piid_clean == search_clean:
            return 1.0
        
        # Check if one contains the other
        if search_upper in award_id or search_clean in award_id_clean:
            return 0.9
        if search_upper in piid or search_clean in piid_clean:
            return 0.9
        if award_id in search_upper or award_id_clean in search_clean:
            return 0.85
        if piid in search_upper or piid_clean in search_clean:
            return 0.85
        
        # Use sequence matching for fuzzy comparison
        similarity_award = SequenceMatcher(None, search_clean, award_id_clean).ratio()
        similarity_piid = SequenceMatcher(None, search_clean, piid_clean).ratio()
        similarity = max(similarity_award, similarity_piid)
        
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
            # If contract number detected, try specific PIID search first
            if contract_number:
                logger.info(f"🎯 Detected contract number, trying specific PIID search: {contract_number}")
                piid_results = self._search_by_piid(contract_number)
                if piid_results:
                    logger.info(f"✅ Found {len(piid_results)} results for PIID: {contract_number}")
                    return piid_results
                else:
                    logger.info(f"⚠️ No results found for PIID search, falling back to keyword search")
            
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
    
    def _search_by_piid(self, piid: str) -> List[Dict[str, Any]]:
        """
        Search specifically by PIID using the correct USASpending API approach
        """
        try:
            # USASpending API requires specific format for PIID search
            payload = {
                "filters": {
                    "award_type_codes": ["A", "B", "C", "D"],
                    "award_ids": [piid.upper()],  # Use award_ids filter for PIID
                    "time_period": [{
                        "start_date": self.earliest_searchable_date,  # Use class constant
                        "end_date": datetime.now().strftime("%Y-%m-%d")
                    }]
                },
                "fields": [
                    "Award ID",
                    "piid",
                    "Recipient Name", 
                    "Award Amount",
                    "Total Outlays",
                    "Start Date",
                    "End Date",
                    "Awarding Agency",
                    "Awarding Sub Agency",
                    "Award Type",
                    "Description",
                    "generated_internal_id"
                ],
                "page": 1,
                "limit": 10,
                "sort": "Award Amount",
                "order": "desc"
            }
            
            logger.info(f"📡 PIID-specific search request to USASpending API")
            
            response = requests.post(
                self.base_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Federal-Contract-Research-Tool/1.0"
                },
                timeout=60
            )
            
            if response.status_code == 200:
                data = response.json()
                awards_data = data.get('results', [])
                
                if awards_data:
                    processed_awards = []
                    for award in awards_data:
                        processed_award = self._process_award_data(award)
                        if processed_award:
                            processed_awards.append(processed_award)
                    return processed_awards
                    
            return []
            
        except Exception as e:
            logger.error(f"❌ Error in PIID search: {str(e)}")
            return []
    
    def _get_generated_id_for_piid(self, contract_id: str) -> Optional[str]:
        """
        Get the generated_internal_id for a given PIID
        This is step 1 of the two-step process for getting detailed transactions
        """
        logger.info(f"🔍 Step 1: Getting generated_internal_id for PIID: {contract_id}")
        
        # Search for the award to get its generated_internal_id
        awards = self._search_by_piid(contract_id)
        
        if awards and len(awards) > 0:
            award = awards[0]
            generated_id = award.get('generated_internal_id')
            if generated_id:
                logger.info(f"✅ Found generated_internal_id: {generated_id}")
                return generated_id
            else:
                logger.warning(f"⚠️ Award found but no generated_internal_id present")
        else:
            logger.warning(f"⚠️ No award found for PIID: {contract_id}")
        
        return None
    
    def _get_detailed_transactions(self, generated_id: str) -> List[Dict[str, Any]]:
        """
        Get detailed transaction history using the generated_internal_id
        This is step 2 of the two-step process
        Properly handles pagination to get ALL transactions
        """
        logger.info(f"🔍 Step 2: Getting detailed transactions for generated_id: {generated_id}")
        
        all_transactions = []
        page = 1
        has_next = True
        max_pages = 100  # Safety limit to prevent infinite loops
        
        while has_next and page <= max_pages:
            try:
                # Build the URL with the generated_id
                url = f"{self.detailed_transaction_url}{generated_id}/"
                
                # API requires these parameters in the URL, not as query params
                params = {
                    "page": page,
                    "limit": 10  # API limit is 10 per page
                }
                
                logger.info(f"📡 Fetching page {page} from: {url}")
                
                response = requests.get(
                    url,
                    params=params,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "Federal-Contract-Research-Tool/1.0"
                    },
                    timeout=60
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Extract transactions from the response
                    transactions = data.get('results', [])
                    if transactions:
                        all_transactions.extend(transactions)
                        logger.info(f"📋 Page {page}: Found {len(transactions)} transactions")
                    
                    # Check if there's a next page
                    page_metadata = data.get('page_metadata', {})
                    has_next = page_metadata.get('has_next_page', False)
                    total = page_metadata.get('total', 0)
                    
                    logger.info(f"📊 Page metadata: has_next={has_next}, total={total}, current_count={len(all_transactions)}")
                    
                    if has_next:
                        page += 1
                    else:
                        logger.info(f"✅ Reached last page. Total transactions fetched: {len(all_transactions)}")
                else:
                    logger.error(f"❌ Error fetching page {page}: {response.status_code}")
                    logger.error(f"Response: {response.text[:500]}")
                    break
                    
            except Exception as e:
                logger.error(f"❌ Error fetching detailed transactions page {page}: {str(e)}")
                break
        
        if page > max_pages:
            logger.warning(f"⚠️ Reached maximum page limit ({max_pages}). Total transactions fetched: {len(all_transactions)}")
        
        return all_transactions
    
    def get_contract_transactions(self, contract_id: str) -> List[Dict[str, Any]]:
        """
        Get detailed transaction history for a specific contract
        Uses a two-step process:
        1. Get the generated_internal_id for the PIID
        2. Use the generated_internal_id to fetch detailed transactions
        
        Args:
            contract_id: The contract ID (PIID) to get transactions for
            
        Returns:
            List of transaction dictionaries
        """
        logger.info(f"📊 Fetching transaction history for contract: {contract_id}")
        
        try:
            # Step 1: Get the generated_internal_id
            generated_id = self._get_generated_id_for_piid(contract_id)
            
            if not generated_id:
                logger.error(f"❌ Could not find generated_internal_id for PIID: {contract_id}")
                # Fall back to base award info
                return self._get_base_award_info(contract_id)
            
            # Step 2: Get detailed transactions using the generated_internal_id
            transactions_data = self._get_detailed_transactions(generated_id)
            
            if not transactions_data:
                logger.warning(f"⚠️ No detailed transactions found for generated_id: {generated_id}")
                return self._get_base_award_info(contract_id)
            
            logger.info(f"✅ Successfully fetched {len(transactions_data)} detailed transactions")
            
            # Process transactions and group by modification number
            mod_dict = {}
            for transaction in transactions_data:
                processed_tx = self._process_detailed_transaction_data(transaction)
                if processed_tx:
                    mod_num = processed_tx['mod_number']
                    
                    # Keep only the latest/highest transaction for each modification number
                    if mod_num in mod_dict:
                        existing = mod_dict[mod_num]
                        # Compare by date first, then by amount if dates are equal
                        if (processed_tx['award_date'] > existing['award_date'] or 
                            (processed_tx['award_date'] == existing['award_date'] and 
                             (processed_tx.get('award_amount', 0) or 0) > (existing.get('award_amount', 0) or 0))):
                            mod_dict[mod_num] = processed_tx
                    else:
                        mod_dict[mod_num] = processed_tx
            
            # Convert to list
            processed_transactions = list(mod_dict.values())
            
            # Sort modifications properly (BASE first, then P00001, P00002, etc.)
            def sort_key(mod):
                if mod['mod_number'] == 'BASE':
                    return (0, 0)
                else:
                    # Extract number from P00001 format
                    match = re.match(r'P(\d+)', mod['mod_number'])
                    if match:
                        return (1, int(match.group(1)))
                    return (2, mod['mod_number'])
            
            processed_transactions.sort(key=sort_key)
            
            # Log the processed transactions
            logger.info(f"📋 Processed {len(processed_transactions)} unique modifications from {len(transactions_data)} total transactions")
            for tx in processed_transactions:
                logger.info(f"  - {tx['mod_number']}: ${tx.get('award_amount', 0):,.2f} on {tx.get('award_date', 'N/A')}")
            
            return processed_transactions
                
        except Exception as e:
            logger.error(f"❌ Error fetching transactions: {str(e)}")
            return []
    
    def _process_detailed_transaction_data(self, transaction: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Process raw transaction data from the detailed transaction endpoint
        """
        try:
            # Extract modification number
            mod_number = (
                transaction.get("modification_number") or 
                transaction.get("Modification Number") or 
                "0"
            )
            
            # Convert modification number to expected format
            if mod_number == "0" or mod_number == "00" or mod_number == "":
                mod_number = "BASE"
            else:
                # Ensure mod_number is padded to 5 digits
                try:
                    mod_num_int = int(mod_number)
                    mod_number = f"P{mod_num_int:05d}"
                except ValueError:
                    # If it's not a pure number, use as-is with P prefix
                    mod_number = f"P{mod_number}"
            
            # Extract action date
            action_date = self._parse_date(
                transaction.get("action_date") or 
                transaction.get("Action Date")
            )
            
            # Extract obligation amount - this is the individual transaction amount
            obligation = None
            for amount_field in [
                "federal_action_obligation",
                "Federal Action Obligation", 
                "Action Obligation",
                "action_obligation"
            ]:
                if transaction.get(amount_field) is not None:
                    try:
                        obligation = float(transaction[amount_field])
                        break
                    except (ValueError, TypeError):
                        continue
            
            # Extract current total value (cumulative)
            total_value = None
            for value_field in [
                "current_total_value_of_award",
                "Current Total Value of Award",
                "total_obligated_amount",
                "Total Obligated Amount"
            ]:
                if transaction.get(value_field) is not None:
                    try:
                        total_value = float(transaction[value_field])
                        break
                    except (ValueError, TypeError):
                        continue
            
            description = (
                transaction.get("description") or
                transaction.get("Description") or 
                transaction.get("action_type_description") or
                transaction.get("Action Type Description") or
                "No description available"
            )
            
            action_type = (
                transaction.get("action_type") or 
                transaction.get("Action Type") or
                transaction.get("action_type_description") or
                "Unknown"
            )
            
            return {
                "mod_number": mod_number,
                "award_date": action_date,
                "award_amount": obligation,  # Individual transaction amount
                "total_value": total_value,  # Cumulative total after this transaction
                "description": description,
                "action_type": action_type,
                "awarding_agency": transaction.get("awarding_agency_name") or transaction.get("Awarding Agency"),
                "recipient_name": transaction.get("recipient_name") or transaction.get("Recipient Name")
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing detailed transaction data: {str(e)}")
            logger.error(f"Transaction data: {json.dumps(transaction, indent=2)[:500]}")
            return None
    
    def _get_base_award_info(self, contract_id: str) -> List[Dict[str, Any]]:
        """Get base award information when detailed transactions are not available"""
        try:
            logger.info(f"🔄 Getting base award info for {contract_id}")
            
            # Search for the award first
            awards = self._search_by_piid(contract_id)
            
            if awards:
                award = awards[0]
                # Create base transaction from award data
                base_tx = {
                    "mod_number": "BASE",
                    "award_date": award.get("start_date"),
                    "award_amount": award.get("award_amount", 0),
                    "total_value": award.get("award_amount", 0),
                    "description": award.get("description", "Base Award"),
                    "action_type": "Base Award",
                    "awarding_agency": award.get("awarding_agency"),
                    "recipient_name": award.get("recipient_name")
                }
                logger.info(f"✅ Created base transaction from award data")
                return [base_tx]
            
            return []
            
        except Exception as e:
            logger.error(f"❌ Error getting base award info: {str(e)}")
            return []
    
    def _process_transaction_data(self, transaction: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process raw transaction data from USASpending API"""
        try:
            # Extract modification number
            mod_number = (
                transaction.get("modification_number") or 
                transaction.get("Modification Number") or 
                "0"
            )
            
            # Convert modification number to expected format
            if mod_number == "0" or mod_number == "00" or mod_number == "":
                mod_number = "BASE"
            else:
                mod_number = f"P{mod_number.zfill(5)}"
            
            # Extract action date
            action_date = self._parse_date(
                transaction.get("action_date") or 
                transaction.get("Action Date")
            )
            
            # Extract obligation amount (this is the amount for THIS specific transaction)
            obligation = None
            for amount_field in [
                "federal_action_obligation",
                "Federal Action Obligation",
                "Action Obligation"
            ]:
                if transaction.get(amount_field) is not None:
                    try:
                        obligation = float(transaction[amount_field])
                        break
                    except (ValueError, TypeError):
                        continue
            
            # Extract total value (this is the cumulative total after this transaction)
            total_value = None
            for value_field in [
                "current_total_value_of_award",
                "Current Total Value of Award",
                "total_obligated_amount",
                "Total Obligated Amount"
            ]:
                if transaction.get(value_field) is not None:
                    try:
                        total_value = float(transaction[value_field])
                        break
                    except (ValueError, TypeError):
                        continue
            
            description = (
                transaction.get("transaction_description") or
                transaction.get("description") or 
                transaction.get("Description") or 
                transaction.get("action_type_description") or
                transaction.get("Transaction Description") or
                "No description available"
            )
            
            action_type = (
                transaction.get("action_type_description") or 
                transaction.get("Action Type") or
                transaction.get("action_type") or
                "Unknown"
            )
            
            return {
                "mod_number": mod_number,
                "award_date": action_date,
                "award_amount": obligation,  # Individual transaction amount
                "total_value": total_value,   # Cumulative total
                "description": description,
                "action_type": action_type,
                "awarding_agency": transaction.get("awarding_agency_name") or transaction.get("Awarding Agency"),
                "recipient_name": transaction.get("recipient_name") or transaction.get("Recipient Name")
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing transaction data: {str(e)}")
            logger.error(f"Transaction data: {json.dumps(transaction, indent=2)[:500]}")
            return None
    
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
                "piid",
                "Recipient Name", 
                "Award Amount",
                "Total Outlays",
                "Start Date",
                "End Date",
                "Awarding Agency",
                "Awarding Sub Agency",
                "Award Type",
                "Description",
                "generated_internal_id",
                "def_codes",
                "COVID-19 Obligations",
                "COVID-19 Outlays",
                "Infrastructure Obligations",
                "Infrastructure Outlays"
            ],
            "page": 1,
            "limit": min(limit, 100),  # USASpending API limits
            "sort": "Award Amount",
            "order": "desc"
        }
        
        # Only use keywords if NOT a contract number and NOT empty
        # For blank searches, we want to return all recent awards
        if keywords and keywords.strip() and keywords.lower() not in ['none', ''] and not contract_number:
            payload["keywords"] = [keywords.strip()]
            logger.info(f"🔍 Using keywords parameter: {keywords}")
        elif not keywords or not keywords.strip():
            logger.info(f"📋 Blank search - returning recent awards without keyword filter")
        
        return payload
    
    def _validate_date(self, date_str: Optional[str], is_start_date: bool = True) -> Optional[str]:
        """
        Validate and adjust dates to meet USASpending API constraints
        
        Args:
            date_str: Date string in YYYY-MM-DD format
            is_start_date: Whether this is a start date (True) or end date (False)
            
        Returns:
            Validated date string or None
        """
        if not date_str:
            return None
            
        try:
            # Parse the date
            parsed_date = datetime.strptime(date_str, "%Y-%m-%d")
            
            # Check against API constraints
            earliest_date = datetime.strptime(self.earliest_searchable_date, "%Y-%m-%d")
            
            if parsed_date < earliest_date:
                logger.warning(f"⚠️ Date {date_str} is before API limit. Adjusting to {self.earliest_searchable_date}")
                return self.earliest_searchable_date
            
            # Don't allow future dates for end date
            if not is_start_date and parsed_date > datetime.now():
                return datetime.now().strftime("%Y-%m-%d")
                
            return date_str
            
        except ValueError:
            logger.error(f"❌ Invalid date format: {date_str}")
            return None
    
    def _build_filters(self, keywords: Optional[str], awarding_agency: Optional[str], 
                      award_date_from: Optional[str], award_date_to: Optional[str],
                      contract_number: Optional[str] = None) -> Dict[str, Any]:
        """
        Build the filters object according to USASpending API specification
        """
        filters = {}
        
        # If contract number detected, use award_ids filter
        if contract_number:
            filters["award_ids"] = [contract_number.upper()]
            logger.info(f"🔍 Using PIID filter for contract number: {contract_number}")
        
        # Add agency filter only if provided and not empty
        if awarding_agency and awarding_agency.strip() and awarding_agency.lower() not in ['none', '', 'all']:
            filters["agencies"] = [{
                "type": "awarding",
                "tier": "toptier",
                "name": awarding_agency.strip()
            }]
            logger.info(f"🏛️ Adding agency filter: {awarding_agency}")
        
        # Add time period filter with proper validation
        if contract_number:
            # For contract searches, use wider date range but within API limits
            filters["time_period"] = [{
                "start_date": self.earliest_searchable_date,
                "end_date": datetime.now().strftime("%Y-%m-%d")
            }]
            logger.info(f"📅 Using extended time period for contract search (from {self.earliest_searchable_date})")
        elif award_date_from or award_date_to:
            # Validate and adjust dates
            if not award_date_from:
                # Default to 90 days ago if no from date
                award_date_from = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
            else:
                # Validate the from date
                award_date_from = self._validate_date(award_date_from, is_start_date=True)
                if not award_date_from:
                    award_date_from = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
            
            if not award_date_to:
                award_date_to = datetime.now().strftime("%Y-%m-%d")
            else:
                # Validate the to date
                award_date_to = self._validate_date(award_date_to, is_start_date=False)
                if not award_date_to:
                    award_date_to = datetime.now().strftime("%Y-%m-%d")
            
            filters["time_period"] = [{
                "start_date": award_date_from,
                "end_date": award_date_to
            }]
            logger.info(f"📅 Adding time period filter: {award_date_from} to {award_date_to}")
        else:
            # Default to last 90 days for blank searches
            filters["time_period"] = [{
                "start_date": (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d"), 
                "end_date": datetime.now().strftime("%Y-%m-%d")
            }]
            logger.info("📅 Using default time period: last 90 days")
        
        # Always include contract award types - USE ONLY VALID VALUES
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
            # Extract PIID first as it's the most important
            piid = (
                award.get("piid") or 
                award.get("PIID") or 
                award.get("Award ID") or 
                award.get("award_id") or
                ""
            )
            
            award_id = piid or award.get("generated_internal_id") or f"award-{id(award)}"
            
            # Extract generated_internal_id - this is critical for transaction lookups
            generated_internal_id = award.get("generated_internal_id")
            
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
                if award.get(amount_field) is not None:
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
                "piid": piid,  # Store PIID for transaction lookups
                "generated_internal_id": generated_internal_id,  # Store for detailed transaction lookups
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

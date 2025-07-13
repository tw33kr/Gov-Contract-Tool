# FPDS Service Fix - Use internal_id Field

## Problem
The USASpending API returns `internal_id` not `generated_internal_id` for the contract lookup.

## Solution
Update the `_get_generated_id_for_piid` method to check for both fields:

1. First try `generated_internal_id` 
2. Then try `internal_id` (which is what the API actually returns)
3. Also request both fields in the API call

## Code Changes

In `backend/app/services/fpds.py`, update the `_get_generated_id_for_piid` method:

```python
def _get_generated_id_for_piid(self, contract_id: str) -> Optional[str]:
    """
    Get the generated_internal_id or internal_id for a given PIID using the search/awards endpoint
    This is step 1 of the two-step process for getting detailed transactions
    """
    logger.info(f"🔍 Step 1: Getting internal ID for PIID: {contract_id}")
    
    try:
        # Try multiple approaches to find the internal ID
        # Approach 1: Use piid filter
        payload = {
            "filters": {
                "piid": [contract_id.upper()]
            },
            "fields": ["generated_internal_id", "internal_id", "Award ID", "piid", "recipient_name"],
            "limit": 1,
            "page": 1
        }
        
        logger.info(f"📡 POST to: {self.search_awards_url}")
        logger.info(f"📋 Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(
            self.search_awards_url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Federal-Contract-Research-Tool/1.0"
            },
            timeout=60
        )
        
        logger.info(f"📊 Step 1 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            results = data.get('results', [])
            
            # Debug log the full response
            logger.info(f"🔍 Step 1 Response: {json.dumps(data, indent=2)[:1000]}")
            
            if results and len(results) > 0:
                result = results[0]
                
                # Try to get internal ID from multiple possible fields
                internal_id = None
                
                # First try generated_internal_id
                if result.get('generated_internal_id'):
                    internal_id = result.get('generated_internal_id')
                    logger.info(f"✅ Found generated_internal_id: {internal_id}")
                # Then try internal_id
                elif result.get('internal_id'):
                    internal_id = str(result.get('internal_id'))  # Convert to string if number
                    logger.info(f"✅ Found internal_id: {internal_id}")
                
                if internal_id:
                    logger.info(f"📋 Award details: PIID={result.get('Award ID')}, Recipient={result.get('recipient_name')}")
                    return internal_id
                else:
                    logger.warning(f"⚠️ Award found but no internal ID in response: {result}")
                    
                    # Try approach 2: Use Award ID filter
                    return self._try_award_id_search(contract_id)
            else:
                logger.warning(f"⚠️ No results found for PIID: {contract_id}")
                # Try approach 2
                return self._try_award_id_search(contract_id)
        else:
            logger.error(f"❌ Error getting internal ID: {response.status_code}")
            logger.error(f"Response: {response.text[:500]}")
            
    except Exception as e:
        logger.error(f"❌ Error in _get_generated_id_for_piid: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
    
    return None
```

Also add the `_try_award_id_search` fallback method:

```python
def _try_award_id_search(self, contract_id: str) -> Optional[str]:
    """
    Alternative approach: search using award_ids filter
    """
    logger.info(f"🔄 Trying alternative search with award_ids filter")
    
    try:
        payload = {
            "filters": {
                "award_ids": [contract_id.upper()],
                "award_type_codes": ["A", "B", "C", "D"]
            },
            "fields": ["generated_internal_id", "internal_id", "Award ID", "piid"],
            "limit": 1,
            "page": 1
        }
        
        response = requests.post(
            self.search_awards_url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Federal-Contract-Research-Tool/1.0"
            },
            timeout=60
        )
        
        if response.status_code == 200:
            data = response.json()
            results = data.get('results', [])
            
            if results:
                result = results[0]
                # Try both field names
                internal_id = result.get('generated_internal_id') or str(result.get('internal_id', ''))
                if internal_id:
                    logger.info(f"✅ Found internal ID via award_ids search: {internal_id}")
                    return internal_id
                    
    except Exception as e:
        logger.error(f"❌ Error in award_ids search: {str(e)}")
        
    return None
```

Also update the `_search_by_piid` method to request `internal_id`:

```python
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
    "internal_id"  # Also request internal_id field
],
```

## Testing
After applying these changes, the transaction fetching should work properly:
1. The API will find the `internal_id` (100847848 in your example)
2. Use that ID to fetch all 11 transactions
3. Display the complete modification history

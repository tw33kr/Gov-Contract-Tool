# Change Log - 7-15-2025 8:00PM EST

## Contract Search API Fix - Proper spending_by_award Endpoint Usage

### Issue Addressed
- Contract searches were failing to find existing contracts (e.g., 36C10B23N10010013)
- The direct PIID search was using incorrect GET request to `/api/v2/awards/{id}/` endpoint
- This endpoint approach was not working for contract lookups in USASpending

### Fix Implemented in fpds.py

1. **Corrected _search_by_direct_piid Method**
   - Changed from GET request to `/api/v2/awards/{id}/` 
   - Now uses POST request to `/api/v2/search/spending_by_award/`
   - Contract number is properly placed in the `award_ids` field within the JSON payload
   - This matches the USASpending API documentation for contract searches

2. **Proper JSON Payload Structure**
   - Builds complete JSON payload with filters, fields, and pagination
   - Places contract number in `filters.award_ids` array as required by the API
   - Includes all necessary fields for comprehensive award data retrieval

### Technical Details
- The USASpending API requires POST requests with JSON payloads for searches
- The `award_ids` field in the filters is the correct place for contract numbers
- This approach aligns with how the API is designed to search for specific awards

### Result
- Contract number searches should now properly query the USASpending database
- Direct PIID search (Strategy 1) now uses the correct API endpoint and method
- Searches for specific contract numbers like 36C10B23N10010013 should return results if they exist in USASpending
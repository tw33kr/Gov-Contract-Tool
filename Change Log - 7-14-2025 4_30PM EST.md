# Change Log - 7-14-2025 4:30PM EST

## Contract Number Search Fix - API Format Issue

### Issue Addressed
- USASpending API was returning 400 error: "Invalid value in 'filters|award_ids'. '{'piid': '36C10B23N10010013'}' is not a valid type (text)"
- Contract number searches were failing due to incorrect award_ids filter format

### Fix Implemented in fpds.py
- Corrected the award_ids filter format in three locations:
  1. `search_awards` method (line 192) - Changed from `[{"piid": contract_number.upper()}]` to `[contract_number.upper()]`
  2. `_search_by_piid` method (line 370) - Applied same fix for PIID-specific searches
  3. `_get_generated_id_for_piid` method (line 426) - Fixed for getting internal IDs

### Technical Details
- USASpending API expects award_ids to be an array of strings, not an array of objects with 'piid' key
- The fix changes the payload structure from:
  ```json
  "award_ids": [{"piid": "36C10B23N10010013"}]
  ```
  to:
  ```json
  "award_ids": ["36C10B23N10010013"]
  ```

### Result
- Contract number searches now work correctly without API errors
- Users can successfully search for specific contracts like "36C10B23N10010013" and receive accurate results
- The exact match filtering logic remains intact, ensuring single precise results for contract numbers
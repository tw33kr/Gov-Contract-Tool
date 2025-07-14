# Change Log - 7-14-2025 8:15AM EST

## Contract Number Search Fix - Missing Required Field

### Issue Addressed
- USASpending API was returning 422 error: "Missing value: 'filters|award_type_codes' is a required field"
- Contract number searches were failing because the award_type_codes filter was missing from the payload

### Fix Implemented in fpds.py
- Added required `award_type_codes` filter to all contract number search methods:
  1. `search_awards` method (line 192) - Added `"award_type_codes": ["A", "B", "C", "D"]` to filters
  2. `_search_by_piid` method (line 370) - Added same required field for PIID-specific searches
  3. `_get_generated_id_for_piid` method (line 426) - Added required field for internal ID lookups

### Technical Details
- USASpending API requires the award_type_codes field in all search requests
- Valid award type codes are:
  - "A": BPA Call
  - "B": Purchase Order  
  - "C": Delivery Order
  - "D": Definitive Contract
- This field must be included even when searching by specific contract numbers

### Result
- Contract number searches now complete successfully without API validation errors
- Users can search for specific contracts and receive accurate results
- All three search methods that use contract numbers are now properly configured
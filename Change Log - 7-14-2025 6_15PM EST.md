# Change Log - 7-14-2025 6:15PM EST

## Contract Search Date Range Fix

### Issue Addressed
- USASpending API was returning 422 error: "start_date falls before the earliest available search date of 2007-10-01"
- Contract searches were using "2000-01-01" as start date, which is not supported by the API
- Searches for contract numbers were failing due to invalid date range

### Fix Implemented in fpds.py
- Updated all contract search methods to use `self.earliest_searchable_date` (2007-10-01) instead of hardcoded "2000-01-01":
  1. `search_awards` method (line 173) - Contract number search date range
  2. `_search_by_piid` method (line 389) - PIID-specific search date range
  3. `_get_generated_id_for_piid` method (line 442) - Internal ID lookup date range

### Technical Details
- The USASpending API only supports searches from October 1, 2007 onwards
- All date ranges now respect the API's earliest_searchable_date constraint
- Date validation remains in place through the `_validate_date` method

### Result
- Contract number searches now work without API errors
- Users can search for contracts from 2007-10-01 to present
- The 422 error has been resolved
- All contract search functionality continues to work as expected with the corrected date range
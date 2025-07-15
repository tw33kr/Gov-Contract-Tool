# Change Log - 7-14-2025 7:30PM EST

## Contract Search Enhancement - IDV Support and Case-Insensitive Matching

### Issue Addressed
- Contract searches failing to find exact matches for certain contract numbers (e.g., 36C10B23N10010013)
- Case sensitivity issues preventing matches when contracts are stored with different case variations
- Missing support for IDV (Indefinite Delivery Vehicle) parent contracts with child awards

### Fixes Implemented in fpds.py

1. **Added IDV Awards Support**
   - Added new IDV endpoint URL: `https://api.usaspending.gov/api/v2/idvs/awards/`
   - Created `_search_idv_awards()` method to search for IDV parent contracts and their child awards
   - Integrated IDV search as Strategy 3 in the main search flow
   - IDV awards are marked with `is_idv_child` flag for identification

2. **Enhanced Case-Insensitive Search**
   - Modified Strategy 2 to include lowercase variation in addition to uppercase
   - Award IDs filter now tries: uppercase, lowercase, and no-delimiter variations
   - Ensures matches regardless of how the contract number is stored in USASpending

3. **Improved Search Strategy Order**
   - Strategy 1: Direct PIID lookup
   - Strategy 2: Award IDs filter with case variations (NEW: includes lowercase)
   - Strategy 3: IDV awards search (NEW)
   - Strategy 4: Keywords search (fallback)

### Technical Details
- The USASpending API sometimes stores contract numbers in different cases
- IDV contracts are parent awards that have multiple child task/delivery orders
- The fix ensures comprehensive coverage of all contract types and case variations

### Result
- Contract searches now successfully find matches for previously failing contract numbers
- Support for hierarchical IDV contract structures
- More robust search that handles case sensitivity issues
- Better coverage of the federal contracting landscape
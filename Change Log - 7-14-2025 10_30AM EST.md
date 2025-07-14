# Change Log - 7-14-2025 10:30AM EST

## Contract Awards Search Fixes

### Fixed Contract Number Search Filtering
- Modified `search_awards()` method in `fpds.py` to properly filter results when searching for contract numbers
- Added confidence score filtering with threshold of 0.7 for PIID searches (line 185-195)
- Implemented fallback filtering with 0.5 threshold for general searches (line 258-270)
- Limited contract number search results to top 10 high-confidence matches
- Ensured exact contract matches are prioritized and returned first

### Fixed Vendor Search Functionality  
- Corrected vendor search implementation in `search_awards()` method
- Added dedicated vendor-only search logic that properly uses `recipient_search_text` filter (line 204-222)
- Ensured vendor_name parameter is correctly passed through the entire search chain
- Fixed parameter mapping in `_build_filters()` to handle vendor searches (line 1067-1070)

### Technical Improvements
- Enhanced confidence calculation to properly score contract number matches
- Improved logging to show when high-confidence filtering is applied
- Added fallback to return top 5 results even when no high-confidence matches found
- Maintained backward compatibility with existing search functionality

These fixes ensure users can reliably search for specific contracts by their PIID and filter awards by vendor name, addressing the critical search functionality issues reported.
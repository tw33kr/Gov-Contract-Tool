# Changelog

All notable changes to the Federal Contract Research Tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2025-07-10 17:45 UTC

### Major Focus: Contractor Intelligence Page Overhaul

**Summary of Instructions Received:**
The user reported widespread API timeout issues across the application but specifically requested focus on getting the Contractor Intelligence page working reliably. The key issue was that the tool routinely failed to find relevant contractor data, while USASpending.gov easily finds complete datasets (e.g., 234 records for "Planned Systems International"). The user emphasized the need for iterative data retrieval within API limits and comprehensive contractor analysis capabilities.

### Added
- **NEW: ContractorService class** (`backend/app/services/contractor_service.py`)
  - Implements proper pagination for large contractor datasets
  - Uses iterative API calls with rate limiting (max 10 pages, 100 records each)
  - Comprehensive caching system for contractor profiles and awards
  - Background refresh logic for stale data (6-hour cache expiry)
  - Extended date range to 2020 for historical contractor analysis

- **NEW: Contractor profile endpoint** (`/api/contractors/{name}/profile`)
  - Previously missing endpoint that frontend was trying to call
  - Returns comprehensive contractor profiles with performance metrics
  - Calculates average award values and years of activity
  - Includes recent awards, primary agencies, and NAICS codes

- **NEW: Contractor test endpoint** (`/api/contractors/test/{name}`)
  - Debug endpoint for troubleshooting specific contractor searches
  - Provides detailed logging and API call information
  - Helps verify functionality for known contractors

- **Enhanced contractor database schema**
  - New `contractor_profiles` table for cached summary data
  - New `contractor_awards` table for detailed award records
  - Proper indexing for fast contractor name and date searches
  - Foreign key relationships for data integrity

### Fixed
- **CRITICAL: Contractor search API timeouts**
  - Previous implementation tried to fetch 1000 awards at once, causing timeouts
  - New implementation uses pagination with 30-second timeouts per page
  - Graceful degradation when API limits are reached
  - Caching prevents repeated expensive API calls

- **CRITICAL: Missing contractor profile endpoint**
  - Frontend was calling `/api/contractors/{name}/profile` which didn't exist
  - Added comprehensive profile endpoint with detailed contractor data
  - Includes performance metrics and historical analysis

- **CRITICAL: Inefficient data retrieval**
  - Now uses `recipient_search_text` filter for targeted contractor searches
  - Implements proper USASpending.gov API pagination
  - Retrieves comprehensive datasets similar to USASpending.gov interface
  - Can handle large datasets like "Planned Systems International" (234 records)

- **Enhanced frontend error handling**
  - Removed localStorage dependency (not supported in Claude.ai artifacts)
  - Added comprehensive error messages with troubleshooting tips
  - Better loading states with progress indicators
  - Detailed console logging for debugging

### Technical Changes

#### Backend Changes:
- **ContractorService.search_contractors()**
  - Uses pagination to retrieve up to 1000 records (10 pages × 100 records)
  - Implements proper rate limiting with 0.5-second delays between pages
  - Uses `recipient_search_text` filter for accurate contractor matching
  - Processes awards into comprehensive contractor profiles
  - Caches results for performance

- **ContractorService._build_contractor_search_payload()**
  - Builds proper USASpending.gov API payloads with pagination
  - Uses extended date range (2020-present) for comprehensive data
  - Includes all relevant fields for contractor analysis
  - Supports both specific contractor searches and general queries

- **ContractorService._process_awards_to_contractors()**
  - Aggregates award data into contractor profiles
  - Tracks total awards, values, agencies, NAICS codes, locations
  - Maintains recent award history (up to 20 per contractor)
  - Calculates date ranges and performance metrics

- **Enhanced API endpoints in contracts.py**
  - Updated `/api/contractors/search` to use new ContractorService
  - Added missing `/api/contractors/{name}/profile` endpoint
  - Added `/api/contractors/test/{name}` for debugging
  - Better error handling and response formatting
  - Detailed logging for troubleshooting

#### Frontend Changes:
- **ContractorSearch.js enhancements**
  - Removed localStorage usage (Claude.ai compatibility)
  - Added test buttons for debugging specific contractors
  - Enhanced error handling with detailed troubleshooting guides
  - Better loading states and progress indicators
  - Improved contractor result display with comprehensive information

- **Enhanced UI/UX**
  - Better formatting for currency and numbers
  - Comprehensive contractor cards with key metrics
  - Test functionality for known contractors
  - Detailed error messages with actionable guidance
  - Progress indicators during data retrieval

### Performance Improvements
- **Caching system**: Contractor profiles cached for 6 hours
- **Pagination**: Prevents API timeouts with manageable chunk sizes
- **Rate limiting**: 0.5-second delays between API calls
- **Smart retrieval**: Stops pagination when sufficient data is found
- **Background refresh**: Updates stale cache data automatically

### Data Quality Improvements
- **Extended date range**: 2020-present for comprehensive historical data
- **Better field mapping**: Handles various USASpending.gov field formats
- **Data validation**: Proper error handling for malformed API responses
- **Comprehensive metrics**: Total values, award counts, agency relationships
- **Timeline tracking**: First and latest award dates for activity analysis

### Testing and Debugging
- **Test endpoints**: Dedicated debugging endpoints for contractor searches
- **Enhanced logging**: Detailed API call logging for troubleshooting
- **Error reporting**: Comprehensive error messages with actionable steps
- **Sample data**: Built-in test contractors for verification
- **Console logging**: Frontend debugging information

### Known Issues Addressed
- ✅ **Contractor search timeouts** - Fixed with pagination
- ✅ **Missing profile endpoint** - Added comprehensive profile API
- ✅ **Inefficient data retrieval** - Implemented proper pagination
- ✅ **Poor error handling** - Enhanced with detailed troubleshooting
- ✅ **LocalStorage incompatibility** - Removed for Claude.ai compatibility

### Remaining Known Issues
- Some USASpending.gov API responses may have inconsistent field names
- Very large contractor datasets (1000+ awards) may still take time to process
- API rate limiting may affect concurrent searches

### Example Contractor Searches Now Supported
- **"Planned Systems International"** - Should find 234+ records
- **"Lockheed Martin"** - Large defense contractor with thousands of awards
- **"Boeing"** - Major aerospace contractor
- **Partial searches** - "Planned Systems" finds variations

### Testing Instructions
1. Navigate to Contractor Intelligence page
2. Try searching for "Planned Systems International"
3. Use test buttons for debugging specific contractors
4. Check backend logs for detailed API call information
5. Verify comprehensive contractor profiles load correctly
6. Test pagination with large contractor datasets

---

## [Previous] - 2025-07-10 16:20 UTC

### Fixed (Previous Session)
- **MAJOR FIX**: Fixed USASpending.gov API integration where awarding agency and keywords were not affecting search results
- Corrected agency filter format to use proper USASpending.gov structure
- Separated keywords parameter from filters
- Improved handling of 'None' string values in search parameters
- Enhanced sample data fallback to properly reflect search parameters
- Extended default date range from 2 months to 6 months for better search results

---

## Project Overview

### Current Architecture
- **Backend**: Python FastAPI application with comprehensive API services
- **Services**: 
  - `sam_gov.py` - Contract opportunities from SAM.gov
  - `fpds.py` - Contract awards from USASpending.gov
  - `contractor_service.py` - **NEW** Comprehensive contractor analysis
- **Frontend**: React application with multiple specialized pages
- **Database**: SQLite with caching for performance optimization

### API Endpoints
- **Opportunities**: `/api/contracts/search` (SAM.gov integration)
- **Awards**: `/api/contracts/search?include_awards=true` (USASpending.gov)
- **Contractors**: `/api/contractors/search` (NEW - with pagination)
- **Contractor Profiles**: `/api/contractors/{name}/profile` (NEW)
- **Testing**: `/api/contractors/test/{name}` (NEW - for debugging)

### Data Sources
- **SAM.gov API**: Contract opportunities (requires API key)
- **USASpending.gov API**: Contract awards and FPDS data (no API key required)
- **Comprehensive datasets**: Up to 1000 records per contractor via pagination

This release specifically addresses the user's request to focus on Contractor Intelligence functionality and get it working reliably with comprehensive data retrieval capabilities similar to USASpending.gov's interface.
# Changelog

All notable changes to the Federal Contract Research Tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2025-07-10 16:20 UTC

### Added
- Created CHANGELOG.md to track project changes
- Initial documentation of the project structure
- Enhanced logging for debugging USASpending.gov API calls
- Better input validation for search parameters

### Fixed
- **MAJOR FIX**: Fixed USASpending.gov API integration where awarding agency and keywords were not affecting search results
- Corrected agency filter format to use proper USASpending.gov structure: `{"type": "awarding", "tier": "toptier", "name": "agency_name"}`
- Separated keywords parameter from filters (USASpending.gov uses a separate "keywords" field at the top level)
- Improved handling of 'None' string values in search parameters
- Enhanced sample data fallback to properly reflect search parameters
- Extended default date range from 2 months to 6 months for better search results

### Technical Changes
- Modified `_build_payload()` method to separate keywords from filters
- Updated `_build_filters()` method with correct agency filter structure
- Improved `_get_sample_awards()` to dynamically reflect search criteria
- Added comprehensive logging for filter construction debugging
- Enhanced input validation to filter out invalid values like "None" strings

### Known Issues
- Some USASpending.gov API responses may have inconsistent field names
- API timeout issues may occur with complex searches (45-second timeout with retry logic)

### Project Structure
- **Backend**: Python FastAPI application
  - SAM.gov integration for contract opportunities
  - USASpending.gov integration for contract awards (FPDS data)
  - SQLite database for caching
  - Services: `sam_gov.py`, `fpds.py`
- **Frontend**: React application
  - Search Opportunities page
  - Contract Awards page  
  - Analytics dashboard
- **Database**: SQLite for local caching of results

### Current Features
- Search federal contract opportunities via SAM.gov API
- View contract awards via USASpending.gov API
- Basic analytics and filtering
- Caching for improved performance
- Real-time data integration
- Advanced search with agency and keyword filtering

### API Integration Details
- **SAM.gov API**: Used for contract opportunities with valid API key
- **USASpending.gov API**: Used for contract awards (FPDS data), no API key required
- **Endpoints**:
  - Opportunities: `https://api.sam.gov/prod/opportunities/v2/search`
  - Awards: `https://api.usaspending.gov/api/v2/search/spending_by_award`

---

## Previous History
This project was developed through iterative conversations and debugging sessions to create a GovWin-like federal contract research tool. The codebase evolved from a basic MVP to include both opportunities and awards data integration.

### Key Development Milestones
1. Initial MVP with SAM.gov opportunities integration
2. Added USASpending.gov awards integration for FPDS data
3. Created React frontend with multiple pages
4. Implemented caching and analytics
5. Fixed critical search filter issues (this release)

### Testing Notes
After applying these fixes, you should see:
- Keyword searches now properly filter award results
- Agency filters now work correctly with USASpending.gov API
- More relevant search results
- Better logging for debugging API calls
- Sample data that reflects your actual search parameters when API calls fail

To test the fixes:
1. Search for awards with specific keywords (e.g., "cybersecurity")
2. Filter by specific agency (e.g., "Department of Defense")
3. Check backend logs to verify filter construction
4. Verify that results match your search criteria
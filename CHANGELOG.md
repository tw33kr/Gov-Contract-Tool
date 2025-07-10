# Changelog

All notable changes to the Federal Contract Research Tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2025-07-10

### Added
- Created CHANGELOG.md to track project changes
- Initial documentation of the project structure

### Fixed
- Fixed USASpending.gov API integration to properly handle awarding agency and keywords filters
- Improved error handling and filter validation in FPDS service
- Enhanced logging for better debugging of search parameters

### Known Issues
- Some USASpending.gov API responses may have inconsistent field names
- Sample data fallback may not reflect actual search parameters

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

---

## Previous History
This project was developed through iterative conversations and debugging sessions to create a GovWin-like federal contract research tool. The codebase evolved from a basic MVP to include both opportunities and awards data integration.
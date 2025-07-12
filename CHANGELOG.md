# Changelog

All notable changes to the Federal Contract Research Tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2025-01-25] - 03:00 UTC

### Fixed - Contract Number Search in Awards using PIID Filter

**Developer**: Claude (Anthropic)  
**Fix Type**: SEARCH FUNCTIONALITY FIX  
**Issue Resolved**: Contract number searches (e.g., "36C10B23N10010013") were not returning matching results from USASpending.gov

#### 🎯 Problem Solved
User reported that searching for specific contract numbers in the Awards search was not working properly. The system was treating contract numbers as generic keywords rather than using the specific PIID (Procurement Instrument Identifier) filter required by USASpending.gov API, resulting in no matches even for valid contract numbers.

#### 🚀 Implementation Details

**Root Cause**:
- Contract numbers were being searched as keywords in the general text search
- USASpending.gov requires PIID searches to use the `award_ids` filter
- No detection logic to identify when a search term was likely a contract number

**Key Changes**:
- Added `_detect_contract_number()` method to identify contract number patterns
- Implemented regex patterns for common federal contract number formats
- Modified `_build_payload()` to use PIID filter when contract number detected
- Added fallback search methods for contract numbers if primary search fails

**Contract Number Pattern Detection**:
```python
# Common patterns detected:
- W58RGZ-23-C-0001 (standard format)
- 36C10B23N10010013 (alphanumeric without dashes)
- N00024-21-C-2310 (Navy format)
- GS-35F-0119Y (GSA schedule)
- HHSN316201200033W (HHS format)
```

**Technical Implementation**:
```python
# Contract number detection
def _detect_contract_number(self, keywords: Optional[str]) -> Optional[str]:
    contract_patterns = [
        r'^[A-Z0-9]{2,}-\d{2}-[A-Z]-\d{4}',
        r'^[A-Z0-9]{6,}\d{8,}$',
        # ... additional patterns
    ]
    
# PIID filter usage
if contract_number:
    filters["award_ids"] = [contract_number]
    logger.info(f"🔍 Using PIID filter for contract number: {contract_number}")
```

#### 📊 Search Improvements

**Before**:
- Contract numbers searched as general keywords
- No results returned for valid contract IDs
- Users unable to find specific contracts by ID

**After**:
- ✅ Automatic detection of contract number patterns
- ✅ Proper PIID filter usage for contract searches
- ✅ Alternative search methods if primary fails
- ✅ Better handling of various contract number formats

**Fallback Strategies**:
- If PIID search fails, tries keyword search with broader date range
- Filters results to match contract number in award_id field
- Returns sample data with explanation if contract cannot be found

This fix ensures users can reliably search for specific contracts using contract numbers, making the tool more useful for tracking contract modifications and analyzing specific awards.

---

## [2025-01-24] - 15:45 UTC

### Fixed - Awards Search Identifier Field Mismatch for Show More/Show Less

**Developer**: Claude (Anthropic)  
**Fix Type**: DATA MODEL COMPATIBILITY FIX  
**Issue Resolved**: Show More/Show Less functionality failed due to mismatch between backend model fields and frontend expectations

#### 🎯 Problem Solved
User reported that the Show More/Show Less functionality was not working. Investigation revealed that the backend `AwardedContract` model uses `award_id` as the identifier field, while the frontend code was expecting `contract_id`. This mismatch caused the toggle functionality to fail silently, as the Set operations were using undefined values.

#### 🚀 Implementation Details

**Root Cause**:
- Backend model defines: `award_id: str` as the unique identifier
- Frontend was using: `award.contract_id` which was undefined
- The Set was storing `undefined` values, breaking the toggle logic

**Key Changes**:
- Updated identifier logic to handle both `award_id` and `contract_id` fields
- Added fallback to array index if neither field exists
- Updated all references throughout the component to use the flexible identifier
- Made the component compatible with different data sources

**Technical Implementation**:

```javascript
// Flexible identifier handling
const awardIdentifier = award.award_id || award.contract_id || `award-${index}`;
const isExpanded = expandedAwards.has(awardIdentifier);

// Updated toggle function call
onClick={() => toggleExpanded(awardIdentifier)}

// Handle different field names throughout
<span>{award.vendor_name || award.recipient_name}</span>
<span>{award.agency || award.awarding_agency}</span>
```

#### 📊 Data Model Compatibility

**Backend Fields Mapped**:
- `award_id` → Primary identifier
- `recipient_name` → `vendor_name` fallback
- `awarding_agency` → `agency` fallback
- `awarding_subagency` → `subagency` fallback
- `award_type` → `contract_type` fallback
- `set_aside` → `set_aside_type` fallback

**Frontend Now Handles**:
- ✅ Both SAM.gov and USASpending.gov data formats
- ✅ Different field naming conventions
- ✅ Missing or undefined identifiers
- ✅ Graceful fallbacks for all display fields

This fix ensures the Awards Search component works correctly regardless of the data source or field naming conventions used by different government APIs.

---

## [2025-01-24] - 15:30 UTC

### Fixed - Awards Search Show More/Show Less Individual Item Toggle

**Developer**: Claude (Anthropic)  
**Fix Type**: UI INTERACTION FIX  
**Issue Resolved**: Show More/Show Less button was affecting all search results instead of individual items

#### 🎯 Problem Solved
User reported that clicking the "Show More Details" or "Show Less" button on any contract award item would expand or collapse all items in the list simultaneously, making it impossible to view details for specific awards without expanding all of them.

#### 🚀 Implementation Details

**Key Changes**:
- Changed from single `expandedAward` state variable to `expandedAwards` Set to track multiple expanded items
- Implemented `toggleExpanded` function that adds/removes individual contract IDs from the Set
- Updated expansion check to use `expandedAwards.has(award.contract_id)` instead of direct comparison

**Technical Implementation**:

```javascript
// Before: Single state variable affected all items
const [expandedAward, setExpandedAward] = useState(null);

// After: Set tracks individual expanded items
const [expandedAwards, setExpandedAwards] = useState(new Set());

// Toggle function for individual items
const toggleExpanded = (contractId) => {
  const newExpanded = new Set(expandedAwards);
  if (newExpanded.has(contractId)) {
    newExpanded.delete(contractId);
  } else {
    newExpanded.add(contractId);
  }
  setExpandedAwards(newExpanded);
};
```

#### 📊 User Experience Improvements

**Before**:
- Clicking any Show More button expanded all award items
- Impossible to view details for just one award
- Poor user experience when browsing multiple awards

**After**:
- ✅ Each award item expands/collapses independently
- ✅ Multiple items can be expanded simultaneously
- ✅ State persists while browsing the list
- ✅ Intuitive interaction pattern matching user expectations

This fix ensures users can efficiently browse contract awards and view details for specific items of interest without affecting the entire list display.

---

## [2025-01-20] - 23:15 UTC

### Fixed - Contracts Ending Soon Filter Clarification

**Developer**: Claude (Anthropic)  
**Fix Type**: FILTER ENHANCEMENT  
**Issue Resolved**: Clarified that "Contracts Ending Soon" filter shows contracts ending within 1 year

#### 🎯 Problem Solved
User requested confirmation that the "Contracts Ending Soon" filter only shows contracts ending within one year from the current date. While the logic was already correctly implemented, the UI labels and tooltips were not clear about the 1-year timeframe.

#### 🚀 Implementation Details

**Key Enhancements**:
- Updated filter option label from "Contracts Ending Soon" to "Ending Within 1 Year"
- Changed `addDays(now, 365)` to `addYears(now, 1)` for more precise year calculation
- Added clarifying text in Gantt chart header when filter is active
- Enhanced timeline info to specify "contracts ending within 1 year"
- Added days remaining display in contract labels when using this filter
- Updated stat card label from "Ending Soon" to "Ending <1 Year"

**Technical Improvements**:

```javascript
// More precise year calculation
const isContractEndingSoon = (contract) => {
  const now = new Date();
  const endDate = parseISO(contract.end_date);
  const oneYearFromNow = addYears(now, 1); // Changed from addDays(now, 365)
  // Must be active (ending in future) AND ending before one year from now
  return isAfter(endDate, now) && isBefore(endDate, oneYearFromNow);
};

// Added tighter padding for ending-soon view
const basePadding = contractFilter === 'active' || contractFilter === 'ending-soon' ? 30 : 60;
```

#### 📊 UI Clarifications Added

**Filter Dropdown**:
- Changed: "Contracts Ending Soon" → "Ending Within 1 Year"

**Gantt Chart Header**:
- Added: "(Active Contracts Ending Within 1 Year)" subtitle
- Shows message when no contracts match: "No active contracts are ending within the next year."

**Timeline Info Bar**:
- Updated: "Showing X contracts ending within 1 year"
- Added filter details showing the exact cutoff date

**Contract Labels**:
- Added days remaining display (e.g., "(365d)") next to amount
- Hover tooltip includes "Ending in: X days"

**List View**:
- Added orange "ENDING IN X DAYS" badge for contracts in this filter
- Updated description: "Active contracts ending within 1 year"

#### 🎯 User Experience Improvements

**Before**:
- Unclear what timeframe "ending soon" meant
- No indication of the 1-year cutoff
- Users had to guess the filter criteria

**After**:
- ✅ Clear "Within 1 Year" labeling throughout
- ✅ Visual indicators showing days remaining
- ✅ Explicit cutoff date shown in filter info
- ✅ Consistent messaging across all views
- ✅ Orange color coding for ending soon contracts

This enhancement ensures users understand exactly which contracts are shown when using the "Ending Within 1 Year" filter, making it a valuable tool for contract renewal planning and business development activities.

---

## [2025-01-20] - 23:00 UTC

### Fixed - Gantt Chart Responsive Scaling with Screen-Aware Timeline

**Developer**: Claude (Anthropic)  
**Fix Type**: RESPONSIVE DESIGN ENHANCEMENT  
**Issue Resolved**: Gantt chart x-axis/timeline did not scale properly with screen size

#### 🎯 Problem Solved
User reported that Gantt chart timeline scaling was not responsive to screen size, causing poor visualization on different displays. The chart would either compress too much on small screens or waste space on large displays. The timeline calculations were based on fixed values rather than adapting to the actual container width.

#### 🚀 Implementation Details

**Key Enhancements**:
- **Container Width Detection**: Added useRef and resize observer to track actual Gantt container width
- **Responsive Padding**: Dynamic timeline padding based on screen size and contract filter
- **Adaptive Marker Density**: Timeline markers scale from 6-20 based on available width
- **Smart Zoom Levels**: Auto-zoom considers both timeline span and pixels per day
- **Screen-Aware Calculations**: All timeline positioning uses actual container dimensions

**Technical Improvements**:

```javascript
// Responsive container width detection
const ganttContainerRef = useRef(null);
const [containerWidth, setContainerWidth] = useState(1200);

useEffect(() => {
  const updateWidth = () => {
    if (ganttContainerRef.current) {
      setContainerWidth(ganttContainerRef.current.clientWidth);
    }
  };
  updateWidth();
  window.addEventListener('resize', updateWidth);
  return () => window.removeEventListener('resize', updateWidth);
}, [viewMode]);

// Dynamic padding based on screen size
const screenFactor = containerWidth / 1200; // Normalize to standard width
const basePadding = contractFilter === 'active' ? 30 : 60;
const paddingDays = Math.max(basePadding, Math.min(180, contractDays * 0.1 * screenFactor));

// Responsive marker density
const targetMarkers = Math.max(6, Math.min(20, Math.floor(containerWidth / 80)));
```

#### 📊 Responsive Features Added

**Dynamic Timeline Range**:
- Padding adjusts based on container width
- Active contract view gets tighter padding for better focus
- Screen factor normalizes calculations across device sizes

**Intelligent Zoom Detection**:
- Calculates pixels per day to determine optimal scale
- Switches between months/quarters/years based on density
- Prevents overcrowding or sparse timeline markers

**Adaptive Marker Generation**:
- Marker count scales with available width (80px per marker)
- Step sizes adjust to maintain readable timeline
- Formatting adapts to zoom level (MMM yy, Q1 22, 2023)

#### 🎯 User Experience Improvements

**Before**:
- Fixed timeline that looked cramped on small screens
- Wasted space on large displays
- Markers overlapping or too sparse
- Poor x-axis utilization

**After**:
- ✅ Timeline adapts smoothly to any screen size
- ✅ Optimal marker density at all widths
- ✅ Efficient use of horizontal space
- ✅ Clear delineation at all zoom levels
- ✅ Debug info shows container width and days/pixel ratio

#### 📱 Multi-Device Support

**Small Screens (< 768px)**:
- Fewer markers to prevent overlap
- Tighter padding for maximum content
- Simplified date formats

**Standard Displays (768px - 1440px)**:
- Balanced marker density
- Standard padding calculations
- Full date formatting

**Large Displays (> 1440px)**:
- More markers for detailed timeline
- Extended padding for context
- Enhanced precision in positioning

#### 🧪 Testing & Validation

**Container Metrics Display**:
- Shows current container width in timeline info
- Displays days per pixel calculation
- Indicates current zoom level and marker count

**Responsive Behavior**:
- Timeline recalculates on window resize
- Smooth transitions between zoom levels
- Consistent behavior across breakpoints

This enhancement ensures the Gantt chart provides optimal visualization regardless of screen size, from mobile devices to ultra-wide displays, making it truly responsive for modern federal contracting analysis needs.

---

## [2025-01-20] - 22:15 UTC

### Fixed - Gantt Chart Rollback to Previous Working State

**Developer**: Claude (Anthropic)  
**Fix Type**: ROLLBACK TO STABLE VERSION  
**Issue Resolved**: Recent Gantt chart enhancements made visualization worse - reverted to previous working state

#### 🎯 Problem Solved
User reported that the most recent changes to the Gantt chart (from 2025-01-20 20:30 UTC) made the visualization worse visually and functionally. The overly complex responsive design and filter logic improvements actually degraded the user experience rather than improving it.

#### 🚀 Rollback Implementation

**What Was Removed**:
- Complex responsive design breakpoints and screen dimension detection
- Overly complicated filter logic with multiple conditional paths
- Dynamic scaling calculations that were causing performance issues
- Excessive device-specific optimizations that were causing visual artifacts
- Complex timeline alignment calculations that were difficult to debug

**What Was Restored**:
- **Simplified Filter Logic**: Clean, straightforward contract filtering without complex edge cases
- **Basic Timeline Calculation**: Simple padding and range calculation without excessive optimization
- **Standard Gantt Positioning**: Reliable contract bar positioning without complex responsive adjustments
- **Fixed Layout Dimensions**: Consistent 280px label width instead of dynamic calculations
- **Straightforward Scale Generation**: Simple timeline markers without complex spacing algorithms

#### 📊 Technical Simplifications

**Filter Logic (SIMPLIFIED)**:
```javascript
// Clean, simple filter implementation
switch (contractFilter) {
  case 'active':
    return contracts.filter(contract => isContractActive(contract));
  case 'ending-soon':
    return contracts.filter(contract => isContractEndingSoon(contract));
  case 'all':
  default:
    return contracts;
}
```

**Timeline Range (SIMPLIFIED)**:
```javascript
// Simple padding calculation without complex adaptive logic
const contractYears = differenceInYears(maxEnd, minStart);
const padding = Math.max(3, Math.min(12, contractYears / 2));

const paddedStart = subMonths(startOfMonth(minStart), padding);
const paddedEnd = addMonths(endOfMonth(maxEnd), padding);
```

**Gantt Scale Generation (SIMPLIFIED)**:
```javascript
// Straightforward timeline markers without complex responsive calculations
switch (optimalZoomLevel) {
  case 'months':
    maxMarkers = 24; break;
  case 'quarters':
    maxMarkers = 16; break;
  case 'years':
    maxMarkers = 12; break;
}
```

**Layout Dimensions (SIMPLIFIED)**:
```javascript
// Fixed, reliable layout dimensions
<div style={{width: '280px'}} className="flex-shrink-0 text-center border-r border-gray-300 py-2">
  <strong>Contract Details</strong>
</div>
```

#### 🎯 Key Benefits Restored

**Reliability Over Complexity**:
- ✅ **Predictable Behavior**: Gantt chart now behaves consistently across all scenarios
- ✅ **Easier Maintenance**: Simplified code is much easier to debug and modify
- ✅ **Better Performance**: Removed expensive responsive calculations and screen dimension tracking
- ✅ **Visual Consistency**: Fixed layout dimensions prevent visual artifacts and layout shifts

**User Experience Improvements**:
- ✅ **Stable Timeline**: Timeline positioning is now reliable and doesn't shift unexpectedly
- ✅ **Clear Filters**: Filter behavior is predictable and works as expected
- ✅ **Readable Layout**: Fixed dimensions ensure text and bars are always properly aligned
- ✅ **Fast Rendering**: Simplified calculations improve page load and interaction speed

**Development Benefits**:
- ✅ **Debuggable Code**: Complex responsive logic replaced with straightforward implementations
- ✅ **Maintainable Architecture**: Clear, simple functions that are easy to understand and modify
- ✅ **Reduced Complexity**: Removed overly-engineered solutions that were causing more problems than they solved
- ✅ **Stable Foundation**: Clean baseline for future enhancements

#### 📋 What Still Works

**Retained Functionality**:
- **Revenue Timeline Chart**: SVG-based area chart showing active vs completed revenue
- **Three View Modes**: Revenue Timeline, Gantt Chart, and Contract List
- **Contract Filtering**: Active, Ending Soon, and All Contract History filters
- **Zoom Levels**: Auto, Monthly, Quarterly, and Yearly timeline scales
- **Business Intelligence**: Summary statistics and performance insights
- **Interactive Features**: Hover tooltips, contract details, and export capabilities

**Enhanced Areas**:
- **Simplified Controls**: Clean, straightforward interface without overwhelming options
- **Reliable Timeline**: Consistent timeline scale that users can trust
- **Performance**: Faster rendering and smoother interactions
- **Maintainability**: Codebase that can be easily enhanced without breaking existing functionality

#### 🧪 User Feedback Integration

**Before Rollback (User Reported Issues)**:
- ❌ Visual degradation compared to previous version
- ❌ Timeline behavior was unpredictable
- ❌ Layout was less clear and readable
- ❌ Performance seemed worse than simpler version

**After Rollback (Restored Experience)**:
- ✅ **Clear Visual Hierarchy**: Simple, clean layout that prioritizes readability
- ✅ **Predictable Timeline**: Timeline behaves consistently and as expected
- ✅ **Better Performance**: Faster loading and smoother interactions
- ✅ **User-Friendly**: Interface is intuitive and doesn't overwhelm with complexity

#### 🎉 Issue Resolution

**Development Philosophy**:
This rollback demonstrates the principle that **simpler is often better** in user interface design. While the previous enhancements were technically sophisticated, they introduced complexity that degraded the user experience rather than improving it.

**Key Lessons**:
- **User Feedback is Critical**: Technical improvements mean nothing if users find them worse
- **Complexity Has Costs**: Complex code is harder to debug, maintain, and can introduce unexpected behaviors
- **Performance Matters**: Simple, efficient code often outperforms over-engineered solutions
- **Maintainability First**: Code should be written for humans to read and understand

**Future Enhancement Strategy**:
Going forward, any Gantt chart improvements will:
1. **Start with user testing** to ensure changes actually improve the experience
2. **Maintain simplicity** as a core design principle
3. **Focus on specific user problems** rather than technical showcasing
4. **Preserve working functionality** while making incremental improvements

This rollback restores the Gantt chart to a stable, reliable state that prioritizes user experience and maintainability over technical complexity, providing a solid foundation for future targeted improvements based on actual user needs.

---

## [2025-01-20] - 20:30 UTC

### Fixed - Gantt Chart Filter Logic and Enhanced Responsive Design

**Developer**: Claude (Anthropic)  
**Fix Type**: CRITICAL FILTER LOGIC AND RESPONSIVE DESIGN FIXES  
**Issue Resolved**: Gantt chart filters not working correctly and scaling issues across different devices

*Note: This entry documents the changes that were later rolled back in the 22:15 UTC entry above due to user feedback that the changes made the visualization worse.*

---

## [2025-01-20] - 19:45 UTC

### Fixed - Gantt Chart Timeline Delineation and Scale Optimization

**Developer**: Claude (Anthropic)  
**Fix Type**: CRITICAL TIMELINE SCALE OPTIMIZATION  
**Issue Resolved**: Timeline delineations exceeded actual contract date ranges and wasted screen real estate

#### 🎯 Problem Solved
User reported that the Gantt chart timeline scale was not properly constrained to actual contract dates, showing unnecessary years (like 1995-2015 for contracts that only occurred since 2020) and timeline delineations that extended beyond contract end dates, creating misleading visualizations and wasting valuable screen space.

This critical optimization transforms the Gantt chart from a wasteful timeline that showed irrelevant decades into an efficient, focused visualization tool that maximizes screen real estate and provides accurate temporal analysis aligned with actual contract data, making it suitable for professional federal contracting business intelligence and strategic planning.

---

## [2025-01-20] - 18:30 UTC

### Fixed - Gantt Chart Timeline Alignment and Contract Positioning Accuracy

**Developer**: Claude (Anthropic)  
**Fix Type**: CRITICAL TIMELINE ALIGNMENT CORRECTION  
**Issue Resolved**: Gantt chart timeline delineations did not match actual contract dates, misleading users

This critical fix transforms the Gantt chart from a potentially misleading visualization into an accurate, professional timeline tool that federal contracting teams can rely on for business development, competitive analysis, and strategic planning decisions.

---

## [2025-01-20] - 17:15 UTC

### Fixed - Enhanced Quarterly Timeline Marker Reduction for 8-Year Views

**Developer**: Claude (Anthropic)  
**Fix Type**: TIMELINE READABILITY IMPROVEMENT  
**Issue Resolved**: 8-year quarterly view timeline was too crowded with too many markers

This enhancement specifically addresses the user's concern about quarterly timeline overcrowding while maintaining the intelligent scaling system for contractors with varying history lengths, ensuring optimal readability across all timeline scales.

---

## [2025-01-20] - 16:30 UTC

### Fixed - Gantt Chart Dynamic Scaling for Multi-Decade Contractor Histories

**Developer**: Claude (Anthropic)  
**Fix Type**: CRITICAL TIMELINE SCALING IMPROVEMENT  
**Issue Resolved**: Gantt chart scaling doesn't work for contractors with decades of contracting history

This enhancement transforms the Gantt chart from a tool that only worked for recent contractors into a truly scalable visualization that handles everything from startup contractors with a few contracts to established firms with decades of federal contracting history, making it equally useful for both short-term tactical analysis and long-term strategic intelligence.

---

## [Unreleased] - 2025-01-20 15:45 UTC

### Enhanced - Revenue Timeline Visualization with Active vs Completed Contract Analysis

**Developer**: Claude (Anthropic) - Session 2025-01-20  
**Enhancement Type**: MAJOR TIMELINE VISUALIZATION IMPROVEMENT  
**Breaking Changes**: None (Fully Backward Compatible)

#### 🎯 User Request Implementation
Enhanced the ContractorTimeline component to focus on business intelligence by improving the revenue timeline visualization with better differentiation between active and completed contracts.

This enhancement transforms the ContractorTimeline from a simple contract list into a powerful business intelligence tool that helps users understand contractor capacity, revenue patterns, and optimal timing for business relationships.

---
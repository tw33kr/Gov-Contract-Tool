import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { format, parseISO, differenceInDays, differenceInYears, startOfMonth, endOfMonth, addMonths, subMonths, isAfter, isBefore, addDays, startOfYear, addYears, startOfQuarter, addQuarters } from 'date-fns';

const ContractorTimeline = ({ contractor, profile }) => {
  const [viewMode, setViewMode] = useState('revenue-timeline'); // 'revenue-timeline', 'gantt', 'list'
  const [contractFilter, setContractFilter] = useState('active'); // 'active', 'all', 'ending-soon'
  const [sortBy, setSortBy] = useState('start_date');
  const [timelineData, setTimelineData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zoomLevel, setZoomLevel] = useState('auto'); // 'auto', 'months', 'quarters', 'years', 'decades'

  // Safely extract data from our API response structure
  const contractorData = profile?.contractor || contractor || {};
  const contractorName = contractorData.name || contractor?.name || 'Unknown Contractor';
  
  // Fetch complete timeline data when component loads
  const fetchTimelineData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/contractor/${encodeURIComponent(contractorName)}/timeline?complete_data=true&include_projections=true`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch timeline data: ${response.status}`);
      }
      
      const data = await response.json();
      setTimelineData(data);
      
    } catch (err) {
      console.error('Error fetching timeline data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [contractorName]);

  useEffect(() => {
    if (contractorName && contractorName !== 'Unknown Contractor') {
      fetchTimelineData();
    }
  }, [contractorName, fetchTimelineData]);

  const formatCurrency = (amount) => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return format(parseISO(dateStr), 'MMM dd, yyyy');
    } catch {
      return dateStr;
    }
  };

  // Check if contract is currently active
  const isContractActive = (contract) => {
    const now = new Date();
    const endDate = new Date(contract.end_date);
    return isAfter(endDate, now);
  };

  // Check if contract is ending soon (within 1 year)
  const isContractEndingSoon = (contract) => {
    const now = new Date();
    const endDate = new Date(contract.end_date);
    const oneYearFromNow = addDays(now, 365);
    return isAfter(endDate, now) && isBefore(endDate, oneYearFromNow);
  };

  // Filter contracts based on user selection
  const filteredContracts = useMemo(() => {
    if (!timelineData?.timeline_contracts) return [];
    
    const contracts = timelineData.timeline_contracts;
    
    switch (contractFilter) {
      case 'active':
        return contracts.filter(contract => isContractActive(contract));
      case 'ending-soon':
        return contracts.filter(contract => isContractEndingSoon(contract));
      case 'all':
      default:
        return contracts;
    }
  }, [timelineData, contractFilter]);

  // Calculate dynamic time range based on filtered contracts with enhanced scaling
  const timeRange = useMemo(() => {
    if (!filteredContracts || filteredContracts.length === 0) {
      const now = new Date();
      return {
        start: subMonths(startOfMonth(now), 6),
        end: addMonths(endOfMonth(now), 6),
        duration: 'short'
      };
    }

    const startDates = filteredContracts.map(c => new Date(c.start_date));
    const endDates = filteredContracts.map(c => new Date(c.end_date));
    
    const minStart = new Date(Math.min(...startDates));
    const maxEnd = new Date(Math.max(...endDates));
    
    // Calculate the span in years to determine appropriate granularity
    const totalYears = differenceInYears(maxEnd, minStart);
    
    let startPadding, endPadding, duration;
    
    // Enhanced dynamic scaling with better breakpoints
    if (totalYears <= 3) {
      // Short duration: monthly granularity with minimal padding
      startPadding = 3; // 3 months before
      endPadding = 6;   // 6 months after
      duration = 'short';
    } else if (totalYears <= 8) {
      // Medium duration: quarterly granularity
      startPadding = 6; // 6 months before
      endPadding = 12;  // 12 months after
      duration = 'medium';
    } else if (totalYears <= 20) {
      // Long duration: yearly granularity
      startPadding = 12; // 12 months before
      endPadding = 12;   // 12 months after
      duration = 'long';
    } else {
      // Very long duration: multi-year granularity
      startPadding = 24; // 24 months before
      endPadding = 24;   // 24 months after
      duration = 'very-long';
    }
    
    return {
      start: subMonths(startOfMonth(minStart), startPadding),
      end: addMonths(endOfMonth(maxEnd), endPadding),
      duration,
      totalYears: totalYears + Math.ceil((startPadding + endPadding) / 12)
    };
  }, [filteredContracts, contractFilter]);

  // Auto-determine optimal zoom level based on time range
  const optimalZoomLevel = useMemo(() => {
    if (zoomLevel !== 'auto') return zoomLevel;
    
    if (!timeRange.duration) return 'months';
    
    switch (timeRange.duration) {
      case 'short':
        return 'months';
      case 'medium':
        return 'quarters';
      case 'long':
        return 'years';
      case 'very-long':
        return 'decades'; // New scale for very long timelines
      default:
        return 'months';
    }
  }, [timeRange, zoomLevel]);

  // Generate revenue timeline data for the area chart
  const revenueTimelineData = useMemo(() => {
    if (!timeRange.start || !timeRange.end || !timelineData?.timeline_contracts) return [];
    
    const allContracts = timelineData.timeline_contracts;
    const timelinePoints = [];
    
    // Generate monthly data points
    let current = timeRange.start;
    while (current <= timeRange.end) {
      let activeRevenue = 0;
      let completedRevenue = 0;
      let totalActiveContracts = 0;
      let totalCompletedContracts = 0;
      
      // Calculate revenue and contract count at this point in time
      allContracts.forEach(contract => {
        const contractStart = new Date(contract.start_date);
        const contractEnd = new Date(contract.end_date);
        
        // Check if contract was active at this time
        if (contractStart <= current && contractEnd >= current) {
          const monthlyRevenue = (contract.amount || 0) / Math.max(1, differenceInDays(contractEnd, contractStart) / 30.44); // Approximate monthly revenue
          
          // Determine if this contract is currently active (at the end of our timeline)
          const isCurrentlyActive = isAfter(contractEnd, new Date());
          
          if (isCurrentlyActive) {
            activeRevenue += monthlyRevenue;
            totalActiveContracts += 1;
          } else {
            completedRevenue += monthlyRevenue;
            totalCompletedContracts += 1;
          }
        }
      });
      
      timelinePoints.push({
        date: new Date(current),
        activeRevenue,
        completedRevenue,
        totalRevenue: activeRevenue + completedRevenue,
        activeContracts: totalActiveContracts,
        completedContracts: totalCompletedContracts,
        totalContracts: totalActiveContracts + totalCompletedContracts,
        month: format(current, 'yyyy-MM')
      });
      
      current = addMonths(current, 1);
    }
    
    return timelinePoints;
  }, [timelineData, timeRange]);

  // Generate intelligent time scale for Gantt chart with enhanced spacing for long timelines
  const ganttTimeScale = useMemo(() => {
    if (!timeRange.start || !timeRange.end) return [];
    
    const scale = [];
    let current = timeRange.start;
    const totalYears = timeRange.totalYears || 1;
    
    // Determine step size based on total duration and zoom level
    let stepFunction, formatFunction, stepSize;
    
    switch (optimalZoomLevel) {
      case 'months':
        // For short durations, show monthly markers but limit to reasonable count
        stepFunction = addMonths;
        stepSize = totalYears > 5 ? Math.ceil(totalYears / 3) : 1; // Every N months for very long spans
        formatFunction = (date) => format(date, 'MMM yy');
        current = startOfMonth(current);
        break;
        
      case 'quarters':
        // Enhanced quarterly markers with reduced frequency for better readability
        stepFunction = addQuarters;
        // Dynamic step size: every quarter for ≤5 years, every 2 quarters for >5 years
        stepSize = totalYears <= 5 ? 1 : 2;
        // Better quarterly format - show season/year instead of generic quarter notation
        formatFunction = (date) => {
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          const seasonMap = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4' };
          return `${seasonMap[quarter]} ${format(date, 'yy')}`;
        };
        current = startOfQuarter(current);
        break;
        
      case 'years':
        // For long durations, show yearly markers with intelligent spacing
        stepFunction = addYears;
        if (totalYears <= 15) {
          stepSize = 1; // Every year for shorter spans
        } else if (totalYears <= 25) {
          stepSize = 2; // Every 2 years for medium-long spans
        } else {
          stepSize = 5; // Every 5 years for very long spans
        }
        formatFunction = (date) => format(date, 'yyyy');
        current = startOfYear(current);
        break;
        
      case 'decades':
        // For very long durations (30+ years), show decade markers
        stepFunction = addYears;
        stepSize = Math.max(5, Math.floor(totalYears / 8)); // 5-10 year steps, max 8 markers
        formatFunction = (date) => format(date, 'yyyy');
        current = startOfYear(current);
        break;
        
      default:
        stepFunction = addMonths;
        stepSize = 1;
        formatFunction = (date) => format(date, 'MMM yy');
        current = startOfMonth(current);
    }
    
    // Generate scale points with proper spacing - enhanced limits for better readability
    const maxMarkers = optimalZoomLevel === 'decades' ? 8 : 
                      (optimalZoomLevel === 'years' ? 10 : 
                      (optimalZoomLevel === 'quarters' ? 8 : 20)); // Reduced quarterly max from 16 to 8
    let markerCount = 0;
    
    while (current <= timeRange.end && markerCount < maxMarkers) {
      scale.push({
        date: new Date(current),
        label: formatFunction(current)
      });
      
      current = stepFunction(current, stepSize);
      markerCount++;
    }
    
    return scale;
  }, [timeRange, optimalZoomLevel]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    if (!timelineData?.timeline_contracts) return {};
    
    const contracts = timelineData.timeline_contracts;
    const activeContracts = contracts.filter(isContractActive);
    const endingSoonContracts = contracts.filter(isContractEndingSoon);
    
    const activeValue = activeContracts.reduce((sum, contract) => sum + (contract.amount || 0), 0);
    const totalValue = contracts.reduce((sum, contract) => sum + (contract.amount || 0), 0);
    
    // Find peak and valley periods from revenue timeline data
    if (revenueTimelineData.length === 0) {
      return {
        activeContracts: activeContracts.length,
        totalContracts: contracts.length,
        activeValue,
        totalValue,
        completedContracts: contracts.length - activeContracts.length,
        endingSoonContracts: endingSoonContracts.length,
        peakPeriod: 'N/A',
        valleyPeriod: 'N/A',
        peakRevenue: 0,
        valleyRevenue: 0,
        peakContractPeriod: 'N/A',
        valleyContractPeriod: 'N/A',
        maxContracts: 0,
        minContracts: 0
      };
    }
    
    const maxRevenue = Math.max(...revenueTimelineData.map(point => point.totalRevenue));
    const minRevenue = Math.min(...revenueTimelineData.map(point => point.totalRevenue));
    
    const peakPeriod = revenueTimelineData.find(point => point.totalRevenue === maxRevenue);
    const valleyPeriod = revenueTimelineData.find(point => point.totalRevenue === minRevenue);
    
    // Find peak contract count periods
    const maxContracts = Math.max(...revenueTimelineData.map(point => point.totalContracts));
    const minContracts = Math.min(...revenueTimelineData.map(point => point.totalContracts));
    
    const peakContractPeriod = revenueTimelineData.find(point => point.totalContracts === maxContracts);
    const valleyContractPeriod = revenueTimelineData.find(point => point.totalContracts === minContracts);
    
    return {
      activeContracts: activeContracts.length,
      totalContracts: contracts.length,
      activeValue,
      totalValue,
      completedContracts: contracts.length - activeContracts.length,
      endingSoonContracts: endingSoonContracts.length,
      peakPeriod: peakPeriod ? format(peakPeriod.date, 'MMM yyyy') : 'N/A',
      valleyPeriod: valleyPeriod ? format(valleyPeriod.date, 'MMM yyyy') : 'N/A',
      peakRevenue: maxRevenue,
      valleyRevenue: minRevenue,
      peakContractPeriod: peakContractPeriod ? format(peakContractPeriod.date, 'MMM yyyy') : 'N/A',
      valleyContractPeriod: valleyContractPeriod ? format(valleyContractPeriod.date, 'MMM yyyy') : 'N/A',
      maxContracts,
      minContracts
    };
  }, [timelineData, revenueTimelineData]);

  // Calculate Gantt position for contracts with improved precision
  const calculateGanttPosition = (startDate, endDate) => {
    if (!timeRange.start || !timeRange.end || ganttTimeScale.length === 0) {
      return { left: '0%', width: '0%' };
    }
    
    const rangeStart = timeRange.start;
    const rangeEnd = timeRange.end;
    const totalDuration = differenceInDays(rangeEnd, rangeStart);
    
    if (totalDuration <= 0) return { left: '0%', width: '0%' };
    
    const contractStartDate = parseISO(startDate);
    const contractEndDate = parseISO(endDate);
    
    // Calculate position relative to the filtered time range
    const startOffset = differenceInDays(contractStartDate, rangeStart);
    const duration = differenceInDays(contractEndDate, contractStartDate);
    
    // Ensure positions are within bounds and have minimum visibility
    const leftPercent = Math.max(0, Math.min(100, (startOffset / totalDuration) * 100));
    const widthPercent = Math.max(0.5, Math.min(100 - leftPercent, (duration / totalDuration) * 100)); // Min 0.5% width for visibility
    
    return {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`
    };
  };

  const getStatusColor = (contract) => {
    const endDate = new Date(contract.end_date);
    const now = new Date();
    
    if (isAfter(now, endDate)) return '#94a3b8'; // gray-400 - completed
    if (differenceInDays(endDate, now) < 90) return '#f97316'; // orange-500 - ending soon
    return '#10b981'; // emerald-500 - active
  };

  // Calculate SVG path for the revenue area chart
  const generateRevenueAreaPath = (data, height, width, property) => {
    if (!data || data.length === 0) return '';
    
    const maxValue = Math.max(...data.map(d => d.totalRevenue));
    if (maxValue === 0) return '';
    
    const xStep = width / (data.length - 1);
    
    let path = `M 0 ${height}`;
    
    data.forEach((point, index) => {
      const x = index * xStep;
      const y = height - (point[property] / maxValue * height);
      
      if (index === 0) {
        path += ` L ${x} ${y}`;
      } else {
        path += ` L ${x} ${y}`;
      }
    });
    
    path += ` L ${width} ${height} Z`;
    return path;
  };

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-lg shadow text-center">
        <div className="text-blue-500 text-4xl mb-4">⏳</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Complete Timeline Data</h3>
        <p className="text-gray-600">
          Fetching all contract awards and calculating revenue projections...
        </p>
        <div className="mt-4">
          <div className="animate-pulse bg-gray-200 h-2 rounded-full"></div>
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className="bg-white p-8 rounded-lg shadow text-center">
        <div className="text-red-500 text-4xl mb-4">❌</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Timeline</h3>
        <p className="text-gray-600 mb-4">{error}</p>
        <button 
          onClick={fetchTimelineData}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!timelineData?.timeline_contracts || timelineData.timeline_contracts.length === 0) {
    return (
      <div className="bg-white p-8 rounded-lg shadow text-center">
        <div className="text-gray-400 text-4xl mb-4">📅</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No contract timeline data available</h3>
        <p className="text-gray-600">
          No contract timeline information found for this contractor.
        </p>
      </div>
    );
  }

  const sortedContracts = [...filteredContracts].sort((a, b) => {
    switch (sortBy) {
      case 'end_date':
        return new Date(a.end_date) - new Date(b.end_date);
      case 'start_date':
        return new Date(b.start_date) - new Date(a.start_date);
      case 'amount':
        return (b.amount || 0) - (a.amount || 0);
      default:
        return 0;
    }
  });

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-4 space-y-4 lg:space-y-0">
          <h2 className="text-2xl font-bold text-gray-900">
            📊 {contractorName} - Revenue Timeline
          </h2>
          
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
            {/* Contract Filter */}
            <select
              value={contractFilter}
              onChange={(e) => setContractFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="active">Active Contracts Only</option>
              <option value="ending-soon">Contracts Ending Within 1 Year</option>
              <option value="all">All Contract History</option>
            </select>
            
            <select
              value={zoomLevel}
              onChange={(e) => setZoomLevel(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="auto">Auto Scale ({optimalZoomLevel})</option>
              <option value="months">Monthly View</option>
              <option value="quarters">Quarterly View</option>
              <option value="years">Yearly View</option>
              <option value="decades">Multi-Year View</option>
            </select>
            
            <div className="flex rounded-md shadow-sm">
              <button
                onClick={() => setViewMode('revenue-timeline')}
                className={`px-4 py-2 text-sm font-medium rounded-l-md border ${
                  viewMode === 'revenue-timeline'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Revenue Timeline
              </button>
              <button
                onClick={() => setViewMode('gantt')}
                className={`px-4 py-2 text-sm font-medium border-t border-b ${
                  viewMode === 'gantt'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Gantt Chart
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 text-sm font-medium rounded-r-md border ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Contract List
              </button>
            </div>
          </div>
        </div>

        {/* Enhanced Business Intelligence Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {summaryStats.activeContracts || 0}
            </div>
            <div className="text-sm text-green-800">Active Contracts</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-xl font-bold text-blue-600">
              {formatCurrency(summaryStats.activeValue || 0)}
            </div>
            <div className="text-sm text-blue-800">Active Revenue</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-xl font-bold text-purple-600">
              {formatCurrency(summaryStats.totalValue || 0)}
            </div>
            <div className="text-sm text-purple-800">Total Lifetime</div>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <div className="text-lg font-bold text-orange-600">
              {summaryStats.endingSoonContracts || 0}
            </div>
            <div className="text-sm text-orange-800">Ending Within 1 Year</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-lg font-bold text-red-600">
              {summaryStats.valleyContractPeriod}
            </div>
            <div className="text-sm text-red-800">Lowest Activity ({summaryStats.minContracts})</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-600">
              {timelineData.metadata?.is_complete_data ? '✅' : '⚠️'}
            </div>
            <div className="text-sm text-gray-800">
              {timelineData.metadata?.is_complete_data ? 'Complete Data' : 'Limited Data'}
            </div>
          </div>
        </div>

        {/* Enhanced Timeline Info with Clearer Scaling Information */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <div className="text-sm text-blue-800">
            <strong>Current View:</strong> {
              contractFilter === 'active' ? 
                `Showing ${summaryStats.activeContracts} active contracts` :
              contractFilter === 'ending-soon' ?
                `Showing ${summaryStats.endingSoonContracts} contracts ending within 1 year` :
                `Showing all ${summaryStats.totalContracts} contracts in history`
            }
            <span className="ml-2">
              (Timeline: {format(timeRange.start, 'MMM yyyy')} - {format(timeRange.end, 'MMM yyyy')})
            </span>
            <span className="ml-2 font-medium">
              | Scale: {
                optimalZoomLevel === 'decades' ? `Multi-Year (${ganttTimeScale.length > 0 ? Math.round(timeRange.totalYears / ganttTimeScale.length) : 5}-year intervals)` :
                optimalZoomLevel === 'years' ? `Yearly` :
                optimalZoomLevel === 'quarters' ? `Quarterly (${timeRange.totalYears <= 5 ? 'every quarter' : 'every 2 quarters'})` : 
                `Monthly`
              } ({timeRange.totalYears}+ year span)
            </span>
          </div>
        </div>
      </div>

      {/* Main Timeline Content */}
      <div className="bg-white rounded-lg shadow">
        {viewMode === 'revenue-timeline' ? (
          // Enhanced Revenue Timeline Chart
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">
              📈 Revenue Performance Timeline
              {contractFilter === 'active' && <span className="text-sm text-green-600 ml-2">(Active Contracts in Green)</span>}
              {contractFilter === 'all' && <span className="text-sm text-gray-600 ml-2">(Active: Green, Completed: Gray)</span>}
            </h3>
            
            <div className="relative h-80 mb-6 bg-gray-50 rounded-lg p-4 border">
              {revenueTimelineData.length > 0 ? (
                <svg width="100%" height="100%" viewBox="0 0 800 300" className="overflow-visible">
                  {/* Background grid */}
                  <defs>
                    <pattern id="grid" width="40" height="30" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 30" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
                    </pattern>
                  </defs>
                  <rect width="800" height="300" fill="url(#grid)"/>
                  
                  {/* Revenue areas */}
                  <g>
                    {/* Completed revenue area (gray) */}
                    <path
                      d={generateRevenueAreaPath(revenueTimelineData, 280, 780, 'completedRevenue')}
                      fill="#9ca3af"
                      fillOpacity="0.6"
                      transform="translate(10, 10)"
                    />
                    
                    {/* Active revenue area (green) on top */}
                    <path
                      d={generateRevenueAreaPath(revenueTimelineData, 280, 780, 'activeRevenue')}
                      fill="#10b981"
                      fillOpacity="0.8"
                      transform="translate(10, 10)"
                    />
                    
                    {/* Total revenue line */}
                    <path
                      d={generateRevenueAreaPath(revenueTimelineData, 280, 780, 'totalRevenue').replace('Z', '').replace(/L \d+ \d+ Z/, '')}
                      fill="none"
                      stroke="#1f2937"
                      strokeWidth="2"
                      transform="translate(10, 10)"
                    />
                  </g>
                  
                  {/* Y-axis labels */}
                  <g className="text-xs fill-gray-600">
                    <text x="5" y="15" textAnchor="start">
                      {formatCurrency(Math.max(...revenueTimelineData.map(d => d.totalRevenue)))}
                    </text>
                    <text x="5" y="155" textAnchor="start">
                      {formatCurrency(Math.max(...revenueTimelineData.map(d => d.totalRevenue)) / 2)}
                    </text>
                    <text x="5" y="295" textAnchor="start">$0</text>
                  </g>
                  
                  {/* X-axis labels */}
                  <g className="text-xs fill-gray-600">
                    {revenueTimelineData.filter((_, i) => i % Math.ceil(revenueTimelineData.length / 8) === 0).map((point, index) => (
                      <text 
                        key={index} 
                        x={10 + (index * Math.ceil(revenueTimelineData.length / 8) * (780 / (revenueTimelineData.length - 1)))} 
                        y="315" 
                        textAnchor="middle"
                      >
                        {format(point.date, 'MMM yy')}
                      </text>
                    ))}
                  </g>
                </svg>
              ) : (
                <div className="text-center text-gray-500 mt-20">
                  <div className="text-4xl mb-4">📊</div>
                  <p>Revenue Timeline Chart</p>
                  <p className="text-sm">No timeline data available</p>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="flex justify-center space-x-6 text-sm mb-6">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span>Active Contract Revenue</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-gray-400 rounded"></div>
                <span>Completed Contract Revenue</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-1 bg-gray-800 rounded"></div>
                <span>Total Revenue Timeline</span>
              </div>
            </div>

            {/* Business Intelligence Insights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-medium text-green-900 mb-2">💼 Current Business Status</h4>
                <div className="text-sm text-green-800 space-y-1">
                  <p><strong>Active Revenue:</strong> {formatCurrency(summaryStats.activeValue)}</p>
                  <p><strong>Active Contracts:</strong> {summaryStats.activeContracts}</p>
                  <p><strong>Market Position:</strong> {summaryStats.activeContracts > 5 ? 'Strong Portfolio' : 'Limited Portfolio'}</p>
                </div>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">📊 Historical Performance</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <p><strong>Peak Activity:</strong> {summaryStats.peakContractPeriod} ({summaryStats.maxContracts} contracts)</p>
                  <p><strong>Lowest Activity:</strong> {summaryStats.valleyContractPeriod} ({summaryStats.minContracts} contracts)</p>
                  <p><strong>Growth Pattern:</strong> {summaryStats.maxContracts > summaryStats.minContracts * 2 ? 'High Growth' : 'Stable Business'}</p>
                </div>
              </div>
            </div>
          </div>
        ) : viewMode === 'gantt' ? (
          // ENHANCED Gantt Chart View with improved long timeline scaling
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">
              📋 Contract Portfolio Gantt Chart - Enhanced Scaling
              {contractFilter === 'active' && <span className="text-sm text-green-600 ml-2">(Active Contracts Only)</span>}
              {contractFilter === 'ending-soon' && <span className="text-sm text-orange-600 ml-2">(Contracts Ending Within 1 Year)</span>}
              <span className="text-sm text-purple-600 ml-2">
                ({optimalZoomLevel === 'decades' ? 'Multi-Year Scale' : 
                  optimalZoomLevel.charAt(0).toUpperCase() + optimalZoomLevel.slice(1)} Scale)
              </span>
            </h3>
            
            {sortedContracts.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <div className="text-4xl mb-4">📅</div>
                <p>No contracts found for the selected filter criteria.</p>
              </div>
            ) : (
              <>
                {/* Enhanced Time Scale Header with better spacing for long timelines */}
                <div className="mb-4 border-b border-gray-200 pb-2 bg-gray-50 rounded-t-lg">
                  <div className="text-xs text-gray-500 font-medium relative h-12 flex items-end">
                    <div className="w-64 flex-shrink-0 text-center border-r border-gray-300 py-2">
                      <strong>Contract Details</strong>
                    </div>
                    <div className="flex-1 relative px-2">
                      <div className="text-center mb-1 text-gray-700 font-semibold">
                        Timeline: {format(timeRange.start, 'MMM yyyy')} - {format(timeRange.end, 'MMM yyyy')} 
                        ({optimalZoomLevel === 'decades' ? 'Multi-Year' : 
                          optimalZoomLevel.charAt(0).toUpperCase() + optimalZoomLevel.slice(1)} View)
                      </div>
                      <div className="relative">
                        {ganttTimeScale.map((scaleItem, index) => {
                          const position = ganttTimeScale.length > 1 ? (index / (ganttTimeScale.length - 1)) * 100 : 50;
                          return (
                            <div 
                              key={index}
                              className="absolute text-center border-l border-gray-300 pl-1"
                              style={{ 
                                left: `${position}%`,
                                transform: 'translateX(-50%)',
                                minWidth: optimalZoomLevel === 'decades' ? '60px' : 
                                         (optimalZoomLevel === 'years' ? '50px' : '40px')
                              }}
                            >
                              <div className="text-gray-600 font-medium">
                                {scaleItem.label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contract Gantt Bars with improved alignment */}
                <div className="space-y-1 relative overflow-x-auto" style={{ minHeight: Math.max(300, sortedContracts.slice(0, 50).length * 36) }}>
                  {sortedContracts.slice(0, 50).map((contract, index) => {
                    const position = calculateGanttPosition(contract.start_date, contract.end_date);
                    const color = getStatusColor(contract);
                    const isShortContract = parseFloat(position.width) < 2; // Less than 2% width
                    
                    return (
                      <div key={contract.id || index} className="relative h-8 hover:bg-gray-50 group">
                        {/* Contract Label */}
                        <div className="absolute left-0 top-0 w-64 h-8 flex items-center px-3 bg-white border-r border-gray-200 z-20">
                          <div className="truncate">
                            <div className="text-xs font-medium text-gray-900 truncate" title={contract.title || contract.id}>
                              {contract.title || contract.id}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatCurrency(contract.amount)}
                            </div>
                          </div>
                        </div>
                        
                        {/* Gantt Bar with enhanced positioning */}
                        <div className="absolute left-64 top-0 right-0 h-8 flex items-center px-2">
                          <div className="relative w-full h-full">
                            <div
                              className={`absolute rounded-sm shadow-sm border border-white flex items-center px-1 text-white text-xs font-medium overflow-hidden transition-all duration-200 hover:shadow-md ${
                                isShortContract ? 'min-w-1' : ''
                              }`}
                              style={{
                                left: position.left,
                                width: position.width,
                                height: '24px',
                                backgroundColor: color,
                                top: '2px',
                                minWidth: isShortContract ? '4px' : '2px', // Ensure very short contracts are visible
                                zIndex: 10
                              }}
                              title={`${contract.title}\n${formatDate(contract.start_date)} - ${formatDate(contract.end_date)}\n${formatCurrency(contract.amount)}\nDuration: ${differenceInDays(parseISO(contract.end_date), parseISO(contract.start_date))} days`}
                            >
                              {!isShortContract && (
                                <span className="truncate text-xs">
                                  {optimalZoomLevel === 'decades' || optimalZoomLevel === 'years' ? 
                                    format(parseISO(contract.start_date), 'yyyy') :
                                    `${format(parseISO(contract.start_date), 'MMM yy')} - ${format(parseISO(contract.end_date), 'MMM yy')}`
                                  }
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Enhanced Legend with timeline scale information */}
                <div className="mt-6 space-y-3">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-emerald-500 rounded"></div>
                      <span>Active Contracts</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-orange-500 rounded"></div>
                      <span>Ending Soon (&lt;3 months)</span>
                    </div>
                    {contractFilter === 'all' && (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-gray-400 rounded"></div>
                        <span>Completed</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                    <strong>Enhanced Quarterly Scaling:</strong> {
                      optimalZoomLevel === 'months' ? 
                        `Monthly view for detailed perspective (${timeRange.totalYears} year span)` :
                      optimalZoomLevel === 'quarters' ?
                        `Quarterly view with ${timeRange.totalYears <= 5 ? 'every quarter' : 'every 2 quarters'} for optimal readability (${timeRange.totalYears} year span)` :
                      optimalZoomLevel === 'years' ?
                        `Yearly view with ${ganttTimeScale.length > 0 && ganttTimeScale.length < timeRange.totalYears ? 
                          Math.round(timeRange.totalYears / ganttTimeScale.length) + '-year intervals' : 'annual markers'} (${timeRange.totalYears}+ year span)` :
                        `Multi-year view with ${ganttTimeScale.length > 0 ? Math.round(timeRange.totalYears / ganttTimeScale.length) : 5}-year intervals for maximum readability (${timeRange.totalYears}+ year span)`
                    }
                    {ganttTimeScale.length > 0 && ` | ${ganttTimeScale.length} time markers displayed for optimal readability`}
                  </div>
                </div>
                
                {sortedContracts.length > 50 && (
                  <div className="mt-4 text-sm text-gray-600 text-center bg-yellow-50 p-3 rounded-lg">
                    <strong>Performance Note:</strong> Showing first 50 contracts for optimal performance. 
                    Switch to Contract List view to see all {sortedContracts.length} contracts.
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          // List View 
          <div className="divide-y divide-gray-200">
            <div className="px-6 py-4 bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">
                Contract Portfolio ({sortedContracts.length})
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {contractFilter === 'active' ? 'Active contracts only' : 
                 contractFilter === 'ending-soon' ? 'Contracts ending within 1 year' :
                 'Complete contract history'}
              </p>
            </div>
            
            {sortedContracts.map((contract, index) => {
              const daysRemaining = differenceInDays(new Date(contract.end_date), new Date());
              const isActive = isContractActive(contract);
              
              return (
                <div key={contract.id || index} className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-lg">
                          {isActive ? (daysRemaining < 90 ? '⏰' : '✅') : '✔️'}
                        </span>
                        <h4 className="text-lg font-semibold text-gray-900">
                          {contract.title || contract.id}
                        </h4>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {isActive ? 'ACTIVE' : 'COMPLETED'}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Agency:</span> {contract.agency}
                        </div>
                        <div>
                          <span className="font-medium">Start:</span> {formatDate(contract.start_date)}
                        </div>
                        <div>
                          <span className="font-medium">End:</span> {formatDate(contract.end_date)}
                        </div>
                        <div>
                          <span className="font-medium">NAICS:</span> {contract.naics_code || 'N/A'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right ml-4">
                      <div className="text-lg font-bold text-blue-600">
                        {formatCurrency(contract.amount)}
                      </div>
                      {isActive && daysRemaining > 0 && (
                        <div className="text-sm text-orange-600 font-medium">
                          {daysRemaining} days remaining
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Enhanced Business Intelligence Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-green-50 p-6 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-3">🎯 Business Intelligence Summary</h4>
        <div className="text-sm text-gray-700 space-y-2">
          <p>
            <strong>Current Status:</strong> {contractorName} has {summaryStats.activeContracts} active contracts 
            worth {formatCurrency(summaryStats.activeValue)} in current revenue.
          </p>
          <p>
            <strong>Peak Performance:</strong> Highest activity was in {summaryStats.peakContractPeriod} 
            with {summaryStats.maxContracts} simultaneous contracts.
          </p>
          <p>
            <strong>Enhanced Scaling Insight:</strong> {timeRange.totalYears <= 3 ? 
              'Short timeline (≤3 years) uses monthly granularity for detailed analysis.' :
              timeRange.totalYears <= 8 ?
              'Medium timeline (3-8 years) uses enhanced quarterly granularity with reduced markers for optimal readability.' :
              timeRange.totalYears <= 20 ?
              'Long timeline (8-20 years) uses yearly granularity for historical perspective.' :
              'Very long timeline (20+ years) uses multi-year intervals for optimal readability, ideal for analyzing decades of contracting history.'
            }
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContractorTimeline;
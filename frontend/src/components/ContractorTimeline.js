import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { format, parseISO, differenceInDays, differenceInYears, startOfMonth, endOfMonth, addMonths, subMonths, isAfter, isBefore, addDays, startOfYear, addYears, startOfQuarter, addQuarters } from 'date-fns';

const ContractorTimeline = ({ contractor, profile }) => {
  const [viewMode, setViewMode] = useState('revenue-timeline'); // 'revenue-timeline', 'gantt', 'list'
  const [contractFilter, setContractFilter] = useState('active'); // 'active', 'all', 'ending-soon'
  const [sortBy, setSortBy] = useState('start_date');
  const [timelineData, setTimelineData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zoomLevel, setZoomLevel] = useState('auto'); // 'auto', 'months', 'quarters', 'years', 'decades'
  const [screenDimensions, setScreenDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Refs for measuring actual container dimensions
  const ganttContainerRef = useRef(null);
  const timelineAreaRef = useRef(null);

  // Safely extract data from our API response structure
  const contractorData = profile?.contractor || contractor || {};
  const contractorName = contractorData.name || contractor?.name || 'Unknown Contractor';
  
  // Track screen resize events for responsive scaling
  useEffect(() => {
    const handleResize = () => {
      setScreenDimensions({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Check if contract is currently active (end date is in the future)
  const isContractActive = (contract) => {
    const now = new Date();
    const endDate = parseISO(contract.end_date);
    return isAfter(endDate, now);
  };

  // FIXED: Check if contract is ending soon (within 1 year from today, regardless of whether it's currently active)
  const isContractEndingSoon = (contract) => {
    const now = new Date();
    const endDate = parseISO(contract.end_date);
    const oneYearFromNow = addDays(now, 365);
    // Contract ends within the next year (could be active or recently completed)
    return isBefore(endDate, oneYearFromNow) && isAfter(endDate, subMonths(now, 3)); // Include contracts that ended up to 3 months ago
  };

  // FIXED: Filter contracts based on user selection with corrected logic
  const filteredContracts = useMemo(() => {
    if (!timelineData?.timeline_contracts) return [];
    
    const contracts = timelineData.timeline_contracts;
    
    switch (contractFilter) {
      case 'active':
        return contracts.filter(contract => isContractActive(contract));
      case 'ending-soon':
        // FIXED: Include all contracts that end within 1 year, regardless of current status
        return contracts.filter(contract => {
          const now = new Date();
          const endDate = parseISO(contract.end_date);
          const oneYearFromNow = addDays(now, 365);
          // Contracts ending within next 12 months OR ended within last 3 months
          return (isAfter(endDate, now) && isBefore(endDate, oneYearFromNow)) ||
                 (isBefore(endDate, now) && isAfter(endDate, subMonths(now, 3)));
        });
      case 'all':
      default:
        return contracts;
    }
  }, [timelineData, contractFilter]);

  // FIXED: Calculate timeline range based on ALL contracts, not just filtered ones
  // This prevents scaling issues when switching between filters
  const timeRange = useMemo(() => {
    // Use ALL contracts for calculating the overall timeline range
    const allContracts = timelineData?.timeline_contracts || [];
    
    if (allContracts.length === 0) {
      const now = new Date();
      return {
        start: subMonths(startOfMonth(now), 6),
        end: addMonths(endOfMonth(now), 6),
        duration: 'short',
        totalYears: 1,
        contractStart: now,
        contractEnd: now,
        contractYears: 0,
        actualRange: { start: now, end: now }
      };
    }

    // Calculate range from ALL contracts to maintain consistent scaling
    const startDates = allContracts.map(c => {
      try {
        return parseISO(c.start_date);
      } catch {
        return new Date();
      }
    }).filter(date => !isNaN(date.getTime()));
    
    const endDates = allContracts.map(c => {
      try {
        return parseISO(c.end_date);
      } catch {
        return new Date();
      }
    }).filter(date => !isNaN(date.getTime()));
    
    if (startDates.length === 0 || endDates.length === 0) {
      const now = new Date();
      return {
        start: subMonths(startOfMonth(now), 6),
        end: addMonths(endOfMonth(now), 6),
        duration: 'short',
        totalYears: 1,
        contractStart: now,
        contractEnd: now,
        contractYears: 0,
        actualRange: { start: now, end: now }
      };
    }
    
    const minStart = new Date(Math.min(...startDates));
    const maxEnd = new Date(Math.max(...endDates));
    
    // Calculate the actual contract span in years
    const contractYears = differenceInYears(maxEnd, minStart);
    
    // Adaptive padding based on contract span and filter type
    let startPadding, endPadding, duration;
    
    if (contractYears <= 2) {
      startPadding = 1; endPadding = 1; duration = 'very-short';
    } else if (contractYears <= 5) {
      startPadding = 2; endPadding = 2; duration = 'short';
    } else if (contractYears <= 10) {
      startPadding = 3; endPadding = 3; duration = 'medium';
    } else if (contractYears <= 20) {
      startPadding = 6; endPadding = 6; duration = 'long';
    } else {
      startPadding = 6; endPadding = 6; duration = 'very-long';
    }
    
    // For filtered views, adjust range to focus on relevant period
    let adjustedStart = minStart;
    let adjustedEnd = maxEnd;
    
    if (contractFilter === 'active' && filteredContracts.length > 0) {
      // For active contracts, focus on current active period
      const activeStartDates = filteredContracts.map(c => parseISO(c.start_date));
      const activeEndDates = filteredContracts.map(c => parseISO(c.end_date));
      adjustedStart = new Date(Math.min(...activeStartDates));
      adjustedEnd = new Date(Math.max(...activeEndDates));
      startPadding = Math.min(startPadding, 3); // Reduce padding for active view
      endPadding = Math.min(endPadding, 6);
    } else if (contractFilter === 'ending-soon' && filteredContracts.length > 0) {
      // For ending soon, focus on the relevant time window
      const now = new Date();
      adjustedStart = subMonths(now, 6); // 6 months ago
      adjustedEnd = addMonths(now, 12); // 12 months from now
      startPadding = 1;
      endPadding = 1;
    }
    
    const paddedStart = subMonths(startOfMonth(adjustedStart), startPadding);
    const paddedEnd = addMonths(endOfMonth(adjustedEnd), endPadding);
    
    return {
      start: paddedStart,
      end: paddedEnd,
      duration,
      totalYears: differenceInYears(paddedEnd, paddedStart),
      contractStart: adjustedStart,
      contractEnd: adjustedEnd,
      contractYears: differenceInYears(adjustedEnd, adjustedStart),
      actualRange: { start: adjustedStart, end: adjustedEnd }
    };
  }, [timelineData, contractFilter, filteredContracts]);

  // ENHANCED: Better responsive design breakpoints and calculations
  const responsiveTimelineConfig = useMemo(() => {
    const containerElement = ganttContainerRef.current;
    
    // Better responsive breakpoints
    let deviceType, baseSpacing, textWidth, labelWidth;
    
    if (screenDimensions.width < 640) {
      // Mobile phones
      deviceType = 'mobile';
      baseSpacing = 50;
      textWidth = 40;
      labelWidth = 200;
    } else if (screenDimensions.width < 768) {
      // Large mobile/small tablet
      deviceType = 'mobile-large';
      baseSpacing = 60;
      textWidth = 45;
      labelWidth = 220;
    } else if (screenDimensions.width < 1024) {
      // Tablet
      deviceType = 'tablet';
      baseSpacing = 70;
      textWidth = 50;
      labelWidth = 240;
    } else if (screenDimensions.width < 1440) {
      // Desktop
      deviceType = 'desktop';
      baseSpacing = 80;
      textWidth = 60;
      labelWidth = 264;
    } else {
      // Large desktop
      deviceType = 'desktop-large';
      baseSpacing = 100;
      textWidth = 70;
      labelWidth = 280;
    }
    
    // Calculate available width more accurately
    const actualContainerWidth = containerElement?.offsetWidth || 
                                 Math.max(320, screenDimensions.width * 0.9); // Better fallback
    
    const availableTimelineWidth = Math.max(200, actualContainerWidth - labelWidth - 40);
    
    // Calculate optimal marker count based on available space
    const maxPhysicalMarkers = Math.floor(availableTimelineWidth / baseSpacing);
    const optimalMarkerCount = Math.max(3, Math.min(deviceType === 'mobile' ? 8 : 15, maxPhysicalMarkers));
    
    return {
      availableWidth: availableTimelineWidth,
      maxMarkers: optimalMarkerCount,
      minSpacing: baseSpacing,
      textWidth,
      labelWidth,
      containerWidth: actualContainerWidth,
      deviceType
    };
  }, [screenDimensions, ganttContainerRef.current?.offsetWidth]);

  // Enhanced zoom level calculation with better responsive logic
  const optimalZoomLevel = useMemo(() => {
    if (zoomLevel !== 'auto') return zoomLevel;
    
    if (!timeRange.contractYears) return 'months';
    
    const { maxMarkers, deviceType } = responsiveTimelineConfig;
    
    // For mobile devices, prefer less granular views
    if (deviceType === 'mobile' || maxMarkers <= 4) {
      if (timeRange.contractYears > 5) return 'years';
      if (timeRange.contractYears > 2) return 'quarters';
      return 'months';
    }
    
    // For larger screens, use the full range
    if (timeRange.contractYears <= 1.5) {
      return 'months';
    } else if (timeRange.contractYears <= 6) {
      return 'quarters';
    } else if (timeRange.contractYears <= 25) {
      return 'years';
    } else {
      return 'decades';
    }
  }, [timeRange, zoomLevel, responsiveTimelineConfig]);

  // Generate revenue timeline data for the area chart
  const revenueTimelineData = useMemo(() => {
    if (!timeRange.start || !timeRange.end || !timelineData?.timeline_contracts) return [];
    
    const allContracts = timelineData.timeline_contracts;
    const timelinePoints = [];
    
    // Generate monthly data points within the timeline range
    let current = timeRange.start;
    while (current <= timeRange.end) {
      let activeRevenue = 0;
      let completedRevenue = 0;
      let totalActiveContracts = 0;
      let totalCompletedContracts = 0;
      
      // Calculate revenue and contract count at this point in time
      allContracts.forEach(contract => {
        try {
          const contractStart = parseISO(contract.start_date);
          const contractEnd = parseISO(contract.end_date);
          
          // Check if contract was active at this time
          if (contractStart <= current && contractEnd >= current) {
            const contractDuration = Math.max(1, differenceInDays(contractEnd, contractStart));
            const monthlyRevenue = (contract.amount || 0) / (contractDuration / 30.44);
            
            // Determine if this contract is currently active
            const isCurrentlyActive = isAfter(contractEnd, new Date());
            
            if (isCurrentlyActive) {
              activeRevenue += monthlyRevenue;
              totalActiveContracts += 1;
            } else {
              completedRevenue += monthlyRevenue;
              totalCompletedContracts += 1;
            }
          }
        } catch (error) {
          console.warn('Error processing contract dates:', contract, error);
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

  // ENHANCED: Generate responsive timeline scale
  const ganttTimeScale = useMemo(() => {
    if (!timeRange.start || !timeRange.end) return [];
    
    const scale = [];
    const timelineStart = timeRange.actualRange?.start || timeRange.start;
    const timelineEnd = timeRange.actualRange?.end || timeRange.end;
    
    let current = new Date(timelineStart);
    const totalDuration = differenceInDays(timelineEnd, timelineStart);
    
    if (totalDuration <= 0) return [];
    
    const { maxMarkers, deviceType } = responsiveTimelineConfig;
    
    // Determine step size and formatting based on zoom level and device
    let stepFunction, formatFunction, stepSize;
    
    switch (optimalZoomLevel) {
      case 'months':
        stepFunction = addMonths;
        stepSize = Math.max(1, Math.ceil(timeRange.contractYears * 12 / maxMarkers));
        formatFunction = (date) => deviceType === 'mobile' ? 
          format(date, 'MMM') : format(date, 'MMM yy');
        current = startOfMonth(current);
        break;
        
      case 'quarters':
        stepFunction = addQuarters;
        stepSize = Math.max(1, Math.ceil(timeRange.contractYears * 4 / maxMarkers));
        formatFunction = (date) => {
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          const seasonMap = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4' };
          return deviceType === 'mobile' ? 
            `${seasonMap[quarter]}` : `${seasonMap[quarter]} ${format(date, 'yy')}`;
        };
        current = startOfQuarter(current);
        break;
        
      case 'years':
        stepFunction = addYears;
        stepSize = Math.max(1, Math.ceil(timeRange.contractYears / maxMarkers));
        formatFunction = (date) => format(date, 'yyyy');
        current = startOfYear(current);
        break;
        
      case 'decades':
        stepFunction = addYears;
        stepSize = Math.max(2, Math.ceil(timeRange.contractYears / maxMarkers));
        formatFunction = (date) => format(date, 'yyyy');
        current = startOfYear(current);
        break;
        
      default:
        stepFunction = addMonths;
        stepSize = 1;
        formatFunction = (date) => format(date, 'MMM yy');
        current = startOfMonth(current);
    }
    
    let markerCount = 0;
    
    // Generate timeline markers
    while (current <= timelineEnd && markerCount < maxMarkers) {
      const daysFromTimelineStart = differenceInDays(current, timeRange.start);
      const totalTimelineDuration = differenceInDays(timeRange.end, timeRange.start);
      const positionPercent = totalTimelineDuration > 0 ? 
        (daysFromTimelineStart / totalTimelineDuration) * 100 : 0;
      
      scale.push({
        date: new Date(current),
        label: formatFunction(current),
        position: Math.max(0, Math.min(100, positionPercent))
      });
      
      current = stepFunction(current, stepSize);
      markerCount++;
    }
    
    return scale;
  }, [timeRange, optimalZoomLevel, responsiveTimelineConfig]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    if (!timelineData?.timeline_contracts) return {};
    
    const contracts = timelineData.timeline_contracts;
    const activeContracts = contracts.filter(isContractActive);
    const endingSoonContracts = contracts.filter(contract => {
      const now = new Date();
      const endDate = parseISO(contract.end_date);
      const oneYearFromNow = addDays(now, 365);
      return (isAfter(endDate, now) && isBefore(endDate, oneYearFromNow)) ||
             (isBefore(endDate, now) && isAfter(endDate, subMonths(now, 3)));
    });
    
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

  // Calculate Gantt position for contracts with precise alignment
  const calculateGanttPosition = (startDate, endDate) => {
    if (!timeRange.start || !timeRange.end) {
      return { left: '0%', width: '0%' };
    }
    
    const totalDuration = differenceInDays(timeRange.end, timeRange.start);
    if (totalDuration <= 0) return { left: '0%', width: '0%' };
    
    try {
      const contractStartDate = parseISO(startDate);
      const contractEndDate = parseISO(endDate);
      
      const startOffset = differenceInDays(contractStartDate, timeRange.start);
      const contractDuration = differenceInDays(contractEndDate, contractStartDate);
      
      const leftPercent = Math.max(0, Math.min(100, (startOffset / totalDuration) * 100));
      const widthPercent = Math.max(0.5, Math.min(100 - leftPercent, (contractDuration / totalDuration) * 100));
      
      return {
        left: `${leftPercent}%`,
        width: `${widthPercent}%`
      };
    } catch (error) {
      console.warn('Error calculating Gantt position for contract:', { startDate, endDate, error });
      return { left: '0%', width: '0%' };
    }
  };

  const getStatusColor = (contract) => {
    try {
      const endDate = parseISO(contract.end_date);
      const now = new Date();
      
      if (isAfter(now, endDate)) return '#94a3b8'; // gray-400 - completed
      if (differenceInDays(endDate, now) < 90) return '#f97316'; // orange-500 - ending soon
      return '#10b981'; // emerald-500 - active
    } catch {
      return '#94a3b8'; // gray fallback
    }
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
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-4 space-y-4 lg:space-y-0">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            📊 {contractorName} - Revenue Timeline
          </h2>
          
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
            {/* Contract Filter */}
            <select
              value={contractFilter}
              onChange={(e) => setContractFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="active">Active Contracts Only</option>
              <option value="ending-soon">Contracts Ending Within 1 Year</option>
              <option value="all">All Contract History</option>
            </select>
            
            <select
              value={zoomLevel}
              onChange={(e) => setZoomLevel(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500 text-sm"
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
                className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-l-md border ${
                  viewMode === 'revenue-timeline'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Revenue Timeline
              </button>
              <button
                onClick={() => setViewMode('gantt')}
                className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-t border-b ${
                  viewMode === 'gantt'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Gantt Chart
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-r-md border ${
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
          <div className="text-center p-2 sm:p-4 bg-green-50 rounded-lg">
            <div className="text-lg sm:text-2xl font-bold text-green-600">
              {summaryStats.activeContracts || 0}
            </div>
            <div className="text-xs sm:text-sm text-green-800">Active Contracts</div>
          </div>
          <div className="text-center p-2 sm:p-4 bg-blue-50 rounded-lg">
            <div className="text-sm sm:text-xl font-bold text-blue-600">
              {formatCurrency(summaryStats.activeValue || 0)}
            </div>
            <div className="text-xs sm:text-sm text-blue-800">Active Revenue</div>
          </div>
          <div className="text-center p-2 sm:p-4 bg-purple-50 rounded-lg">
            <div className="text-sm sm:text-xl font-bold text-purple-600">
              {formatCurrency(summaryStats.totalValue || 0)}
            </div>
            <div className="text-xs sm:text-sm text-purple-800">Total Lifetime</div>
          </div>
          <div className="text-center p-2 sm:p-4 bg-orange-50 rounded-lg">
            <div className="text-lg font-bold text-orange-600">
              {summaryStats.endingSoonContracts || 0}
            </div>
            <div className="text-xs sm:text-sm text-orange-800">Ending Within 1 Year</div>
          </div>
          <div className="text-center p-2 sm:p-4 bg-red-50 rounded-lg">
            <div className="text-sm sm:text-lg font-bold text-red-600">
              {summaryStats.valleyContractPeriod}
            </div>
            <div className="text-xs sm:text-sm text-red-800">Lowest Activity ({summaryStats.minContracts})</div>
          </div>
          <div className="text-center p-2 sm:p-4 bg-gray-50 rounded-lg">
            <div className="text-xl sm:text-2xl font-bold text-gray-600">
              {timelineData.metadata?.is_complete_data ? '✅' : '⚠️'}
            </div>
            <div className="text-xs sm:text-sm text-gray-800">
              {timelineData.metadata?.is_complete_data ? 'Complete Data' : 'Limited Data'}
            </div>
          </div>
        </div>

        {/* Timeline Info */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <div className="text-xs sm:text-sm text-blue-800">
            <strong>Current View:</strong> {
              contractFilter === 'active' ? 
                `Showing ${summaryStats.activeContracts} active contracts` :
              contractFilter === 'ending-soon' ?
                `Showing ${summaryStats.endingSoonContracts} contracts ending within 1 year` :
                `Showing all ${summaryStats.totalContracts} contracts in history`
            }
            <span className="ml-2">
              (Contract Period: {format(timeRange.actualRange?.start || timeRange.start, 'MMM yyyy')} - {format(timeRange.actualRange?.end || timeRange.end, 'MMM yyyy')})
            </span>
            <span className="hidden sm:inline ml-2 font-medium">
              | Scale: {optimalZoomLevel} ({ganttTimeScale.length} markers) - Optimized for {responsiveTimelineConfig.deviceType}
            </span>
          </div>
        </div>
      </div>

      {/* Main Timeline Content */}
      <div className="bg-white rounded-lg shadow" ref={ganttContainerRef}>
        {viewMode === 'revenue-timeline' ? (
          // Enhanced Revenue Timeline Chart
          <div className="p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-6">
              📈 Revenue Performance Timeline
              {contractFilter === 'active' && <span className="text-sm text-green-600 ml-2">(Active Contracts in Green)</span>}
              {contractFilter === 'all' && <span className="text-sm text-gray-600 ml-2">(Active: Green, Completed: Gray)</span>}
            </h3>
            
            <div className="relative h-60 sm:h-80 mb-6 bg-gray-50 rounded-lg p-4 border">
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
            <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-sm mb-6">
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
          // ENHANCED: Responsive Gantt Chart View
          <div className="p-4 sm:p-6" ref={timelineAreaRef}>
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-6">
              📋 Contract Portfolio Gantt Chart
              {contractFilter === 'active' && <span className="text-sm text-green-600 ml-2">(Active Contracts Only)</span>}
              {contractFilter === 'ending-soon' && <span className="text-sm text-orange-600 ml-2">(Contracts Ending Within 1 Year)</span>}
              {contractFilter === 'all' && <span className="text-sm text-gray-600 ml-2">(All Contract History)</span>}
            </h3>
            
            {sortedContracts.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <div className="text-4xl mb-4">📅</div>
                <p>No contracts found for the selected filter criteria.</p>
                <p className="text-sm mt-2 text-gray-400">
                  {contractFilter === 'ending-soon' ? 
                    'Try selecting "All Contract History" to see completed contracts.' :
                    'Try adjusting your filter selection.'
                  }
                </p>
              </div>
            ) : (
              <>
                {/* Responsive Time Scale Header */}
                <div className="mb-4 border-b border-gray-200 pb-2 bg-gray-50 rounded-t-lg overflow-x-auto">
                  <div className="text-xs text-gray-500 font-medium relative h-12 flex items-end min-w-[600px]">
                    <div style={{width: `${responsiveTimelineConfig.labelWidth}px`}} className="flex-shrink-0 text-center border-r border-gray-300 py-2">
                      <strong>Contract Details</strong>
                    </div>
                    <div className="flex-1 relative px-2">
                      <div className="text-center mb-1 text-gray-700 font-semibold">
                        Timeline: {format(timeRange.actualRange?.start || timeRange.start, 'MMM yyyy')} - {format(timeRange.actualRange?.end || timeRange.end, 'MMM yyyy')} 
                        ({optimalZoomLevel.charAt(0).toUpperCase() + optimalZoomLevel.slice(1)} Scale)
                      </div>
                      <div className="relative">
                        {ganttTimeScale.map((scaleItem, index) => (
                          <div 
                            key={index}
                            className="absolute text-center border-l border-gray-300 pl-1"
                            style={{ 
                              left: `${scaleItem.position}%`,
                              transform: 'translateX(-50%)',
                              minWidth: `${responsiveTimelineConfig.textWidth}px`
                            }}
                          >
                            <div className="text-gray-600 font-medium">
                              {scaleItem.label}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contract Gantt Bars with responsive design */}
                <div className="space-y-1 relative overflow-x-auto" style={{ minHeight: Math.max(300, sortedContracts.slice(0, 50).length * 36) }}>
                  <div className="min-w-[600px]">
                    {sortedContracts.slice(0, 50).map((contract, index) => {
                      const position = calculateGanttPosition(contract.start_date, contract.end_date);
                      const color = getStatusColor(contract);
                      const isShortContract = parseFloat(position.width) < 2;
                      
                      return (
                        <div key={contract.id || index} className="relative h-8 hover:bg-gray-50 group">
                          {/* Contract Label */}
                          <div 
                            className="absolute left-0 top-0 h-8 flex items-center px-3 bg-white border-r border-gray-200 z-20"
                            style={{width: `${responsiveTimelineConfig.labelWidth}px`}}
                          >
                            <div className="truncate w-full">
                              <div className="text-xs font-medium text-gray-900 truncate" title={contract.title || contract.id}>
                                {contract.title || contract.id}
                              </div>
                              <div className="text-xs text-gray-500">
                                {formatCurrency(contract.amount)}
                              </div>
                            </div>
                          </div>
                          
                          {/* Gantt Bar */}
                          <div 
                            className="absolute top-0 right-0 h-8 flex items-center px-2"
                            style={{left: `${responsiveTimelineConfig.labelWidth}px`}}
                          >
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
                                  minWidth: isShortContract ? '4px' : '2px',
                                  zIndex: 10
                                }}
                                title={`${contract.title}\n${formatDate(contract.start_date)} - ${formatDate(contract.end_date)}\n${formatCurrency(contract.amount)}\nDuration: ${differenceInDays(parseISO(contract.end_date), parseISO(contract.start_date))} days`}
                              >
                                {!isShortContract && (
                                  <span className="truncate text-xs">
                                    {optimalZoomLevel === 'decades' || optimalZoomLevel === 'years' ? 
                                      format(parseISO(contract.start_date), 'yyyy') :
                                      responsiveTimelineConfig.deviceType === 'mobile' ?
                                        format(parseISO(contract.start_date), 'MMM yy') :
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
                </div>

                {/* Enhanced Legend */}
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
                    <strong>Responsive Timeline:</strong> Optimized for {responsiveTimelineConfig.deviceType} display 
                    ({screenDimensions.width}px) with {ganttTimeScale.length} timeline markers. 
                    Filter showing {sortedContracts.length} contracts out of {timelineData.timeline_contracts?.length || 0} total.
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
            <div className="px-4 sm:px-6 py-4 bg-gray-50">
              <h3 className="text-base sm:text-lg font-medium text-gray-900">
                Contract Portfolio ({sortedContracts.length})
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {contractFilter === 'active' ? 'Active contracts only' : 
                 contractFilter === 'ending-soon' ? 'Contracts ending within 1 year' :
                 'Complete contract history'}
              </p>
            </div>
            
            {sortedContracts.map((contract, index) => {
              const daysRemaining = differenceInDays(parseISO(contract.end_date), new Date());
              const isActive = isContractActive(contract);
              
              return (
                <div key={contract.id || index} className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start space-y-2 sm:space-y-0">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-lg">
                          {isActive ? (daysRemaining < 90 ? '⏰' : '✅') : '✔️'}
                        </span>
                        <h4 className="text-base sm:text-lg font-semibold text-gray-900">
                          {contract.title || contract.id}
                        </h4>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {isActive ? 'ACTIVE' : 'COMPLETED'}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 text-sm text-gray-600">
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
                    
                    <div className="text-left sm:text-right sm:ml-4">
                      <div className="text-base sm:text-lg font-bold text-blue-600">
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
      <div className="bg-gradient-to-r from-blue-50 to-green-50 p-4 sm:p-6 rounded-lg">
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
            <strong>Responsive Design:</strong> Interface optimized for {responsiveTimelineConfig.deviceType} devices 
            ({screenDimensions.width}px display) with dynamic timeline scaling.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContractorTimeline;
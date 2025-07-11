import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { format, parseISO, differenceInDays, startOfMonth, endOfMonth, addMonths, subMonths, isAfter, isBefore } from 'date-fns';

const ContractorTimeline = ({ contractor, profile }) => {
  const [viewMode, setViewMode] = useState('revenue-timeline'); // 'revenue-timeline', 'gantt', 'list'
  const [contractFilter, setContractFilter] = useState('active'); // 'active', 'all'
  const [sortBy, setSortBy] = useState('start_date');
  const [timelineData, setTimelineData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState({ start: null, end: null });
  const [zoomLevel, setZoomLevel] = useState('months'); // 'months', 'quarters', 'years'

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
      
      // Calculate time range from contracts
      if (data.timeline_contracts && data.timeline_contracts.length > 0) {
        const startDates = data.timeline_contracts.map(c => new Date(c.start_date));
        const endDates = data.timeline_contracts.map(c => new Date(c.end_date));
        
        const minStart = new Date(Math.min(...startDates));
        const maxEnd = new Date(Math.max(...endDates));
        
        // Add some padding to the range
        setTimeRange({
          start: subMonths(startOfMonth(minStart), 6),
          end: addMonths(endOfMonth(maxEnd), 12) // Extend for future projections
        });
      }
      
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

  // Filter contracts based on user selection
  const filteredContracts = useMemo(() => {
    if (!timelineData?.timeline_contracts) return [];
    
    const contracts = timelineData.timeline_contracts;
    
    if (contractFilter === 'active') {
      return contracts.filter(contract => isContractActive(contract));
    }
    
    return contracts; // Return all contracts
  }, [timelineData, contractFilter]);

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
      
      // Calculate revenue at this point in time
      allContracts.forEach(contract => {
        const contractStart = new Date(contract.start_date);
        const contractEnd = new Date(contract.end_date);
        
        // Check if contract was active at this time
        if (contractStart <= current && contractEnd >= current) {
          const isActive = isContractActive(contract);
          const monthlyRevenue = (contract.amount || 0) / 12; // Approximate monthly revenue
          
          if (isActive) {
            activeRevenue += monthlyRevenue;
          } else {
            completedRevenue += monthlyRevenue;
          }
        }
      });
      
      timelinePoints.push({
        date: new Date(current),
        activeRevenue,
        completedRevenue,
        totalRevenue: activeRevenue + completedRevenue,
        month: format(current, 'yyyy-MM')
      });
      
      current = addMonths(current, 1);
    }
    
    return timelinePoints;
  }, [timelineData, timeRange]);

  // Generate time scale for charts
  const timeScale = useMemo(() => {
    if (!timeRange.start || !timeRange.end) return [];
    
    const scale = [];
    let current = timeRange.start;
    
    while (current <= timeRange.end) {
      scale.push(new Date(current));
      
      switch (zoomLevel) {
        case 'months':
          current = addMonths(current, 1);
          break;
        case 'quarters':
          current = addMonths(current, 3);
          break;
        case 'years':
          current = addMonths(current, 12);
          break;
        default:
          current = addMonths(current, 1);
      }
    }
    
    return scale;
  }, [timeRange, zoomLevel]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    if (!timelineData?.timeline_contracts) return {};
    
    const contracts = timelineData.timeline_contracts;
    const activeContracts = contracts.filter(isContractActive);
    const now = new Date();
    
    const activeValue = activeContracts.reduce((sum, contract) => sum + (contract.amount || 0), 0);
    const totalValue = contracts.reduce((sum, contract) => sum + (contract.amount || 0), 0);
    
    // Find peak and valley periods
    const maxRevenue = Math.max(...revenueTimelineData.map(point => point.totalRevenue));
    const minRevenue = Math.min(...revenueTimelineData.map(point => point.totalRevenue));
    
    const peakPeriod = revenueTimelineData.find(point => point.totalRevenue === maxRevenue);
    const valleyPeriod = revenueTimelineData.find(point => point.totalRevenue === minRevenue);
    
    return {
      activeContracts: activeContracts.length,
      totalContracts: contracts.length,
      activeValue,
      totalValue,
      completedContracts: contracts.length - activeContracts.length,
      peakPeriod: peakPeriod ? format(peakPeriod.date, 'MMM yyyy') : 'N/A',
      valleyPeriod: valleyPeriod ? format(valleyPeriod.date, 'MMM yyyy') : 'N/A',
      peakRevenue: maxRevenue,
      valleyRevenue: minRevenue
    };
  }, [timelineData, revenueTimelineData]);

  // Calculate Gantt position for contracts
  const calculateGanttPosition = (startDate, endDate) => {
    if (!timeRange.start || !timeRange.end) return { left: 0, width: 0 };
    
    const totalDuration = differenceInDays(timeRange.end, timeRange.start);
    const startOffset = differenceInDays(parseISO(startDate), timeRange.start);
    const duration = differenceInDays(parseISO(endDate), parseISO(startDate));
    
    const leftPercent = Math.max(0, (startOffset / totalDuration) * 100);
    const widthPercent = Math.min(100 - leftPercent, (duration / totalDuration) * 100);
    
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
  }

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
              <option value="all">All Contract History</option>
            </select>
            
            <select
              value={zoomLevel}
              onChange={(e) => setZoomLevel(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="months">Monthly View</option>
              <option value="quarters">Quarterly View</option>
              <option value="years">Yearly View</option>
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
              {summaryStats.peakPeriod}
            </div>
            <div className="text-sm text-orange-800">Peak Period</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-lg font-bold text-red-600">
              {summaryStats.valleyPeriod}
            </div>
            <div className="text-sm text-red-800">Lowest Period</div>
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

        {/* Contract Filter Info */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <div className="text-sm text-blue-800">
            <strong>Current View:</strong> {contractFilter === 'active' ? 
              `Showing ${summaryStats.activeContracts} active contracts (${summaryStats.completedContracts} completed contracts hidden)` :
              `Showing all ${summaryStats.totalContracts} contracts in history`
            }
          </div>
        </div>
      </div>

      {/* Main Timeline Content */}
      <div className="bg-white rounded-lg shadow">
        {viewMode === 'revenue-timeline' ? (
          // NEW: Revenue Timeline Chart
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">
              📈 Revenue Performance Timeline
            </h3>
            
            <div className="relative h-96 mb-6">
              {/* Revenue Area Chart */}
              <svg width="100%" height="100%" className="overflow-visible">
                <defs>
                  {/* Gradients for active and completed revenue */}
                  <linearGradient id="activeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.8"/>
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.2"/>
                  </linearGradient>
                  <linearGradient id="completedGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.6"/>
                    <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.1"/>
                  </linearGradient>
                </defs>
                
                {revenueTimelineData.length > 1 && (
                  <>
                    {/* Calculate chart dimensions */}
                    {(() => {
                      const maxRevenue = Math.max(...revenueTimelineData.map(point => point.totalRevenue));
                      const chartHeight = 320; // Leave room for axes
                      const chartWidth = 800; // Approximate
                      
                      // Generate paths for active and completed revenue areas
                      const activePoints = revenueTimelineData.map((point, index) => {
                        const x = (index / (revenueTimelineData.length - 1)) * 90; // 90% of width
                        const y = chartHeight - ((point.activeRevenue / maxRevenue) * (chartHeight - 40));
                        return `${x + 5}% ${y}px`;
                      }).join(' L ');
                      
                      const completedPoints = revenueTimelineData.map((point, index) => {
                        const x = (index / (revenueTimelineData.length - 1)) * 90;
                        const activeY = chartHeight - ((point.activeRevenue / maxRevenue) * (chartHeight - 40));
                        const totalY = chartHeight - ((point.totalRevenue / maxRevenue) * (chartHeight - 40));
                        return `${x + 5}% ${activeY}px`;
                      }).join(' L ');
                      
                      const totalPoints = revenueTimelineData.map((point, index) => {
                        const x = (index / (revenueTimelineData.length - 1)) * 90;
                        const y = chartHeight - ((point.totalRevenue / maxRevenue) * (chartHeight - 40));
                        return `${x + 5}% ${y}px`;
                      }).join(' L ');

                      return (
                        <>
                          {/* Active Revenue Area */}
                          <path
                            d={`M 5% ${chartHeight}px L ${activePoints} L 95% ${chartHeight}px Z`}
                            fill="url(#activeGradient)"
                            stroke="#10b981"
                            strokeWidth="2"
                          />
                          
                          {/* Completed Revenue Area */}
                          <path
                            d={`M 5% ${chartHeight}px L ${totalPoints} L 95% ${chartHeight}px Z`}
                            fill="url(#completedGradient)"
                            stroke="#94a3b8"
                            strokeWidth="1"
                            fillOpacity="0.3"
                          />
                          
                          {/* Total Revenue Line */}
                          <path
                            d={`M ${totalPoints}`}
                            fill="none"
                            stroke="#1f2937"
                            strokeWidth="3"
                          />
                        </>
                      );
                    })()}
                  </>
                )}
                
                {/* Y-axis labels */}
                <g className="text-xs text-gray-500">
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
                    const maxRevenue = Math.max(...revenueTimelineData.map(point => point.totalRevenue));
                    const value = maxRevenue * (1 - ratio);
                    const y = 40 + (ratio * 280);
                    
                    return (
                      <text key={index} x="2%" y={y} className="text-xs fill-gray-500">
                        {formatCurrency(value)}
                      </text>
                    );
                  })}
                </g>
              </svg>
              
              {/* Time axis */}
              <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-500 px-12">
                {timeScale.slice(0, 8).map((date, index) => (
                  <span key={index}>
                    {zoomLevel === 'months' && format(date, 'MMM yyyy')}
                    {zoomLevel === 'quarters' && format(date, 'QQQ yyyy')}
                    {zoomLevel === 'years' && format(date, 'yyyy')}
                  </span>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex justify-center space-x-6 text-sm">
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
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <p><strong>Peak Period:</strong> {summaryStats.peakPeriod} ({formatCurrency(summaryStats.peakRevenue)})</p>
                  <p><strong>Valley Period:</strong> {summaryStats.valleyPeriod} ({formatCurrency(summaryStats.valleyRevenue)})</p>
                  <p><strong>Growth Trend:</strong> {summaryStats.peakRevenue > summaryStats.valleyRevenue * 2 ? 'High Growth' : 'Stable'}</p>
                </div>
              </div>
            </div>
          </div>
        ) : viewMode === 'gantt' ? (
          // Gantt Chart View (Existing - but now filtered)
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">
              📋 Contract Portfolio Gantt Chart
              {contractFilter === 'active' && <span className="text-sm text-green-600 ml-2">(Active Contracts Only)</span>}
            </h3>
            
            {/* Time Scale Header */}
            <div className="mb-4 border-b border-gray-200 pb-2">
              <div className="flex text-xs text-gray-500 font-medium">
                {timeScale.map((date, index) => (
                  <div 
                    key={index}
                    className="flex-1 text-center border-r border-gray-100 last:border-r-0 px-1"
                    style={{ minWidth: '60px' }}
                  >
                    {zoomLevel === 'months' && format(date, 'MMM yyyy')}
                    {zoomLevel === 'quarters' && format(date, 'QQQ yyyy')}
                    {zoomLevel === 'years' && format(date, 'yyyy')}
                  </div>
                ))}
              </div>
            </div>

            {/* Contract Gantt Bars */}
            <div className="space-y-2 relative" style={{ minHeight: '300px' }}>
              {sortedContracts.slice(0, 20).map((contract, index) => {
                const position = calculateGanttPosition(contract.start_date, contract.end_date);
                const color = getStatusColor(contract);
                
                return (
                  <div key={contract.id || index} className="relative h-8 border-b border-gray-100 last:border-b-0">
                    {/* Contract Label */}
                    <div className="absolute left-0 top-0 w-64 h-8 flex items-center px-3 bg-gray-50 border-r border-gray-200 z-10">
                      <div className="truncate">
                        <div className="text-xs font-medium text-gray-900 truncate">
                          {contract.title || contract.id}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatCurrency(contract.amount)}
                        </div>
                      </div>
                    </div>
                    
                    {/* Gantt Bar */}
                    <div className="absolute left-64 top-0 right-0 h-8 flex items-center">
                      <div className="relative w-full h-full">
                        <div
                          className="absolute rounded-md shadow-sm border border-white flex items-center px-2 text-white text-xs font-medium overflow-hidden"
                          style={{
                            left: position.left,
                            width: position.width,
                            height: '24px',
                            backgroundColor: color,
                            top: '2px'
                          }}
                          title={`${contract.title}\n${formatDate(contract.start_date)} - ${formatDate(contract.end_date)}\n${formatCurrency(contract.amount)}`}
                        >
                          <span className="truncate text-xs">
                            {format(parseISO(contract.start_date), 'MMM yy')} - {format(parseISO(contract.end_date), 'MMM yy')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-6 flex flex-wrap gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-emerald-500 rounded"></div>
                <span>Active Contracts</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-orange-500 rounded"></div>
                <span>Ending Soon (&lt;3 months)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-gray-400 rounded"></div>
                <span>Completed</span>
              </div>
            </div>
            
            {sortedContracts.length > 20 && (
              <div className="mt-4 text-sm text-gray-600 text-center">
                Showing first 20 contracts. Switch to Contract List view to see all {sortedContracts.length} contracts.
              </div>
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
                {contractFilter === 'active' ? 'Active contracts only' : 'Complete contract history'}
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

      {/* Business Intelligence Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-green-50 p-6 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-3">🎯 Business Intelligence Summary</h4>
        <div className="text-sm text-gray-700 space-y-2">
          <p>
            <strong>Current Status:</strong> {contractorName} has {summaryStats.activeContracts} active contracts 
            worth {formatCurrency(summaryStats.activeValue)} in current revenue.
          </p>
          <p>
            <strong>Historical Performance:</strong> Peak performance was in {summaryStats.peakPeriod} 
            with {formatCurrency(summaryStats.peakRevenue)} in monthly revenue.
          </p>
          <p>
            <strong>Strategic Insight:</strong> {contractFilter === 'active' ? 
              'Focus on active contracts to understand current capacity and upcoming recompete schedule.' :
              'Historical view shows growth patterns and business cycle trends for competitive analysis.'
            }
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContractorTimeline;
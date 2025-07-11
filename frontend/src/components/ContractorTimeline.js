import React, { useState, useEffect, useMemo } from 'react';
import { format, parseISO, differenceInDays, startOfMonth, endOfMonth, eachMonthOfInterval, addMonths, subMonths } from 'date-fns';

const ContractorTimeline = ({ contractor, profile }) => {
  const [viewMode, setViewMode] = useState('gantt'); // 'gantt', 'timeline', or 'list'
  const [sortBy, setSortBy] = useState('start_date');
  const [timelineData, setTimelineData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState({ start: null, end: null });
  const [showWorkloadIntegral, setShowWorkloadIntegral] = useState(true);
  const [zoomLevel, setZoomLevel] = useState('months'); // 'months', 'quarters', 'years'

  // Safely extract data from our API response structure
  const contractorData = profile?.contractor || contractor || {};
  const profileData = profile?.profile || profile || {};
  const contractorName = contractorData.name || contractor?.name || 'Unknown Contractor';
  
  // Fetch complete timeline data when component loads
  useEffect(() => {
    if (contractorName && contractorName !== 'Unknown Contractor') {
      fetchTimelineData();
    }
  }, [contractorName]);

  const fetchTimelineData = async () => {
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
  };

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

  // Generate time scale based on zoom level
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

  // Calculate position and width for Gantt chart bars
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

  // Generate workload integral data
  const workloadIntegralData = useMemo(() => {
    if (!timelineData?.workload_projection || !timeRange.start || !timeRange.end) return [];
    
    const integral = [];
    const monthlyData = {};
    
    // Process workload projection data
    timelineData.workload_projection.forEach(item => {
      monthlyData[item.month] = item.workload;
    });
    
    // Generate smooth curve data points
    let current = timeRange.start;
    while (current <= timeRange.end) {
      const monthKey = format(current, 'yyyy-MM');
      const workload = monthlyData[monthKey] || 0;
      
      const offsetPercent = (differenceInDays(current, timeRange.start) / differenceInDays(timeRange.end, timeRange.start)) * 100;
      
      integral.push({
        date: current,
        workload,
        offsetPercent,
        monthKey
      });
      
      current = addMonths(current, 1);
    }
    
    return integral;
  }, [timelineData, timeRange]);

  const getStatusColor = (contract) => {
    const endDate = new Date(contract.end_date);
    const now = new Date();
    const status = contract.status;
    
    if (status === 'completed') return '#94a3b8'; // gray-400
    if (endDate < addMonths(now, 3)) return '#f97316'; // orange-500 - ending soon
    return '#10b981'; // emerald-500 - active
  };

  const getContractHeight = (amount) => {
    if (!timelineData?.timeline_contracts) return 20;
    
    const maxAmount = Math.max(...timelineData.timeline_contracts.map(c => c.amount || 0));
    const minHeight = 16;
    const maxHeight = 40;
    
    if (maxAmount === 0) return minHeight;
    
    const ratio = (amount || 0) / maxAmount;
    return minHeight + (ratio * (maxHeight - minHeight));
  };

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-lg shadow text-center">
        <div className="text-blue-500 text-4xl mb-4">⏳</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Complete Timeline Data</h3>
        <p className="text-gray-600">
          Fetching all contract awards and calculating timeline projections...
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

  const contracts = timelineData.timeline_contracts || [];
  const recompetes = timelineData.recompete_projections || [];
  const summary = timelineData.summary || {};

  const sortedContracts = [...contracts].sort((a, b) => {
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
            📅 {contractorName} - Contract Timeline
          </h2>
          
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
            <select
              value={zoomLevel}
              onChange={(e) => setZoomLevel(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="months">Monthly View</option>
              <option value="quarters">Quarterly View</option>
              <option value="years">Yearly View</option>
            </select>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="start_date">Sort by Start Date</option>
              <option value="end_date">Sort by End Date</option>
              <option value="amount">Sort by Amount</option>
            </select>
            
            <div className="flex rounded-md shadow-sm">
              <button
                onClick={() => setViewMode('gantt')}
                className={`px-4 py-2 text-sm font-medium rounded-l-md border ${
                  viewMode === 'gantt'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Gantt Chart
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-4 py-2 text-sm font-medium border-t border-b ${
                  viewMode === 'timeline'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Timeline View
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 text-sm font-medium rounded-r-md border ${
                  viewMode === 'list'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                List View
              </button>
            </div>
          </div>
        </div>

        {/* Enhanced Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {summary.active_contracts || 0}
            </div>
            <div className="text-sm text-green-800">Active Contracts</div>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">
              {summary.upcoming_recompetes || 0}
            </div>
            <div className="text-sm text-orange-800">Upcoming Recompetes</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(summary.total_active_value || 0)}
            </div>
            <div className="text-sm text-purple-800">Active Value</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {summary.timeline_span_years || 0}
            </div>
            <div className="text-sm text-blue-800">Years of History</div>
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

        {/* Workload Toggle for Gantt View */}
        {viewMode === 'gantt' && (
          <div className="mt-4 flex items-center">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showWorkloadIntegral}
                onChange={(e) => setShowWorkloadIntegral(e.target.checked)}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm text-gray-700">Show Proposal Workload Projection</span>
            </label>
          </div>
        )}
      </div>

      {/* Main Timeline Content */}
      <div className="bg-white rounded-lg shadow">
        {viewMode === 'gantt' ? (
          // Gantt Chart View
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">
              Contract Portfolio Gantt Chart
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

            {/* Workload Integral Background */}
            {showWorkloadIntegral && workloadIntegralData.length > 0 && (
              <div className="relative mb-4 h-20 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
                <div className="absolute inset-0 p-2">
                  <div className="text-xs font-medium text-blue-700 mb-1">
                    Proposal Workload Projection (Recompete Activity)
                  </div>
                  <svg width="100%" height="50" className="overflow-visible">
                    <defs>
                      <linearGradient id="workloadGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3"/>
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1"/>
                      </linearGradient>
                    </defs>
                    {workloadIntegralData.length > 1 && (
                      <path
                        d={`M ${workloadIntegralData.map((point, index) => 
                          `${point.offsetPercent}% ${50 - (point.workload / Math.max(...workloadIntegralData.map(p => p.workload))) * 40}`
                        ).join(' L ')}`}
                        fill="url(#workloadGradient)"
                        stroke="#3b82f6"
                        strokeWidth="2"
                        fillOpacity="0.3"
                      />
                    )}
                  </svg>
                </div>
              </div>
            )}

            {/* Contract Gantt Bars */}
            <div className="space-y-2 relative" style={{ minHeight: '400px' }}>
              {sortedContracts.map((contract, index) => {
                const position = calculateGanttPosition(contract.start_date, contract.end_date);
                const height = getContractHeight(contract.amount);
                const color = getStatusColor(contract);
                
                return (
                  <div key={contract.id || index} className="relative h-12 border-b border-gray-100 last:border-b-0">
                    {/* Contract Label */}
                    <div className="absolute left-0 top-0 w-64 h-12 flex items-center px-3 bg-gray-50 border-r border-gray-200 z-10">
                      <div className="truncate">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {contract.title || contract.id}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatCurrency(contract.amount)} • {contract.agency}
                        </div>
                      </div>
                    </div>
                    
                    {/* Gantt Bar */}
                    <div className="absolute left-64 top-0 right-0 h-12 flex items-center">
                      <div className="relative w-full h-full">
                        <div
                          className="absolute rounded-md shadow-sm border border-white flex items-center px-2 text-white text-xs font-medium overflow-hidden"
                          style={{
                            left: position.left,
                            width: position.width,
                            height: `${height}px`,
                            backgroundColor: color,
                            top: `${(48 - height) / 2}px`
                          }}
                          title={`${contract.title}\n${formatDate(contract.start_date)} - ${formatDate(contract.end_date)}\n${formatCurrency(contract.amount)}`}
                        >
                          <span className="truncate">
                            {formatDate(contract.start_date)} - {formatDate(contract.end_date)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Recompete Events Overlay */}
              {recompetes.map((recompete, index) => {
                const startPosition = calculateGanttPosition(recompete.recompete_start, recompete.contract_end);
                
                return (
                  <div 
                    key={`recompete-${index}`}
                    className="absolute left-64 right-0 pointer-events-none"
                    style={{ 
                      top: `${index * 48 + 35}px`,
                      height: '8px'
                    }}
                  >
                    <div
                      className="absolute bg-red-400 opacity-60 rounded-full"
                      style={{
                        left: startPosition.left,
                        width: startPosition.width,
                        height: '4px',
                        top: '2px'
                      }}
                      title={`Recompete: ${recompete.contract_title}`}
                    />
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
              <div className="flex items-center space-x-2">
                <div className="w-4 h-2 bg-red-400 rounded-full"></div>
                <span>Recompete Period</span>
              </div>
              {showWorkloadIntegral && (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-blue-400 opacity-30 rounded"></div>
                  <span>Proposal Workload</span>
                </div>
              )}
            </div>
          </div>
        ) : viewMode === 'timeline' ? (
          // Enhanced Timeline View
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">Contract Timeline Visualization</h3>
            <p className="text-gray-600 mb-4">
              Timeline view showing contract durations and status. Bar height represents contract value.
            </p>
            
            <div className="space-y-4">
              {sortedContracts.map((contract, index) => {
                const startDate = new Date(contract.start_date);
                const endDate = new Date(contract.end_date);
                const now = new Date();
                const totalDuration = endDate - startDate;
                const elapsed = now - startDate;
                const progressPercent = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
                const daysRemaining = differenceInDays(endDate, now);
                
                return (
                  <div key={contract.id || index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-gray-900">
                        {contract.title || contract.id}
                      </span>
                      <span className="text-sm text-gray-600">{formatCurrency(contract.amount)}</span>
                    </div>
                    
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>{formatDate(contract.start_date)}</span>
                      <span>{formatDate(contract.end_date)}</span>
                    </div>
                    
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full transition-all duration-300`}
                        style={{ 
                          width: `${progressPercent}%`,
                          backgroundColor: getStatusColor(contract)
                        }}
                      ></div>
                    </div>
                    
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-gray-500">{contract.agency}</span>
                      {daysRemaining > 0 && (
                        <span className="text-xs text-orange-600 font-medium">
                          {daysRemaining} days left
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // List View (existing implementation)
          <div className="divide-y divide-gray-200">
            <div className="px-6 py-4 bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">
                Contract Awards ({sortedContracts.length})
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Complete contract portfolio with timeline analysis
              </p>
            </div>
            
            {sortedContracts.map((contract, index) => {
              const daysRemaining = differenceInDays(new Date(contract.end_date), new Date());
              
              return (
                <div key={contract.id || index} className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-lg">
                          {contract.status === 'active' ? '✅' : daysRemaining > 0 ? '⏰' : '✔️'}
                        </span>
                        <h4 className="text-lg font-semibold text-gray-900">
                          {contract.title || contract.id}
                        </h4>
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
                      
                      <div className="mt-2">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          contract.status === 'active' ? 'bg-green-100 text-green-800' :
                          daysRemaining > 0 ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {contract.status?.toUpperCase() || (daysRemaining > 0 ? 'ACTIVE' : 'COMPLETED')}
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-right ml-4">
                      <div className="text-lg font-bold text-purple-600">
                        {formatCurrency(contract.amount)}
                      </div>
                      {daysRemaining > 0 && (
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

      {/* Data Information */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">📊 Timeline Analysis Information:</h4>
        <div className="text-sm text-blue-800 space-y-1">
          <p>
            <strong>Data Completeness:</strong> {timelineData.metadata?.is_complete_data ? 
              'Complete contractor portfolio data retrieved via pagination' : 
              'Limited to recent awards only'}
          </p>
          <p>
            <strong>Gantt Chart:</strong> Shows all contract timelines simultaneously with proposal workload projections
          </p>
          <p>
            <strong>Workload Integral:</strong> Estimates recompete proposal effort based on contract values and end dates
          </p>
          <p>
            <strong>Recompete Projections:</strong> Estimates 6-12 month proposal periods before contract expirations
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContractorTimeline;
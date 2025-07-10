import React, { useState } from 'react';

const ContractorTimeline = ({ contractor, profile }) => {
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' or 'list'
  const [sortBy, setSortBy] = useState('end_date'); // 'end_date', 'start_date', 'amount'

  // Safely extract data from our API response structure
  const contractorData = profile?.contractor || contractor || {};
  const profileData = profile?.profile || profile || {};
  const contractorName = contractorData.name || contractor?.name || 'Unknown Contractor';
  
  // Use recent_awards as our contract data since that's what our API provides
  const recentAwards = profileData.recent_awards || [];
  const totalValue = profileData.total_value || 0;
  
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
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const getStatusColor = (award) => {
    const endDate = new Date(award.end_date);
    const now = new Date();
    const daysUntilEnd = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntilEnd < 0) return 'bg-gray-400'; // completed
    if (daysUntilEnd < 90) return 'bg-orange-500'; // ending soon
    return 'bg-green-500'; // active
  };

  const getStatusIcon = (award) => {
    const endDate = new Date(award.end_date);
    const now = new Date();
    const daysUntilEnd = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntilEnd < 0) return '✔️'; // completed
    if (daysUntilEnd < 90) return '⏰'; // ending soon
    return '✅'; // active
  };

  const getStatus = (award) => {
    const endDate = new Date(award.end_date);
    const now = new Date();
    const daysUntilEnd = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntilEnd < 0) return 'completed';
    if (daysUntilEnd < 90) return 'ending_soon';
    return 'active';
  };

  const getDaysRemaining = (award) => {
    const endDate = new Date(award.end_date);
    const now = new Date();
    const daysUntilEnd = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    return daysUntilEnd > 0 ? daysUntilEnd : null;
  };

  const sortedContracts = [...recentAwards].sort((a, b) => {
    switch (sortBy) {
      case 'end_date':
        if (!a.end_date || !b.end_date) return 0;
        return new Date(a.end_date) - new Date(b.end_date);
      case 'start_date':
        if (!a.start_date || !b.start_date) return 0;
        return new Date(b.start_date) - new Date(a.start_date);
      case 'amount':
        return (b.amount || 0) - (a.amount || 0);
      default:
        return 0;
    }
  });

  // Calculate summary statistics
  const activeContracts = sortedContracts.filter(award => getStatus(award) === 'active');
  const endingSoonContracts = sortedContracts.filter(award => getStatus(award) === 'ending_soon');
  const activeValue = activeContracts.reduce((sum, award) => sum + (award.amount || 0), 0);

  if (!recentAwards || recentAwards.length === 0) {
    return (
      <div className="bg-white p-8 rounded-lg shadow text-center">
        <div className="text-gray-400 text-4xl mb-4">📅</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No contract timeline data available</h3>
        <p className="text-gray-600">
          No recent awards found for this contractor, or contract timeline information is not available.
        </p>
      </div>
    );
  }

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
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="end_date">Sort by End Date</option>
              <option value="start_date">Sort by Start Date</option>
              <option value="amount">Sort by Amount</option>
            </select>
            
            <div className="flex rounded-md shadow-sm">
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-4 py-2 text-sm font-medium rounded-l-md border ${
                  viewMode === 'timeline'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Timeline View
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 text-sm font-medium rounded-r-md border-t border-r border-b ${
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

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {activeContracts.length}
            </div>
            <div className="text-sm text-green-800">Active Contracts</div>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">
              {endingSoonContracts.length}
            </div>
            <div className="text-sm text-orange-800">Ending Soon</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(activeValue)}
            </div>
            <div className="text-sm text-purple-800">Active Value</div>
          </div>
        </div>
      </div>

      {/* Contract List/Timeline */}
      <div className="bg-white rounded-lg shadow">
        {viewMode === 'list' ? (
          <div className="divide-y divide-gray-200">
            <div className="px-6 py-4 bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">
                Recent Awards ({sortedContracts.length})
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Showing recent contract awards with timeline analysis
              </p>
            </div>
            
            {sortedContracts.map((award, index) => {
              const status = getStatus(award);
              const daysRemaining = getDaysRemaining(award);
              
              return (
                <div key={index} className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-lg">{getStatusIcon(award)}</span>
                        <h4 className="text-lg font-semibold text-gray-900">
                          {award.title || award.award_id || 'Award'}
                        </h4>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Agency:</span> {award.agency || 'Unknown'}
                        </div>
                        <div>
                          <span className="font-medium">Start:</span> {formatDate(award.start_date)}
                        </div>
                        <div>
                          <span className="font-medium">End:</span> {formatDate(award.end_date)}
                        </div>
                        <div>
                          <span className="font-medium">NAICS:</span> {award.naics_code || 'N/A'}
                        </div>
                      </div>
                      
                      {award.award_type && (
                        <div className="mt-2">
                          <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                            {award.award_type}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="text-right ml-4">
                      <div className="text-lg font-bold text-purple-600">
                        {formatCurrency(award.amount)}
                      </div>
                      {daysRemaining && (
                        <div className="text-sm text-orange-600 font-medium">
                          {daysRemaining} days remaining
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      status === 'active' ? 'bg-green-100 text-green-800' :
                      status === 'ending_soon' ? 'bg-orange-100 text-orange-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {status.replace('_', ' ').toUpperCase()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Timeline View
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">Contract Timeline Visualization</h3>
            <p className="text-gray-600 mb-4">
              This shows the duration and status of contract awards. Green indicates active contracts, 
              orange shows contracts ending soon, and gray represents completed contracts.
            </p>
            
            <div className="space-y-4">
              {sortedContracts.map((award, index) => {
                const startDate = new Date(award.start_date);
                const endDate = new Date(award.end_date);
                const now = new Date();
                const totalDuration = endDate - startDate;
                const elapsed = now - startDate;
                const progressPercent = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
                const daysRemaining = getDaysRemaining(award);
                
                return (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-gray-900">
                        {award.title || award.award_id || 'Award'}
                      </span>
                      <span className="text-sm text-gray-600">{formatCurrency(award.amount)}</span>
                    </div>
                    
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>{formatDate(award.start_date)}</span>
                      <span>{formatDate(award.end_date)}</span>
                    </div>
                    
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full ${getStatusColor(award)}`}
                        style={{ width: `${progressPercent}%` }}
                      ></div>
                    </div>
                    
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-gray-500">{award.agency || 'Unknown Agency'}</span>
                      {daysRemaining && (
                        <span className="text-xs text-orange-600 font-medium">
                          {daysRemaining} days left
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {sortedContracts.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No contract timeline data available
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data Note */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">📋 Data Note:</h4>
        <p className="text-sm text-blue-800">
          Timeline analysis is based on available recent awards data. Contract end dates are used to 
          estimate status (active, ending soon, completed). For more precise contract status information, 
          additional data sources may be required.
        </p>
      </div>
    </div>
  );
};

export default ContractorTimeline;
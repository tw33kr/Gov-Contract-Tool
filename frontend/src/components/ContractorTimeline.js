import React, { useState } from 'react';

const ContractorTimeline = ({ contractor, profile }) => {
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' or 'list'
  const [sortBy, setSortBy] = useState('end_date'); // 'end_date', 'start_date', 'amount'

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'ending_soon': return 'bg-orange-500';
      case 'completed': return 'bg-gray-400';
      default: return 'bg-blue-500';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active': return '✅';
      case 'ending_soon': return '⏰';
      case 'completed': return '✔️';
      default: return '📄';
    }
  };

  const sortedContracts = [...profile.active_contracts].sort((a, b) => {
    switch (sortBy) {
      case 'end_date':
        return new Date(a.end_date) - new Date(b.end_date);
      case 'start_date':
        return new Date(b.start_date) - new Date(a.start_date);
      case 'amount':
        return b.award_amount - a.award_amount;
      default:
        return 0;
    }
  });

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">
            📅 {profile.contractor_name} - Contract Timeline
          </h2>
          
          <div className="flex space-x-4">
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
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {profile.active_contracts.filter(c => c.status === 'active').length}
            </div>
            <div className="text-sm text-green-800">Active Contracts</div>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">
              {profile.active_contracts.filter(c => c.status === 'ending_soon').length}
            </div>
            <div className="text-sm text-orange-800">Ending Soon</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(profile.total_active_value)}
            </div>
            <div className="text-sm text-purple-800">Total Active Value</div>
          </div>
        </div>
      </div>

      {/* Contract List/Timeline */}
      <div className="bg-white rounded-lg shadow">
        {viewMode === 'list' ? (
          <div className="divide-y divide-gray-200">
            <div className="px-6 py-4 bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">
                Active Contracts ({sortedContracts.length})
              </h3>
            </div>
            
            {sortedContracts.map((contract, index) => (
              <div key={index} className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-lg">{getStatusIcon(contract.status)}</span>
                      <h4 className="text-lg font-semibold text-gray-900">{contract.title}</h4>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Agency:</span> {contract.awarding_agency}
                      </div>
                      <div>
                        <span className="font-medium">Start:</span> {contract.start_date}
                      </div>
                      <div>
                        <span className="font-medium">End:</span> {contract.end_date}
                      </div>
                      <div>
                        <span className="font-medium">NAICS:</span> {contract.naics_code || 'N/A'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-lg font-bold text-purple-600">
                      {formatCurrency(contract.award_amount)}
                    </div>
                    {contract.days_remaining && (
                      <div className="text-sm text-orange-600 font-medium">
                        {contract.days_remaining} days remaining
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mt-4">
                  <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    contract.status === 'active' ? 'bg-green-100 text-green-800' :
                    contract.status === 'ending_soon' ? 'bg-orange-100 text-orange-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {contract.status.replace('_', ' ').toUpperCase()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Timeline View (Simplified for now - could be enhanced with a proper timeline library)
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">Contract Timeline Visualization</h3>
            <p className="text-gray-600 mb-4">
              This shows the overlap and duration of active contracts. Use this to identify busy periods and recompete scheduling.
            </p>
            
            <div className="space-y-4">
              {sortedContracts.map((contract, index) => {
                const startDate = new Date(contract.start_date);
                const endDate = new Date(contract.end_date);
                const now = new Date();
                const totalDuration = endDate - startDate;
                const elapsed = now - startDate;
                const progressPercent = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
                
                return (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-gray-900">{contract.title}</span>
                      <span className="text-sm text-gray-600">{formatCurrency(contract.award_amount)}</span>
                    </div>
                    
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>{contract.start_date}</span>
                      <span>{contract.end_date}</span>
                    </div>
                    
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full ${getStatusColor(contract.status)}`}
                        style={{ width: `${progressPercent}%` }}
                      ></div>
                    </div>
                    
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-gray-500">{contract.awarding_agency}</span>
                      {contract.days_remaining && (
                        <span className="text-xs text-orange-600 font-medium">
                          {contract.days_remaining} days left
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContractorTimeline;
// frontend/src/components/ContractorAnalysis.js
import React from 'react';

const ContractorAnalysis = ({ contractors, loading }) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!contractors || contractors.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No contractor data available.</p>
      </div>
    );
  }

  // Format currency
  const formatCurrency = (amount) => {
    if (amount >= 1000000000) {
      return `$${(amount / 1000000000).toFixed(1)}B`;
    } else if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`;
    }
    return `$${amount?.toLocaleString() || 0}`;
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Contractor Analysis</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {contractors.map((contractor, index) => (
          <div key={index} className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {contractor.name}
                </h3>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Awards:</span>
                    <span className="font-medium text-gray-900">{contractor.total_awards}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Value:</span>
                    <span className="font-medium text-gray-900">{formatCurrency(contractor.total_value)}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Agencies:</span>
                    <span className="font-medium text-gray-900">{contractor.agencies?.length || 0}</span>
                  </div>
                </div>
                
                {contractor.recent_awards && contractor.recent_awards.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Awards:</h4>
                    <div className="space-y-1">
                      {contractor.recent_awards.slice(0, 2).map((award, awardIndex) => (
                        <div key={awardIndex} className="text-xs text-gray-600">
                          <div className="truncate" title={award.title}>
                            {award.title}
                          </div>
                          <div className="text-gray-500">
                            {formatCurrency(award.amount)} • {award.agency}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContractorAnalysis;
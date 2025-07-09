// frontend/src/components/ContractList.js
import React, { useState } from 'react';
import ContractCard from './ContractCard';

const ContractList = ({ contracts, loading }) => {
  const [sortBy, setSortBy] = useState('posted_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [expandedContract, setExpandedContract] = useState(null);

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-2 text-gray-600">Searching contracts...</p>
      </div>
    );
  }

  if (!contracts || contracts.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-gray-400 text-6xl mb-4">📋</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No contracts found</h3>
        <p className="text-gray-600">Try adjusting your search criteria or removing some filters.</p>
      </div>
    );
  }

  const sortContracts = (contracts) => {
    return [...contracts].sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      // Handle date sorting
      if (sortBy === 'posted_date' || sortBy === 'response_deadline') {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      }

      // Handle amount sorting
      if (sortBy === 'award_amount') {
        aValue = aValue || 0;
        bValue = bValue || 0;
      }

      // Handle string sorting
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const sortedContracts = sortContracts(contracts);

  const formatCurrency = (amount) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getDaysUntilDeadline = (deadlineString) => {
    if (!deadlineString) return null;
    const deadline = new Date(deadlineString);
    const today = new Date();
    const diffTime = deadline - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const SortButton = ({ field, children }) => (
    <button
      onClick={() => handleSort(field)}
      className={`text-left font-medium hover:text-blue-600 transition-colors ${
        sortBy === field ? 'text-blue-600' : 'text-gray-700'
      }`}
    >
      {children}
      {sortBy === field && (
        <span className="ml-1">
          {sortOrder === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </button>
  );

  return (
    <div>
      {/* Sort Controls */}
      <div className="p-4 bg-gray-50 border-b">
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-gray-600">Sort by:</span>
          <SortButton field="posted_date">Date Posted</SortButton>
          <SortButton field="response_deadline">Deadline</SortButton>
          <SortButton field="award_amount">Award Value</SortButton>
          <SortButton field="agency">Agency</SortButton>
          <SortButton field="title">Title</SortButton>
        </div>
      </div>

      {/* Contract Cards */}
      <div className="divide-y divide-gray-200">
        {sortedContracts.map((contract) => {
          const daysUntilDeadline = getDaysUntilDeadline(contract.response_deadline);
          const isExpanded = expandedContract === contract.notice_id;
          
          return (
            <div key={contract.notice_id} className="p-6 hover:bg-gray-50 transition-colors">
              {/* Contract Header */}
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {contract.title}
                  </h3>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <span className="font-medium">{contract.agency}</span>
                    {contract.office && <span>{contract.office}</span>}
                    <span>Posted: {formatDate(contract.posted_date)}</span>
                    {contract.solicitation_number && (
                      <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                        {contract.solicitation_number}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col items-end space-y-2 ml-4">
                  {contract.award_amount && (
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(contract.award_amount)}
                    </div>
                  )}
                  
                  {daysUntilDeadline !== null && (
                    <div className={`text-sm px-2 py-1 rounded-full ${
                      daysUntilDeadline < 0 
                        ? 'bg-red-100 text-red-800'
                        : daysUntilDeadline <= 7 
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {daysUntilDeadline < 0 
                        ? 'Expired' 
                        : daysUntilDeadline === 0 
                        ? 'Due Today' 
                        : `${daysUntilDeadline} days left`
                      }
                    </div>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-3">
                {contract.naics_code && (
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                    NAICS: {contract.naics_code}
                  </span>
                )}
                {contract.set_aside && (
                  <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">
                    {contract.set_aside}
                  </span>
                )}
                {contract.contract_type && (
                  <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full">
                    {contract.contract_type}
                  </span>
                )}
                {contract.place_of_performance && (
                  <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">
                    📍 {contract.place_of_performance}
                  </span>
                )}
              </div>

              {/* Description Preview */}
              <div className="text-gray-700 mb-3">
                <p className="line-clamp-2">
                  {contract.description || 'No description available.'}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center">
                <button
                  onClick={() => setExpandedContract(isExpanded ? null : contract.notice_id)}
                  className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                >
                  {isExpanded ? 'Show Less' : 'Show More'}
                </button>
                
                <div className="flex gap-2">
                  <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors">
                    Track Opportunity
                  </button>
                  <button 
                    onClick={() => {
                      const contractText = `
Contract: ${contract.title}
Agency: ${contract.agency}
Solicitation: ${contract.solicitation_number || 'N/A'}
Posted: ${formatDate(contract.posted_date)}
Deadline: ${formatDate(contract.response_deadline)}
Value: ${formatCurrency(contract.award_amount)}

Description:
${contract.description}
                      `.trim();
                      
                      const blob = new Blob([contractText], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `contract-${contract.notice_id}.txt`;
                      link.click();
                    }}
                    className="border border-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-50 transition-colors"
                  >
                    Export
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <ContractCard contract={contract} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ContractList;
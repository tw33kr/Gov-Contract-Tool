// frontend/src/components/AwardsList.js
import React, { useState } from 'react';
import ContractAnalysis from './ContractAnalysis';
import { getContractMods } from '../services/api';

const AwardsList = ({ awards, loading }) => {
  const [sortBy, setSortBy] = useState('award_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [expandedAwards, setExpandedAwards] = useState(new Set());
  const [selectedContract, setSelectedContract] = useState(null);
  const [contractMods, setContractMods] = useState(null);
  const [loadingMods, setLoadingMods] = useState(false);

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        <p className="mt-2 text-gray-600">Searching contract awards...</p>
      </div>
    );
  }

  if (!awards || awards.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-gray-400 text-6xl mb-4">🏆</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No contract awards found</h3>
        <p className="text-gray-600">Try adjusting your search criteria or date range.</p>
      </div>
    );
  }

  const sortAwards = (awards) => {
    return [...awards].sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      // Handle date sorting
      if (sortBy === 'award_date' || sortBy === 'start_date' || sortBy === 'end_date') {
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

  const toggleExpanded = (awardId) => {
    const newExpanded = new Set(expandedAwards);
    if (newExpanded.has(awardId)) {
      newExpanded.delete(awardId);
    } else {
      newExpanded.add(awardId);
    }
    setExpandedAwards(newExpanded);
  };

  const handleAnalyzeContract = async (award) => {
    setLoadingMods(true);
    setSelectedContract(award);
    
    try {
      // Use the PIID or award_id to get transaction history from USASpending
      const contractId = award.piid || award.contract_id || award.award_id;
      
      if (!contractId) {
        console.error('No contract ID available for analysis');
        setContractMods([]);
        return;
      }
      
      console.log('Fetching transaction history for contract:', contractId);
      const mods = await getContractMods(contractId);
      
      console.log('Retrieved modifications:', mods);
      setContractMods(mods);
    } catch (error) {
      console.error('Error loading contract mods:', error);
      setContractMods([]);
    } finally {
      setLoadingMods(false);
    }
  };

  const handleCloseAnalysis = () => {
    setSelectedContract(null);
    setContractMods(null);
  };

  const sortedAwards = sortAwards(awards);

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

  const SortButton = ({ field, children }) => (
    <button
      onClick={() => handleSort(field)}
      className={`text-left font-medium hover:text-green-600 transition-colors ${
        sortBy === field ? 'text-green-600' : 'text-gray-700'
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
          <SortButton field="award_date">Award Date</SortButton>
          <SortButton field="award_amount">Award Value</SortButton>
          <SortButton field="vendor_name">Vendor</SortButton>
          <SortButton field="agency">Agency</SortButton>
          <SortButton field="title">Title</SortButton>
        </div>
      </div>

      {/* Awards Cards */}
      <div className="divide-y divide-gray-200">
        {sortedAwards.map((award, index) => {
          // Use award_id if available, otherwise use contract_id or fallback to index
          const awardIdentifier = award.award_id || award.contract_id || `award-${index}`;
          const isExpanded = expandedAwards.has(awardIdentifier);
          
          return (
            <div key={awardIdentifier} className="p-6 hover:bg-gray-50 transition-colors">
              {/* Award Header */}
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {award.title}
                  </h3>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <span className="font-medium text-green-600">🏆 {award.vendor_name || award.recipient_name}</span>
                    <span className="font-medium">{award.agency || award.awarding_agency}</span>
                    {(award.subagency || award.awarding_subagency) && <span>{award.subagency || award.awarding_subagency}</span>}
                    <span>Awarded: {formatDate(award.award_date)}</span>
                    {(award.piid || award.contract_id || award.award_id) && (
                      <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                        {award.piid || award.contract_id || award.award_id}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col items-end space-y-2 ml-4">
                  <div className="text-xl font-bold text-green-600">
                    {formatCurrency(award.award_amount)}
                  </div>
                  {award.funding_amount && award.funding_amount !== award.award_amount && (
                    <div className="text-sm text-gray-500">
                      Total Value: {formatCurrency(award.funding_amount)}
                    </div>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-3">
                {award.naics_code && (
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                    NAICS: {award.naics_code}
                  </span>
                )}
                {award.psc_code && (
                  <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">
                    PSC: {award.psc_code}
                  </span>
                )}
                {(award.set_aside_type || award.set_aside) && (
                  <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">
                    {award.set_aside_type || award.set_aside}
                  </span>
                )}
                {(award.contract_type || award.award_type) && (
                  <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full">
                    {award.contract_type || award.award_type}
                  </span>
                )}
                {award.competition_type && (
                  <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                    {award.competition_type}
                  </span>
                )}
                {(award.place_of_performance_city || award.place_of_performance_state || award.place_of_performance) && (
                  <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                    📍 {award.place_of_performance || `${award.place_of_performance_city}, ${award.place_of_performance_state}`}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center">
                <button
                  onClick={() => toggleExpanded(awardIdentifier)}
                  className="text-green-600 hover:text-green-800 font-medium text-sm"
                >
                  {isExpanded ? 'Show Less' : 'Show More Details'}
                </button>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleAnalyzeContract(award)}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
                  >
                    Analyze Contract
                  </button>
                  <button 
                    onClick={() => {
                      const awardText = `
Contract Award Details:
Title: ${award.title}
Vendor: ${award.vendor_name || award.recipient_name}
Agency: ${award.agency || award.awarding_agency}
Award Date: ${formatDate(award.award_date)}
Award Amount: ${formatCurrency(award.award_amount)}
Contract ID: ${award.piid || award.contract_id || award.award_id}
NAICS: ${award.naics_code} - ${award.naics_description || 'N/A'}
PSC: ${award.psc_code} - ${award.psc_description || 'N/A'}
Set-Aside: ${award.set_aside_type || award.set_aside || 'N/A'}
Competition: ${award.competition_type || 'N/A'}
Performance Location: ${award.place_of_performance || `${award.place_of_performance_city || 'N/A'}, ${award.place_of_performance_state || 'N/A'}`}
                      `.trim();
                      
                      const blob = new Blob([awardText], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `award-${award.piid || award.contract_id || award.award_id}.txt`;
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Column */}
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Award Details</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Contract ID:</span>
                            <span className="font-mono">{award.piid || award.contract_id || award.award_id}</span>
                          </div>
                          
                          {award.start_date && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Start Date:</span>
                              <span>{formatDate(award.start_date)}</span>
                            </div>
                          )}
                          
                          {award.end_date && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">End Date:</span>
                              <span>{formatDate(award.end_date)}</span>
                            </div>
                          )}
                          
                          {(award.contract_type || award.award_type) && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Contract Type:</span>
                              <span>{award.contract_type || award.award_type}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Classification</h4>
                        <div className="space-y-2 text-sm">
                          {award.naics_description && (
                            <div>
                              <span className="text-gray-600">NAICS Description:</span>
                              <p className="mt-1 text-gray-900">{award.naics_description}</p>
                            </div>
                          )}
                          
                          {award.psc_description && (
                            <div>
                              <span className="text-gray-600">PSC Description:</span>
                              <p className="mt-1 text-gray-900">{award.psc_description}</p>
                            </div>
                          )}
                          
                          {award.description && (
                            <div>
                              <span className="text-gray-600">Description:</span>
                              <p className="mt-1 text-gray-900">{award.description}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Vendor Information</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Vendor Name:</span>
                            <span className="font-semibold">{award.vendor_name || award.recipient_name}</span>
                          </div>
                          
                          {award.vendor_duns && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">DUNS:</span>
                              <span className="font-mono">{award.vendor_duns}</span>
                            </div>
                          )}
                          
                          {(award.vendor_city || award.vendor_state) && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Vendor Location:</span>
                              <span>{award.vendor_city}, {award.vendor_state}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Competition & Set-Aside</h4>
                        <div className="space-y-2 text-sm">
                          {award.competition_type && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Competition:</span>
                              <span>{award.competition_type}</span>
                            </div>
                          )}
                          
                          {(award.set_aside_type || award.set_aside) && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Set-Aside:</span>
                              <span>{award.set_aside_type || award.set_aside}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Contract Analysis Modal */}
      {selectedContract && contractMods !== null && !loadingMods && (
        <ContractAnalysis 
          contract={selectedContract} 
          mods={contractMods} 
          onClose={handleCloseAnalysis}
        />
      )}
      
      {/* Loading Modal */}
      {loadingMods && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 flex flex-col items-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
            <p className="text-gray-600">Loading contract transaction history from USASpending.gov...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AwardsList;
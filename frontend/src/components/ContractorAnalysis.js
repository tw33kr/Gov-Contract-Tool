// ContractorAnalysis.js - Main contractor analysis component
import React, { useState, useEffect } from 'react';
import ContractorSearch from './ContractorSearch';
import ContractorProfile from './ContractorProfile';
import ContractorTimeline from './ContractorTimeline';

const ContractorAnalysis = () => {
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [activeTab, setActiveTab] = useState('search');
  const [contractorProfile, setContractorProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleContractorSelect = async (contractor) => {
    setSelectedContractor(contractor);
    setActiveTab('profile');
    setLoading(true);
    
    try {
      // Fetch detailed contractor profile
      const response = await fetch(`/api/contractors/${encodeURIComponent(contractor.name)}/profile`);
      if (response.ok) {
        const profile = await response.json();
        setContractorProfile(profile);
      }
    } catch (error) {
      console.error('Error fetching contractor profile:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">🏢 Contractor Intelligence</h1>
        <p className="text-gray-600">
          Analyze federal contractors' active portfolios, recompete schedules, and market positioning
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('search')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'search'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            🔍 Search Contractors
          </button>
          
          {selectedContractor && (
            <>
              <button
                onClick={() => setActiveTab('profile')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'profile'
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📊 Profile Analysis
              </button>
              
              <button
                onClick={() => setActiveTab('timeline')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'timeline'
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📅 Contract Timeline
              </button>
            </>
          )}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'search' && (
        <ContractorSearch onContractorSelect={handleContractorSelect} />
      )}
      
      {activeTab === 'profile' && selectedContractor && (
        <ContractorProfile 
          contractor={selectedContractor}
          profile={contractorProfile}
          loading={loading}
        />
      )}
      
      {activeTab === 'timeline' && selectedContractor && contractorProfile && (
        <ContractorTimeline 
          contractor={selectedContractor}
          profile={contractorProfile}
        />
      )}
    </div>
  );
};

export default ContractorAnalysis;
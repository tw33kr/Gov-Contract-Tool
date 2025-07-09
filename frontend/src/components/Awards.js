// frontend/src/components/Awards.js
import React, { useState, useEffect } from 'react';
import AwardsList from './AwardsList';
import AwardsAnalytics from './AwardsAnalytics';
import AwardsSearchForm from './AwardsSearchForm';
import { searchAwards, getAwardsAnalytics } from '../services/api';

const Awards = () => {
  const [awards, setAwards] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useState({});
  const [activeTab, setActiveTab] = useState('search');
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    // Load initial awards data
    handleSearch({});
    loadAnalytics();
  }, []);

  const handleSearch = async (params) => {
    setLoading(true);
    setError(null);
    try {
      const response = await searchAwards(params);
      setAwards(response.awards || []);
      setTotalCount(response.total_count || 0);
      setSearchParams(params);
    } catch (err) {
      setError('Failed to search contract awards. Please try again.');
      console.error('Awards search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const analyticsData = await getAwardsAnalytics();
      setAnalytics(analyticsData);
    } catch (err) {
      console.error('Awards analytics error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">Federal Contract Awards</h1>
          <p className="text-green-200 mt-2">Analyze awarded contracts and market intelligence</p>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('search')}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === 'search'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Search Awards
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === 'analytics'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Market Analytics
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'search' && (
          <>
            {/* Search Section */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">Search Contract Awards</h2>
              <AwardsSearchForm onSearch={handleSearch} loading={loading} />
            </div>

            {/* Results Section */}
            <div className="bg-white rounded-lg shadow-md">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">
                    Contract Awards
                    {totalCount > 0 && (
                      <span className="text-gray-500 text-base font-normal ml-2">
                        ({totalCount.toLocaleString()} total)
                      </span>
                    )}
                  </h2>
                  {awards.length > 0 && (
                    <button
                      onClick={() => {
                        const dataStr = JSON.stringify(awards, null, 2);
                        const dataBlob = new Blob([dataStr], {type: 'application/json'});
                        const url = URL.createObjectURL(dataBlob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = 'contract_awards.json';
                        link.click();
                      }}
                      className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
                    >
                      Export Awards
                    </button>
                  )}
                </div>
              </div>
              
              {error && (
                <div className="p-6 bg-red-50 border-l-4 border-red-400">
                  <p className="text-red-700">{error}</p>
                </div>
              )}
              
              <AwardsList awards={awards} loading={loading} />
            </div>
          </>
        )}

        {activeTab === 'analytics' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-6">Market Intelligence & Analytics</h2>
            <AwardsAnalytics data={analytics} />
          </div>
        )}
      </main>
    </div>
  );
};

export default Awards;
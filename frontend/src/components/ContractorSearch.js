import React, { useState, useEffect } from 'react';

const ContractorSearch = ({ onContractorSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);

  useEffect(() => {
    // Load recent searches from localStorage
    const saved = localStorage.getItem('recentContractorSearches');
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/contractors/search?name_query=${encodeURIComponent(searchQuery)}&limit=20`);
      const data = await response.json();
      setSearchResults(data.contractors || []);
      
      // Save to recent searches
      const updated = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem('recentContractorSearches', JSON.stringify(updated));
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex space-x-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for contractors (e.g., Lockheed Martin, Boeing, etc.)"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !searchQuery.trim()}
            className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? '🔍 Searching...' : '🔍 Search'}
          </button>
        </div>

        {/* Recent Searches */}
        {recentSearches.length > 0 && (
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-2">Recent searches:</p>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((search, index) => (
                <button
                  key={index}
                  onClick={() => setSearchQuery(search)}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200"
                >
                  {search}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Found {searchResults.length} contractors
            </h3>
          </div>
          
          <div className="divide-y divide-gray-200">
            {searchResults.map((contractor, index) => (
              <div
                key={index}
                className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onContractorSelect(contractor)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold text-purple-600 hover:text-purple-800">
                      {contractor.name}
                    </h4>
                    <div className="mt-2 grid grid-cols-3 gap-4 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Total Awards:</span> {contractor.total_awards}
                      </div>
                      <div>
                        <span className="font-medium">Total Value:</span> {formatCurrency(contractor.total_value)}
                      </div>
                      <div>
                        <span className="font-medium">Latest Award:</span> {contractor.latest_award_date || 'N/A'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-purple-600 font-medium">View Profile →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {searchResults.length === 0 && searchQuery && !loading && (
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <div className="text-gray-400 text-4xl mb-4">🔍</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No contractors found</h3>
          <p className="text-gray-600">
            Try a different search term or check the spelling.
          </p>
        </div>
      )}

      {/* Help Text */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">💡 Search Tips:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Use partial company names (e.g., "Lockheed" instead of full name)</li>
          <li>• Try searching for major defense contractors, IT companies, or consulting firms</li>
          <li>• Common contractors: Boeing, Raytheon, General Dynamics, CACI, SAIC</li>
        </ul>
      </div>
    </div>
  );
};

export default ContractorSearch;
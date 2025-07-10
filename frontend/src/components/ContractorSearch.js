import React, { useState, useEffect } from 'react';

const ContractorSearch = ({ onContractorSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [error, setError] = useState(null);
  const [searchPerformed, setSearchPerformed] = useState(false);

  useEffect(() => {
    // Load recent searches from state (not localStorage to avoid MCP restrictions)
    setRecentSearches([
      'Planned Systems International',
      'Lockheed Martin',
      'Boeing',
      'Raytheon',
      'General Dynamics'
    ]);
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setError(null);
    setSearchPerformed(true);
    
    try {
      console.log(`🔍 Searching for contractor: ${searchQuery}`);
      
      const response = await fetch(`/api/contractors/search?name_query=${encodeURIComponent(searchQuery)}&limit=20`);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('📊 Search response:', data);
      
      setSearchResults(data.contractors || []);
      
      // Update recent searches (keep in memory only)
      const updated = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, 5);
      setRecentSearches(updated);
      
      if (data.contractors && data.contractors.length > 0) {
        console.log(`✅ Found ${data.contractors.length} contractors`);
      } else {
        console.log('⚠️ No contractors found');
      }
      
    } catch (error) {
      console.error('❌ Search error:', error);
      setError(`Search failed: ${error.message}. Please check your network connection and try again.`);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const testSearch = async (contractorName) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log(`🧪 Testing search for: ${contractorName}`);
      
      const response = await fetch(`/api/contractors/test/${encodeURIComponent(contractorName)}`);
      const data = await response.json();
      
      console.log('🧪 Test response:', data);
      
      if (data.contractors && data.contractors.length > 0) {
        setSearchResults(data.contractors);
        setSearchQuery(contractorName);
        setSearchPerformed(true);
      } else {
        setError(`Test search found no results for '${contractorName}'. Check backend logs for API details.`);
      }
      
    } catch (error) {
      console.error('❌ Test search error:', error);
      setError(`Test failed: ${error.message}`);
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

  const formatNumber = (num) => {
    if (!num) return '0';
    return new Intl.NumberFormat('en-US').format(num);
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
              placeholder="Search for contractors (e.g., Planned Systems International, Lockheed Martin, etc.)"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !searchQuery.trim()}
            className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '🔍 Searching...' : '🔍 Search'}
          </button>
        </div>

        {/* Recent/Sample Searches */}
        <div className="mt-4">
          <p className="text-sm text-gray-600 mb-2">Try these popular contractors:</p>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((search, index) => (
              <button
                key={index}
                onClick={() => setSearchQuery(search)}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
              >
                {search}
              </button>
            ))}
          </div>
        </div>

        {/* Test Buttons for Debugging */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-600 mb-2">🧪 Test specific contractors (with detailed logging):</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => testSearch('Planned Systems International')}
              disabled={loading}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors disabled:opacity-50"
            >
              Test: Planned Systems International
            </button>
            <button
              onClick={() => testSearch('Lockheed Martin')}
              disabled={loading}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors disabled:opacity-50"
            >
              Test: Lockheed Martin
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">These test buttons provide detailed backend logging for debugging</p>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="text-red-400 text-xl mr-3">⚠️</div>
            <div>
              <h3 className="text-lg font-medium text-red-900 mb-2">Search Error</h3>
              <p className="text-red-700">{error}</p>
              <div className="mt-2 text-sm text-red-600">
                <p><strong>Troubleshooting tips:</strong></p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Check that the backend server is running on port 8000</li>
                  <li>Try a different contractor name or partial name</li>
                  <li>Check browser console and backend logs for detailed error info</li>
                  <li>Use the test buttons above for debugging specific searches</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <div className="animate-spin text-purple-600 text-4xl mb-4">⚙️</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Searching contractors...</h3>
          <p className="text-gray-600">
            Using pagination to retrieve comprehensive contractor data.
            This may take a moment for large datasets.
          </p>
        </div>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Found {searchResults.length} contractors
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Results retrieved using paginated API calls for comprehensive data
            </p>
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
                    
                    {/* Primary Stats */}
                    <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">Total Awards:</span>
                        <div className="text-lg font-semibold text-gray-900">
                          {formatNumber(contractor.total_awards)}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Total Value:</span>
                        <div className="text-lg font-semibold text-green-600">
                          {formatCurrency(contractor.total_value)}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Latest Award:</span>
                        <div className="text-sm text-gray-600">
                          {contractor.latest_award_date || 'N/A'}
                        </div>
                      </div>
                    </div>

                    {/* Additional Details */}
                    {contractor.primary_agencies && contractor.primary_agencies.length > 0 && (
                      <div className="mt-3">
                        <span className="text-sm font-medium text-gray-700">Primary Agencies: </span>
                        <span className="text-sm text-gray-600">
                          {contractor.primary_agencies.slice(0, 2).join(', ')}
                          {contractor.primary_agencies.length > 2 && ` (+${contractor.primary_agencies.length - 2} more)`}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="text-right ml-4">
                    <span className="text-sm text-purple-600 font-medium">View Profile →</span>
                    <div className="text-xs text-gray-500 mt-1">
                      Comprehensive data
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {searchPerformed && searchResults.length === 0 && !loading && !error && (
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <div className="text-gray-400 text-4xl mb-4">🔍</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No contractors found</h3>
          <p className="text-gray-600 mb-4">
            No contractors found for "{searchQuery}". This could mean:
          </p>
          <ul className="text-sm text-gray-600 text-left max-w-md mx-auto space-y-1">
            <li>• The contractor name is spelled differently in government records</li>
            <li>• Try a partial name search (e.g., "Planned Systems" instead of full name)</li>
            <li>• The contractor may not have recent federal awards</li>
            <li>• Use the test buttons above to verify the search functionality</li>
          </ul>
        </div>
      )}

      {/* Help Text */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">💡 Search Tips:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>Exact matches work best:</strong> "Planned Systems International" finds 234 records</li>
          <li>• <strong>Try partial names:</strong> "Planned Systems" may find variations</li>
          <li>• <strong>Common contractors:</strong> Boeing, Raytheon, General Dynamics, CACI, SAIC</li>
          <li>• <strong>Use test buttons:</strong> For debugging and verifying search functionality</li>
          <li>• <strong>Check backend logs:</strong> Detailed API call information is logged</li>
        </ul>
      </div>
    </div>
  );
};

export default ContractorSearch;
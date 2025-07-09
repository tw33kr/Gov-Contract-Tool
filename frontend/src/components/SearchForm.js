// frontend/src/components/SearchForm.js
import React, { useState, useEffect } from 'react';
import { getAgencies, getSetAsides } from '../services/api';

const SearchForm = ({ onSearch, loading }) => {
  const [formData, setFormData] = useState({
    keyword: '',
    agency: '',
    naics_code: '',
    set_aside: '',
    min_amount: '',
    max_amount: ''
  });
  
  const [agencies, setAgencies] = useState([]);
  const [setAsides, setSetAsides] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  const loadFilterOptions = async () => {
    try {
      const [agenciesData, setAsidesData] = await Promise.all([
        getAgencies(),
        getSetAsides()
      ]);
      setAgencies(agenciesData.agencies || []);
      setSetAsides(setAsidesData.set_asides || []);
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Filter out empty values
    const searchParams = Object.entries(formData).reduce((acc, [key, value]) => {
      if (value && value.toString().trim()) {
        acc[key] = value;
      }
      return acc;
    }, {});
    
    onSearch(searchParams);
  };

  const handleReset = () => {
    setFormData({
      keyword: '',
      agency: '',
      naics_code: '',
      set_aside: '',
      min_amount: '',
      max_amount: ''
    });
    onSearch({});
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Search */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label htmlFor="keyword" className="block text-sm font-medium text-gray-700 mb-1">
            Keywords
          </label>
          <input
            type="text"
            id="keyword"
            name="keyword"
            value={formData.keyword}
            onChange={handleInputChange}
            placeholder="e.g., IT services, construction"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="agency" className="block text-sm font-medium text-gray-700 mb-1">
            Agency
          </label>
          <select
            id="agency"
            name="agency"
            value={formData.agency}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Agencies</option>
            {agencies.map(agency => (
              <option key={agency} value={agency}>{agency}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="set_aside" className="block text-sm font-medium text-gray-700 mb-1">
            Set-Aside Type
          </label>
          <select
            id="set_aside"
            name="set_aside"
            value={formData.set_aside}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Types</option>
            {setAsides.map(setAside => (
              <option key={setAside} value={setAside}>{setAside}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Advanced Search Toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-blue-600 hover:text-blue-800 font-medium text-sm"
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced Filters
        </button>
      </div>

      {/* Advanced Search */}
      {showAdvanced && (
        <div className="border-t pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="naics_code" className="block text-sm font-medium text-gray-700 mb-1">
                NAICS Code
              </label>
              <input
                type="text"
                id="naics_code"
                name="naics_code"
                value={formData.naics_code}
                onChange={handleInputChange}
                placeholder="e.g., 541512"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="min_amount" className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Value ($)
              </label>
              <input
                type="number"
                id="min_amount"
                name="min_amount"
                value={formData.min_amount}
                onChange={handleInputChange}
                placeholder="0"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="max_amount" className="block text-sm font-medium text-gray-700 mb-1">
                Maximum Value ($)
              </label>
              <input
                type="number"
                id="max_amount"
                name="max_amount"
                value={formData.max_amount}
                onChange={handleInputChange}
                placeholder="No limit"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={loading}
          className={`px-6 py-2 rounded-md font-medium transition-colors ${
            loading 
              ? 'bg-gray-400 text-white cursor-not-allowed' 
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {loading ? 'Searching...' : 'Search Contracts'}
        </button>
        
        <button
          type="button"
          onClick={handleReset}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md font-medium hover:bg-gray-50 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Quick Search Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <h4 className="font-medium text-blue-900 mb-2">Search Tips:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Use specific keywords like "IT support", "construction", or "consulting"</li>
          <li>• Filter by agency to find opportunities from specific departments</li>
          <li>• Set-aside filters help identify opportunities for small businesses</li>
          <li>• Use NAICS codes to find contracts in your industry sector</li>
        </ul>
      </div>
    </form>
  );
};

export default SearchForm;
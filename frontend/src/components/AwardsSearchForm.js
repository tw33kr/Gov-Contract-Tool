// frontend/src/components/AwardsSearchForm.js
import React, { useState, useEffect } from 'react';
import { getAgencies } from '../services/api';

const AwardsSearchForm = ({ onSearch, loading }) => {
  const [formData, setFormData] = useState({
    keyword: '',
    agency: '',
    naics_code: '',
    vendor_name: '',
    min_amount: '',
    max_amount: '',
    award_date_from: '',
    award_date_to: ''
  });
  
  const [agencies, setAgencies] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  const loadFilterOptions = async () => {
    try {
      const agenciesData = await getAgencies();
      setAgencies(agenciesData.agencies || []);
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
    
    // Filter out empty values and add include_awards flag
    const searchParams = Object.entries(formData).reduce((acc, [key, value]) => {
      if (value && value.toString().trim()) {
        acc[key] = value;
      }
      return acc;
    }, { include_awards: true });
    
    onSearch(searchParams);
  };

  const handleReset = () => {
    setFormData({
      keyword: '',
      agency: '',
      naics_code: '',
      vendor_name: '',
      min_amount: '',
      max_amount: '',
      award_date_from: '',
      award_date_to: ''
    });
    onSearch({ include_awards: true });
  };

  // Set default date range (last 90 days)
  const getDefaultDateRange = () => {
    const today = new Date();
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(today.getDate() - 90);
    
    return {
      from: ninetyDaysAgo.toISOString().split('T')[0],
      to: today.toISOString().split('T')[0]
    };
  };

  const defaultDates = getDefaultDateRange();

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
            placeholder="e.g., cybersecurity, construction"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="agency" className="block text-sm font-medium text-gray-700 mb-1">
            Awarding Agency
          </label>
          <select
            id="agency"
            name="agency"
            value={formData.agency}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">All Agencies</option>
            {agencies.map(agency => (
              <option key={agency} value={agency}>{agency}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="vendor_name" className="block text-sm font-medium text-gray-700 mb-1">
            Winning Vendor
          </label>
          <input
            type="text"
            id="vendor_name"
            name="vendor_name"
            value={formData.vendor_name}
            onChange={handleInputChange}
            placeholder="e.g., Lockheed Martin, IBM"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Advanced Search Toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-green-600 hover:text-green-800 font-medium text-sm"
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced Filters
        </button>
      </div>

      {/* Advanced Search */}
      {showAdvanced && (
        <div className="border-t pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="min_amount" className="block text-sm font-medium text-gray-700 mb-1">
                Min Award Value ($)
              </label>
              <input
                type="number"
                id="min_amount"
                name="min_amount"
                value={formData.min_amount}
                onChange={handleInputChange}
                placeholder="0"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="max_amount" className="block text-sm font-medium text-gray-700 mb-1">
                Max Award Value ($)
              </label>
              <input
                type="number"
                id="max_amount"
                name="max_amount"
                value={formData.max_amount}
                onChange={handleInputChange}
                placeholder="No limit"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Award Date Range
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  name="award_date_from"
                  value={formData.award_date_from || defaultDates.from}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs"
                />
                <input
                  type="date"
                  name="award_date_to"
                  value={formData.award_date_to || defaultDates.to}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs"
                />
              </div>
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
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {loading ? 'Searching...' : 'Search Awards'}
        </button>
        
        <button
          type="button"
          onClick={handleReset}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md font-medium hover:bg-gray-50 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Search Tips */}
      <div className="bg-green-50 border border-green-200 rounded-md p-4">
        <h4 className="font-medium text-green-900 mb-2">Award Search Tips:</h4>
        <ul className="text-sm text-green-800 space-y-1">
          <li>• Search by vendor name to see who's winning contracts in your industry</li>
          <li>• Use NAICS codes to find awards in specific industry sectors</li>
          <li>• Filter by award value to focus on contracts of relevant size</li>
          <li>• Default date range shows last 90 days of awards</li>
          <li>• Analyze competition patterns and pricing strategies</li>
        </ul>
      </div>
    </form>
  );
};

export default AwardsSearchForm;
import React, { useState } from 'react';
import SearchForm from './SearchForm';
import ContractList from './ContractList';
import { searchContracts } from '../services/api';

const OpportunitiesTab = () => {
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({});

  const handleSearch = async (params) => {
    setLoading(true);
    setSearchParams(params);
    
    try {
      // Use the searchContracts function from api.js
      const data = await searchContracts(params);
      
      setSearchResults(data.contracts || []);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <SearchForm onSearch={handleSearch} loading={loading} />
      <ContractList 
        contracts={searchResults} 
        loading={loading}
        searchParams={searchParams}
      />
    </div>
  );
};

export default OpportunitiesTab;
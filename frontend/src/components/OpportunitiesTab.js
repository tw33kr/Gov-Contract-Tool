import React, { useState } from 'react';
import SearchForm from './SearchForm';
import ContractList from './ContractList';

const OpportunitiesTab = () => {
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({});

  const handleSearch = async (params) => {
    setLoading(true);
    setSearchParams(params);
    
    try {
      // Build query string from search parameters
      const queryParams = new URLSearchParams();
      
      if (params.keyword) queryParams.append('keyword', params.keyword);
      if (params.agency) queryParams.append('agency', params.agency);
      if (params.naics_code) queryParams.append('naics_code', params.naics_code);
      if (params.set_aside) queryParams.append('set_aside', params.set_aside);
      if (params.posted_date_from) queryParams.append('posted_date_from', params.posted_date_from);
      if (params.posted_date_to) queryParams.append('posted_date_to', params.posted_date_to);
      if (params.limit) queryParams.append('limit', params.limit);

      const response = await fetch(`/api/contracts/search?${queryParams.toString()}`);
      const data = await response.json();
      
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
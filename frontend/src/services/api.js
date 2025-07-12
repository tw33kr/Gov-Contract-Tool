// frontend/src/services/api.js
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,  // Increased timeout to 2 minutes
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`Making ${config.method?.toUpperCase()} request to ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    
    if (error.response?.status === 400 && error.response?.data?.detail?.includes('API key is required')) {
      throw new Error('SAM.gov API key is required. Get your free API key at https://sam.gov/data-services and set the SAM_GOV_API_KEY environment variable.');
    } else if (error.response?.status === 404) {
      throw new Error('Resource not found');
    } else if (error.response?.status === 500) {
      console.warn('Server error - returning empty results instead of failing');
      // For 500 errors, return empty structure instead of throwing
      return {
        contracts: [],
        awards: [],
        total_count: 0,
        awards_count: 0,
        has_more: false
      };
    } else if (error.code === 'ECONNREFUSED') {
      throw new Error('Unable to connect to the server. Please ensure the backend is running.');
    } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      throw new Error('Request timed out. The server may be processing a large request. Please try again.');
    } else {
      throw new Error(error.response?.data?.detail || error.message || 'An unexpected error occurred');
    }
  }
);

// Contract search
export const searchContracts = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        queryParams.append(key, value);
      }
    });
    
    console.log('🔍 Searching contracts with params:', params);
    const response = await api.get(`/api/contracts/search?${queryParams}`);
    console.log('✅ Contracts search response:', response);
    return response;
  } catch (error) {
    console.error('Error searching contracts:', error);
    // Return empty results instead of throwing for better UX
    return {
      contracts: [],
      awards: [],
      total_count: 0,
      awards_count: 0,
      has_more: false
    };
  }
};

// Contract awards search
export const searchAwards = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    
    // Always include awards in the search
    const searchParams = { ...params, include_awards: true };
    
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        queryParams.append(key, value);
      }
    });
    
    console.log('🏆 Searching awards with params:', searchParams);
    const response = await api.get(`/api/contracts/search?${queryParams}`);
    console.log('✅ Awards search response:', response);
    return response;
  } catch (error) {
    console.error('Error searching awards:', error);
    // Return empty results instead of throwing for better UX
    return {
      contracts: [],
      awards: [],
      total_count: 0,
      awards_count: 0,
      has_more: false
    };
  }
};

// Get contract transaction history (modifications)
export const getContractMods = async (contractId) => {
  try {
    console.log('📝 Getting contract transaction history for:', contractId);
    const response = await api.get(`/api/contracts/contract/${contractId}/transactions`);
    console.log('✅ Contract transactions response:', response);
    
    // Convert transactions to modifications format expected by ContractAnalysis component
    if (response.transactions && Array.isArray(response.transactions)) {
      return response.transactions.map(tx => ({
        mod_number: tx.mod_number || 'Unknown',
        award_date: tx.award_date,
        award_amount: tx.award_amount || 0,
        description: tx.description || tx.action_type || 'Transaction'
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error getting contract transactions:', error);
    // Return empty array if error
    return [];
  }
};

// Get awards analytics
export const getAwardsAnalytics = async () => {
  try {
    const response = await api.get('/api/analytics/summary?include_awards=true');
    return response;
  } catch (error) {
    console.error('Error getting awards analytics:', error);
    // Return empty analytics instead of throwing
    return {
      total_opportunities: 0,
      total_awards: 0,
      total_award_value: 0,
      top_agencies: [],
      top_naics_codes: [],
      top_recipients: []
    };
  }
};

// Get contract details
export const getContractDetails = async (noticeId) => {
  try {
    const response = await api.get(`/api/contracts/${noticeId}`);
    return response;
  } catch (error) {
    console.error('Error getting contract details:', error);
    throw error;
  }
};

// Get analytics
export const getAnalytics = async () => {
  try {
    const response = await api.get('/api/analytics/summary');
    return response;
  } catch (error) {
    console.error('Error getting analytics:', error);
    // Return empty analytics instead of throwing
    return {
      total_opportunities: 0,
      total_awards: 0,
      total_award_value: 0,
      top_agencies: [],
      top_naics_codes: [],
      top_recipients: []
    };
  }
};

// Get agencies list
export const getAgencies = async () => {
  try {
    const response = await api.get('/api/agencies');
    return response;
  } catch (error) {
    console.error('Error getting agencies:', error);
    // Return default agencies if error
    return { 
      agencies: [
        "GENERAL SERVICES ADMINISTRATION",
        "DEPARTMENT OF DEFENSE",
        "DEPARTMENT OF HOMELAND SECURITY",
        "DEPARTMENT OF VETERANS AFFAIRS"
      ] 
    };
  }
};

// Get set-asides list
export const getSetAsides = async () => {
  try {
    const response = await api.get('/api/set-asides');
    return response;
  } catch (error) {
    console.error('Error getting set-asides:', error);
    // Return default set-asides if error
    return { set_asides: ["SBA", "SDVOSBC", "WOSB", "8(a)", "HUBZone"] };
  }
};

// Search contractors
export const searchContractors = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        queryParams.append(key, value);
      }
    });
    
    console.log('🏢 Searching contractors with params:', params);
    const response = await api.get(`/api/contractors/search?${queryParams}`);
    console.log('✅ Contractors search response:', response);
    return response;
  } catch (error) {
    console.error('Error searching contractors:', error);
    // Return empty results instead of throwing
    return { contractors: [] };
  }
};

// Health check
export const healthCheck = async () => {
  try {
    const response = await api.get('/health');
    return response;
  } catch (error) {
    console.error('Health check failed:', error);
    throw error;
  }
};

export default api;

import React from 'react';

const ContractorProfile = ({ contractor, profile, loading }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading contractor profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bg-white p-8 rounded-lg shadow text-center">
        <div className="text-gray-400 text-4xl mb-4">📊</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No profile data available</h3>
        <p className="text-gray-600">Unable to load contractor profile information.</p>
      </div>
    );
  }

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

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  // Extract data from our API response structure
  const contractorData = profile.contractor || contractor || {};
  const profileData = profile.profile || profile || {};
  
  // Safe data extraction with defaults
  const contractorName = contractorData.name || contractor?.name || 'Unknown Contractor';
  const totalAwards = profileData.total_awards || 0;
  const totalValue = profileData.total_value || 0;
  const primaryAgencies = profileData.primary_agencies || [];
  const naicsCodes = profileData.naics_codes || [];
  const recentAwards = profileData.recent_awards || [];
  const performanceMetrics = profileData.performance_metrics || {};
  const dateRange = profileData.date_range || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{contractorName}</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600">{formatNumber(totalAwards)}</div>
            <div className="text-sm text-gray-600">Total Awards</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">{formatCurrency(totalValue)}</div>
            <div className="text-sm text-gray-600">Total Value</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">{formatCurrency(performanceMetrics.avg_award_value || 0)}</div>
            <div className="text-sm text-gray-600">Avg Award Value</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600">{performanceMetrics.active_years || 0}</div>
            <div className="text-sm text-gray-600">Years Active</div>
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      {(dateRange.start || dateRange.end) && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">📅 Activity Timeline</h3>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-lg font-semibold text-gray-900">
                {formatDate(dateRange.start)}
              </div>
              <div className="text-sm text-gray-600">First Award</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-900">
                {formatDate(dateRange.end)}
              </div>
              <div className="text-sm text-gray-600">Latest Award</div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Awards */}
      {recentAwards && recentAwards.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">🏆 Recent Awards</h3>
          <p className="text-gray-600 mb-4">Latest contract awards for this contractor</p>
          
          <div className="space-y-4">
            {recentAwards.slice(0, 10).map((award, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">
                      {award.title || award.award_id || 'Award'}
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">{award.agency || 'Unknown Agency'}</p>
                    {award.award_type && (
                      <span className="inline-block bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded mt-2">
                        {award.award_type}
                      </span>
                    )}
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-lg font-semibold text-green-600">
                      {formatCurrency(award.amount)}
                    </div>
                    <div className="text-sm text-gray-600">
                      {formatDate(award.start_date)}
                    </div>
                  </div>
                </div>
                {award.naics_code && (
                  <div className="mt-2 text-sm text-gray-500">
                    NAICS: {award.naics_code}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {recentAwards.length > 10 && (
            <div className="mt-4 text-center text-sm text-gray-500">
              Showing 10 of {recentAwards.length} recent awards
            </div>
          )}
        </div>
      )}

      {/* Top Agencies & NAICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Primary Agencies */}
        {primaryAgencies && primaryAgencies.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">🏛️ Primary Agencies</h3>
            
            <div className="space-y-3">
              {primaryAgencies.slice(0, 8).map((agency, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-gray-900 text-sm">{agency}</span>
                  <span className="text-purple-600 font-medium">✓</span>
                </div>
              ))}
            </div>
            
            {primaryAgencies.length > 8 && (
              <div className="mt-3 text-sm text-gray-500">
                +{primaryAgencies.length - 8} more agencies
              </div>
            )}
          </div>
        )}

        {/* NAICS Codes */}
        {naicsCodes && naicsCodes.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">🏭 NAICS Codes</h3>
            
            <div className="space-y-3">
              {naicsCodes.slice(0, 8).map((naics, index) => (
                <div key={index} className="">
                  <span className="text-gray-900 text-sm block">{naics}</span>
                </div>
              ))}
            </div>
            
            {naicsCodes.length > 8 && (
              <div className="mt-3 text-sm text-gray-500">
                +{naicsCodes.length - 8} more NAICS codes
              </div>
            )}
          </div>
        )}
      </div>

      {/* Debug Information (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium text-gray-700 mb-2">Debug Information:</h4>
          <pre className="text-xs text-gray-600 overflow-auto">
            {JSON.stringify({ contractor, profile }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default ContractorProfile;
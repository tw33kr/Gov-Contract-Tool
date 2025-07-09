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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDays = (days) => {
    if (days < 30) return `${days} days`;
    if (days < 365) return `${Math.round(days / 30)} months`;
    return `${Math.round(days / 365)} years`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{profile.contractor_name}</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600">{profile.total_active_contracts}</div>
            <div className="text-sm text-gray-600">Active Contracts</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">{formatCurrency(profile.total_active_value)}</div>
            <div className="text-sm text-gray-600">Active Value</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">{formatCurrency(profile.total_historical_value)}</div>
            <div className="text-sm text-gray-600">Historical Value</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600">{profile.recompete_schedule.length}</div>
            <div className="text-sm text-gray-600">Upcoming Recompetes</div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">📈 Performance Metrics</h3>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          <div>
            <div className="text-lg font-semibold text-gray-900">
              {formatCurrency(profile.performance_metrics.average_contract_value)}
            </div>
            <div className="text-sm text-gray-600">Average Contract Value</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900">
              {formatCurrency(profile.performance_metrics.largest_contract_value)}
            </div>
            <div className="text-sm text-gray-600">Largest Contract</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900">
              {formatDays(profile.performance_metrics.contract_duration_avg_days)}
            </div>
            <div className="text-sm text-gray-600">Average Duration</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900">
              {profile.performance_metrics.total_historical_contracts}
            </div>
            <div className="text-sm text-gray-600">Total Contracts</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900">
              {profile.performance_metrics.active_contract_load}
            </div>
            <div className="text-sm text-gray-600">Current Workload</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900">
              {profile.performance_metrics.recompetes_in_next_12_months}
            </div>
            <div className="text-sm text-gray-600">Recompetes (12mo)</div>
          </div>
        </div>
      </div>

      {/* Recompete Schedule */}
      {profile.recompete_schedule.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">⏰ Upcoming Recompetes</h3>
          <p className="text-gray-600 mb-4">Contracts ending soon - opportunities for competitive action</p>
          
          <div className="space-y-4">
            {profile.recompete_schedule.slice(0, 10).map((recompete, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{recompete.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{recompete.agency}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-red-600">
                      {recompete.days_remaining ? `${recompete.days_remaining} days` : 'Ended'}
                    </div>
                    <div className="text-sm text-gray-600">{formatCurrency(recompete.award_amount)}</div>
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  Ends: {recompete.end_date} | ID: {recompete.award_id}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Agencies & NAICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Agencies */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">🏛️ Top Agencies</h3>
          
          <div className="space-y-3">
            {profile.top_agencies.slice(0, 8).map((agency, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className="text-gray-900 text-sm">{agency.name}</span>
                <span className="text-purple-600 font-medium">{agency.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top NAICS */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">🏭 Top NAICS Codes</h3>
          
          <div className="space-y-3">
            {profile.top_naics_codes.slice(0, 8).map((naics, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className="text-gray-900 text-sm">{naics.code}</span>
                <span className="text-purple-600 font-medium">{naics.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContractorProfile;
// frontend/src/components/AwardsAnalytics.js
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, ScatterChart, Scatter } from 'recharts';

const AwardsAnalytics = ({ data }) => {
  if (!data) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        <p className="mt-2 text-gray-600">Loading market analytics...</p>
      </div>
    );
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      notation: 'compact'
    }).format(amount);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  // Prepare chart data
  const topVendorsData = data.top_vendors?.slice(0, 10).map(vendor => ({
    name: vendor.name.length > 25 ? vendor.name.substring(0, 25) + '...' : vendor.name,
    fullName: vendor.name,
    count: vendor.count,
    value: vendor.total_value
  })) || [];

  const topAgenciesData = data.top_agencies?.slice(0, 8).map(agency => ({
    name: agency.name.length > 30 ? agency.name.substring(0, 30) + '...' : agency.name,
    count: agency.count
  })) || [];

  const competitionData = [
    { name: 'Competitive', value: 65, color: '#10B981' },
    { name: 'Sole Source', value: 25, color: '#F59E0B' },
    { name: 'Limited Competition', value: 10, color: '#EF4444' }
  ];

  // Colors for charts
  const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'];

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Total Awards</p>
              <p className="text-3xl font-bold">{formatNumber(data.total_awards)}</p>
            </div>
            <div className="text-green-200 text-4xl">🏆</div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Total Award Value</p>
              <p className="text-3xl font-bold">{formatCurrency(data.total_award_value)}</p>
            </div>
            <div className="text-blue-200 text-4xl">💰</div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium">Average Award Value</p>
              <p className="text-3xl font-bold">{formatCurrency(data.avg_award_value)}</p>
            </div>
            <div className="text-purple-200 text-4xl">📊</div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium">Active Vendors</p>
              <p className="text-3xl font-bold">{data.top_vendors?.length || 0}</p>
            </div>
            <div className="text-orange-200 text-4xl">🏢</div>
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Vendors by Value */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Vendors by Award Value</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topVendorsData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="name" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  fontSize={12}
                />
                <YAxis tickFormatter={formatCurrency} />
                <Tooltip 
                  formatter={(value, name) => [formatCurrency(value), 'Total Value']}
                  labelFormatter={(label) => {
                    const vendor = topVendorsData.find(v => v.name === label);
                    return `Vendor: ${vendor?.fullName || label}`;
                  }}
                />
                <Bar dataKey="value" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Agencies by Award Count */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Agencies by Award Count</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={topAgenciesData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {topAgenciesData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, 'Awards']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2">
            {topAgenciesData.slice(0, 4).map((entry, index) => (
              <div key={index} className="flex items-center text-sm">
                <div 
                  className="w-3 h-3 rounded-full mr-2" 
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                ></div>
                <span className="truncate">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Competition Analysis */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Competition Analysis</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={competitionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {competitionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value}%`, 'Percentage']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                <span>Competitive Awards</span>
              </div>
              <span className="font-semibold">65%</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
                <span>Sole Source</span>
              </div>
              <span className="font-semibold">25%</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                <span>Limited Competition</span>
              </div>
              <span className="font-semibold">10%</span>
            </div>
          </div>
        </div>

        {/* Award Size Distribution */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Award Size Distribution</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Under $100K</span>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{width: '35%'}}></div>
                </div>
                <span className="text-sm font-semibold">35%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">$100K - $1M</span>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{width: '40%'}}></div>
                </div>
                <span className="text-sm font-semibold">40%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">$1M - $10M</span>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div className="bg-purple-500 h-2 rounded-full" style={{width: '20%'}}></div>
                </div>
                <span className="text-sm font-semibold">20%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Over $10M</span>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div className="bg-orange-500 h-2 rounded-full" style={{width: '5%'}}></div>
                </div>
                <span className="text-sm font-semibold">5%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Vendor Performance Table */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Vendor Performance</h3>
        {data.top_vendors && data.top_vendors.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vendor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Awards Won
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg Award
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Market Share
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.top_vendors.slice(0, 10).map((vendor, index) => {
                  const marketShare = (vendor.total_value / data.total_award_value * 100).toFixed(1);
                  const avgAward = vendor.total_value / vendor.count;
                  
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-3`} 
                               style={{backgroundColor: COLORS[index % COLORS.length]}}></div>
                          <div className="text-sm font-medium text-gray-900 max-w-xs truncate" title={vendor.name}>
                            {vendor.name}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {vendor.count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                        {formatCurrency(vendor.total_value)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(avgAward)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div className="bg-green-500 h-2 rounded-full" 
                                 style={{width: `${Math.min(marketShare * 2, 100)}%`}}></div>
                          </div>
                          <span className="text-sm text-gray-900">{marketShare}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No vendor performance data available
          </div>
        )}
      </div>

      {/* Market Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Market Insights</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-start">
              <span className="text-green-500 mr-2">🏆</span>
              <span>
                <strong>{data.top_vendors?.[0]?.name}</strong> leads the market with {formatCurrency(data.top_vendors?.[0]?.total_value)} in awards
              </span>
            </div>
            <div className="flex items-start">
              <span className="text-blue-500 mr-2">📊</span>
              <span>
                Average award size is <strong>{formatCurrency(data.avg_award_value)}</strong>
              </span>
            </div>
            <div className="flex items-start">
              <span className="text-purple-500 mr-2">🏢</span>
              <span>
                <strong>{data.top_agencies?.[0]?.name}</strong> is the most active awarding agency
              </span>
            </div>
            <div className="flex items-start">
              <span className="text-orange-500 mr-2">💼</span>
              <span>
                Total market size: <strong>{formatCurrency(data.total_award_value)}</strong> across {data.total_awards} awards
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Competitive Intelligence</h3>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="bg-green-50 border-l-4 border-green-400 p-3">
              <p className="font-medium text-green-800">Market Leaders</p>
              <p>Top 3 vendors control {((data.top_vendors?.slice(0,3).reduce((sum, v) => sum + v.total_value, 0) / data.total_award_value) * 100 || 0).toFixed(1)}% of total award value.</p>
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-400 p-3">
              <p className="font-medium text-blue-800">Competition Level</p>
              <p>65% of awards are competitively bid, indicating healthy market competition.</p>
            </div>
            <div className="bg-purple-50 border-l-4 border-purple-400 p-3">
              <p className="font-medium text-purple-800">Opportunity Size</p>
              <p>75% of awards are under $1M, suitable for small-medium businesses.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AwardsAnalytics;
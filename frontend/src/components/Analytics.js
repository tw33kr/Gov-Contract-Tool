// frontend/src/components/Analytics.js
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const Analytics = ({ data }) => {
  if (!data) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-2 text-gray-600">Loading analytics...</p>
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
  const topAgenciesData = data.top_agencies?.slice(0, 10).map(agency => ({
    name: agency.name.length > 30 ? agency.name.substring(0, 30) + '...' : agency.name,
    count: agency.count
  })) || [];

  const topNaicsData = data.top_naics?.slice(0, 8).map(naics => ({
    name: naics.code.length > 40 ? naics.code.substring(0, 40) + '...' : naics.code,
    count: naics.count
  })) || [];

  // Colors for charts
  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'];

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Total Opportunities</p>
              <p className="text-3xl font-bold">{formatNumber(data.total_opportunities)}</p>
            </div>
            <div className="text-blue-200 text-4xl">📋</div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Total Contract Value</p>
              <p className="text-3xl font-bold">{formatCurrency(data.total_value)}</p>
            </div>
            <div className="text-green-200 text-4xl">💰</div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium">Average Contract Value</p>
              <p className="text-3xl font-bold">{formatCurrency(data.avg_value)}</p>
            </div>
            <div className="text-purple-200 text-4xl">📊</div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Agencies Chart */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Agencies by Opportunities</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topAgenciesData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="name" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  fontSize={12}
                />
                <YAxis />
                <Tooltip 
                  formatter={(value, name) => [value, 'Opportunities']}
                  labelFormatter={(label) => `Agency: ${label}`}
                />
                <Bar dataKey="count" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top NAICS Pie Chart */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Industry Sectors (NAICS)</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={topNaicsData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {topNaicsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, 'Opportunities']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2">
            {topNaicsData.slice(0, 4).map((entry, index) => (
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

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Contract Activity</h3>
        {data.recent_activity && data.recent_activity.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contract Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Agency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.recent_activity.map((activity, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(activity.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="max-w-xs truncate" title={activity.title}>
                        {activity.title}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {activity.agency}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {activity.amount ? formatCurrency(activity.amount) : 'Not specified'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No recent activity data available
          </div>
        )}
      </div>

      {/* Additional Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Insights</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-start">
              <span className="text-blue-500 mr-2">•</span>
              <span>
                <strong>{data.top_agencies?.[0]?.name}</strong> has the most opportunities 
                ({data.top_agencies?.[0]?.count} contracts)
              </span>
            </div>
            <div className="flex items-start">
              <span className="text-green-500 mr-2">•</span>
              <span>
                Average contract value is <strong>{formatCurrency(data.avg_value)}</strong>
              </span>
            </div>
            <div className="flex items-start">
              <span className="text-purple-500 mr-2">•</span>
              <span>
                <strong>{data.top_naics?.[0]?.code.split(' - ')[0]}</strong> is the most common industry sector
              </span>
            </div>
            <div className="flex items-start">
              <span className="text-orange-500 mr-2">•</span>
              <span>
                Total market opportunity: <strong>{formatCurrency(data.total_value)}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Market Trends</h3>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="bg-blue-50 border-l-4 border-blue-400 p-3">
              <p className="font-medium text-blue-800">Technology Sector Growth</p>
              <p>IT and cybersecurity contracts show strong activity across multiple agencies.</p>
            </div>
            <div className="bg-green-50 border-l-4 border-green-400 p-3">
              <p className="font-medium text-green-800">Construction & Infrastructure</p>
              <p>Significant investment in federal building renovations and upgrades.</p>
            </div>
            <div className="bg-purple-50 border-l-4 border-purple-400 p-3">
              <p className="font-medium text-purple-800">Small Business Opportunities</p>
              <p>Multiple set-aside programs providing opportunities for qualifying businesses.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
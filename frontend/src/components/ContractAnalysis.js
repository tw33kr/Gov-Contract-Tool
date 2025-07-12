// frontend/src/components/ContractAnalysis.js
import React, { useState, useEffect } from 'react';
import { format, parseISO, getYear, getMonth, startOfYear, endOfYear, isWithinInterval, differenceInDays } from 'date-fns';

const ContractAnalysis = ({ contract, mods, onClose }) => {
  const [activeTab, setActiveTab] = useState('calendar');
  const [calendarData, setCalendarData] = useState([]);
  const [fiscalData, setFiscalData] = useState([]);
  const [performanceData, setPerformanceData] = useState([]);

  useEffect(() => {
    if (contract && mods) {
      analyzeContract();
    }
  }, [contract, mods]);

  const analyzeContract = () => {
    // Combine base contract and mods
    const allMods = [
      {
        mod_number: 'BASE',
        award_date: contract.award_date,
        award_amount: contract.award_amount,
        description: 'Base Contract Award'
      },
      ...mods
    ];

    // Sort by date
    allMods.sort((a, b) => new Date(a.award_date) - new Date(b.award_date));

    // Get contract date range
    const startDate = parseISO(contract.start_date || contract.award_date);
    const endDate = contract.end_date ? parseISO(contract.end_date) : new Date();

    // Analyze by calendar year
    const calendarYearData = analyzeByCalendarYear(allMods, startDate, endDate);
    setCalendarData(calendarYearData);

    // Analyze by fiscal year
    const fiscalYearData = analyzeByFiscalYear(allMods, startDate, endDate);
    setFiscalData(fiscalYearData);

    // Analyze by performance period
    const performancePeriodData = analyzeByPerformancePeriod(allMods, startDate, endDate);
    setPerformanceData(performancePeriodData);
  };

  const analyzeByCalendarYear = (mods, startDate, endDate) => {
    const startYear = getYear(startDate);
    const endYear = getYear(endDate);
    const yearlyData = [];

    for (let year = startYear; year <= endYear; year++) {
      const yearStart = startOfYear(new Date(year, 0, 1));
      const yearEnd = endOfYear(new Date(year, 0, 1));
      
      const yearMods = mods.filter(mod => {
        const modDate = parseISO(mod.award_date);
        return isWithinInterval(modDate, { start: yearStart, end: yearEnd });
      });

      const totalAmount = yearMods.reduce((sum, mod) => sum + (mod.award_amount || 0), 0);
      
      yearlyData.push({
        year: year.toString(),
        period: `Jan ${year} - Dec ${year}`,
        mods: yearMods,
        totalAmount,
        modCount: yearMods.length
      });
    }

    return yearlyData;
  };

  const analyzeByFiscalYear = (mods, startDate, endDate) => {
    const getFiscalYear = (date) => {
      const month = getMonth(date);
      const year = getYear(date);
      // Fiscal year starts in October (month 9)
      return month >= 9 ? year + 1 : year;
    };

    const startFY = getFiscalYear(startDate);
    const endFY = getFiscalYear(endDate);
    const yearlyData = [];

    for (let fy = startFY; fy <= endFY; fy++) {
      const fyStart = new Date(fy - 1, 9, 1); // October 1st of previous year
      const fyEnd = new Date(fy, 8, 30, 23, 59, 59); // September 30th
      
      const yearMods = mods.filter(mod => {
        const modDate = parseISO(mod.award_date);
        return isWithinInterval(modDate, { start: fyStart, end: fyEnd });
      });

      const totalAmount = yearMods.reduce((sum, mod) => sum + (mod.award_amount || 0), 0);
      
      yearlyData.push({
        year: `FY${fy}`,
        period: `Oct ${fy-1} - Sep ${fy}`,
        mods: yearMods,
        totalAmount,
        modCount: yearMods.length
      });
    }

    return yearlyData;
  };

  const analyzeByPerformancePeriod = (mods, startDate, endDate) => {
    const yearlyData = [];
    let currentStart = new Date(startDate);
    let periodNumber = 1;

    while (currentStart < endDate) {
      const currentEnd = new Date(currentStart);
      currentEnd.setFullYear(currentEnd.getFullYear() + 1);
      currentEnd.setDate(currentEnd.getDate() - 1);
      
      const periodEnd = currentEnd > endDate ? endDate : currentEnd;
      
      const yearMods = mods.filter(mod => {
        const modDate = parseISO(mod.award_date);
        return isWithinInterval(modDate, { start: currentStart, end: periodEnd });
      });

      const totalAmount = yearMods.reduce((sum, mod) => sum + (mod.award_amount || 0), 0);
      
      yearlyData.push({
        year: `Year ${periodNumber}`,
        period: `${format(currentStart, 'MMM dd, yyyy')} - ${format(periodEnd, 'MMM dd, yyyy')}`,
        mods: yearMods,
        totalAmount,
        modCount: yearMods.length
      });

      currentStart = new Date(currentEnd);
      currentStart.setDate(currentStart.getDate() + 1);
      periodNumber++;
    }

    return yearlyData;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  const renderTable = (data, title) => (
    <div className="mb-8">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Range</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mods</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-4 py-2 whitespace-nowrap font-medium">{row.year}</td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">{row.period}</td>
                <td className="px-4 py-2 whitespace-nowrap text-sm">{row.modCount}</td>
                <td className="px-4 py-2 whitespace-nowrap text-right font-medium">{formatCurrency(row.totalAmount)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2">-</td>
              <td className="px-4 py-2">{data.reduce((sum, row) => sum + row.modCount, 0)}</td>
              <td className="px-4 py-2 text-right">{formatCurrency(data.reduce((sum, row) => sum + row.totalAmount, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderChart = (data, title, color) => {
    const maxAmount = Math.max(...data.flatMap(d => d.mods.map(m => m.award_amount || 0)));
    const chartHeight = 300;
    const chartWidth = 800;
    const padding = { top: 40, right: 150, bottom: 60, left: 80 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;

    return (
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">{title} - Modification Timeline</h3>
        <div className="overflow-x-auto">
          <svg width={chartWidth} height={chartHeight} className="bg-white border border-gray-200">
            {/* Y-axis */}
            <line x1={padding.left} y1={padding.top} x2={padding.left} y2={chartHeight - padding.bottom} stroke="#e5e7eb" />
            
            {/* X-axis */}
            <line x1={padding.left} y1={chartHeight - padding.bottom} x2={chartWidth - padding.right} y2={chartHeight - padding.bottom} stroke="#e5e7eb" />
            
            {/* Y-axis labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
              const y = chartHeight - padding.bottom - (tick * plotHeight);
              const value = tick * maxAmount;
              return (
                <g key={tick}>
                  <line x1={padding.left - 5} y1={y} x2={padding.left} y2={y} stroke="#9ca3af" />
                  <text x={padding.left - 10} y={y + 4} textAnchor="end" className="text-xs fill-gray-600">
                    {formatCurrency(value)}
                  </text>
                </g>
              );
            })}

            {/* Plot data */}
            {data.map((yearData, yearIdx) => {
              const yearX = padding.left + (yearIdx / (data.length - 1)) * plotWidth;
              const yearWidth = plotWidth / data.length;
              
              return (
                <g key={yearIdx}>
                  {/* Year divider */}
                  <line x1={yearX + yearWidth} y1={padding.top} x2={yearX + yearWidth} y2={chartHeight - padding.bottom} stroke="#e5e7eb" strokeDasharray="2,2" />
                  
                  {/* Year label */}
                  <text x={yearX + yearWidth / 2} y={chartHeight - padding.bottom + 20} textAnchor="middle" className="text-xs font-medium fill-gray-700">
                    {yearData.year}
                  </text>
                  
                  {/* Period label */}
                  <text x={yearX + yearWidth / 2} y={chartHeight - padding.bottom + 35} textAnchor="middle" className="text-xs fill-gray-500">
                    {yearData.period.split(' - ')[0]}
                  </text>
                  
                  {/* Total amount at end of period */}
                  <text x={yearX + yearWidth - 5} y={chartHeight - padding.bottom - 5} textAnchor="end" className="text-xs font-semibold fill-gray-700">
                    {formatCurrency(yearData.totalAmount)}
                  </text>
                  
                  {/* Plot mods */}
                  {yearData.mods.map((mod, modIdx) => {
                    const modX = yearX + (modIdx / Math.max(yearData.mods.length - 1, 1)) * yearWidth * 0.8 + yearWidth * 0.1;
                    const modY = chartHeight - padding.bottom - ((mod.award_amount || 0) / maxAmount) * plotHeight;
                    
                    return (
                      <g key={modIdx}>
                        {/* Vertical line to baseline */}
                        <line x1={modX} y1={chartHeight - padding.bottom} x2={modX} y2={modY} stroke={color} strokeWidth="2" opacity="0.3" />
                        
                        {/* Mod point */}
                        <circle cx={modX} cy={modY} r="4" fill={color} stroke="white" strokeWidth="2">
                          <title>{`${mod.mod_number}: ${formatCurrency(mod.award_amount)} on ${format(parseISO(mod.award_date), 'MMM dd, yyyy')}`}</title>
                        </circle>
                        
                        {/* Mod label for significant amounts */}
                        {mod.award_amount > maxAmount * 0.1 && (
                          <text x={modX} y={modY - 8} textAnchor="middle" className="text-xs font-medium" fill={color}>
                            {mod.mod_number}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Chart title */}
            <text x={chartWidth / 2} y={20} textAnchor="middle" className="text-sm font-semibold fill-gray-700">
              Contract Modifications by {title}
            </text>
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-green-600 text-white p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-2">Contract Analysis</h2>
              <p className="text-green-100">{contract.title}</p>
              <p className="text-sm text-green-200 mt-1">
                Contract ID: {contract.contract_id || contract.award_id} | 
                Total Value: {formatCurrency(contract.award_amount + (mods?.reduce((sum, m) => sum + (m.award_amount || 0), 0) || 0))}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-green-100 text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {[
              { id: 'calendar', label: 'Calendar Year' },
              { id: 'fiscal', label: 'Fiscal Year' },
              { id: 'performance', label: 'Performance Period' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-6 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 240px)' }}>
          {activeTab === 'calendar' && (
            <>
              {renderTable(calendarData, 'Calendar Year Analysis')}
              {renderChart(calendarData, 'Calendar Year', '#10b981')}
            </>
          )}
          
          {activeTab === 'fiscal' && (
            <>
              {renderTable(fiscalData, 'Fiscal Year Analysis')}
              {renderChart(fiscalData, 'Fiscal Year', '#3b82f6')}
            </>
          )}
          
          {activeTab === 'performance' && (
            <>
              {renderTable(performanceData, 'Performance Period Analysis')}
              {renderChart(performanceData, 'Performance Period', '#f59e0b')}
            </>
          )}
          
          {/* Modification Details */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4">Modification Details</h3>
            <div className="space-y-2">
              {[...mods, { mod_number: 'BASE', award_date: contract.award_date, award_amount: contract.award_amount, description: 'Base Contract Award' }]
                .sort((a, b) => new Date(a.award_date) - new Date(b.award_date))
                .map((mod, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <div>
                      <span className="font-medium">{mod.mod_number}</span>
                      <span className="text-sm text-gray-600 ml-2">
                        {format(parseISO(mod.award_date), 'MMM dd, yyyy')}
                      </span>
                      {mod.description && (
                        <span className="text-sm text-gray-500 ml-2">- {mod.description}</span>
                      )}
                    </div>
                    <span className="font-medium">{formatCurrency(mod.award_amount)}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContractAnalysis;
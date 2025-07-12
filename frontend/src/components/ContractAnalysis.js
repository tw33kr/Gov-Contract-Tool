// frontend/src/components/ContractAnalysis.js
import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO, getYear, getMonth, startOfYear, endOfYear, isWithinInterval, differenceInDays } from 'date-fns';

const ContractAnalysis = ({ contract, mods, onClose }) => {
  const [calendarData, setCalendarData] = useState([]);
  const [fiscalData, setFiscalData] = useState([]);
  const [performanceData, setPerformanceData] = useState([]);
  const [allMods, setAllMods] = useState([]);
  const [timelineData, setTimelineData] = useState(null);

  const analyzeContract = useCallback(() => {
    // Combine base contract and mods
    const combinedMods = [
      {
        mod_number: 'BASE',
        award_date: contract.award_date,
        award_amount: contract.award_amount,
        description: 'Base Contract Award'
      },
      ...mods
    ];

    // Sort by date
    combinedMods.sort((a, b) => new Date(a.award_date) - new Date(b.award_date));
    setAllMods(combinedMods);

    // Get contract date range
    const startDate = parseISO(contract.start_date || contract.award_date);
    const endDate = contract.end_date ? parseISO(contract.end_date) : new Date();

    // Analyze by calendar year
    const calendarYearData = analyzeByCalendarYear(combinedMods, startDate, endDate);
    setCalendarData(calendarYearData);

    // Analyze by fiscal year
    const fiscalYearData = analyzeByFiscalYear(combinedMods, startDate, endDate);
    setFiscalData(fiscalYearData);

    // Analyze by performance period
    const performancePeriodData = analyzeByPerformancePeriod(combinedMods, startDate, endDate);
    setPerformanceData(performancePeriodData);

    // Create unified timeline data
    createUnifiedTimeline(combinedMods, startDate, endDate, calendarYearData, fiscalYearData, performancePeriodData);
  }, [contract, mods]);

  useEffect(() => {
    if (contract && mods) {
      analyzeContract();
    }
  }, [contract, mods, analyzeContract]);

  const createUnifiedTimeline = (mods, startDate, endDate, calendarData, fiscalData, performanceData) => {
    const timeline = {
      startDate,
      endDate,
      mods,
      calendarMarkers: [],
      fiscalMarkers: [],
      performanceMarkers: []
    };

    // Create calendar year markers
    calendarData.forEach((yearData) => {
      if (yearData.totalAmount > 0) {
        const endDate = new Date(parseInt(yearData.year), 11, 31); // Dec 31
        timeline.calendarMarkers.push({
          date: endDate,
          label: yearData.year,
          amount: yearData.totalAmount
        });
      }
    });

    // Create fiscal year markers
    fiscalData.forEach((fyData) => {
      if (fyData.totalAmount > 0) {
        const fy = parseInt(fyData.year.replace('FY', ''));
        const endDate = new Date(fy - 1, 8, 30); // Sep 30
        timeline.fiscalMarkers.push({
          date: endDate,
          label: fyData.year,
          amount: fyData.totalAmount
        });
      }
    });

    // Create performance period markers
    performanceData.forEach((periodData) => {
      if (periodData.totalAmount > 0) {
        // Parse the end date from the period string
        const periodEndStr = periodData.period.split(' - ')[1];
        const endDate = parseISO(periodEndStr);
        timeline.performanceMarkers.push({
          date: endDate,
          label: periodData.year,
          amount: periodData.totalAmount
        });
      }
    });

    setTimelineData(timeline);
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
      
      // Create a closure to capture the current values
      const filterMods = (start, end) => {
        return mods.filter(mod => {
          const modDate = parseISO(mod.award_date);
          return isWithinInterval(modDate, { start, end });
        });
      };
      
      const yearMods = filterMods(currentStart, periodEnd);
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

  const formatCompactCurrency = (amount) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return formatCurrency(amount);
  };

  const renderUnifiedChart = () => {
    if (!timelineData) return null;

    const { startDate, endDate, mods, calendarMarkers, fiscalMarkers, performanceMarkers } = timelineData;
    const maxAmount = Math.max(...mods.map(m => m.award_amount || 0));
    const chartHeight = 450;
    const chartWidth = 1200;
    const padding = { top: 40, right: 80, bottom: 200, left: 100 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;

    // Time scale
    const totalDays = differenceInDays(endDate, startDate);
    const getXPosition = (date) => {
      const days = differenceInDays(date, startDate);
      return padding.left + (days / totalDays) * plotWidth;
    };

    return (
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Unified Contract Modification Timeline</h3>
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
                    {formatCompactCurrency(value)}
                  </text>
                </g>
              );
            })}

            {/* Plot modifications */}
            {mods.map((mod, idx) => {
              const modDate = parseISO(mod.award_date);
              const x = getXPosition(modDate);
              const y = chartHeight - padding.bottom - ((mod.award_amount || 0) / maxAmount) * plotHeight;
              
              return (
                <g key={idx}>
                  {/* Vertical line to baseline */}
                  <line x1={x} y1={chartHeight - padding.bottom} x2={x} y2={y} stroke="#6b7280" strokeWidth="1" opacity="0.3" />
                  
                  {/* Mod point */}
                  <circle cx={x} cy={y} r="5" fill="#6b7280" stroke="white" strokeWidth="2">
                    <title>{`${mod.mod_number}: ${formatCurrency(mod.award_amount)} on ${format(modDate, 'MMM dd, yyyy')}`}</title>
                  </circle>
                  
                  {/* Mod label for significant amounts */}
                  {mod.award_amount > maxAmount * 0.15 && (
                    <text x={x} y={y - 8} textAnchor="middle" className="text-xs font-medium fill-gray-700">
                      {mod.mod_number}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Calendar Year Markers */}
            {calendarMarkers.map((marker, idx) => {
              const x = getXPosition(marker.date);
              if (x < padding.left || x > chartWidth - padding.right) return null;
              
              return (
                <g key={`cal-${idx}`}>
                  {/* Vertical line */}
                  <line x1={x} y1={padding.top} x2={x} y2={chartHeight - padding.bottom} stroke="#10b981" strokeWidth="2" opacity="0.3" />
                  
                  {/* Year label */}
                  <text x={x} y={chartHeight - padding.bottom + 20} textAnchor="middle" className="text-sm font-medium fill-green-600">
                    CY{marker.label}
                  </text>
                  
                  {/* Amount */}
                  <text x={x} y={chartHeight - padding.bottom + 35} textAnchor="middle" className="text-xs font-semibold fill-green-700">
                    {formatCompactCurrency(marker.amount)}
                  </text>
                </g>
              );
            })}

            {/* Fiscal Year Markers */}
            {fiscalMarkers.map((marker, idx) => {
              const x = getXPosition(marker.date);
              if (x < padding.left || x > chartWidth - padding.right) return null;
              
              return (
                <g key={`fy-${idx}`}>
                  {/* Vertical line */}
                  <line x1={x} y1={padding.top} x2={x} y2={chartHeight - padding.bottom} stroke="#3b82f6" strokeWidth="2" opacity="0.3" strokeDasharray="5,5" />
                  
                  {/* Year label */}
                  <text x={x} y={chartHeight - padding.bottom + 60} textAnchor="middle" className="text-sm font-medium fill-blue-600">
                    {marker.label}
                  </text>
                  
                  {/* Amount */}
                  <text x={x} y={chartHeight - padding.bottom + 75} textAnchor="middle" className="text-xs font-semibold fill-blue-700">
                    {formatCompactCurrency(marker.amount)}
                  </text>
                </g>
              );
            })}

            {/* Performance Period Markers */}
            {performanceMarkers.map((marker, idx) => {
              const x = getXPosition(marker.date);
              if (x < padding.left || x > chartWidth - padding.right) return null;
              
              return (
                <g key={`pp-${idx}`}>
                  {/* Vertical line */}
                  <line x1={x} y1={padding.top} x2={x} y2={chartHeight - padding.bottom} stroke="#f59e0b" strokeWidth="2" opacity="0.3" strokeDasharray="2,2" />
                  
                  {/* Year label */}
                  <text x={x} y={chartHeight - padding.bottom + 100} textAnchor="middle" className="text-sm font-medium fill-amber-600">
                    PP {marker.label}
                  </text>
                  
                  {/* Amount */}
                  <text x={x} y={chartHeight - padding.bottom + 115} textAnchor="middle" className="text-xs font-semibold fill-amber-700">
                    {formatCompactCurrency(marker.amount)}
                  </text>
                </g>
              );
            })}

            {/* Chart title */}
            <text x={chartWidth / 2} y={20} textAnchor="middle" className="text-base font-semibold fill-gray-700">
              Contract Modifications Across All Calendar Types
            </text>

            {/* Legend */}
            <g transform={`translate(${padding.left}, ${chartHeight - 50})`}>
              <text x="0" y="0" className="text-xs font-medium fill-gray-600">Legend:</text>
              
              {/* Calendar Year */}
              <line x1="80" y1="-3" x2="100" y2="-3" stroke="#10b981" strokeWidth="2" />
              <text x="105" y="0" className="text-xs fill-gray-600">Calendar Year (CY)</text>
              
              {/* Fiscal Year */}
              <line x1="250" y1="-3" x2="270" y2="-3" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" />
              <text x="275" y="0" className="text-xs fill-gray-600">Fiscal Year (FY)</text>
              
              {/* Performance Period */}
              <line x1="400" y1="-3" x2="420" y2="-3" stroke="#f59e0b" strokeWidth="2" strokeDasharray="2,2" />
              <text x="425" y="0" className="text-xs fill-gray-600">Performance Period (PP)</text>
              
              {/* Modifications */}
              <circle cx="590" cy="-3" r="4" fill="#6b7280" />
              <text x="600" y="0" className="text-xs fill-gray-600">Modifications</text>
            </g>
          </svg>
        </div>
      </div>
    );
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
            {data.filter(row => row.totalAmount > 0).map((row, idx) => (
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
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

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 160px)' }}>
          {/* Unified Chart */}
          {renderUnifiedChart()}
          
          {/* Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
            <div>{renderTable(calendarData, 'Calendar Year Analysis')}</div>
            <div>{renderTable(fiscalData, 'Fiscal Year Analysis')}</div>
            <div>{renderTable(performanceData, 'Performance Period Analysis')}</div>
          </div>
          
          {/* Modification Details */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4">Modification Details</h3>
            <div className="space-y-2">
              {allMods.map((mod, idx) => (
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
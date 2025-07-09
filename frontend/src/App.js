import React, { useState } from 'react';
import './App.css';
import OpportunitiesTab from './components/OpportunitiesTab';
import Analytics from './components/Analytics';
import Awards from './components/Awards';
import ContractorAnalysis from './components/ContractorAnalysis';

function App() {
  const [activeTab, setActiveTab] = useState('opportunities');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">
                🏛️ Federal Contract Research Tool
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                Real-time federal contracting intelligence
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('opportunities')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'opportunities'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              🔍 Search Opportunities
            </button>
            
            <button
              onClick={() => setActiveTab('awards')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'awards'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              🏆 Contract Awards
            </button>

            <button
              onClick={() => setActiveTab('contractors')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'contractors'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              🏢 Contractor Intelligence
            </button>
            
            <button
              onClick={() => setActiveTab('analytics')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'analytics'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📊 Analytics
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {activeTab === 'opportunities' && (
          <OpportunitiesTab />
        )}
        
        {activeTab === 'awards' && <Awards />}
        
        {activeTab === 'contractors' && <ContractorAnalysis />}
        
        {activeTab === 'analytics' && <Analytics />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            Federal Contract Research Tool - Powered by SAM.gov and USASpending.gov APIs
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
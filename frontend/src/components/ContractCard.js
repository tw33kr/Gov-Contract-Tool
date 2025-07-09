// frontend/src/components/ContractCard.js
import React from 'react';

const ContractCard = ({ contract }) => {
  const formatDate = (dateString) => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="bg-gray-50 rounded-lg p-6 space-y-4">
      {/* Detailed Information Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Contract Details</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Notice ID:</span>
                <span className="font-mono">{contract.notice_id}</span>
              </div>
              
              {contract.solicitation_number && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Solicitation:</span>
                  <span className="font-mono">{contract.solicitation_number}</span>
                </div>
              )}
              
              {contract.contract_type && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Contract Type:</span>
                  <span>{contract.contract_type}</span>
                </div>
              )}
              
              {contract.award_amount && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Award Amount:</span>
                  <span className="font-semibold text-green-600">
                    {formatCurrency(contract.award_amount)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Classification</h4>
            <div className="space-y-2 text-sm">
              {contract.naics_code && (
                <div className="flex justify-between">
                  <span className="text-gray-600">NAICS Code:</span>
                  <span>{contract.naics_code}</span>
                </div>
              )}
              
              {contract.naics_description && (
                <div>
                  <span className="text-gray-600">NAICS Description:</span>
                  <p className="mt-1 text-gray-900">{contract.naics_description}</p>
                </div>
              )}
              
              {contract.set_aside && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Set-Aside:</span>
                  <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">
                    {contract.set_aside}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Timeline</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Posted Date:</span>
                <span>{formatDate(contract.posted_date)}</span>
              </div>
              
              {contract.response_deadline && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Response Deadline:</span>
                  <span className="font-semibold">
                    {formatDate(contract.response_deadline)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Location & Contact</h4>
            <div className="space-y-2 text-sm">
              {contract.place_of_performance && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Performance Location:</span>
                  <span>{contract.place_of_performance}</span>
                </div>
              )}
              
              <div className="flex justify-between">
                <span className="text-gray-600">Agency:</span>
                <span>{contract.agency}</span>
              </div>
              
              {contract.office && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Office:</span>
                  <span>{contract.office}</span>
                </div>
              )}
              
              {contract.contact_info && (
                <div>
                  <span className="text-gray-600">Contact:</span>
                  <p className="mt-1 text-gray-900">{contract.contact_info}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full Description */}
      <div>
        <h4 className="font-semibold text-gray-900 mb-2">Full Description</h4>
        <div className="bg-white rounded border p-4">
          <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
            {contract.description || 'No detailed description available.'}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 pt-4 border-t">
        <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors">
          Save to Watchlist
        </button>
        
        <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors">
          Set Reminder
        </button>
        
        <button className="border border-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-50 transition-colors">
          View on SAM.gov
        </button>
        
        <button 
          onClick={() => {
            const shareText = `Check out this federal contract opportunity: ${contract.title} from ${contract.agency}. Deadline: ${formatDate(contract.response_deadline)}`;
            if (navigator.share) {
              navigator.share({
                title: contract.title,
                text: shareText,
                url: window.location.href
              });
            } else {
              navigator.clipboard.writeText(shareText);
              alert('Contract information copied to clipboard!');
            }
          }}
          className="border border-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-50 transition-colors"
        >
          Share
        </button>
      </div>
    </div>
  );
};

export default ContractCard;
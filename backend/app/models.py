# backend/app/models.py
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class SearchRequest(BaseModel):
    keyword: Optional[str] = None
    agency: Optional[str] = None
    naics_code: Optional[str] = None
    set_aside: Optional[str] = None
    posted_date_from: Optional[str] = None
    posted_date_to: Optional[str] = None
    award_date_from: Optional[str] = None
    award_date_to: Optional[str] = None
    limit: int = 50
    offset: int = 0
    include_awards: bool = False

class ContractOpportunity(BaseModel):
    notice_id: str
    title: str
    agency: str
    office: Optional[str] = None
    posted_date: Optional[str] = None
    response_deadline: Optional[str] = None
    naics_code: Optional[str] = None
    naics_description: Optional[str] = None
    set_aside: Optional[str] = None
    description: Optional[str] = None
    award_amount: Optional[float] = None
    place_of_performance: Optional[str] = None
    contact_info: Optional[str] = None
    solicitation_number: Optional[str] = None
    contract_type: str = "Unknown"

class AwardedContract(BaseModel):
    award_id: str
    title: str
    recipient_name: str
    awarding_agency: str
    awarding_subagency: Optional[str] = None
    award_amount: float = 0.0
    award_date: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    award_type: str = "Contract"
    description: Optional[str] = None
    naics_code: Optional[str] = None
    naics_description: Optional[str] = None
    place_of_performance: Optional[str] = None
    contract_type: str = "Unknown"
    set_aside: Optional[str] = None
    competition_type: str = "Unknown"

class AgencyCount(BaseModel):
    name: str
    count: int

class NAICSCount(BaseModel):
    code: str
    count: int

class VendorValue(BaseModel):
    name: str
    total_value: float

class AnalyticsSummary(BaseModel):
    total_opportunities: int = 0
    total_awards: int = 0
    total_opportunity_value: float = 0.0
    total_award_value: float = 0.0
    avg_opportunity_value: float = 0.0
    top_agencies: List[AgencyCount] = []
    top_naics_codes: List[NAICSCount] = []
    top_naics: List[NAICSCount] = []  # Alias for top_naics_codes
    top_vendors: List[VendorValue] = []
    recent_activity: List[dict] = []

class SearchResponse(BaseModel):
    contracts: List[ContractOpportunity] = []
    awards: List[AwardedContract] = []
    total_count: int = 0
    has_more: bool = False

# New models for enhanced features
class SavedSearch(BaseModel):
    id: Optional[int] = None
    name: str
    description: Optional[str] = None
    search_params: dict
    created_at: Optional[str] = None
    last_run: Optional[str] = None

class SavedSearchResponse(BaseModel):
    saved_searches: List[SavedSearch]

class CompetitiveIntelligence(BaseModel):
    top_contractors: List[VendorValue] = []
    market_concentration: dict = {}
    average_award_size: float = 0.0
    competition_analysis: dict = {}

class MarketTrends(BaseModel):
    monthly_awards: List[dict] = []
    agency_trends: List[dict] = []
    sector_growth: List[dict] = []

class EnhancedAnalytics(BaseModel):
    basic_summary: AnalyticsSummary
    competitive_intelligence: CompetitiveIntelligence
    market_trends: MarketTrends
    recommendations: List[str] = []

# Contractor profile models
class ContractTimelineItem(BaseModel):
    award_id: str
    title: str
    awarding_agency: str
    award_amount: float
    start_date: str
    end_date: str
    status: str  # "active", "ending_soon", "completed"
    days_remaining: Optional[int] = None
    contract_type: str
    naics_code: Optional[str] = None

class ContractorProfile(BaseModel):
    contractor_name: str
    total_active_contracts: int
    total_active_value: float
    total_historical_value: float
    active_contracts: List[ContractTimelineItem]
    top_agencies: List[AgencyCount]
    top_naics_codes: List[NAICSCount]
    timeline_data: List[dict]  # For visualization
    recompete_schedule: List[dict]  # Contracts ending soon
    performance_metrics: dict

class ContractorSearchResponse(BaseModel):
    contractors: List[dict]  # List of contractor names with basic stats
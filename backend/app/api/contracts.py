from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
import logging

from app.services.sam_gov import SAMGovService
from app.models import SearchRequest, SearchResponse, ContractOpportunity, AwardedContract, AnalyticsSummary, ContractorProfile, ContractorSearchResponse, ContractTimelineItem, AgencyCount, NAICSCount

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize the SAM.gov service
sam_service = SAMGovService()

# Add backwards compatibility routes (without /contracts prefix)
@router.get("/agencies", include_in_schema=False)
async def get_agencies_compat():
    """Backwards compatibility route for agencies"""
    return await get_agencies()

@router.get("/set-asides", include_in_schema=False) 
async def get_set_asides_compat():
    """Backwards compatibility route for set-asides"""
    return await get_set_asides()

@router.get("/analytics/summary", include_in_schema=False)
async def get_analytics_summary_compat(
    include_awards: bool = False,
    keywords: Optional[str] = Query(None, alias="keyword"),
    agency: Optional[str] = None
):
    """Backwards compatibility route for analytics"""
    return await get_analytics_summary(include_awards, keywords, agency)

@router.get("/search")
async def search_contracts(
    keywords: Optional[str] = Query(None, alias="keyword"),  # Accept 'keyword' but use as 'keywords'
    agency: Optional[str] = None,
    vendor_name: Optional[str] = None,  # Add vendor_name parameter for awards
    naics: Optional[str] = None,
    set_aside: Optional[str] = None,
    posted_from: Optional[str] = None,
    posted_to: Optional[str] = None,
    award_date_from: Optional[str] = None,
    award_date_to: Optional[str] = None,
    min_amount: Optional[float] = None,  # Add min_amount for awards
    max_amount: Optional[float] = None,  # Add max_amount for awards
    limit: int = 50,
    include_awards: bool = False
):
    """
    Search for federal contract opportunities and optionally include awards
    """
    try:
        logger.info(f"🔍 GET search request: keywords={keywords}, agency={agency}, include_awards={include_awards}")
        
        # Call SAM service which handles both opportunities and awards internally
        opportunities, awards = sam_service.search_contracts(
            keywords=keywords,
            agency=agency,
            naics=naics,
            set_aside=set_aside,
            posted_from=posted_from,
            posted_to=posted_to,
            limit=limit,
            include_awards=include_awards
        )
        
        # Apply additional filtering for awards if needed
        if include_awards and awards:
            # Filter by vendor name if specified (post-processing)
            if vendor_name:
                vendor_name_lower = vendor_name.lower()
                awards = [
                    award for award in awards 
                    if vendor_name_lower in award.get('recipient_name', '').lower()
                ]
                logger.info(f"🔍 Filtered awards by vendor name '{vendor_name}': {len(awards)} results")
            
            # Filter by amount range if specified (post-processing)
            if min_amount is not None or max_amount is not None:
                filtered_awards = []
                for award in awards:
                    award_amount = award.get('award_amount')
                    if award_amount is not None:
                        if min_amount is not None and award_amount < min_amount:
                            continue
                        if max_amount is not None and award_amount > max_amount:
                            continue
                    filtered_awards.append(award)
                awards = filtered_awards
                logger.info(f"🔍 Filtered awards by amount range ${min_amount}-${max_amount}: {len(awards)} results")
        
        # Convert to response format
        contract_opportunities = []
        for opp in opportunities:
            try:
                contract_opportunities.append(ContractOpportunity(**opp))
            except Exception as e:
                logger.warning(f"⚠️ Skipping invalid opportunity: {str(e)}")
                continue
        
        awarded_contracts = []
        for award in awards:
            try:
                awarded_contracts.append(AwardedContract(**award))
            except Exception as e:
                logger.warning(f"⚠️ Skipping invalid award: {str(e)}")
                continue
        
        return SearchResponse(
            contracts=contract_opportunities,
            awards=awarded_contracts,
            total_count=len(contract_opportunities),
            awards_count=len(awarded_contracts),
            has_more=len(contract_opportunities) >= limit
        )
        
    except Exception as e:
        logger.error(f"❌ Error in GET search contracts: {str(e)}")
        # Return empty results instead of raising exception
        return SearchResponse(
            contracts=[],
            awards=[],
            total_count=0,
            awards_count=0,
            has_more=False
        )

@router.post("/search")
async def search_contracts_post(request: SearchRequest):
    """
    Search for federal contract opportunities using POST request
    """
    try:
        logger.info(f"🔍 POST search request: {request}")
        
        # Call the service with correct parameter names
        opportunities, awards = sam_service.search_contracts(
            keywords=request.keywords or request.keyword,  # Support both field names
            agency=request.agency,
            naics=getattr(request, 'naics_code', getattr(request, 'naics', None)),
            set_aside=request.set_aside,
            posted_from=getattr(request, 'posted_date_from', getattr(request, 'posted_from', None)),
            posted_to=getattr(request, 'posted_date_to', getattr(request, 'posted_to', None)),
            limit=request.limit,
            include_awards=request.include_awards
        )
        
        # Convert to response format
        contract_opportunities = []
        for opp in opportunities:
            try:
                contract_opportunities.append(ContractOpportunity(**opp))
            except Exception as e:
                logger.warning(f"⚠️ Skipping invalid opportunity: {str(e)}")
                continue
        
        awarded_contracts = []
        for award in awards:
            try:
                awarded_contracts.append(AwardedContract(**award))
            except Exception as e:
                logger.warning(f"⚠️ Skipping invalid award: {str(e)}")
                continue
        
        return SearchResponse(
            contracts=contract_opportunities,
            awards=awarded_contracts,
            total_count=len(contract_opportunities),
            awards_count=len(awarded_contracts),
            has_more=len(contract_opportunities) >= request.limit
        )
        
    except Exception as e:
        logger.error(f"❌ Error in POST search contracts: {str(e)}")
        # Return empty results instead of raising exception
        return SearchResponse(
            contracts=[],
            awards=[],
            total_count=0,
            awards_count=0,
            has_more=False
        )

@router.get("/agencies")
async def get_agencies():
    """
    Get list of available agencies
    """
    try:
        agencies = sam_service.get_agencies()
        return {"agencies": agencies}
    except Exception as e:
        logger.error(f"❌ Error getting agencies: {str(e)}")
        # Return default agencies if error
        return {"agencies": [
            "GENERAL SERVICES ADMINISTRATION",
            "DEPARTMENT OF DEFENSE",
            "DEPARTMENT OF HOMELAND SECURITY",
            "DEPARTMENT OF VETERANS AFFAIRS"
        ]}

@router.get("/set-asides")
async def get_set_asides():
    """
    Get list of available set-aside types
    """
    try:
        set_asides = sam_service.get_set_asides()
        return {"set_asides": set_asides}
    except Exception as e:
        logger.error(f"❌ Error getting set-asides: {str(e)}")
        # Return default set-asides if error
        return {"set_asides": ["SBA", "SDVOSBC", "WOSB", "8(a)", "HUBZone"]}

@router.get("/analytics/summary")
async def get_analytics_summary(
    include_awards: bool = False,
    keywords: Optional[str] = Query(None, alias="keyword"),  # Accept 'keyword' but use as 'keywords'
    agency: Optional[str] = None
):
    """
    Get analytics summary for contracts and optionally awards
    """
    try:
        logger.info(f"🔍 Analytics request: include_awards={include_awards}, keywords={keywords}, agency={agency}")
        
        # Get analytics from service
        analytics = sam_service.get_analytics(include_awards=include_awards)
        
        return AnalyticsSummary(
            total_opportunities=analytics.get("total_opportunities", 0),
            total_awards=analytics.get("total_awards", 0),
            total_award_value=analytics.get("total_value", 0),
            top_agencies=analytics.get("top_agencies", []),
            top_naics_codes=analytics.get("top_naics_codes", []),
            top_recipients=analytics.get("top_recipients", [])
        )
        
    except Exception as e:
        logger.error(f"❌ Error getting analytics: {str(e)}")
        # Return empty analytics instead of raising exception
        return AnalyticsSummary(
            total_opportunities=0,
            total_awards=0,
            total_award_value=0,
            top_agencies=[],
            top_naics_codes=[],
            top_recipients=[]
        )

# Test endpoint for awards data
@router.get("/test-awards")
async def test_awards():
    """
    Test endpoint to verify USASpending.gov awards integration
    """
    try:
        from app.services.fpds import FPDSService
        fpds_service = FPDSService()
        
        # Test search with some common keywords
        awards = fpds_service.search_awards(
            keywords="information technology",
            limit=10
        )
        
        return {
            "message": "USASpending.gov awards test",
            "awards_found": len(awards),
            "sample_awards": awards[:3] if awards else []
        }
        
    except Exception as e:
        logger.error(f"❌ Error testing awards: {str(e)}")
        return {
            "message": "Awards test failed",
            "error": str(e),
            "awards_found": 0,
            "sample_awards": []
        }

# Contractors/Vendor search endpoints
@router.get("/contractors/search")
async def search_contractors(
    name_query: Optional[str] = None,
    limit: int = 20
):
    """
    Search for contractors/vendors based on awards data
    """
    try:
        logger.info(f"🔍 Contractor search request: name_query='{name_query}', limit={limit}")
        
        # Use FPDS service to search for contractors in awards data
        from app.services.fpds import FPDSService
        fpds_service = FPDSService()
        
        # Get all awards and extract contractor information
        awards = fpds_service.search_awards(keywords=name_query, limit=1000)
        
        if not awards:
            logger.warning("⚠️ No awards data available for contractor search")
            return ContractorSearchResponse(contractors=[])
        
        # Group by contractor/recipient
        contractor_data = {}
        for award in awards:
            recipient_name = award.get("recipient_name", "Unknown")
            
            # Filter by name query if provided
            if name_query and name_query.lower() not in recipient_name.lower():
                continue
                
            if recipient_name not in contractor_data:
                contractor_data[recipient_name] = {
                    "name": recipient_name,
                    "total_awards": 0,
                    "total_value": 0,
                    "agencies": set(),
                    "award_types": set(),
                    "recent_awards": []
                }
            
            contractor_data[recipient_name]["total_awards"] += 1
            if award.get("award_amount"):
                contractor_data[recipient_name]["total_value"] += award["award_amount"]
            
            contractor_data[recipient_name]["agencies"].add(award.get("awarding_agency", "Unknown"))
            contractor_data[recipient_name]["award_types"].add(award.get("award_type", "Unknown"))
            
            # Keep recent awards (limit to 5 per contractor)
            if len(contractor_data[recipient_name]["recent_awards"]) < 5:
                contractor_data[recipient_name]["recent_awards"].append({
                    "award_id": award.get("award_id"),
                    "title": award.get("title", award.get("description", "")[:100]),
                    "amount": award.get("award_amount"),
                    "agency": award.get("awarding_agency"),
                    "date": award.get("start_date")
                })
        
        # Convert to list format expected by ContractorSearchResponse
        contractors = []
        for name, data in contractor_data.items():
            contractors.append({
                "name": data["name"],
                "total_awards": data["total_awards"],
                "total_value": data["total_value"],
                "agencies": list(data["agencies"]),
                "award_types": list(data["award_types"]),
                "recent_awards": data["recent_awards"]
            })
        
        # Sort by total value descending
        contractors.sort(key=lambda x: x["total_value"], reverse=True)
        
        # Limit results
        contractors = contractors[:limit]
        
        logger.info(f"✅ Found {len(contractors)} contractors matching query")
        
        return ContractorSearchResponse(
            contractors=contractors
        )
        
    except Exception as e:
        logger.error(f"❌ Error searching contractors: {str(e)}")
        # Return empty results instead of raising exception
        return ContractorSearchResponse(contractors=[])

# Health check endpoint
@router.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    return {"status": "healthy", "service": "Federal Contract Research API"}

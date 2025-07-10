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
        
        # For opportunities search (SAM.gov), use original parameters
        opportunities, awards = sam_service.search_contracts(
            keywords=keywords,  # Use 'keywords' for service call
            agency=agency,
            naics=naics,
            set_aside=set_aside,
            posted_from=posted_from,
            posted_to=posted_to,
            limit=limit,
            include_awards=include_awards
        )
        
        # If awards are requested, also search FPDS with proper parameter mapping
        if include_awards:
            logger.info("🏆 Awards requested - fetching from FPDS with proper parameter mapping")
            from app.services.fpds import FPDSService
            fpds_service = FPDSService()
            
            # Map frontend parameters to FPDS service parameters
            fpds_awards = fpds_service.search_awards(
                keywords=keywords,  # Map 'keyword' to 'keywords'
                awarding_agency=agency,  # Map 'agency' to 'awarding_agency'
                award_date_from=award_date_from,
                award_date_to=award_date_to,
                limit=limit
            )
            
            # Filter by vendor name if specified (post-processing since FPDS API doesn't support this filter)
            if vendor_name and fpds_awards:
                vendor_name_lower = vendor_name.lower()
                fpds_awards = [
                    award for award in fpds_awards 
                    if vendor_name_lower in award.get('recipient_name', '').lower()
                ]
                logger.info(f"🔍 Filtered awards by vendor name '{vendor_name}': {len(fpds_awards)} results")
            
            # Filter by amount range if specified (post-processing)
            if (min_amount is not None or max_amount is not None) and fpds_awards:
                filtered_awards = []
                for award in fpds_awards:
                    award_amount = award.get('award_amount')
                    if award_amount is not None:
                        if min_amount is not None and award_amount < min_amount:
                            continue
                        if max_amount is not None and award_amount > max_amount:
                            continue
                    filtered_awards.append(award)
                fpds_awards = filtered_awards
                logger.info(f"🔍 Filtered awards by amount range ${min_amount}-${max_amount}: {len(fpds_awards)} results")
            
            # Replace the awards from sam_service with FPDS awards
            awards = fpds_awards
            logger.info(f"✅ Using {len(awards)} awards from FPDS service")
        
        # Convert to response format
        contract_opportunities = []
        for opp in opportunities:
            contract_opportunities.append(ContractOpportunity(**opp))
        
        awarded_contracts = []
        for award in awards:
            awarded_contracts.append(AwardedContract(**award))
        
        return SearchResponse(
            contracts=contract_opportunities,
            awards=awarded_contracts,
            total_count=len(contract_opportunities),
            awards_count=len(awarded_contracts),
            has_more=len(contract_opportunities) >= limit
        )
        
    except Exception as e:
        logger.error(f"❌ Error in GET search contracts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error searching contracts: {str(e)}")

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
            naics=request.naics_code,
            set_aside=request.set_aside,
            posted_from=request.posted_date_from,
            posted_to=request.posted_date_to,
            limit=request.limit,
            include_awards=request.include_awards
        )
        
        # Convert to response format
        contract_opportunities = []
        for opp in opportunities:
            contract_opportunities.append(ContractOpportunity(**opp))
        
        awarded_contracts = []
        for award in awards:
            awarded_contracts.append(AwardedContract(**award))
        
        return SearchResponse(
            contracts=contract_opportunities,
            awards=awarded_contracts,
            total_count=len(contract_opportunities),
            awards_count=len(awarded_contracts),
            has_more=len(contract_opportunities) >= request.limit
        )
        
    except Exception as e:
        logger.error(f"❌ Error in POST search contracts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error searching contracts: {str(e)}")

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
        raise HTTPException(status_code=500, detail=f"Error getting agencies: {str(e)}")

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
        raise HTTPException(status_code=500, detail=f"Error getting set-asides: {str(e)}")

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
        raise HTTPException(status_code=500, detail=f"Error getting analytics: {str(e)}")

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
        raise HTTPException(status_code=500, detail=f"Error testing awards: {str(e)}")

# Health check endpoint
@router.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    return {"status": "healthy", "service": "Federal Contract Research API"}

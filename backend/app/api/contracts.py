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
    naics: Optional[str] = None,
    set_aside: Optional[str] = None,
    posted_from: Optional[str] = None,
    posted_to: Optional[str] = None,
    award_date_from: Optional[str] = None,
    award_date_to: Optional[str] = None,
    limit: int = 50,
    include_awards: bool = False
):
    """
    Search for federal contract opportunities and optionally include awards
    """
    try:
        logger.info(f"🔍 GET search request: keywords={keywords}, agency={agency}, include_awards={include_awards}")
        
        # Call the service with correct parameter names
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
            keywords=request.keywords,  # Use 'keywords' for service call
            agency=request.agency,
            naics=request.naics,
            set_aside=request.set_aside,
            posted_from=request.posted_from,
            posted_to=request.posted_to,
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
        # Fixed: Change limit from 1000 to 100 to comply with USASpending.gov API limits
        awards = fpds_service.search_awards(keywords=name_query, limit=100)
        
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
        raise HTTPException(status_code=500, detail=f"Error searching contractors: {str(e)}")

@router.get("/contractors/{contractor_name}")
async def get_contractor_details(contractor_name: str):
    """
    Get detailed information about a specific contractor
    """
    try:
        logger.info(f"🔍 Contractor details request: {contractor_name}")
        
        from app.services.fpds import FPDSService
        fpds_service = FPDSService()
        
        # Get all awards for this contractor
        # Fixed: Change limit from 1000 to 100 to comply with USASpending.gov API limits
        awards = fpds_service.search_awards(limit=100)
        contractor_awards = [
            award for award in awards 
            if award.get("recipient_name", "").lower() == contractor_name.lower()
        ]
        
        if not contractor_awards:
            raise HTTPException(status_code=404, detail="Contractor not found")
        
        # Calculate analytics
        total_value = sum(award.get("award_amount", 0) for award in contractor_awards)
        agencies = list(set(award.get("awarding_agency") for award in contractor_awards))
        award_types = list(set(award.get("award_type") for award in contractor_awards))
        
        # Recent awards
        recent_awards = sorted(
            contractor_awards,
            key=lambda x: x.get("start_date", ""),
            reverse=True
        )[:10]
        
        # Convert awards to ContractTimelineItem format
        active_contracts = []
        for award in recent_awards:
            if award.get("start_date") and award.get("end_date"):
                timeline_item = ContractTimelineItem(
                    award_id=award.get("award_id", ""),
                    title=award.get("title", ""),
                    awarding_agency=award.get("awarding_agency", ""),
                    award_amount=award.get("award_amount", 0.0),
                    start_date=award.get("start_date", ""),
                    end_date=award.get("end_date", ""),
                    status="active",  # Default status
                    contract_type=award.get("award_type", "Contract"),
                    naics_code=award.get("naics_code")
                )
                active_contracts.append(timeline_item)
        
        # Convert agencies to AgencyCount format
        agency_counts = []
        agency_count_dict = {}
        for award in contractor_awards:
            agency = award.get("awarding_agency", "Unknown")
            agency_count_dict[agency] = agency_count_dict.get(agency, 0) + 1
        
        for agency, count in agency_count_dict.items():
            agency_counts.append(AgencyCount(name=agency, count=count))
        
        # Convert NAICS to NAICSCount format (if available)
        naics_counts = []
        naics_count_dict = {}
        for award in contractor_awards:
            naics = award.get("naics_code")
            if naics:
                naics_count_dict[naics] = naics_count_dict.get(naics, 0) + 1
        
        for naics, count in naics_count_dict.items():
            naics_counts.append(NAICSCount(code=naics, count=count))
        
        return ContractorProfile(
            contractor_name=contractor_name,
            total_active_contracts=len(contractor_awards),
            total_active_value=total_value,
            total_historical_value=total_value,  # Same for now
            active_contracts=active_contracts,
            top_agencies=agency_counts,
            top_naics_codes=naics_counts,
            timeline_data=[],  # TODO: Implement timeline visualization data
            recompete_schedule=[],  # TODO: Implement ending contracts
            performance_metrics={}  # TODO: Implement performance metrics
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error getting contractor details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting contractor details: {str(e)}")

# Export endpoints (ready for future implementation)
@router.get("/export/opportunities")
async def export_opportunities(
    format: str = "csv",
    keywords: Optional[str] = None,
    agency: Optional[str] = None,
    limit: int = 1000
):
    """
    Export opportunities to CSV or Excel format
    """
    try:
        # Get opportunities data
        opportunities, _ = sam_service.search_contracts(
            keywords=keywords,
            agency=agency,
            limit=limit,
            include_awards=False
        )
        
        if format.lower() == "csv":
            # TODO: Implement CSV export
            return {"message": "CSV export not yet implemented", "count": len(opportunities)}
        elif format.lower() == "excel":
            # TODO: Implement Excel export  
            return {"message": "Excel export not yet implemented", "count": len(opportunities)}
        else:
            raise HTTPException(status_code=400, detail="Unsupported format. Use 'csv' or 'excel'")
            
    except Exception as e:
        logger.error(f"❌ Error exporting opportunities: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error exporting opportunities: {str(e)}")

@router.get("/export/awards")
async def export_awards(
    format: str = "csv",
    keywords: Optional[str] = None,
    agency: Optional[str] = None,
    limit: int = 1000
):
    """
    Export awards to CSV or Excel format
    """
    try:
        # Get awards data
        _, awards = sam_service.search_contracts(
            keywords=keywords,
            agency=agency,
            limit=limit,
            include_awards=True
        )
        
        if format.lower() == "csv":
            # TODO: Implement CSV export
            return {"message": "CSV export not yet implemented", "count": len(awards)}
        elif format.lower() == "excel":
            # TODO: Implement Excel export
            return {"message": "Excel export not yet implemented", "count": len(awards)}
        else:
            raise HTTPException(status_code=400, detail="Unsupported format. Use 'csv' or 'excel'")
            
    except Exception as e:
        logger.error(f"❌ Error exporting awards: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error exporting awards: {str(e)}")

# Health check endpoint
@router.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    return {"status": "healthy", "service": "Federal Contract Research API"}

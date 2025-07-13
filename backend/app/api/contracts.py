from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
import logging
from datetime import datetime, timedelta

from app.services.sam_gov import SAMGovService
from app.services.contractor_service import ContractorService
from app.models import SearchRequest, SearchResponse, ContractOpportunity, AwardedContract, AnalyticsSummary, ContractorProfile, ContractorSearchResponse, ContractTimelineItem, AgencyCount, NAICSCount

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize services
sam_service = SAMGovService()
contractor_service = ContractorService()

# Helper function for calculating active years
def calculate_active_years(start_date: Optional[str], end_date: Optional[str]) -> float:
    """
    Calculate years of activity for a contractor
    """
    if not start_date or not end_date:
        return 0.0
    
    try:
        start = datetime.fromisoformat(start_date.replace('Z', '+00:00') if 'Z' in start_date else start_date[:10])
        end = datetime.fromisoformat(end_date.replace('Z', '+00:00') if 'Z' in end_date else end_date[:10])
        return round((end - start).days / 365.25, 1)
    except Exception:
        return 0.0

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

@router.get("/contract/{contract_id}/transactions")
async def get_contract_transactions(contract_id: str):
    """
    Get detailed transaction history for a specific contract
    
    This endpoint retrieves all modifications and transactions for a contract
    from USASpending.gov, providing the complete history needed for analysis.
    """
    try:
        logger.info(f"📊 Getting transaction history for contract: {contract_id}")
        
        from app.services.fpds import FPDSService
        fpds_service = FPDSService()
        
        # Get transactions from USASpending API
        transactions = fpds_service.get_contract_transactions(contract_id)
        
        if not transactions:
            logger.warning(f"⚠️ No transactions found for contract: {contract_id}")
            return {
                "contract_id": contract_id,
                "transactions": [],
                "total_modifications": 0,
                "message": "No transaction history found for this contract ID"
            }
        
        # Sort transactions by date
        transactions.sort(key=lambda x: x.get('award_date', ''))
        
        # Calculate summary statistics
        total_value = max([t.get('total_value', 0) for t in transactions] or [0])
        total_obligations = sum([t.get('award_amount', 0) for t in transactions if t.get('award_amount', 0) > 0])
        
        return {
            "contract_id": contract_id,
            "transactions": transactions,
            "total_modifications": len(transactions),
            "summary": {
                "total_contract_value": total_value,
                "total_obligations": total_obligations,
                "modification_count": len([t for t in transactions if t['mod_number'] != 'BASE']),
                "base_award": next((t for t in transactions if t['mod_number'] == 'BASE'), None)
            }
        }
        
    except Exception as e:
        logger.error(f"❌ Error getting contract transactions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving contract transactions: {str(e)}")

# DEBUG ENDPOINT FOR TRANSACTION TESTING - ENHANCED VERSION
@router.get("/contract/{contract_id}/transactions/debug")
async def debug_contract_transactions(contract_id: str):
    """
    Enhanced debug endpoint to trace the exact transaction fetching process
    """
    try:
        logger.info(f"🔍 DEBUG: Transaction fetching for contract: {contract_id}")
        
        from app.services.fpds import FPDSService
        import requests
        import json
        
        fpds_service = FPDSService()
        debug_info = {
            "contract_id": contract_id,
            "step_0_test_connection": None,
            "step_1_generated_id": None,
            "step_1_response": None,
            "step_2_transactions": [],
            "step_2_pagination": [],
            "final_processed": None,
            "errors": [],
            "backend_logs": []
        }
        
        # Step 0: Test basic API connectivity
        try:
            test_url = "https://api.usaspending.gov/api/v2/references/agency/autocomplete/"
            test_response = requests.post(
                test_url, 
                json={"search_text": "test"}, 
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            debug_info["step_0_test_connection"] = {
                "status": "success" if test_response.status_code == 200 else "failed",
                "status_code": test_response.status_code,
                "message": "USASpending API is reachable" if test_response.status_code == 200 else "Cannot reach USASpending API"
            }
        except Exception as e:
            debug_info["step_0_test_connection"] = {
                "status": "error",
                "message": f"Connection error: {str(e)}"
            }
        
        # Step 1: Get generated_internal_id with more detailed logging
        try:
            payload = {
                "filters": {
                    "piid": [contract_id.upper()]
                },
                "fields": ["generated_internal_id", "Award ID", "recipient_name", "total_obligated_amount"],
                "limit": 1,
                "page": 1
            }
            
            debug_info["backend_logs"].append(f"Searching for PIID: {contract_id.upper()}")
            debug_info["backend_logs"].append(f"Request URL: {fpds_service.search_awards_url}")
            
            response = requests.post(
                fpds_service.search_awards_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Federal-Contract-Research-Tool/1.0"
                },
                timeout=60
            )
            
            debug_info["step_1_response"] = {
                "status_code": response.status_code,
                "url": fpds_service.search_awards_url,
                "payload_sent": payload,
                "response_headers": dict(response.headers),
                "response_data": None
            }
            
            if response.status_code == 200:
                data = response.json()
                debug_info["step_1_response"]["response_data"] = data
                
                results = data.get('results', [])
                if results:
                    result = results[0]
                    debug_info["step_1_generated_id"] = result.get('generated_internal_id')
                    debug_info["backend_logs"].append(f"Found award: {result}")
                else:
                    debug_info["backend_logs"].append("No results found in Step 1")
            else:
                debug_info["step_1_response"]["error_text"] = response.text[:500]
                    
        except Exception as e:
            debug_info["errors"].append(f"Step 1 error: {str(e)}")
            import traceback
            debug_info["errors"].append(f"Traceback: {traceback.format_exc()}")
        
        # Step 2: Get transactions if we have generated_id
        if debug_info["step_1_generated_id"]:
            generated_id = debug_info["step_1_generated_id"]
            page = 1
            has_next = True
            
            while has_next and page <= 5:  # Limit to 5 pages for debug
                try:
                    url = f"{fpds_service.award_transactions_url}{generated_id}/"
                    params = {
                        "page": page,
                        "limit": 50,
                        "sort": "-action_date"
                    }
                    
                    debug_info["backend_logs"].append(f"Fetching transactions page {page} from: {url}")
                    
                    response = requests.get(
                        url,
                        params=params,
                        headers={
                            "Content-Type": "application/json",
                            "User-Agent": "Federal-Contract-Research-Tool/1.0"
                        },
                        timeout=60
                    )
                    
                    page_info = {
                        "page": page,
                        "url": url,
                        "params": params,
                        "status_code": response.status_code,
                        "response_keys": None,
                        "transaction_count": 0,
                        "page_metadata": None,
                        "sample_transactions": []
                    }
                    
                    if response.status_code == 200:
                        data = response.json()
                        page_info["response_keys"] = list(data.keys())
                        
                        transactions = data.get('results', [])
                        page_info["transaction_count"] = len(transactions)
                        
                        if transactions:
                            # Sample first 3 transactions
                            for i, tx in enumerate(transactions[:3]):
                                page_info["sample_transactions"].append({
                                    "index": i,
                                    "modification_number": tx.get('modification_number'),
                                    "action_date": tx.get('action_date'),
                                    "federal_action_obligation": tx.get('federal_action_obligation'),
                                    "current_total_value_of_award": tx.get('current_total_value_of_award'),
                                    "description": tx.get('description', '')[:100]
                                })
                            debug_info["step_2_transactions"].extend(transactions)
                        
                        page_metadata = data.get('page_metadata', {})
                        page_info["page_metadata"] = page_metadata
                        has_next = page_metadata.get('has_next_page', False)
                        
                    else:
                        page_info["error_text"] = response.text[:500]
                        
                    debug_info["step_2_pagination"].append(page_info)
                    
                    if has_next:
                        page += 1
                    else:
                        break
                        
                except Exception as e:
                    debug_info["errors"].append(f"Step 2 page {page} error: {str(e)}")
                    break
        
        # Try to process transactions
        if debug_info["step_2_transactions"]:
            try:
                processed = fpds_service.get_contract_transactions(contract_id)
                debug_info["final_processed"] = {
                    "count": len(processed),
                    "modifications": [
                        {
                            "mod_number": t.get('mod_number'),
                            "award_date": t.get('award_date'),
                            "award_amount": t.get('award_amount'),
                            "total_value": t.get('total_value')
                        } 
                        for t in processed
                    ]
                }
            except Exception as e:
                debug_info["errors"].append(f"Processing error: {str(e)}")
        
        # Summary
        debug_info["summary"] = {
            "api_reachable": debug_info["step_0_test_connection"]["status"] == "success",
            "generated_id_found": bool(debug_info["step_1_generated_id"]),
            "total_raw_transactions": len(debug_info["step_2_transactions"]),
            "total_pages_fetched": len(debug_info["step_2_pagination"]),
            "final_processed_count": debug_info["final_processed"]["count"] if debug_info["final_processed"] else 0,
            "has_errors": len(debug_info["errors"]) > 0
        }
        
        return debug_info
        
    except Exception as e:
        logger.error(f"❌ Debug endpoint error: {str(e)}")
        import traceback
        return {
            "error": str(e),
            "traceback": traceback.format_exc()
        }

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

# ====== CONTRACTOR INTELLIGENCE ENDPOINTS ======

@router.get("/contractors/search")
async def search_contractors(
    name_query: Optional[str] = None,
    limit: int = 20
):
    """
    Search for contractors/vendors using the CORRECT USASpending.gov API approach
    
    This endpoint now uses the same 2-step process as USASpending.gov website:
    1. Fast autocomplete for contractor discovery
    2. Precise data retrieval using recipient_hash
    """
    try:
        logger.info(f"🔍 Contractor search request: name_query='{name_query}', limit={limit}")
        
        # Use the new ContractorService with correct API endpoints
        contractors = contractor_service.search_contractors(
            name_query=name_query,
            limit=limit
        )
        
        if contractors:
            logger.info(f"✅ Found {len(contractors)} contractors")
            # Log details about the first result for debugging
            first = contractors[0]
            logger.info(f"📊 Top result: {first['name']} - {first['total_awards']} awards, ${first['total_value']:,.0f} total value")
        else:
            logger.warning(f"⚠️ No contractors found for query: '{name_query}'")
        
        return ContractorSearchResponse(contractors=contractors)
        
    except Exception as e:
        logger.error(f"❌ Error searching contractors: {str(e)}")
        # Return empty results instead of raising exception
        return ContractorSearchResponse(contractors=[])

@router.get("/contractor/{contractor_name}/profile")
async def get_contractor_profile_endpoint(
    contractor_name: str,
    complete_data: bool = Query(False, description="Fetch complete dataset (all awards) via pagination")
):
    """
    Get detailed contractor profile with optional complete data fetch
    
    - contractor_name: Name of the contractor
    - complete_data: If True, fetches ALL awards (may take 30-60 seconds for large contractors)
    """
    try:
        logger.info(f"🔍 Profile request for {contractor_name} (complete_data: {complete_data})")
        
        profile = contractor_service.get_contractor_profile(contractor_name, fetch_complete_data=complete_data)
        
        if not profile:
            raise HTTPException(status_code=404, detail=f"Contractor '{contractor_name}' not found")
        
        # Prepare response with metadata
        response = {
            "contractor": {
                "name": profile["name"],
                "total_awards": profile["total_awards"],
                "total_value": profile["total_value"],
                "uei": profile.get("uei"),
                "recipient_hash": profile.get("recipient_hash")
            },
            "profile": profile,
            "metadata": {
                "is_complete_data": profile.get("is_complete_data", False),
                "data_scope": "All available awards" if profile.get("is_complete_data") else "Recent 100 awards",
                "fetch_type": "complete" if complete_data else "basic"
            }
        }
        
        logger.info(f"✅ Returned profile for {contractor_name}: {profile['total_awards']} awards, ${profile['total_value']:,.0f} total")
        return response
        
    except Exception as e:
        logger.error(f"❌ Error getting contractor profile: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving contractor profile: {str(e)}")

@router.get("/contractor/{contractor_name}/awards")
async def get_contractor_awards_endpoint(
    contractor_name: str,
    complete_data: bool = Query(False, description="Fetch complete dataset (all awards)"),
    include_timeline: bool = Query(True, description="Include timeline analysis data")
):
    """
    Get detailed awards data for contractor with timeline analysis
    
    - contractor_name: Name of the contractor
    - complete_data: If True, fetches ALL awards via pagination
    - include_timeline: Include contract duration and timeline data
    """
    try:
        logger.info(f"🏆 Awards request for {contractor_name} (complete_data: {complete_data}, timeline: {include_timeline})")
        
        profile = contractor_service.get_contractor_profile(contractor_name, fetch_complete_data=complete_data)
        
        if not profile:
            raise HTTPException(status_code=404, detail=f"Contractor '{contractor_name}' not found")
        
        # Prepare awards response
        awards_response = {
            "contractor_name": profile["name"],
            "total_awards": profile["total_awards"],
            "total_value": profile["total_value"],
            "awards": profile.get("all_awards", profile.get("recent_awards", [])),
            "metadata": {
                "is_complete_data": profile.get("is_complete_data", False),
                "awards_returned": len(profile.get("all_awards", profile.get("recent_awards", []))),
                "data_scope": "All available awards" if profile.get("is_complete_data") else "Recent awards only"
            }
        }
        
        # Add timeline analysis if requested
        if include_timeline and profile.get("contract_durations"):
            awards_response["timeline_analysis"] = {
                "contract_durations": profile.get("contract_durations", []),
                "year_breakdown": profile.get("year_breakdown", {}),
                "agency_breakdown": profile.get("agency_breakdown", {}),
                "analysis_ready": True
            }
        
        logger.info(f"✅ Returned {len(awards_response['awards'])} awards for {contractor_name}")
        return awards_response
        
    except Exception as e:
        logger.error(f"❌ Error getting contractor awards: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving contractor awards: {str(e)}")

@router.get("/contractor/{contractor_name}/timeline")
async def get_contractor_timeline_data(
    contractor_name: str,
    complete_data: bool = Query(True, description="Use complete dataset for timeline"),
    include_projections: bool = Query(True, description="Include recompete projections")
):
    """
    Get comprehensive timeline data for Gantt chart visualization
    
    - contractor_name: Name of the contractor
    - complete_data: Use complete award dataset
    - include_projections: Calculate recompete workload projections
    """
    try:
        logger.info(f"📅 Timeline data request for {contractor_name}")
        
        profile = contractor_service.get_contractor_profile(contractor_name, fetch_complete_data=complete_data)
        
        if not profile:
            raise HTTPException(status_code=404, detail=f"Contractor '{contractor_name}' not found")
        
        # Get all awards for timeline analysis
        all_awards = profile.get("all_awards", profile.get("recent_awards", []))
        
        # Prepare timeline data
        timeline_data = []
        recompete_events = []
        
        for award in all_awards:
            if award.get("start_date") and award.get("end_date"):
                try:
                    start_date = datetime.fromisoformat(award["start_date"].replace('Z', '+00:00'))
                    end_date = datetime.fromisoformat(award["end_date"].replace('Z', '+00:00'))
                    
                    # Calculate contract timeline
                    timeline_item = {
                        "id": award.get("award_id", ""),
                        "title": award.get("title", "")[:50] + "..." if len(award.get("title", "")) > 50 else award.get("title", ""),
                        "full_title": award.get("title", ""),
                        "start_date": start_date.isoformat(),
                        "end_date": end_date.isoformat(),
                        "duration_days": (end_date - start_date).days,
                        "amount": award.get("amount", 0),
                        "agency": award.get("agency", ""),
                        "status": "active" if end_date > datetime.now() else "completed",
                        "naics_code": award.get("naics_code", "")
                    }
                    
                    timeline_data.append(timeline_item)
                    
                    # Calculate recompete projections if requested
                    if include_projections and end_date > datetime.now():
                        # Estimate recompete timeline (typically 6-12 months before contract end)
                        recompete_start = end_date - timedelta(days=365)  # Start recompete process 1 year before
                        recompete_peak = end_date - timedelta(days=180)   # Peak activity 6 months before
                        
                        if recompete_start > datetime.now():  # Only future recompetes
                            recompete_events.append({
                                "contract_id": award.get("award_id", ""),
                                "contract_title": timeline_item["title"],
                                "recompete_start": recompete_start.isoformat(),
                                "recompete_peak": recompete_peak.isoformat(),
                                "contract_end": end_date.isoformat(),
                                "estimated_effort": min(100, max(10, int(award.get("amount", 0) / 1000000))),  # Effort based on contract value
                                "amount": award.get("amount", 0)
                            })
                    
                except Exception as date_error:
                    logger.warning(f"⚠️ Date parsing error for award {award.get('award_id', 'unknown')}: {date_error}")
                    continue
        
        # Sort timeline data by start date
        timeline_data.sort(key=lambda x: x["start_date"])
        recompete_events.sort(key=lambda x: x["recompete_start"])
        
        # Calculate workload projection data for integral chart
        workload_projection = []
        if include_projections and recompete_events:
            from collections import defaultdict
            
            # Create monthly workload projection
            monthly_workload = defaultdict(int)
            
            for event in recompete_events:
                try:
                    start = datetime.fromisoformat(event["recompete_start"])
                    end = datetime.fromisoformat(event["contract_end"])
                    effort = event["estimated_effort"]
                    
                    # Distribute effort over recompete period
                    current = start
                    while current <= end:
                        month_key = current.strftime("%Y-%m")
                        monthly_workload[month_key] += effort
                        current = current.replace(day=1)
                        if current.month == 12:
                            current = current.replace(year=current.year + 1, month=1)
                        else:
                            current = current.replace(month=current.month + 1)
                            
                except Exception as workload_error:
                    logger.warning(f"⚠️ Workload calculation error: {workload_error}")
                    continue
            
            # Convert to timeline format
            for month, workload in sorted(monthly_workload.items()):
                workload_projection.append({
                    "month": month,
                    "workload": workload,
                    "contracts_count": len([e for e in recompete_events 
                                          if month in [datetime.fromisoformat(e["recompete_start"]).strftime("%Y-%m"),
                                                      datetime.fromisoformat(e["contract_end"]).strftime("%Y-%m")]])
                })
        
        response = {
            "contractor_name": profile["name"],
            "total_awards": profile["total_awards"],
            "timeline_contracts": timeline_data,
            "recompete_projections": recompete_events,
            "workload_projection": workload_projection,
            "summary": {
                "total_contracts": len(timeline_data),
                "active_contracts": len([t for t in timeline_data if t["status"] == "active"]),
                "upcoming_recompetes": len(recompete_events),
                "total_active_value": sum([t["amount"] for t in timeline_data if t["status"] == "active"]),
                "timeline_span_years": len(set([t["start_date"][:4] for t in timeline_data])) if timeline_data else 0
            },
            "metadata": {
                "is_complete_data": profile.get("is_complete_data", False),
                "includes_projections": include_projections,
                "data_scope": "All available awards" if profile.get("is_complete_data") else "Recent awards only"
            }
        }
        
        logger.info(f"✅ Returned timeline data for {contractor_name}: {len(timeline_data)} contracts, {len(recompete_events)} recompetes")
        return response
        
    except Exception as e:
        logger.error(f"❌ Error getting timeline data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving timeline data: {str(e)}")

@router.get("/contractor/{contractor_name}/stats")
async def get_contractor_statistics(
    contractor_name: str,
    complete_data: bool = Query(True, description="Use complete dataset for statistics")
):
    """
    Get comprehensive contractor statistics and analytics
    """
    try:
        profile = contractor_service.get_contractor_profile(contractor_name, fetch_complete_data=complete_data)
        
        if not profile:
            raise HTTPException(status_code=404, detail=f"Contractor '{contractor_name}' not found")
        
        stats = {
            "contractor_name": profile["name"],
            "basic_stats": {
                "total_awards": profile["total_awards"],
                "total_value": profile["total_value"],
                "average_award_value": profile["total_value"] / max(1, profile["total_awards"]),
                "first_award_date": profile.get("first_award_date"),
                "latest_award_date": profile.get("latest_award_date")
            },
            "breakdown_stats": {
                "year_breakdown": profile.get("year_breakdown", {}),
                "agency_breakdown": profile.get("agency_breakdown", {}),
                "primary_agencies": profile.get("primary_agencies", []),
                "primary_naics": profile.get("naics_codes", [])
            },
            "metadata": {
                "is_complete_data": profile.get("is_complete_data", False),
                "data_completeness": "100%" if profile.get("is_complete_data") else "Limited to recent 100 awards"
            }
        }
        
        return stats
        
    except Exception as e:
        logger.error(f"❌ Error getting contractor statistics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving contractor statistics: {str(e)}")

@router.get("/contractors/{contractor_name}/profile")
async def get_contractor_profile_legacy(contractor_name: str):
    """
    Legacy endpoint for contractor profile (for backward compatibility)
    """
    try:
        logger.info(f"📊 Getting profile for contractor: {contractor_name}")
        
        # Get detailed profile using the ContractorService
        profile = contractor_service.get_contractor_profile(contractor_name)
        
        if profile:
            logger.info(f"✅ Retrieved profile for {contractor_name}: {profile['total_awards']} awards, ${profile['total_value']:,.0f} total value")
            
            # Convert to expected response format
            return {
                "contractor": {
                    "name": profile["name"],
                    "total_awards": profile["total_awards"],
                    "total_value": profile["total_value"],
                    "latest_award_date": profile.get("latest_award_date"),
                    "first_award_date": profile.get("first_award_date")
                },
                "profile": {
                    "total_awards": profile["total_awards"],
                    "total_value": profile["total_value"],
                    "primary_agencies": profile.get("primary_agencies", []),
                    "naics_codes": profile.get("naics_codes", []),
                    "award_types": profile.get("award_types", []),
                    "recent_awards": profile.get("recent_awards", []),
                    "date_range": {
                        "start": profile.get("first_award_date"),
                        "end": profile.get("latest_award_date")
                    },
                    "performance_metrics": {
                        "avg_award_value": profile["total_value"] / max(profile["total_awards"], 1),
                        "active_years": calculate_active_years(
                            profile.get("first_award_date"),
                            profile.get("latest_award_date")
                        )
                    }
                }
            }
        else:
            logger.warning(f"⚠️ No profile found for contractor: {contractor_name}")
            raise HTTPException(status_code=404, detail=f"Contractor '{contractor_name}' not found")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error getting contractor profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Error retrieving contractor profile")

@router.get("/contractors/test/{contractor_name}")
async def test_contractor_search(contractor_name: str):
    """
    Test endpoint to debug contractor search with the NEW correct API approach
    
    This shows the 2-step process:
    1. Autocomplete for fast contractor discovery
    2. Detailed spending data retrieval
    
    Example: /api/contractors/test/Planned%20Systems%20International
    """
    try:
        logger.info(f"🧪 TESTING contractor search for: {contractor_name}")
        
        # Test the search with the new approach
        test_results = contractor_service.test_contractor_search(contractor_name)
        
        return test_results
        
    except Exception as e:
        logger.error(f"❌ Test failed for {contractor_name}: {str(e)}")
        return {
            "test_query": contractor_name,
            "step_1_autocomplete": "ERROR",
            "step_2_spending": "ERROR",
            "final_result": "ERROR",
            "error": str(e),
            "message": "Test failed - check backend logs for error details"
        }

# Health check endpoint
@router.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    return {"status": "healthy", "service": "Federal Contract Research API"}

                award.get("award_description") or
                "No description available"
            )
            
            # Create a title from description or award info
            title = description
            if len(title) > 100:
                title = title[:97] + "..."
            elif title == "No description available":
                title = f"Award to {recipient_name}"
            
            # Handle award amount - try different field names
            award_amount = None
            for amount_field in [
                "Award Amount", "award_amount", "Total Award Amount", 
                "total_award_amount", "Current Award Amount", "current_award_amount"
            ]:
                if award.get(amount_field) is not None:
                    try:
                        award_amount = float(award[amount_field])
                        break
                    except (ValueError, TypeError):
                        continue
            
            awarding_agency = (
                award.get("Awarding Agency") or 
                award.get("awarding_agency") or
                award.get("awarding_agency_name") or
                "Unknown Agency"
            )
            
            awarding_subagency = (
                award.get("Awarding Sub Agency") or 
                award.get("awarding_sub_agency") or
                award.get("awarding_subagency") or
                ""
            )
            
            # Handle dates
            start_date = self._parse_date(
                award.get("Start Date") or 
                award.get("start_date") or
                award.get("period_of_performance_start_date")
            )
            
            end_date = self._parse_date(
                award.get("End Date") or 
                award.get("end_date") or
                award.get("period_of_performance_current_end_date")
            )
            
            award_type = (
                award.get("Award Type") or 
                award.get("award_type") or
                award.get("Contract Award Type") or
                award.get("type") or
                "Contract"
            )
            
            return {
                "award_id": award_id,
                "piid": piid,  # Store PIID for transaction lookups
                "generated_internal_id": generated_internal_id,  # Store for detailed transaction lookups
                "title": title,
                "recipient_name": recipient_name,
                "description": description,
                "award_amount": award_amount,
                "awarding_agency": awarding_agency,
                "awarding_subagency": awarding_subagency,
                "start_date": start_date,
                "end_date": end_date,
                "award_type": award_type,
                "source": "USASpending.gov"
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing award data: {str(e)}")
            logger.error(f"Award data: {award}")
            return None
    
    def _parse_date(self, date_str: Optional[str]) -> Optional[str]:
        """Parse various date formats from USASpending API"""
        if not date_str:
            return None
        
        # Try different date formats
        formats = ["%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"]
        
        for fmt in formats:
            try:
                parsed_date = datetime.strptime(date_str, fmt)
                return parsed_date.strftime("%Y-%m-%d")
            except ValueError:
                continue
        
        logger.warning(f"Could not parse date: {date_str}")
        return date_str
    
    def _cache_awards(self, awards: List[Dict[str, Any]]):
        """Cache awards in the database"""
        if not awards:
            return
        
        conn = sqlite3.connect(self.database_path)
        cursor = conn.cursor()
        
        for award in awards:
            cursor.execute('''
                INSERT OR REPLACE INTO awards 
                (award_id, recipient_name, description, award_amount, awarding_agency, 
                 awarding_subagency, start_date, end_date, award_type, search_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                award["award_id"],
                award["recipient_name"],
                award["description"],
                award["award_amount"],
                award["awarding_agency"],
                award["awarding_subagency"],
                award["start_date"],
                award["end_date"],
                award["award_type"],
                "cached"
            ))
        
        conn.commit()
        conn.close()
        logger.info(f"💾 Cached {len(awards)} awards in database")
    
    def get_analytics(self) -> Dict[str, Any]:
        """Get analytics from cached awards data"""
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            # Get basic stats
            cursor.execute("SELECT COUNT(*) FROM awards")
            total_awards = cursor.fetchone()[0]
            
            cursor.execute("SELECT SUM(award_amount) FROM awards WHERE award_amount IS NOT NULL")
            total_value = cursor.fetchone()[0] or 0
            
            # Get top agencies
            cursor.execute("""
                SELECT awarding_agency, COUNT(*) as count, SUM(award_amount) as total_amount
                FROM awards 
                WHERE awarding_agency IS NOT NULL 
                GROUP BY awarding_agency 
                ORDER BY total_amount DESC 
                LIMIT 10
            """)
            top_agencies = cursor.fetchall()
            
            # Get top recipients
            cursor.execute("""
                SELECT recipient_name, COUNT(*) as count, SUM(award_amount) as total_amount
                FROM awards 
                WHERE recipient_name IS NOT NULL 
                GROUP BY recipient_name 
                ORDER BY total_amount DESC 
                LIMIT 10
            """)
            top_recipients = cursor.fetchall()
            
            conn.close()
            
            return {
                "total_awards": total_awards,
                "total_value": total_value,
                "top_agencies": [{"name": row[0], "count": row[1], "total_amount": row[2]} for row in top_agencies],
                "top_recipients": [{"name": row[0], "count": row[1], "total_amount": row[2]} for row in top_recipients]
            }
            
        except Exception as e:
            logger.error(f"❌ Error getting analytics: {str(e)}")
            return {
                "total_awards": 0,
                "total_value": 0,
                "top_agencies": [],
                "top_recipients": []
            }

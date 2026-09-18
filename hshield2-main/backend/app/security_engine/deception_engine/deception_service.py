from typing import List, Dict, Any, Optional
from app.security_engine.deception_engine.decoy_manager import DecoyManager, DEFAULT_DECOYS
from app.security_engine.deception_engine.decoy_detector import DecoyDetector

class DeceptionService:
    def __init__(self, db_session=None):
        self.db = db_session
        self.manager = DecoyManager()
        self.detector = DecoyDetector()

    def get_decoys(self, view_mode: str = "defender") -> List[Dict[str, Any]]:
        return self.manager.get_all_decoys(view_mode=view_mode)

    def trigger_decoy_event(
        self,
        decoy_id: str,
        source_asset: str = "Staff-PC-07",
        incident_id: str = "HSX-042"
    ) -> Dict[str, Any]:
        decoy = self.manager.get_decoy_by_id(decoy_id)
        decoy_name = decoy["name"] if decoy else "Fake Hospital Asset"
        
        # Build trigger alert
        alert = self.detector.process_decoy_interaction(
            source_asset=source_asset,
            decoy_id=decoy_id,
            decoy_name=decoy_name,
            incident_id=incident_id
        )

        # Update local memory count
        if decoy:
            decoy["interaction_count"] += 1
            decoy["last_interaction"] = alert["timestamp"]
            decoy["status"] = "TRIGGERED"

        return alert

    def get_adaptive_recommendation(self, incident_stage: str = "Lateral Movement", target_threat: str = "Pharmacy infrastructure") -> Dict[str, Any]:
        return self.manager.recommend_adaptive_decoy(incident_stage, target_threat)

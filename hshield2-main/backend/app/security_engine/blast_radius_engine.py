"""
HEALTHSHIELD-X Blast Radius Engine (Step 5).

Deterministically derives the Potential Blast Radius for an incident:
- Answers: "If the observed source asset were able to move through the currently
  reachable topology, which assets/services could potentially be affected?"
- Consumes the exact topology graph from Step 4 (build_hospital_topology_graph).
- Purely deterministic; no fabricated devices, scores, or AI hallucinations.
- Represents POTENTIAL reachability / exposure; does NOT claim confirmed compromise.
- Distinguishes transit infrastructure (VLAN gateways, L2 segments) from endpoint assets.
- If isolated, lateral movement is restricted with 0 exposed assets.
- If unmapped, returns UNAVAILABLE with "Insufficient topology data for blast radius assessment."
"""

from typing import Dict, Any, List, Optional, Tuple, Set
from sqlalchemy.orm import Session
from app.security_engine.attack_path_engine import (
    build_hospital_topology_graph,
    evaluate_attack_path,
)


def classify_asset_category(node: Dict[str, Any]) -> Tuple[str, bool, bool]:
    """
    Classifies an asset using existing repository metadata.
    Returns: (asset_category, is_clinical, is_critical)
    """
    cat = node.get("category", "")
    dtype = (node.get("type") or "").lower()
    nid = node.get("id", "")
    zid = node.get("zone", "")

    if cat == "DECOY":
        asset_category = "Decoy / Honeypot"
    elif nid == "EHR-DB-01" or "ehr" in dtype or "database" in dtype:
        asset_category = "EHR / Core Infrastructure"
    elif nid == "DC-AUTH-01" or "identity" in dtype or "auth" in dtype or "domain" in dtype:
        asset_category = "Security / Authentication"
    elif nid == "PACS-IMG-03" or "radiology" in dtype or ("imaging" in dtype and "workstation" not in dtype):
        asset_category = "Imaging"
    elif "ventilator" in dtype or "life support" in dtype:
        asset_category = "Life Support"
    elif "patient monitor" in dtype or "monitor" in dtype:
        asset_category = "Patient Monitoring"
    elif "dispenser" in dtype or "pharm" in dtype:
        asset_category = "Pharmacy"
    elif any(k in dtype for k in ["infusion", "pump", "ecg", "analyzer"]):
        asset_category = "Clinical Device"
    elif "workstation" in dtype or "admin" in dtype:
        asset_category = "Administrative"
    else:
        asset_category = "Clinical Device" if cat == "DEVICE" else "Core Infrastructure"

    is_clinical = (
        asset_category in ["Life Support", "Patient Monitoring", "Clinical Device", "Pharmacy"]
        or any(k in dtype for k in ["ventilator", "monitor", "pump", "ecg", "analyzer", "dispenser", "infusion"])
    )
    is_critical = (
        zid == "ZONE-ICU"
        or asset_category == "Life Support"
        or "ventilator" in dtype
        or nid == "EHR-DB-01"
        or "ehr" in dtype
    )

    return asset_category, is_clinical, is_critical


def resolve_node_service(node: Dict[str, Any]) -> str:
    """
    Extracts or resolves the clinical/operational service associated with a node.
    """
    srv = node.get("service")
    if srv:
        return srv
    zid = node.get("zone")
    if zid == "ZONE-ICU":
        return "ICU Life Support & Monitoring Bus"
    elif zid == "ZONE-WARD":
        return "Inpatient Telemetry Service"
    elif zid == "ZONE-NURSE":
        return "Nursing Station Operations"
    elif zid == "ZONE-CORE":
        return "Hospital Core Datacenter & EHR"
    return "Clinical Hospital Service"


def evaluate_blast_radius(
    db: Optional[Session],
    incident_context: Dict[str, Any],
    attack_path_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Deterministically computes the Potential Blast Radius.
    
    Returns:
    {
        "status": "AVAILABLE" | "UNAVAILABLE",
        "source": { "device_id": str, "device_name": str },
        "potentially_exposed_assets": [
            {
                "device_id": str,
                "device_name": str,
                "device_type": str,
                "zone": str,
                "vlan": str,
                "asset_category": str,
                "reachability": "POTENTIAL"
            }
        ],
        "potentially_exposed_count": int,
        "clinical_assets_count": int,
        "critical_assets_count": int,
        "affected_zones": List[str],
        "services_at_exposure": List[str],
        "restricted": bool,
        "reason": Optional[str]
    }
    """
    source_id = str(incident_context.get("device_id") or "").strip()
    if not source_id or source_id in ["UNKNOWN", "UNAVAILABLE"]:
        pid = str(incident_context.get("patient_id") or "").strip()
        if pid and not pid.startswith("P"):
            source_id = pid
        else:
            return {
                "status": "UNAVAILABLE",
                "source": {"device_id": "UNKNOWN", "device_name": "Unknown Source"},
                "potentially_exposed_assets": [],
                "potentially_exposed_count": 0,
                "clinical_assets_count": 0,
                "critical_assets_count": 0,
                "affected_zones": [],
                "services_at_exposure": [],
                "restricted": False,
                "reason": "Insufficient topology data for blast radius assessment."
            }

    # Reuse existing Step 4 topology model
    nodes, adjacency = build_hospital_topology_graph(db)

    # Check if source exists in topology
    if source_id not in nodes:
        return {
            "status": "UNAVAILABLE",
            "source": {"device_id": source_id, "device_name": "Unmapped Device"},
            "potentially_exposed_assets": [],
            "potentially_exposed_count": 0,
            "clinical_assets_count": 0,
            "critical_assets_count": 0,
            "affected_zones": [],
            "services_at_exposure": [],
            "restricted": False,
            "reason": "Insufficient topology data for blast radius assessment."
        }

    source_node = nodes[source_id]

    # Evaluate attack path if not already provided
    if attack_path_context is None:
        attack_path_context = evaluate_attack_path(db, incident_context)

    # If attack path could not be reconstructed due to insufficient topology
    if attack_path_context.get("status") == "UNAVAILABLE":
        return {
            "status": "UNAVAILABLE",
            "source": {"device_id": source_id, "device_name": source_node["name"]},
            "potentially_exposed_assets": [],
            "potentially_exposed_count": 0,
            "clinical_assets_count": 0,
            "critical_assets_count": 0,
            "affected_zones": [],
            "services_at_exposure": [],
            "restricted": False,
            "reason": "Insufficient topology data for blast radius assessment."
        }

    # Respect active isolation / quarantine
    is_isolated = (
        source_node.get("status") == "ISOLATED"
        or attack_path_context.get("is_quarantined") is True
        or attack_path_context.get("status") == "RESTRICTED"
    )

    if is_isolated:
        return {
            "status": "RESTRICTED",
            "source": {
                "device_id": source_id,
                "device_name": source_node["name"],
                "device_type": source_node.get("type", "Unknown"),
                "hospital_zone": source_node.get("zone", "UNKNOWN"),
                "zone": source_node.get("zone", "UNKNOWN"),
                "vlan": source_node.get("vlan", "Unknown")
            },
            "potentially_exposed_assets": [],
            "potentially_exposed_count": 0,
            "clinical_assets_count": 0,
            "critical_assets_count": 0,
            "affected_zones": [],
            "services_at_exposure": [],
            "restricted": True,
            "reason": "Traversal restricted by active host isolation."
        }

    # Extract nodes from the active attack path
    path_nodes = attack_path_context.get("path_nodes", [])
    path_ids = [
        pn["id"] for pn in path_nodes 
        if pn.get("type") in ["SOURCE", "NETWORK", "REACHABLE_ASSET"]
    ]

    # Collect traversed transit infrastructure (network segments, core gateway)
    traversed_transit = [
        nid for nid in path_ids
        if nid in nodes and nodes[nid].get("category") in ["NETWORK", "GATEWAY"]
    ]

    # Target endpoint assets identified in attack path
    target_endpoints = [
        nid for nid in path_ids
        if nid in nodes and nodes[nid].get("category") in ["DEVICE", "CORE_SERVER", "DECOY"] and nid != source_id
    ]

    exposed_asset_ids: List[str] = []
    seen: Set[str] = set()

    # 1. Include target endpoint asset from the attack path
    for tid in target_endpoints:
        if tid not in seen:
            seen.add(tid)
            exposed_asset_ids.append(tid)

    # 2. Derive exposed endpoint assets along the traversed transit infrastructure
    if "VLAN-GW-01" in traversed_transit:
        # If the attack path traverses the Core Network Gateway (inter-VLAN transit),
        # Core Infrastructure servers directly coupled to the routing backbone are exposed
        for cid in ["EHR-DB-01", "DC-AUTH-01"]:
            if cid in nodes and cid not in seen and cid != source_id:
                seen.add(cid)
                exposed_asset_ids.append(cid)
    else:
        # If traversal did not cross the core gateway (e.g. stayed within ICU VLAN segment),
        # exposed assets are adjacent devices on the local VLAN segment
        for transit_id in traversed_transit:
            for neighbor in adjacency.get(transit_id, []):
                if neighbor != source_id and neighbor in nodes:
                    ncat = nodes[neighbor].get("category")
                    if ncat in ["DEVICE", "CORE_SERVER", "DECOY"] and neighbor not in seen:
                        seen.add(neighbor)
                        exposed_asset_ids.append(neighbor)

    # 3. Classify operational and clinical relevance
    exposed_assets: List[Dict[str, Any]] = []
    clinical_count = 0
    critical_count = 0
    affected_zones: List[str] = []
    services_set: Set[str] = set()

    for aid in exposed_asset_ids:
        anode = nodes[aid]
        cat, is_clin, is_crit = classify_asset_category(anode)
        if is_clin:
            clinical_count += 1
        if is_crit:
            critical_count += 1

        az = anode.get("zone")
        if az and az not in affected_zones:
            affected_zones.append(az)

        srv = resolve_node_service(anode)
        if srv:
            services_set.add(srv)

        exposed_assets.append({
            "device_id": aid,
            "device_name": anode["name"],
            "device_type": anode["type"],
            "hospital_zone": anode.get("zone", "UNKNOWN"),
            "zone": anode.get("zone", "UNKNOWN"),
            "vlan": anode.get("vlan", "Unknown"),
            "asset_category": cat,
            "reachability": "POTENTIAL"
        })

    return {
        "status": "AVAILABLE",
        "source": {
            "device_id": source_id,
            "device_name": source_node["name"],
            "device_type": source_node.get("type", "Unknown"),
            "hospital_zone": source_node.get("zone", "UNKNOWN"),
            "zone": source_node.get("zone", "UNKNOWN"),
            "vlan": source_node.get("vlan", "Unknown")
        },
        "potentially_exposed_assets": exposed_assets,
        "potentially_exposed_count": len(exposed_assets),
        "clinical_assets_count": clinical_count,
        "critical_assets_count": critical_count,
        "affected_zones": affected_zones,
        "services_at_exposure": sorted(list(services_set)),
        "restricted": False,
        "reason": None
    }

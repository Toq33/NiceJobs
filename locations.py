"""
Bangladesh 64 Districts Location Library with Verified Geographic Coordinates,
Haversine Proximity Calculation, and Distance-Based Sorting.
"""

import math
from typing import List, Dict, Optional, Any

# Canonical dataset of all 64 districts in Bangladesh
# Accurate geographic coordinates of district headquarters / central points
BANGLADESH_DISTRICTS: List[Dict[str, Any]] = [
    # --- Dhaka Division (13) ---
    {
        "id": "dhaka",
        "name": "Dhaka",
        "division": "Dhaka",
        "lat": 23.8103,
        "lng": 90.4125,
        "aliases": ["Dacca"]
    },
    {
        "id": "gazipur",
        "name": "Gazipur",
        "division": "Dhaka",
        "lat": 24.0023,
        "lng": 90.4264,
        "aliases": ["Joydebpur"]
    },
    {
        "id": "narayanganj",
        "name": "Narayanganj",
        "division": "Dhaka",
        "lat": 23.6238,
        "lng": 90.5000,
        "aliases": []
    },
    {
        "id": "narsingdi",
        "name": "Narsingdi",
        "division": "Dhaka",
        "lat": 23.9193,
        "lng": 90.7176,
        "aliases": []
    },
    {
        "id": "manikganj",
        "name": "Manikganj",
        "division": "Dhaka",
        "lat": 23.8617,
        "lng": 90.0003,
        "aliases": []
    },
    {
        "id": "munshiganj",
        "name": "Munshiganj",
        "division": "Dhaka",
        "lat": 23.5422,
        "lng": 90.5305,
        "aliases": ["Bikrampur"]
    },
    {
        "id": "tangail",
        "name": "Tangail",
        "division": "Dhaka",
        "lat": 24.2513,
        "lng": 89.9167,
        "aliases": []
    },
    {
        "id": "kishoreganj",
        "name": "Kishoreganj",
        "division": "Dhaka",
        "lat": 24.4449,
        "lng": 90.7766,
        "aliases": []
    },
    {
        "id": "faridpur",
        "name": "Faridpur",
        "division": "Dhaka",
        "lat": 23.6071,
        "lng": 89.8429,
        "aliases": []
    },
    {
        "id": "gopalganj",
        "name": "Gopalganj",
        "division": "Dhaka",
        "lat": 23.0051,
        "lng": 89.8266,
        "aliases": []
    },
    {
        "id": "madaripur",
        "name": "Madaripur",
        "division": "Dhaka",
        "lat": 23.1641,
        "lng": 90.1897,
        "aliases": []
    },
    {
        "id": "rajbari",
        "name": "Rajbari",
        "division": "Dhaka",
        "lat": 23.7574,
        "lng": 89.6445,
        "aliases": []
    },
    {
        "id": "shariatpur",
        "name": "Shariatpur",
        "division": "Dhaka",
        "lat": 23.2423,
        "lng": 90.3547,
        "aliases": []
    },

    # --- Chattogram Division (11) ---
    {
        "id": "chattogram",
        "name": "Chattogram",
        "division": "Chattogram",
        "lat": 22.3569,
        "lng": 91.7832,
        "aliases": ["Chittagong", "Ctg"]
    },
    {
        "id": "coxs_bazar",
        "name": "Cox's Bazar",
        "division": "Chattogram",
        "lat": 21.4272,
        "lng": 92.0058,
        "aliases": ["Coxs Bazar", "Coxsbazar"]
    },
    {
        "id": "cumilla",
        "name": "Cumilla",
        "division": "Chattogram",
        "lat": 23.4607,
        "lng": 91.1809,
        "aliases": ["Comilla"]
    },
    {
        "id": "brahmanbaria",
        "name": "Brahmanbaria",
        "division": "Chattogram",
        "lat": 23.9571,
        "lng": 91.1115,
        "aliases": ["B.Baria"]
    },
    {
        "id": "chandpur",
        "name": "Chandpur",
        "division": "Chattogram",
        "lat": 23.2333,
        "lng": 90.6667,
        "aliases": []
    },
    {
        "id": "feni",
        "name": "Feni",
        "division": "Chattogram",
        "lat": 23.0186,
        "lng": 91.3966,
        "aliases": []
    },
    {
        "id": "lakshmipur",
        "name": "Lakshmipur",
        "division": "Chattogram",
        "lat": 22.9425,
        "lng": 90.8412,
        "aliases": ["Laxmipur"]
    },
    {
        "id": "noakhali",
        "name": "Noakhali",
        "division": "Chattogram",
        "lat": 22.8696,
        "lng": 91.0995,
        "aliases": []
    },
    {
        "id": "bandarban",
        "name": "Bandarban",
        "division": "Chattogram",
        "lat": 22.1953,
        "lng": 92.2184,
        "aliases": []
    },
    {
        "id": "khagrachhari",
        "name": "Khagrachhari",
        "division": "Chattogram",
        "lat": 23.1193,
        "lng": 91.9847,
        "aliases": ["Khagrachari"]
    },
    {
        "id": "rangamati",
        "name": "Rangamati",
        "division": "Chattogram",
        "lat": 22.6533,
        "lng": 92.1753,
        "aliases": []
    },

    # --- Sylhet Division (4) ---
    {
        "id": "sylhet",
        "name": "Sylhet",
        "division": "Sylhet",
        "lat": 24.8949,
        "lng": 91.8687,
        "aliases": []
    },
    {
        "id": "moulvibazar",
        "name": "Moulvibazar",
        "division": "Sylhet",
        "lat": 24.4829,
        "lng": 91.7774,
        "aliases": ["Maulvibazar", "Sreemangal"]
    },
    {
        "id": "habiganj",
        "name": "Habiganj",
        "division": "Sylhet",
        "lat": 24.3750,
        "lng": 91.4167,
        "aliases": []
    },
    {
        "id": "sunamganj",
        "name": "Sunamganj",
        "division": "Sylhet",
        "lat": 25.0658,
        "lng": 91.4073,
        "aliases": ["Tanguar Haor"]
    },

    # --- Rajshahi Division (8) ---
    {
        "id": "rajshahi",
        "name": "Rajshahi",
        "division": "Rajshahi",
        "lat": 24.3636,
        "lng": 88.6241,
        "aliases": []
    },
    {
        "id": "bogura",
        "name": "Bogura",
        "division": "Rajshahi",
        "lat": 24.8465,
        "lng": 89.3777,
        "aliases": ["Bogra"]
    },
    {
        "id": "joypurhat",
        "name": "Joypurhat",
        "division": "Rajshahi",
        "lat": 25.0968,
        "lng": 89.0227,
        "aliases": []
    },
    {
        "id": "naogaon",
        "name": "Naogaon",
        "division": "Rajshahi",
        "lat": 24.8236,
        "lng": 88.9320,
        "aliases": []
    },
    {
        "id": "natore",
        "name": "Natore",
        "division": "Rajshahi",
        "lat": 24.4206,
        "lng": 89.0003,
        "aliases": []
    },
    {
        "id": "chapainawabganj",
        "name": "Chapainawabganj",
        "division": "Rajshahi",
        "lat": 24.5965,
        "lng": 88.2775,
        "aliases": ["Nawabganj", "Chapai"]
    },
    {
        "id": "pabna",
        "name": "Pabna",
        "division": "Rajshahi",
        "lat": 24.0064,
        "lng": 89.2372,
        "aliases": []
    },
    {
        "id": "sirajganj",
        "name": "Sirajganj",
        "division": "Rajshahi",
        "lat": 24.4534,
        "lng": 89.7008,
        "aliases": []
    },

    # --- Khulna Division (10) ---
    {
        "id": "khulna",
        "name": "Khulna",
        "division": "Khulna",
        "lat": 22.8456,
        "lng": 89.5403,
        "aliases": []
    },
    {
        "id": "bagerhat",
        "name": "Bagerhat",
        "division": "Khulna",
        "lat": 22.6516,
        "lng": 89.7859,
        "aliases": ["Sundarbans"]
    },
    {
        "id": "jashore",
        "name": "Jashore",
        "division": "Khulna",
        "lat": 23.1664,
        "lng": 89.2081,
        "aliases": ["Jessore"]
    },
    {
        "id": "satkhira",
        "name": "Satkhira",
        "division": "Khulna",
        "lat": 22.7185,
        "lng": 89.0705,
        "aliases": []
    },
    {
        "id": "jhenaidah",
        "name": "Jhenaidah",
        "division": "Khulna",
        "lat": 23.5450,
        "lng": 89.1526,
        "aliases": []
    },
    {
        "id": "magura",
        "name": "Magura",
        "division": "Khulna",
        "lat": 23.4873,
        "lng": 89.4198,
        "aliases": []
    },
    {
        "id": "narail",
        "name": "Narail",
        "division": "Khulna",
        "lat": 23.1725,
        "lng": 89.5120,
        "aliases": []
    },
    {
        "id": "kushtia",
        "name": "Kushtia",
        "division": "Khulna",
        "lat": 23.9013,
        "lng": 89.1204,
        "aliases": []
    },
    {
        "id": "chuadanga",
        "name": "Chuadanga",
        "division": "Khulna",
        "lat": 23.6402,
        "lng": 88.8418,
        "aliases": []
    },
    {
        "id": "meherpur",
        "name": "Meherpur",
        "division": "Khulna",
        "lat": 23.7622,
        "lng": 88.6318,
        "aliases": []
    },

    # --- Barishal Division (6) ---
    {
        "id": "barishal",
        "name": "Barishal",
        "division": "Barishal",
        "lat": 22.7010,
        "lng": 90.3535,
        "aliases": ["Barisal"]
    },
    {
        "id": "barguna",
        "name": "Barguna",
        "division": "Barishal",
        "lat": 22.0953,
        "lng": 90.1121,
        "aliases": []
    },
    {
        "id": "bhola",
        "name": "Bhola",
        "division": "Barishal",
        "lat": 22.6859,
        "lng": 90.6481,
        "aliases": []
    },
    {
        "id": "jhalokathi",
        "name": "Jhalokathi",
        "division": "Barishal",
        "lat": 22.6406,
        "lng": 90.1987,
        "aliases": ["Jhalakati"]
    },
    {
        "id": "patuakhali",
        "name": "Patuakhali",
        "division": "Barishal",
        "lat": 22.3596,
        "lng": 90.3299,
        "aliases": ["Kuakata"]
    },
    {
        "id": "pirojpur",
        "name": "Pirojpur",
        "division": "Barishal",
        "lat": 22.5841,
        "lng": 89.9720,
        "aliases": []
    },

    # --- Rangpur Division (8) ---
    {
        "id": "rangpur",
        "name": "Rangpur",
        "division": "Rangpur",
        "lat": 25.7439,
        "lng": 89.2752,
        "aliases": []
    },
    {
        "id": "dinajpur",
        "name": "Dinajpur",
        "division": "Rangpur",
        "lat": 25.6217,
        "lng": 88.6355,
        "aliases": []
    },
    {
        "id": "gaibandha",
        "name": "Gaibandha",
        "division": "Rangpur",
        "lat": 25.3288,
        "lng": 89.5281,
        "aliases": []
    },
    {
        "id": "kurigram",
        "name": "Kurigram",
        "division": "Rangpur",
        "lat": 25.8054,
        "lng": 89.6362,
        "aliases": []
    },
    {
        "id": "lalmonirhat",
        "name": "Lalmonirhat",
        "division": "Rangpur",
        "lat": 25.9923,
        "lng": 89.2847,
        "aliases": []
    },
    {
        "id": "nilphamari",
        "name": "Nilphamari",
        "division": "Rangpur",
        "lat": 25.9318,
        "lng": 88.8560,
        "aliases": ["Saidpur"]
    },
    {
        "id": "panchagarh",
        "name": "Panchagarh",
        "division": "Rangpur",
        "lat": 26.3411,
        "lng": 88.5542,
        "aliases": ["Tetulia"]
    },
    {
        "id": "thakurgaon",
        "name": "Thakurgaon",
        "division": "Rangpur",
        "lat": 26.0337,
        "lng": 88.4617,
        "aliases": []
    },

    # --- Mymensingh Division (4) ---
    {
        "id": "mymensingh",
        "name": "Mymensingh",
        "division": "Mymensingh",
        "lat": 24.7471,
        "lng": 90.4203,
        "aliases": []
    },
    {
        "id": "jamalpur",
        "name": "Jamalpur",
        "division": "Mymensingh",
        "lat": 24.9375,
        "lng": 89.9378,
        "aliases": []
    },
    {
        "id": "netrokona",
        "name": "Netrokona",
        "division": "Mymensingh",
        "lat": 24.8709,
        "lng": 90.7279,
        "aliases": []
    },
    {
        "id": "sherpur",
        "name": "Sherpur",
        "division": "Mymensingh",
        "lat": 25.0205,
        "lng": 90.0153,
        "aliases": []
    }
]

# Quick lookup maps
_ID_MAP: Dict[str, Dict[str, Any]] = {d["id"]: d for d in BANGLADESH_DISTRICTS}
_NAME_MAP: Dict[str, Dict[str, Any]] = {d["name"].lower(): d for d in BANGLADESH_DISTRICTS}
for d in BANGLADESH_DISTRICTS:
    for alias in d.get("aliases", []):
        _NAME_MAP[alias.lower()] = d


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on the earth in kilometers
    using the Haversine formula.
    """
    R = 6371.0  # Earth's radius in kilometers

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    
    # Clip for floating point precision safety
    a = min(1.0, max(0.0, a))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 1)


def get_all_districts() -> List[Dict[str, Any]]:
    """Return all 64 districts in standard canonical order."""
    return [dict(d) for d in BANGLADESH_DISTRICTS]


def find_district(query: str) -> Optional[Dict[str, Any]]:
    """
    Find a district by name, ID, or alias (case-insensitive).
    """
    if not query:
        return None
    q = query.strip().lower()
    # Direct ID match
    if q in _ID_MAP:
        return dict(_ID_MAP[q])
    # Name or alias match
    if q in _NAME_MAP:
        return dict(_NAME_MAP[q])
    # Fuzzy / substring match
    for d in BANGLADESH_DISTRICTS:
        if q in d["name"].lower() or q in d["id"]:
            return dict(d)
        for alias in d.get("aliases", []):
            if q in alias.lower():
                return dict(d)
    return None


def get_districts_by_proximity(
    preferred_inputs: List[str],
    max_distance_km: Optional[float] = None
) -> List[Dict[str, Any]]:
    """
    Given one or more preferred districts (names or IDs):
    1. Exact matches (distance = 0 km, is_selected = True)
    2. Calculates each other district's minimum distance to ANY of the selected districts
    3. Sorts all remaining districts by ascending minimum distance
    Covers all 64 districts unless max_distance_km is specified.
    """
    # Resolve selected districts
    selected_districts: List[Dict[str, Any]] = []
    selected_ids = set()

    for item in preferred_inputs:
        d = find_district(item)
        if d and d["id"] not in selected_ids:
            selected_districts.append(d)
            selected_ids.add(d["id"])

    # If no valid preferred districts, return all districts with distance=0
    if not selected_districts:
        return [
            {**d, "distance_km": 0.0, "is_selected": False}
            for d in BANGLADESH_DISTRICTS
        ]

    results: List[Dict[str, Any]] = []

    for d in BANGLADESH_DISTRICTS:
        is_selected = d["id"] in selected_ids
        if is_selected:
            min_dist = 0.0
        else:
            # Min distance to any selected district
            min_dist = min(
                haversine_distance(d["lat"], d["lng"], sel["lat"], sel["lng"])
                for sel in selected_districts
            )

        if max_distance_km is not None and min_dist > max_distance_km and not is_selected:
            continue

        results.append({
            "id": d["id"],
            "name": d["name"],
            "division": d["division"],
            "lat": d["lat"],
            "lng": d["lng"],
            "aliases": d.get("aliases", []),
            "distance_km": round(min_dist, 1),
            "is_selected": is_selected
        })

    # Sort: Selected districts first (distance=0, is_selected=True), then by ascending distance, then name
    results.sort(key=lambda x: (not x["is_selected"], x["distance_km"], x["name"]))
    return results


def resolve_district_from_text(text: str) -> Optional[Dict[str, Any]]:
    """
    Search text (such as address, city, or property location) to detect a district.
    Handles compound strings like 'Sreemangal, Sylhet', 'Gulshan, Dhaka', 'Inani, Cox's Bazar'.
    """
    if not text:
        return None
    # 1. Try exact find_district first
    direct = find_district(text)
    if direct:
        return direct
    
    # 2. Split by punctuation/comma and try individual tokens
    cleaned = text.replace(',', ' ').replace(';', ' ').replace('-', ' ').replace('/', ' ')
    parts = [p.strip() for p in cleaned.split() if len(p.strip()) >= 3]
    for part in parts:
        d = find_district(part)
        if d:
            return d

    # 3. Check if any district name or alias is contained as a whole word or substring
    text_lower = f" {text.lower()} "
    # Check exact aliases first (e.g. Sreemangal -> Moulvibazar)
    for d in BANGLADESH_DISTRICTS:
        for alias in d.get("aliases", []):
            if f" {alias.lower()} " in text_lower or alias.lower() in text_lower:
                return dict(d)
    for d in BANGLADESH_DISTRICTS:
        if f" {d['name'].lower()} " in text_lower or d['name'].lower() in text_lower:
            return dict(d)

    return None


def match_job_district(city: str = "", district: str = "", property_location: str = "") -> Optional[Dict[str, Any]]:
    """
    Determine the primary district for a job by inspecting district, city, and property_location.
    """
    if district:
        d = resolve_district_from_text(district)
        if d:
            return d
    if city:
        d = resolve_district_from_text(city)
        if d:
            return d
    if property_location:
        d = resolve_district_from_text(property_location)
        if d:
            return d
    return None


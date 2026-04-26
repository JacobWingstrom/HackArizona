"""
travel_data.py — Real airline route data (OpenFlights) × Census county centroids.

Data sources (both free/open):
  Airports + Routes : openflights.org/data  (ODbL licence)
  County centroids  : US Census Bureau CenPop2020_Mean_CO (public domain)

All heavy work (airport→county mapping, county→airports mapping) is done
once at module import time so every /api/travel-flow/<fips> request is a
fast dict lookup + one DB query.

Public API
----------
  ALL_COUNTIES    : dict  fips → {fips, county, state, lat, lon, pop}
  get_inbound_sources(target_fips, sick_by_fips) → list of source-county dicts
  airport_stats() → dict with counts for the /api/health endpoint
"""

import csv
import math
import os
from collections import defaultdict

_DIR            = os.path.dirname(__file__)
_AIRPORTS_FILE  = os.path.join(_DIR, "data", "airports.dat")
_ROUTES_FILE    = os.path.join(_DIR, "data", "routes.dat")
_CENTROIDS_FILE = os.path.join(_DIR, "data", "county_centroids.csv")

# ── State name → 2-letter abbreviation ───────────────────────────────────────
_STATE_ABBR = {
    'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
    'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
    'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
    'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
    'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
    'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH',
    'New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC',
    'North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA',
    'Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN',
    'Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA',
    'West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
    'District of Columbia':'DC','Puerto Rico':'PR',
}


# ════════════════════════════════════════════════════════════════════════════
# 1. Load county centroids  (Census Bureau — all 3,221 US counties)
# ════════════════════════════════════════════════════════════════════════════
def _load_counties():
    counties = {}
    with open(_CENTROIDS_FILE, encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            fips = row['STATEFP'].zfill(2) + row['COUNTYFP'].zfill(3)
            counties[fips] = {
                'fips':   fips,
                'county': row['COUNAME'],
                'state':  _STATE_ABBR.get(row['STNAME'], row['STNAME'][:2]),
                'lat':    float(row['LATITUDE']),
                'lon':    float(row['LONGITUDE']),
                'pop':    int(row['POPULATION']),
            }
    return counties


# ════════════════════════════════════════════════════════════════════════════
# 2. Load US airports from OpenFlights
# ════════════════════════════════════════════════════════════════════════════
def _load_airports():
    airports = {}
    with open(_AIRPORTS_FILE, encoding='utf-8', errors='replace') as f:
        for row in csv.reader(f):
            if len(row) < 8:
                continue
            try:
                iata    = row[4].strip()
                country = row[3].strip()
                lat     = float(row[6])
                lon     = float(row[7])
            except (ValueError, IndexError):
                continue
            if country != 'United States':
                continue
            if not iata or iata == r'\N':
                continue
            airports[iata] = {
                'iata': iata,
                'name': row[1].strip(),
                'city': row[2].strip(),
                'lat':  lat,
                'lon':  lon,
            }
    return airports


# ════════════════════════════════════════════════════════════════════════════
# 3. Load routes: dest_iata → {src_iata: route_count}
# ════════════════════════════════════════════════════════════════════════════
def _load_routes(airports):
    routes_to = defaultdict(lambda: defaultdict(int))
    with open(_ROUTES_FILE, encoding='utf-8', errors='replace') as f:
        for row in csv.reader(f):
            if len(row) < 5:
                continue
            src, dst = row[2].strip(), row[4].strip()
            if src in airports and dst in airports and src != dst:
                routes_to[dst][src] += 1
    return {k: dict(v) for k, v in routes_to.items()}


# ════════════════════════════════════════════════════════════════════════════
# 4. Pre-compute airport → nearest county FIPS
#    Uses all 3,221 Census centroids.  Every US airport gets mapped.
# ════════════════════════════════════════════════════════════════════════════
def _build_airport_to_fips(airports, counties):
    mapping = {}
    county_list = [(fips, info['lat'], info['lon']) for fips, info in counties.items()]
    for iata, ap in airports.items():
        best_fips, best_d = None, float('inf')
        for fips, clat, clon in county_list:
            d = math.sqrt((clat - ap['lat'])**2 + (clon - ap['lon'])**2)
            if d < best_d:
                best_d = d
                best_fips = fips
        mapping[iata] = best_fips   # always assigns — no distance cutoff
    return mapping


# ════════════════════════════════════════════════════════════════════════════
# 5. Pre-compute county FIPS → list of nearby destination airports
#    Each county gets its closest airports (up to 4), sorted by distance.
#    We search ALL airports so even remote counties find their nearest one.
# ════════════════════════════════════════════════════════════════════════════
def _build_fips_to_airports(counties, airports, routes_to, max_airports=4):
    """
    For each county assign up to max_airports destination airports, chosen as
    the nearest ones that have at least one inbound domestic route.
    No distance cutoff — every county always gets airports, even remote ones.
    """
    routed = set(routes_to.keys())
    airport_list = [(iata, ap['lat'], ap['lon']) for iata, ap in airports.items() if iata in routed]

    mapping = {}
    for fips, info in counties.items():
        clat, clon = info['lat'], info['lon']
        dists = sorted(
            ((math.sqrt((alat - clat)**2 + (alon - clon)**2), iata)
             for iata, alat, alon in airport_list)
        )
        mapping[fips] = [iata for _, iata in dists[:max_airports]]
    return mapping


# ════════════════════════════════════════════════════════════════════════════
# Boot: parse everything once
# ════════════════════════════════════════════════════════════════════════════
print("travel_data: loading OpenFlights + Census county data…")
ALL_COUNTIES     = _load_counties()                          # 3,221 counties
_AIRPORTS        = _load_airports()                          # 1,251 US airports
_ROUTES_TO       = _load_routes(_AIRPORTS)                   # dest → {src: count}
_AIRPORT_TO_FIPS = _build_airport_to_fips(_AIRPORTS, ALL_COUNTIES)   # iata → fips
_FIPS_TO_AIRPORTS = _build_fips_to_airports(                 # fips → [iata, ...]
    ALL_COUNTIES, _AIRPORTS, _ROUTES_TO
)
print(f"travel_data: ready — {len(ALL_COUNTIES)} counties, "
      f"{len(_AIRPORTS)} airports, {sum(len(v) for v in _ROUTES_TO.values())} routes")


# ════════════════════════════════════════════════════════════════════════════
# Public API
# ════════════════════════════════════════════════════════════════════════════
def get_inbound_sources(target_fips, sick_by_fips):
    """
    For a hovered county, return ranked source counties that have direct
    airline routes into it AND have sick reports in the DB.

    Score = sick_count × route_frequency
    (more routes = more passengers = higher transmission risk)

    Parameters
    ----------
    target_fips  : str   5-digit FIPS of hovered county
    sick_by_fips : dict  {fips: sick_count} from the reports DB

    Returns
    -------
    dict: {
        target:  {fips, county, state, lat, lon, pop},
        sources: [ {fips, county, state, lat, lon, pop,
                    sick, routes, score, weight,
                    via_airport, to_airport}, ... ]   max 15
    }
    """
    target = ALL_COUNTIES.get(target_fips)
    if not target:
        return {"target": None, "sources": []}

    dest_airports = _FIPS_TO_AIRPORTS.get(target_fips, [])
    if not dest_airports:
        return {"target": target, "sources": []}

    # Aggregate scores across all dest airports for this county
    county_best = {}   # src_fips → best entry
    for dest_iata in dest_airports:
        for src_iata, route_count in _ROUTES_TO.get(dest_iata, {}).items():
            src_fips = _AIRPORT_TO_FIPS.get(src_iata)
            if not src_fips or src_fips == target_fips:
                continue
            sick = sick_by_fips.get(src_fips, 0)
            if sick == 0:
                continue
            score = sick * route_count
            if src_fips not in county_best or county_best[src_fips]['score'] < score:
                src_county = ALL_COUNTIES.get(src_fips, {})
                county_best[src_fips] = {
                    **src_county,
                    'sick':        sick,
                    'routes':      route_count,
                    'score':       score,
                    'via_airport': src_iata,
                    'to_airport':  dest_iata,
                }

    results = sorted(county_best.values(), key=lambda x: x['score'], reverse=True)[:15]

    if results:
        max_score = results[0]['score']
        for r in results:
            r['weight'] = round(r['score'] / max_score, 3)

    return {"target": target, "sources": results}


def airport_stats():
    return {
        "us_airports":          len(_AIRPORTS),
        "routed_destinations":  len(_ROUTES_TO),
        "total_us_routes":      sum(len(v) for v in _ROUTES_TO.values()),
        "counties_mapped":      len(ALL_COUNTIES),
    }

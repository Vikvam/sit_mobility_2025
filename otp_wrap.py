import requests
from datetime import datetime
from typing import Union, List, Dict, Any


def get_otp_isochrone(
        location: tuple[float, float],
        cutoff_minutes: Union[int, List[int]],
        departure_time: datetime,
        modes=None,
        arrive_by: bool = False,
        batch: bool = True,
        base_url: str = "http://localhost:8080/otp/traveltime/isochrone",
        **kwargs
) -> Dict[str, Any]:
    """
    Retrieve isochrone GeoJSON from OpenTripPlanner API

    Parameters:
    location: Tuple of (latitude, longitude)
    cutoff_minutes: Single integer or list of integers (in minutes)
    departure_time: Timezone-aware datetime object
    modes: List of transportation modes (default: TRANSIT,WALK)
    arrive_by: Reverse search direction (arrive by time)
    base_url: OTP endpoint (default: traveltime/isochrone)
    **kwargs: Additional OTP parameters (e.g., maxWalkDistance=800)

    Returns:
    GeoJSON dictionary with isochrone polygons

    Example:
    >>> from zoneinfo import ZoneInfo
    >>> time = datetime(2025, 2, 14, 1, 25, tzinfo=ZoneInfo("Europe/Prague"))
    >>> isochrone = get_otp_isochrone(
    ...     (49.7475, 13.3776),
    ...     [15, 30, 45],
    ...     time,
    ...     modes=["TRANSIT"],
    ...     maxWalkDistance=800
    ... )
    """
    if modes is None:
        modes = ["TRANSIT", "WALK"]
    params = {
        "batch": str(batch).lower(),
        "location": f"{location[0]:.6f},{location[1]:.6f}",
        "time": departure_time.isoformat(timespec='seconds'),
        "modes": ",".join(m.upper() for m in modes),
        "arriveBy": str(arrive_by).lower(),
    }

    # Handle cutoff times (convert to list if single value)
    cutoffs = [cutoff_minutes] if isinstance(cutoff_minutes, int) else cutoff_minutes
    params["cutoff"] = [f"{c}M" for c in cutoffs]

    # Add extra parameters
    params.update(kwargs)

    try:
        response = requests.get(
            base_url,
            params=params,
            headers={"Accept": "application/json"},
            timeout=30
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        error_detail = response.json().get('error', {}).get('message', 'Unknown error')
        raise RuntimeError(f"OTP API Error: {error_detail}") from e
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Network error: {str(e)}") from e

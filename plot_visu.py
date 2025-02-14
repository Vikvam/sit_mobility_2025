from datetime import datetime
from zoneinfo import ZoneInfo

import geopandas as gpd
import matplotlib.pyplot as plt

from otp_wrap import get_otp_isochrone

# Get isochrone data
isochrone_data = get_otp_isochrone(
    (49.7475, 13.3776),
    [15, 30, 45],
    datetime.now(tz=ZoneInfo("Europe/Prague")),
    modes=["TRANSIT", "WALK"],
    maxWalkDistance=1000
)

# Convert to GeoDataFrame
gdf = gpd.GeoDataFrame.from_features(isochrone_data['features'])

# Plot results
fig, ax = plt.subplots(figsize=(10, 10))
gdf.plot(ax=ax, column='time')
plt.title("Pilsen Public Transport Accessibility")
plt.xlabel("Longitude")
plt.ylabel("Latitude")
plt.show()

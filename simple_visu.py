import json
from datetime import datetime
from zoneinfo import ZoneInfo

import streamlit as st
import geopandas as gpd
import folium
from folium.plugins import Draw
from streamlit_folium import folium_static
from io import StringIO

from otp_wrap import get_otp_isochrone
m = folium.Map(location=[49.7475, 13.3776], zoom_start=13)


def load_geojson(geojson_str):
    """Load GeoJSON string into GeoDataFrame with error handling"""
    try:
        return gpd.read_file(StringIO(geojson_str))
    except Exception as e:
        st.error(f"Error loading GeoJSON: {str(e)}")
        return None


st.title("GeoJSON Comparator")

geos = [
    get_otp_isochrone(
        (49.7475, 13.3776),
        [20],
        datetime.now(tz=ZoneInfo("Europe/Prague")),
        modes=["SUBWAY", "WALK"],
        maxWalkDistance=1000
    ),
    get_otp_isochrone(
        (49.7475, 13.3776),
        [20],
        datetime.now(tz=ZoneInfo("Europe/Prague")),
        modes=["TRANSIT", "WALK"],
        maxWalkDistance=1000
    ),
    get_otp_isochrone(
        (49.7475, 13.3776),
        [20],
        datetime.now(tz=ZoneInfo("Europe/Prague")),
        modes=["WALK", "TRAM"],
        maxWalkDistance=1000
    ),
]

gdfs = [load_geojson((json.dumps(geo))) for geo in geos]


colors = ["blue", "red", "green", "purple", "orange", "yellow", "cyan", "magenta"]

for i, gdf in enumerate(gdfs):
    if gdf is None:
        print("Error loading GeoJSON, stopping")
        st.stop()

    # Use immediate binding for lambda
    style_fn = lambda x, color=colors[i]: {'color': color, 'fillOpacity': 0.3}

    folium.GeoJson(
        gdf,
        name=f"Isochrone {i}",  # Unique name for each layer
        style_function=style_fn,
    ).add_to(m)


# Add layer control and fullscreen option
folium.LayerControl().add_to(m)
folium.plugins.Fullscreen().add_to(m)

# Display map in Streamlit
folium_static(m)

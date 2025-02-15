import sys
import time

import pandas as pd
import requests
import json
from datetime import datetime

cutoff = None

def get_isochrone(row):
    """Process a single CSV row to fetch isochrone data"""
    try:
        params = {
            "locations": [{"lat": row["lat"], "lon": row["lng"]}],
            "costing": "auto",
            "contours": [{"time": cutoff, "color": "ff0000"}],
            "polygons": True,
            "show_locations": True,
            "date_time": datetime.now().isoformat()
        }

        time.sleep(1)
        response = requests.post(
            "https://valhalla1.openstreetmap.de/isochrone",
            json=params,
            headers={"Content-Type": "application/json"}
        )
        response.raise_for_status()

        return {
            "type": "FeatureCollection",
            "features": [
                feature for feature in response.json()["features"]
                if feature["geometry"]["type"] == "Polygon"
            ]
        }
    except Exception as e:
        print(f"Error processing row {row.name}: {str(e)}")
        return None


# Configure input/output paths
input_csv = sys.argv[1]
output_geojson = sys.argv[2]
cutoff = int(sys.argv[3])

# Read and process CSV
df = pd.read_csv(input_csv)
results = df.apply(get_isochrone, axis=1)

# Combine valid results
features = []
for result in results:
    if result and "features" in result:
        features.extend(result["features"])

# Save output
with open(output_geojson, "w") as f:
    json.dump({
        "type": "FeatureCollection",
        "features": features
    }, f)

print(f"Saved {len(features)} isochrone features to {output_geojson}")

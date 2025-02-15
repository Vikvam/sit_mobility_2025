function generateColor(index) {
    const goldenRatio = 0.618033988749895;
    const hue = (goldenRatio * index) % 1;
    return `hsl(${Math.floor(hue * 360)}, 70%, 50%)`;
}

let getIsochrone = async ({location: {lat, lng}, time, minutes, routingEngine}) => {
    if (routingEngine === 'OTP') {
        let params = new URLSearchParams();
        params.append("batch", "true");
        params.append("location", `${lat},${lng}`);
        params.append("time", time);
        params.append("modes", "WALK,TRANSIT");
        params.append("cutoff", `${minutes}M`);
        
        let response = await fetch(
            "https://otp.basta.one/otp/traveltime/isochrone?" + params,
            {headers: {Accept: "application/json"}},
        );
        
        if (response.ok) {
            return await response.json();
        } else {
            throw new Error(`${response.status}: ${await response.text()}`);
        }
    }
    else { // Valhalla
        const params = {
            locations: [{ lat: lat, lon: lng }],
            costing: "auto",
            contours: [
                { time: parseInt(minutes), color: "ff0000" }
            ],
            polygons: true,
            show_locations: true,
            date_time: time
        };

        let response = await fetch(
            "https://valhalla1.openstreetmap.de/isochrone",
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(params)
            }
        );
        
        if (response.ok) {
            const data = await response.json();
            console.log(data);
            return {
                type: "FeatureCollection",
                features: data.features.filter(feature => 
                    feature.geometry.type === 'Polygon'
                )
            };
        } else {
            throw new Error(`${response.status}: ${await response.text()}`);
        }
    }
};


let combineGeoJsons = (geoJsons) => {
    let combined = {
        type: "FeatureCollection",
        features: [],
    };
    for (let geoJson of geoJsons) {
        combined.features.push(...geoJson.features);
    }
    return combined;
}

let getUnionOfFeatures = (geojson) => {
    let union = turf.union(geojson);
    return union;
}

let getIntersectionOfFeatures = (geojson) => {
    let intersection = turf.intersect(geojson);
    return intersection;
}

let location = {lat: 49.74747, lng: 13.37759};
let map = L.map("map").setView(location, 13);
let points = [];
let isos = [];
let markers = [];

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

let minutes = document.getElementById("minutes");
let time = document.getElementById("time");
let pointsInput = document.getElementById("points");
let date = new Date();
date.setUTCHours(date.getHours());
time.value = date.toISOString().slice(0, 16);

let getIsochroneLayer = (isochrone, color) => {
    return L.geoJSON(isochrone, {
        color: color,
        // filter: (feature) => {
        //     return feature.geometry.type === 'Polygon' || feature.geometry.type === "MultiPolygon";
        // }
    }).addTo(map);
}

let updateUnionLayer = () => {
    if (unionLayer) { unionLayer.remove(); }
    if (isos.length > 1) {
        let union = getUnionOfFeatures(combineGeoJsons(isos));
        console.log(union);
        console.log(unionLayer);
        unionLayer = L.geoJSON(union, {color: "green"}).addTo(map);
    }
}

let updateIntersectionLayer = () => {
        // if (isos.length > 1) {
        // if (intersectLayer) {
        //         intersectLayer.remove();
        //     }
        //     let intersection = getIntersectionOfFeatures(combineGeoJsons(isos));
        //     intersectLayer = L.geoJSON(intersection, {color: "red"}).addTo(map);
        //
        // }
}

let addPoint = (name, location) => {
    let markerLocation = null;
    const routingEngine = document.querySelector('input[name="routing-engine"]:checked').value;
    let color = generateColor(points.length);
    let point = {name, location, routingEngine, color};
    point.marker = L.marker(point.location, {
        title: point.name,
        alt: point.name,
        draggable: true,
        autoPan: true,
        icon: L.divIcon({
            className: 'custom-marker',
            html: `<div style='background-color: ${point.color}; width: 1em; height: 1em;'></div>`
        })
    })
        .addTo(map)
        .on("move", (event) => (markerLocation = event.latlng))
        .on("moveend", () => {
            point.location = markerLocation;
            updatePointsInput();
            recomputeIsochrones();
        })
        .on("click", () => {
            removePoint(point);
        });
    addIsochrone(point);

    points.push(point);
};
let removePoint = (point) => {
    let index = points.findIndex((p) => p === point);

    point.marker.remove();
    points.splice(index, 1);
    isos.splice(index, 1);
    
    updatePointsInput();
    updateIsochrones();
        
    updateUnionLayer();
    updateIntersectionLayer();
    
};
let addIsochrone = (point) => {
    try {
        getIsochrone({
            location: point.location,
            time: time.value + ":00+01:00",
            minutes: minutes.value,
            routingEngine: point.routingEngine,
        }).then(isochrone => {
            isos.push(isochrone);
            isochroneLayers.push(getIsochroneLayer(isochrone, point.color));
            
            console.log("points", points);
            console.log("isos", isos);
            console.log("isochroneLayers", isochroneLayers);
        })

        updateUnionLayer();
        updateIntersectionLayer();
    } catch (error) {
        console.error(`Failed to add isochrone for point ${point}:`, error);
    }
};


let isochroneLayers = [];
let unionLayer = null;

let recomputeIsochrones = () => {
    Promise.all(points.map((point) => addIsochrone(point))).then(updateIsochrones)
};

let updateIsochrones = () => {
    for (let layer of isochroneLayers) {
        layer.remove();
    }
    isochroneLayers = [];

    // Create new layers from isos
    isochroneLayers = [];
    isos.forEach((isochrone, idx) => {
        console.log(idx);
        let layer = getIsochroneLayer(isochrone, points[idx].color);
        layer.addTo(map);
        isochroneLayers.push(layer);
    });
};
let updatePointsInput = () => {
    pointsInput.value = points
        .map(
            (point) =>
                `${Number(point.location.lat).toFixed(5)},${Number(
                    point.location.lng,
                ).toFixed(5)}${point.name && "," + point.name}`,
        )
        .join("\n");
};
let updatePoints = () => {
    points.forEach((point) => removePoint(point));
    points = [];
    for (let line of pointsInput.value.split("\n")) {
        let match = line.match(/^(\d+\.\d+),(\d+\.\d+)(?:,([^,]+))?$/);
        if (match) {
            let [_, lat, lng, name] = match;
            name = name ?? "";
            addPoint(name, {lat, lng});
        } else {
            console.log("Invalid line: " + line);
            return;
        }
    }
};

minutes.addEventListener("change", recomputeIsochrones);
time.addEventListener("change", recomputeIsochrones);
pointsInput.addEventListener("change", () => {
    updatePoints();
});
map.on("click", (event) => {
    location = event.latlng;
    addPoint("", event.latlng);
    updatePointsInput();
    updateIsochrones();
});

function setupFileInput() {
  const fileInput = document.getElementById('points-file');
  const textarea = document.getElementById('points');

  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      // Basic validation - check if each line has 3 comma-separated values
      const lines = text.trim().split('\n');
      const isValid = lines.every(line => {
        const parts = line.trim().split(',');
        return parts.length >= 2 &&
               !isNaN(parseFloat(parts[0])) &&
               !isNaN(parseFloat(parts[1]));
      });

      if (!isValid) {
          console.log(text);
          throw new Error('Invalid file format. Each line must contain: latitude,longitude,name');
      }

      textarea.value = text.trim();
      fileInput.value = ''; // Reset file input for repeated uploads
    } catch (error) {
      alert(error.message);
      textarea.value = ''; // Clear textarea on error
      fileInput.value = ''; // Reset file input
    }
  });
}
document.addEventListener('DOMContentLoaded', setupFileInput);

updatePoints();

let colorIndex = 0

function generateColor() {
    const goldenRatio = 0.618033988749895;
    const hue = (goldenRatio * colorIndex++) % 1;
    return `hsl(${Math.floor(hue * 360)}, 70%, 50%)`;
}

async function getOTPRoute(otpHost, routerId, from, to, options = {}) {
    // Validate required parameters
    if (!otpHost || !routerId || !from?.lat || !from?.lon || !to?.lat || !to?.lon) {
        throw new Error('Missing required parameters');
    }

    // Build base URL
    const baseUrl = `${otpHost}/otp/routers/${routerId}/plan`;

    // Set default parameters
    const params = new URLSearchParams({
        fromPlace: `${from.lat},${from.lon}`,
        toPlace: `${to.lat},${to.lon}`,
        mode: options.mode || 'TRANSIT,WALK',
        date: options.date || new Date().toISOString().split('T')[0].replace(/-/g, '/'),
        time: options.time || new Date().toLocaleTimeString('en-GB', {hour12: false}),
        arriveBy: options.arriveBy || false,
        ...options.advancedParams
    });

    try {
        const response = await fetch(`${baseUrl}?${params}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('OTP API Error:', error);
        throw error;
    }
}

async function getOSMPlaces(location, category, apiKey, radius = 1000, limit = 20) {
    try {
        const response = await fetch(
            `https://api.geoapify.com/v2/places?categories=${category}&` +
            `filter=circle:${location.lng},${location.lat},${radius}&` +
            `limit=${limit}&apiKey=${apiKey}`
        );

        const data = await response.json();
        return data.features.map(feature => ({
            name: feature.properties.name,
            lat: feature.properties.lat,
            lng: feature.properties.lon
        }));
    } catch (error) {
        console.error("OSM Geoapify Error:", error);
        return [];
    }
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
    } else { // Valhalla
        const params = {
            locations: [{lat: lat, lon: lng}],
            costing: "auto",
            contours: [
                {time: parseInt(minutes), color: "ff0000"}
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

let location = {lat: 50.08804, lng: 14.42076};
if (new URLSearchParams(window.location.search).get("mode") === "shorim") {
  location = {lat: 49.74747, lng: 13.37769};
}
let map = L.map("map").setView(location, 13);
let points = [];
let isos = [];
let markers = [];

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
// L.tileLayer('https://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=dfcd05a9928341be9a178df12210c482', {
//     attribution: 'Maps © <a href="https://www.thunderforest.com">Thunderforest</a>, Data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
// }).addTo(map);


let minutes = document.getElementById("minutes");
let time = document.getElementById("time");
let pointsInput = document.getElementById("points");
const uploadButton = document.getElementById('uploadButton');

let union_en = document.getElementById("union_en");
let intersect_en = document.getElementById("intersect_en");
let individual_en = document.getElementById("individual_en");

let date = new Date();
date.setUTCHours(date.getHours());
time.value = date.toISOString().slice(0, 16);

let getIsochroneLayer = (isochrone, color) => {
    return L.geoJSON(isochrone, {
        color: color,
        filter: (feature) => {
            return individual_en.checked;
        }
    }).addTo(map);
}

let getIsochroneLayerNoFilter = (isochrone, color) => {
    return L.geoJSON(isochrone, {
        color: color,
        filter: (feature) => {
            return true;
        }
    }).addTo(map);
}

let updateUnionLayer = () => {
    if (unionLayer) {
        unionLayer.remove();
    }
    if (isos.length > 1 && union_en.checked) {
        let union = getUnionOfFeatures(combineGeoJsons(isos));
        unionLayer = L.geoJSON(union, {color: "green"}).addTo(map);
    }
}

let updateIntersectionLayer = () => {
    if (intersectLayer) {
        intersectLayer.remove();
    }
    if (isos.length > 1 && intersect_en.checked) {
        let intersection = getIntersectionOfFeatures(combineGeoJsons(isos));
        intersectLayer = L.geoJSON(intersection, {color: "black"}).addTo(map);
    }
}

let addPoint = (name, location) => {
    let markerLocation = null;
    const routingEngine = document.querySelector('input[name="routing-engine"]:checked').value;
    let color = generateColor();
    let point = {name, location, routingEngine, color};
    point.marker = L.marker(point.location, {
        title: point.name,
        alt: point.name,
        draggable: true,
        autoPan: true,
        icon: L.divIcon({
            className: 'custom-marker',
            html: `<div style='background-color: ${point.color}; width: 1em; height: 1em; box-shadow: -5px -5px 10px rgba(0,0,0,0.7);'></div>`
        })
    })
        .addTo(map)
        .on("move", (event) => (markerLocation = event.latlng))
        .on("moveend", () => {
            point.location = markerLocation;
            removePoint(point);
            addPoint(point.name, point.location);
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

            // console.log("points", points);
            // console.log("isos", isos);
            // console.log("isochroneLayers", isochroneLayers);
            updateUnionLayer();
            updateIntersectionLayer();
        })

    } catch (error) {
        console.error(`Failed to add isochrone for point ${point}:`, error);
    }
};


let isochroneLayers = [];
let unionLayer = null;
let intersectLayer = null;

let recomputeIsochrones = () => {
    for (let layer of isochroneLayers) {
        layer.remove();
    }
    isos = [];
    // Promise.all(points.map((point) => addIsochrone(point))).then(updateIsochrones)
    (async () => {
        for (let i = 0; i < points.length; i++) {
            await addIsochrone(points[i]);
        }
        updateIsochrones();
    })();
};

let updateIsochrones = () => {
    for (let layer of isochroneLayers) {
        layer.remove();
    }
    // Create new layers from isos
    isochroneLayers = [];
    isos.forEach((isochrone, idx) => {
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
let updatePoints = async () => {
    points = [];
    for (let line of pointsInput.value.split("\n")) {
        let match = line.match(/^(\d+\.\d+),(\d+\.\d+)(?:,([^,]+))?$/);
        if (match) {
            let [_, lat, lng, name] = match;
            name = name ?? "";
            addPoint(name, {lat, lng});
            console.log(points)
            await new Promise(resolve => setTimeout(resolve, 50));
        } else {
            console.log("Invalid line: " + line);
            return;
        }
    }
};

minutes.addEventListener("change", () => {
    recomputeIsochrones();
});
time.addEventListener("change", () => {
    recomputeIsochrones();
});

union_en.addEventListener("change", () => {
    updateIsochrones();
    updateUnionLayer();
});
intersect_en.addEventListener("change", () => {
    updateIsochrones();
    updateIntersectionLayer();
});
individual_en.addEventListener("change", updateIsochrones);

// pointsInput.addEventListener("change", () => { updatePoints(); });
uploadButton.addEventListener('click', () => {
    updatePoints();
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

// Global object to store markers by category
let categoryMarkers = {};

const addMarkersToMap = (places, category) => {
    // Initialize array for this category if it doesn't exist
    if (!categoryMarkers[category]) {
        categoryMarkers[category] = [];
    }

    // Create markers for each place
    places.forEach(place => {
        const marker = L.marker([place.lat, place.lng]).addTo(map);
        marker.bindPopup(`<b>${place.name || category}</b><br>${place.address || ''}`);
        categoryMarkers[category].push(marker);
    });
};

const removeMarkersFromMap = (category) => {
    if (categoryMarkers[category]) {
        categoryMarkers[category].forEach(marker => marker.remove());
        categoryMarkers[category] = [];
    }
};

document.querySelectorAll('.osm-category').forEach(checkbox => {
    checkbox.addEventListener('change', async (event) => {
        if (event.target.checked) {
            try {
                const category = event.target.value;
                const coordInput = document.getElementById('coordinates').value;
                const [lng, lat] = coordInput.split(',').map(coord => parseFloat(coord.trim()));
                const center = {lat, lng};
                const results = await getOSMPlaces(center, category, "86dafd30d1e54c25b0021d11af1de5da", 10000);
                console.log(`Places for ${category} at ${lng} ${lat}:`, results);
                addMarkersToMap(results, category);
            } catch (error) {
                console.error('Failed to fetch OSM places:', error);
            }
        } else {
            const category = event.target.value;
            removeMarkersFromMap(category);
        }
    });
});



map.on("click", (event) => {
    location = event.latlng;
    addPoint("", event.latlng);
    updatePointsInput();
    updateIsochrones();
});


function plotOTPRoute(otpResponse) {
    const itinerary = otpResponse.plan.itineraries[0];

// Decode polyline geometry
    const routeCoordinates = itinerary.legs.flatMap(leg =>
        polyline.decode(leg.legGeometry.points).map(([lat, lon]) => [lat, lon])
    );

    console.log(itinerary)
// Draw route path
    L.polyline(routeCoordinates, {color: 'blue'}).addTo(map);

// Add start/end markers
    L.marker(routeCoordinates[0]).bindPopup('Start').addTo(map);
    L.marker(routeCoordinates[routeCoordinates.length - 1]).bindPopup('End').addTo(map);

}

async function loadServerGeoJSONs(urls) {
    try {
        return await Promise.all(
            urls.map(async url => {
                const response = await fetch(url);
                if (!response.ok) throw `HTTP error: ${response.status}`;
                return response.json();
            })
        );
    } catch (error) {
        console.error('Load failed:', error);
        return [];
    }
}

// Usage:

function loadHasici() {
    const urls = ['./geojsons/hasici/hasici10.geojson', './geojsons/hasici/hasici20.geojson', './geojsons/hasici/hasici30.geojson'];
    const colors = ['#00FF00', '#FFFF00', '#FF0000']; // Safe, mild danger, burning hot
    loadServerGeoJSONs(urls).then(geoJSONArray => {
        geoJSONArray.reverse().forEach((gj, index) => {
            const color = colors[2-index] || '#FF0000'; // Default to burning hot if out of range
            L.geoJSON(getUnionOfFeatures(gj), {style: {color: color, fillColor: color}}).addTo(map);
        });
    });
}



// updatePoints();

{ // modes
    let setName = (name) => {
        document.querySelector("title").textContent = name;
        document.querySelector("h1").textContent = name;
    }
    let params = new URLSearchParams(window.location.search);
    let mode = params.get("mode");
    document.body.classList.add(mode);
    switch (mode) {
        case "potkej-se":
            setName("Potkej se");
            intersect_en.checked = true;
            union_en.checked = false;
            break;
    case "shorim":
      setName("Shořim?");
      loadHasici()
      document.querySelector('input[value="valhalla"]').checked = true;
      individual_en.checked = false;
      intersect_en.checked = false;
      union_en.checked = true;
      break;
  }
}

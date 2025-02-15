function generateColor(index) {
    const goldenRatio = 0.618033988749895;
    const hue = (goldenRatio * index) % 1;
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

let getIsochrone = async ({location: {lat, lng}, time, minutes}) => {
    let params = new URLSearchParams();
    params.append("batch", "true");
    params.append("location", `${lat},${lng}`);
    params.append("time", time);
    //params.append("modes", "WALK,TRANSIT");
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
let markers = [];


L.tileLayer('https://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=dfcd05a9928341be9a178df12210c482', {
    attribution: 'Maps © <a href="https://www.thunderforest.com">Thunderforest</a>, Data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);


let minutes = document.getElementById("minutes");
let time = document.getElementById("time");
let pointsInput = document.getElementById("points");

let union_en = document.getElementById("union_en");
let intersect_en = document.getElementById("intersect_en");
let individual_en = document.getElementById("individual_en");

let date = new Date();
date.setUTCHours(date.getHours());
time.value = date.toISOString().slice(0, 16);

let addPoint = (name, location) => {
    let markerLocation = null;
    let point = {name, location};
    point.marker = L.marker(point.location, {
        title: point.name,
        alt: point.name,
        draggable: true,
        autoPan: true,
        icon: L.divIcon({
            className: 'custom-marker',
            html: `<div style='background-color: ${generateColor(points.length)}; width: 1em; height: 1em; box-shadow: -5px -5px 10px rgba(0,0,0,0.7);'></div>`
        })
    })
        .addTo(map)
        .on("move", (event) => (markerLocation = event.latlng))
        .on("moveend", () => {
            point.location = markerLocation;
            updatePointsInput();
            updateIsochrone();
        })
        .on("click", () => {
            point.marker.remove();
            points.splice(
                points.findIndex((p) => p === point),
                1,
            );
            updatePointsInput();
            updateIsochrone();
        });
    points.push(point);
};

let isochroneLayers = [];
let unionLayer = null;
let intersectLayer = null;

let updateIsochrone = () => {
    let isos = []
    Promise.all(
        points.map((point) => {
                let iso = getIsochrone({
                    location: point.location,
                    time: time.value + ":00+01:00",
                    minutes: minutes.value,
                })
                return iso;
            },
        ),
    ).then((isochrones) => {
        for (let iso of isochrones) {
            isos.push(iso);
        }
        for (let layer of isochroneLayers) {
            layer.remove();
        }
        if (individual_en.checked) {
            isochroneLayers = isochrones.map((isochrone) => {
                    let layer = L.geoJSON(isochrone, {color: "darkblue"}).addTo(map)
                    return layer;
                },
            );
        }
        if (isos.length > 1) {
            let union = getUnionOfFeatures(combineGeoJsons(isos));
            if (unionLayer) {
                unionLayer.remove();
            }
            if (intersectLayer) {
                intersectLayer.remove();
            }
            if (union_en.checked) {
                unionLayer = L.geoJSON(union, {color: "green"}).addTo(map);
            }
            if (intersect_en.checked) {
                let intersection = getIntersectionOfFeatures(combineGeoJsons(isos));
                intersectLayer = L.geoJSON(intersection, {color: "red"}).addTo(map);
            }

        }
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
    points.forEach((point) => point.marker.remove());
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

minutes.addEventListener("change", updateIsochrone);
time.addEventListener("change", updateIsochrone);
union_en.addEventListener("change", updateIsochrone);
intersect_en.addEventListener("change", updateIsochrone);
individual_en.addEventListener("change", updateIsochrone);
pointsInput.addEventListener("change", () => {
    updatePoints();
    updateIsochrone();
});
map.on("click", (event) => {
    location = event.latlng;
    addPoint("", event.latlng);
    updatePointsInput();
    updateIsochrone();
});
updatePoints();
updateIsochrone();

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
            updatePoints();
            updateIsochrone();
        } catch (error) {
            alert(error.message);
            textarea.value = ''; // Clear textarea on error
            fileInput.value = ''; // Reset file input
        }
    });
}

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

document.addEventListener('DOMContentLoaded', setupFileInput);
// print random route  for prague
getOTPRoute("https://otp.basta.one", "default", {lat: 50.0755, lon: 14.4378}, {
    lat: 50.0874,
    lon: 14.421
}).then(plotOTPRoute);


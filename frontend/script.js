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

let location = {lat: 49.74747, lng: 13.37759};
let map = L.map("map").setView(location, 13);
let points = [];
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

let addPoint = (name, location) => {
    let markerLocation = null;
    let point = {name, location};
    point.marker = L.marker(point.location, {
        title: point.name,
        alt: point.name,
        draggable: true,
        autoPan: true,
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
        isochroneLayers = isochrones.map((isochrone) => {
                let layer = L.geoJSON(isochrone, {}).addTo(map)
                return layer;
            },
        );
        if (isos.length > 1) {
            let union = getUnionOfFeatures(combineGeoJsons(isos));
            console.log(union);
            if (unionLayer) {
                unionLayer.remove();
            }
            unionLayer = L.geoJSON(union, {color: "orange"}).addTo(map);
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

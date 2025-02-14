let getIsochrone = async ({ location: { lat, lng }, time, minutes }) => {
  let params = new URLSearchParams();
  params.append("batch", "true");
  params.append("location", `${lat},${lng}`);
  params.append("time", time);
  //params.append("modes", "WALK,TRANSIT");
  params.append("cutoff", `${minutes}M`);
  let response = await fetch(
    "https://otp.basta.one/otp/traveltime/isochrone?" + params,
    { headers: { Accept: "application/json" } },
  );
  if (response.ok) {
    return await response.json();
  } else {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
};

let location = { lat: 49.74747, lng: 13.37759 };
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

let addPoint = (name, location) => {
  let markerLocation = null;
  let point = { name, location };
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
      updateIsochrone();
    });
  points.push(point);
};

let isochroneLayers = [];
let updateIsochrone = () => {
  Promise.all(
    points.map((point) =>
      getIsochrone({
        location: point.location,
        time: time.value + ":00+01:00",
        minutes: minutes.value,
      }),
    ),
  ).then((isochrones) => {
    for (let layer of isochroneLayers) {
      layer.remove();
    }
    isochroneLayers = isochrones.map((isochrone) =>
      L.geoJSON(isochrone).addTo(map),
    );
  });
};
let updatePointsInput = () => {
  pointsInput.value = points
    .map(
      (point) =>
        `${point.location.lat},${point.location.lng}${
          point.name && "," + point.name
        }`,
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
      addPoint(name, { lat, lng });
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

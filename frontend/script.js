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
let marker = L.marker(location).addTo(map);
marker.addTo(map);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

let minutes = document.getElementById("minutes");
let time = document.getElementById("time");

let isochroneLayer = null;
let updateIsochrone = () => {
  getIsochrone({
    location,
    time: time.value + ":00+01:00",
    minutes: minutes.value,
  }).then((isochrone) => {
    if (isochroneLayer) {
      isochroneLayer.remove();
    }
    isochroneLayer = L.geoJSON(isochrone);
    isochroneLayer.addTo(map);
  });
};

minutes.addEventListener("change", updateIsochrone);
time.addEventListener("change", updateIsochrone);
map.on("click", (event) => {
  location = event.latlng;
  marker.setLatLng(location);
  updateIsochrone();
});
updateIsochrone();

import { createApp } from "./petite-vue.js";

const getIsochrone = async ({ location: [lat, lon], time, minutes }) => {
  let params = new URLSearchParams();
  params.append("batch", "true");
  params.append("location", `${lat},${lon}`);
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

let map = L.map("map").setView([49.74747, 13.37759], 13);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
let isochroneLayer = null;

createApp({
  minutes: "20",
  date: "2025-02-14T12:00",
  async updateIsochrone() {
    let isochrone = await getIsochrone({
      location: [49.74747, 13.37759],
      time: this.date + ":00+01:00",
      minutes: this.minutes,
    });
    if (isochroneLayer) {
      isochroneLayer.remove();
    }
    isochroneLayer = L.geoJSON(isochrone);
    isochroneLayer.addTo(map);
  },
}).mount();

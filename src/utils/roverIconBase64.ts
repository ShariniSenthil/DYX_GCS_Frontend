import { roverVehicleSvgMarkup } from "../components/shared/RoverVehicleIcon";

export function getRoverIconSVG(size: number, rotation: number): string {
  return roverVehicleSvgMarkup(rotation, "#f5c518", size);
}

export function getRoverIconDataURI(size: number, rotation: number): string {
  const svg = getRoverIconSVG(size, rotation);
  const base64 = btoa(svg);
  return `data:image/svg+xml;base64,${base64}`;
}

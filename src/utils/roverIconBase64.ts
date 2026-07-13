// SVG-based rover icon that mimics the original rover-icon.png design
// Shows a yellow rover with 4 wheels and a red heading arrow

export function getRoverIconSVG(size: number, rotation: number): string {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${rotation}deg); will-change: transform; transition: transform 100ms linear;">
      <!-- Wheels (4 corners) -->
      <g id="wheels">
        <!-- Front Left Wheel -->
        <rect x="15" y="15" width="12" height="20" rx="2" fill="#2d2d2d" stroke="#000" stroke-width="1"/>
        <rect x="17" y="17" width="8" height="16" rx="1" fill="#4a4a4a"/>

        <!-- Front Right Wheel -->
        <rect x="73" y="15" width="12" height="20" rx="2" fill="#2d2d2d" stroke="#000" stroke-width="1"/>
        <rect x="75" y="17" width="8" height="16" rx="1" fill="#4a4a4a"/>

        <!-- Back Left Wheel -->
        <rect x="15" y="65" width="12" height="20" rx="2" fill="#2d2d2d" stroke="#000" stroke-width="1"/>
        <rect x="17" y="67" width="8" height="16" rx="1" fill="#4a4a4a"/>

        <!-- Back Right Wheel -->
        <rect x="73" y="65" width="12" height="20" rx="2" fill="#2d2d2d" stroke="#000" stroke-width="1"/>
        <rect x="75" y="67" width="8" height="16" rx="1" fill="#4a4a4a"/>
      </g>

      <!-- Rover Body (Yellow) -->
      <rect x="30" y="25" width="40" height="50" rx="3" fill="#f4d03f" stroke="#d4af37" stroke-width="2"/>

      <!-- Rover Details -->
      <!-- Eyes/Sensors -->
      <rect x="37" y="37" width="10" height="6" rx="1" fill="#5a5a5a"/>
      <rect x="53" y="37" width="10" height="6" rx="1" fill="#5a5a5a"/>

      <!-- Equipment mounts (top and bottom of body) -->
      <rect x="40" y="28" width="5" height="4" fill="#8b7355"/>
      <rect x="55" y="28" width="5" height="4" fill="#8b7355"/>
      <rect x="40" y="68" width="5" height="4" fill="#8b7355"/>
      <rect x="55" y="68" width="5" height="4" fill="#8b7355"/>

      <!-- Heading Arrow (Red) pointing upward -->
      <g id="heading-arrow">
        <line x1="50" y1="25" x2="50" y2="5" stroke="#e74c3c" stroke-width="4" stroke-linecap="round"/>
        <polygon points="50,0 43,10 57,10" fill="#e74c3c"/>
      </g>
    </svg>
  `.trim();
}

// Alternative: Base64 data URI for the rover icon
export function getRoverIconDataURI(size: number, rotation: number): string {
  const svg = getRoverIconSVG(size, rotation);
  const base64 = btoa(svg);
  return `data:image/svg+xml;base64,${base64}`;
}

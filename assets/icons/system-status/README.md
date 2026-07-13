# System Status Icons - PNG Placeholders

This directory contains SVG icon templates for the System Status Panel. You can convert these to PNG format and customize them as needed.

## Icons Included

### Network Icons
- **wifi-full.svg** - Full WiFi signal (4/4 bars)
- **wifi-good.svg** - Good WiFi signal (3/4 bars)
- **wifi-fair.svg** - Fair WiFi signal (2/4 bars)
- **wifi-weak.svg** - Weak WiFi signal (1/4 bars)
- **wifi-off.svg** - No WiFi connection
- **ethernet.svg** - Ethernet/LAN cable connection

### Communication Icons
- **lora.svg** - LoRa radio tower
- **backend.svg** - Backend/API server (concentric circles)

### Battery Icons
- **battery-full.svg** - Full battery (>50%)
- **battery-medium.svg** - Medium battery (20-50%)
- **battery-low.svg** - Low battery (<20%)

## How to Use

1. **Convert SVG to PNG**: Use an online converter or tool like:
   - ImageMagick: `convert icon.svg icon.png`
   - Online: https://cloudconvert.com/svg-to-png

2. **Replace in Component**: Update `SystemStatusPanel.tsx` to use Image component instead of Text:
   ```tsx
   import { Image } from 'react-native';
   
   <Image 
     source={require('../../assets/icons/system-status/wifi-full.png')}
     style={{ width: 18, height: 18, tintColor: systemStatus.networkColor }}
   />
   ```

3. **Customize**: Edit SVG files to match your design preferences
   - Change colors
   - Adjust strokes and fills
   - Modify dimensions

## Current Usage (Text Icons)

Currently using Unicode text icons:
- Network: `🔌` (Ethernet), `⬆↗→↘⚪` (WiFi levels)
- LoRa: `◎`
- Backend: `◉`
- Battery: `⬚`

## Notes

- All SVG icons are 24x24 size (standard for mobile)
- Use `tintColor` prop to apply dynamic coloring (green/red/orange)
- Icons are scalable and resolution-independent

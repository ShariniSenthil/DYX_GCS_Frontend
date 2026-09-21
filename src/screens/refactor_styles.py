import re

with open('src/screens/DashboardScreen.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add Context
code = code.replace("import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';", 
                    "import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';\nconst ThemeContext = React.createContext(false);")

# 2. Refactor styles to useStyles
code = code.replace('const styles = StyleSheet.create({', 'const useStyles = (isLight: boolean) => React.useMemo(() => StyleSheet.create({')

# Find the end of styles
last_bracket = code.rfind('});')
code = code[:last_bracket] + '}), [isLight]);' + code[last_bracket+3:]

# 3. Replace colors inside styles
styles_start = code.find('const useStyles')
styles_end = code.rfind('}), [isLight]);')

styles_block = code[styles_start:styles_end]

styles_block = re.sub(r'(?<!\w)WHITE(?!\w)', "(isLight ? '#111827' : WHITE)", styles_block)
styles_block = styles_block.replace('PATH_PLAN_GLASS.title', "(isLight ? '#111827' : PATH_PLAN_GLASS.title)")
styles_block = styles_block.replace('PATH_PLAN_GLASS.muted', "(isLight ? '#64748B' : PATH_PLAN_GLASS.muted)")
styles_block = styles_block.replace('PATH_PLAN_GLASS.panelBg', "(isLight ? 'rgba(255,255,255,0.85)' : PATH_PLAN_GLASS.panelBg)")
styles_block = styles_block.replace('PATH_PLAN_GLASS.innerBg', "(isLight ? 'rgba(0,0,0,0.05)' : PATH_PLAN_GLASS.innerBg)")
styles_block = styles_block.replace('PATH_PLAN_GLASS.borderSubtle', "(isLight ? 'rgba(0,0,0,0.05)' : PATH_PLAN_GLASS.borderSubtle)")
styles_block = styles_block.replace('PATH_PLAN_GLASS.border', "(isLight ? 'rgba(0,0,0,0.15)' : PATH_PLAN_GLASS.border)")
styles_block = styles_block.replace("'rgba(0,0,0,0.25)'", "(isLight ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.25)')")
styles_block = styles_block.replace("'rgba(255,255,255,0.3)'", "(isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)')")
styles_block = styles_block.replace("'rgba(255,255,255,0.7)'", "(isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)')")
styles_block = styles_block.replace("'rgba(255,255,255,0.5)'", "(isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)')")
styles_block = styles_block.replace("'rgba(255,255,255,0.16)'", "(isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.16)')")


code = code[:styles_start] + styles_block + code[styles_end:]

# 4. Inject useStyles and Context into DashboardScreen and all sub-components
components = ['DashboardScreen', 'GradeDot', 'GradeBadge', 'StatusTile', 'HeadingTape', 'RingMeter', 'SparkTrack', 'InstCard']

for comp in components:
    if comp == 'DashboardScreen':
        code = code.replace("export function DashboardScreen() {", 
                            "export function DashboardScreen() {\n  const [isLightMode, setIsLightMode] = React.useState(false);\n  const styles = useStyles(isLightMode);")
    else:
        # e.g., const GradeDot = React.memo(({ grade, size = 7 }: { grade: Grade; size?: number }) => (
        # We need to change => ( to => { ... return ( ... ) } if it's implicitly returning
        # But wait, we can just do a regex!
        
        # Simpler: just find the component definition block and inject.
        pass

with open('src/screens/DashboardScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

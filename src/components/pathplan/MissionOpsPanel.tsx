import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert, TextInput } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { PathPlanWaypoint } from '../../types/pathplan';
import { DashConfigDialog } from './DashConfigDialog';
import { useRover } from '../../context/RoverContext';
import { setMissionMode as setBackendMissionMode } from '../../services/missionModeService';

type Props = {
    waypoints: PathPlanWaypoint[];
    /** optional rover position supplied by the parent screen */
    roverPosition?: { lat: number; lon: number; alt?: number } | null;
    onUpdateWaypoints?: (waypoints: PathPlanWaypoint[]) => void;
    onLoadMission?: () => void;
    isFullScreen?: boolean;
    onToggleFullScreen?: () => void;
    isDeleteMode?: boolean;
    selectedForDelete?: number[];
    onToggleDeleteMode?: () => void;
    onToggleSelectAll?: () => void;
    onBulkDelete?: () => void;
    /**
     * Called when the component generates an export. Mobile hosts should save/share the content.
     * signature: (format, content, filename)
     */
    onExportMission?: (format: string, content: string, filename?: string) => void;
    /**
     * Called to request upload (host should open a native file picker and then call onUpdateWaypoints)
     */
    onRequestUpload?: () => void;
    /**
     * Called when user selects Manual Control mode to open fullscreen control UI
     */
    onManualControlOpen?: () => void;
    /** Injected by DraggableCard (handleType="custom") — gesture object for the header drag handle */
    dragGesture?: any;
    /** True while the card is being dragged — injected by DraggableCard */
    isDraggingActive?: boolean;
    onClose?: () => void;
};

const MissionOpsPanel = React.memo(({
    waypoints,
    roverPosition = null,
    onUpdateWaypoints,
    onLoadMission,
    isFullScreen,
    onToggleFullScreen,
    isDeleteMode = false,
    selectedForDelete = [],
    onToggleDeleteMode = () => { },
    onToggleSelectAll = () => { },
    onBulkDelete = () => { },
    onExportMission,
    onRequestUpload,
    onManualControlOpen,
    dragGesture,
    isDraggingActive,
    onClose,
}: Props) => {
    const { missionMode, setMissionMode } = useRover();
    const [showExportDialog, setShowExportDialog] = useState(false);
    const [selectedExportFormat, setSelectedExportFormat] = useState<'qgc' | 'csv' | 'dxf'>('qgc');
    const [showFilenameDialog, setShowFilenameDialog] = useState(false);
    const [exportFilename, setExportFilename] = useState('mission');
    const [pendingExportFormat, setPendingExportFormat] = useState<'qgc' | 'csv' | 'dxf'>('qgc');

    // Dash mode configuration
    const [dashDistance, setDashDistance] = useState(5.0);
    const [dashGap, setDashGap] = useState(3.0);
    const [showDashConfigDialog, setShowDashConfigDialog] = useState(false);

    // Check if manual control mode is active
    const isManualControlMode = missionMode === 'Manual Control';

    // Export generators (adapted for PathPlanWaypoint: uses `lon` field)
    const toQGCWPL110 = (wps: PathPlanWaypoint[]): string => {
        let fileContent = 'QGC WPL 110\n';
        if (wps.length > 0) {
            const homeLat = Number(wps[0].lat).toFixed(7);
            const homeLon = Number(wps[0].lon).toFixed(7);
            fileContent += `0\t1\t0\t16\t0\t0\t0\t0\t${homeLat}\t${homeLon}\t0\t1\n`;
        }

        wps.forEach((wp, index) => {
            const frame = 3;
            const commandId = 16; // default WAYPOINT
            const current = index === 0 ? 1 : 0;
            const autocont = 1;

            const line = [
                index + 1,
                current,
                frame,
                commandId,
                0,
                0,
                0,
                0,
                Number(wp.lat).toFixed(7),
                Number(wp.lon).toFixed(7),
                wp.alt,
                autocont,
            ].join('\t');

            fileContent += line + '\n';
        });

        return fileContent;
    };

    const generateCSV = (wps: PathPlanWaypoint[]) => {
        const headers = ['Index', 'Latitude', 'Longitude', 'Altitude'];
        const rows = wps.map((wp, idx) => [idx + 1, wp.lat.toFixed(7), wp.lon.toFixed(7), wp.alt.toFixed(2)]);
        return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    };

    const generateDXF = (wps: PathPlanWaypoint[]) => {
        const header = `  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1015\n  9\n$INSUNITS\n  70\n6\n  0\nENDSEC\n  0\nSECTION\n  2\nTABLES\n`;
        const points = wps
            .map((wp) => {
                const x = wp.lon * 111320;
                const y = wp.lat * 110540;
                const z = wp.alt;
                return `  0\nPOINT\n  8\nWAYPOINTS\n  10\n${x.toFixed(3)}\n  20\n${y.toFixed(3)}\n  30\n${z.toFixed(3)}\n  62\n1\n`;
            })
            .join('');
        const footer = `  0\nENDSEC\n  0\nEOF\n`;
        return header + points + footer;
    };

    const handleUpload = () => {
        // Host should open native picker and call onUpdateWaypoints after parsing
        try {
            console.log('[MissionOpsPanel] Upload button pressed, calling onRequestUpload');
        } catch (e) { }
        onRequestUpload?.();
    };

    const handleExportClick = () => {
        if (waypoints.length === 0) {
            Alert.alert('No mission to export.');
            return;
        }
        setShowExportDialog(true);
    };

    const handleFormatSelected = (format: typeof selectedExportFormat) => {
        setPendingExportFormat(format);
        setExportFilename('mission');
        setShowExportDialog(false);
        setShowFilenameDialog(true);
    };

    const handleFilenameConfirm = () => {
        if (!exportFilename.trim()) {
            Alert.alert('Invalid Filename', 'Please enter a filename.');
            return;
        }
        setShowFilenameDialog(false);
        confirmExport(pendingExportFormat, exportFilename.trim());
    };

    const confirmExport = (format: typeof selectedExportFormat, customFilename?: string) => {
        setShowExportDialog(false);
        let content = '';
        let filename = customFilename || 'mission.txt';
        
        switch (format) {
            case 'qgc':
                content = toQGCWPL110(waypoints);
                filename = customFilename ? `${customFilename}.waypoints` : 'mission.waypoints';
                break;
            case 'csv':
                content = generateCSV(waypoints);
                filename = customFilename ? `${customFilename}.csv` : 'mission.csv';
                break;
            case 'dxf':
                content = generateDXF(waypoints);
                filename = customFilename ? `${customFilename}.dxf` : 'mission.dxf';
                break;
        }

        if (onExportMission) {
            onExportMission(format, content, filename);
        } else {
            // Fallback: log to console if handler not provided
            console.log('[MissionOpsPanel] Export handler not provided');
            console.log('Export content sample:\n', content.slice(0, 500));
            Alert.alert('Export Ready', `Mission data (${format.toUpperCase()}) generated but export handler not configured.`);
        }
    };

    const handleLoadMission = async () => {
        console.log('[MissionOpsPanel] 🚀 Load Mission button clicked');
        console.log('[MissionOpsPanel] Waypoints count:', waypoints.length);
        console.log('[MissionOpsPanel] Current mission mode:', missionMode);

        if (waypoints.length === 0) {
            console.log('[MissionOpsPanel] ❌ No waypoints to load');
            Alert.alert('No Data', 'No marking points to load');
            return;
        }

        // Load Mission uploads waypoint data only. Backend execution mode is set
        // separately through the explicit mode selection flow.
        console.log('[MissionOpsPanel] Showing load mission confirmation');
        Alert.alert('Load Mission', `Load mission with ${waypoints.length} marking points?\n\nCurrent selected mode: ${missionMode}\nBackend mode will not be changed by this action.`, [
            { text: 'Cancel', style: 'cancel', onPress: () => console.log('[MissionOpsPanel] User cancelled load') },
            {
                text: 'Load',
                onPress: () => {
                    console.log('[MissionOpsPanel] User confirmed load, calling onLoadMission...');
                    onLoadMission?.();
                }
            },
        ]);
        return;

        /*
        // Map frontend mode to backend mode
        let backendMode: 'auto' | 'continuous' | 'dash' = 'auto';
        let modeConfig = {};

        if (missionMode === 'Continuous') {
            backendMode = 'continuous';
        } else if (missionMode === 'Dash') {
            backendMode = 'dash';
            modeConfig = {
                dash_servo_on_time: dashDistance,
                dash_servo_off_time: dashGap,
            };
        }

        console.log('[MissionOpsPanel] Backend mode:', backendMode);
        console.log('[MissionOpsPanel] Mode config:', modeConfig);

        // First, set the mission mode on backend
        try {
            console.log('[MissionOpsPanel] 📡 Setting mission mode on backend...');
            const modeResult = await setBackendMissionMode({ mode: backendMode, ...modeConfig });
            console.log('[MissionOpsPanel] Mode result:', modeResult);

            if (!modeResult.success) {
                console.log('[MissionOpsPanel] ⚠️ Failed to set mission mode:', modeResult.error);
                // Continue anyway - the mode might be set later
            } else {
                console.log('[MissionOpsPanel] ✅ Mission mode set to:', backendMode, modeConfig);
            }
        } catch (error) {
            console.log('[MissionOpsPanel] ❌ Error setting mission mode:', error);
            console.log('[MissionOpsPanel] Error details:', {
                message: (error as any)?.message,
                code: (error as any)?.code,
                stack: (error as any)?.stack,
            });
            // Continue anyway
        }

        // Then load the mission
        console.log('[MissionOpsPanel] 📋 Showing confirmation alert...');
        Alert.alert('Load Mission', `Load mission with ${waypoints.length} marking points in ${missionMode} mode?`, [
            { text: 'Cancel', style: 'cancel', onPress: () => console.log('[MissionOpsPanel] User cancelled load') },
            {
                text: 'Load',
                onPress: () => {
                    console.log('[MissionOpsPanel] ✅ User confirmed load, calling onLoadMission...');
                    onLoadMission?.();
                }
            },
        ]);
        */
    };

    const lastWaypoint = waypoints.length ? waypoints[waypoints.length - 1] : null;

    // Handle exit from manual control mode
    const handleExitManualMode = () => {
        setMissionMode('DGPS Mark');
    };

    const handleDashConfigConfirm = async (onTime: number, offTime: number) => {
        setDashDistance(onTime);
        setDashGap(offTime);
        setShowDashConfigDialog(false);
        console.log('[MissionOpsPanel] Dash config set:', { onTime, offTime });

        // Call backend API with dash configuration
        try {
            const result = await setBackendMissionMode({
                mode: 'dash',
                dash_servo_on_time: onTime,
                dash_servo_off_time: offTime,
            });
            if (result.success) {
                console.log('[MissionOpsPanel] Dash mode set successfully');
            } else {
                console.error('[MissionOpsPanel] Failed to set dash mode:', result.error);
            }
        } catch (error) {
            console.error('[MissionOpsPanel] Error calling setMissionMode for dash:', error);
        }
    };

    const handleDashConfigCancel = () => {
        // Revert to DGPS Mark mode if user cancels Dash config
        setMissionMode('DGPS Mark');
        setShowDashConfigDialog(false);
    };

    return (
        <View style={styles.container}>
            {/* Header — also the drag handle for the floating card */}
            <GestureDetector gesture={dragGesture}>
                <View style={[styles.header, isDraggingActive && styles.headerDragging]}>
                    <View style={styles.headerLeft}>
                        <View style={styles.headerIconWrap}>
                            <Ionicons name="navigate" size={16} color={colors.accent} />
                        </View>
                        <Text style={styles.headerTitle}>MISSION OPS</Text>
                    </View>
                    <View style={styles.headerRight}>
                        <View style={styles.headerBadge}>
                            <View style={[styles.headerBadgeDot, { backgroundColor: waypoints.length > 0 ? '#4ade80' : 'rgba(255,255,255,0.3)' }]} />
                            <Text style={[styles.headerBadgeText, { color: waypoints.length > 0 ? '#4ade80' : 'rgba(255,255,255,0.3)' }]}>
                                {waypoints.length > 0 ? 'ACTIVE' : 'IDLE'}
                            </Text>
                        </View>
                        {onClose && (
                            <TouchableOpacity style={styles.headerCloseBtn} onPress={onClose} activeOpacity={0.7}>
                                <MaterialCommunityIcons name="close" size={14} color="#94A3B8" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </GestureDetector>

            {/* Action Buttons */}
            <View style={styles.buttonsRow}>
                <TouchableOpacity style={[styles.button, styles.uploadBtn]} onPress={onRequestUpload} activeOpacity={0.75}>
                    <MaterialCommunityIcons name="upload" size={20} color="#10B981" />
                    <Text style={[styles.buttonText, { color: '#10B981' }]}>Upload</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.button, waypoints.length ? styles.exportBtn : styles.disabledBtn]}
                    onPress={handleExportClick}
                    disabled={!waypoints.length}
                    activeOpacity={0.75}
                >
                    <MaterialCommunityIcons name="download" size={20} color={waypoints.length ? '#3B82F6' : 'rgba(255,255,255,0.2)'} />
                    <Text style={[styles.buttonText, { color: waypoints.length ? '#3B82F6' : 'rgba(255,255,255,0.2)' }]}>Export</Text>
                </TouchableOpacity>
            </View>

            {/* Load Mission Button */}
            <TouchableOpacity
                style={[styles.loadButton, waypoints.length ? styles.loadActive : styles.disabledBtn]}
                onPress={handleLoadMission}
                activeOpacity={0.8}
                disabled={waypoints.length === 0}
            >
                <MaterialCommunityIcons name="folder-open" size={20} color="#fff" />
                <Text style={styles.loadText}>Load Mission</Text>
                <View style={styles.loadCountBadge}>
                    <Text style={styles.loadCountText}>{waypoints.length}</Text>
                </View>
            </TouchableOpacity>

            {/* Dash Mode Config Dialog */}
            <DashConfigDialog
                visible={showDashConfigDialog}
                initialDistance={dashDistance}
                initialGap={dashGap}
                onConfirm={handleDashConfigConfirm}
                onCancel={handleDashConfigCancel}
            />

            {/* Export modal */}
            <Modal visible={showExportDialog} transparent animationType="fade" onRequestClose={() => setShowExportDialog(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select Export Format</Text>

                        <TouchableOpacity style={styles.formatBtn} onPress={() => handleFormatSelected('qgc')}>
                            <Text style={styles.formatText}>QGC Marking Points (.waypoints)</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.formatBtn} onPress={() => handleFormatSelected('csv')}>
                            <Text style={styles.formatText}>CSV (.csv)</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.formatBtn} onPress={() => handleFormatSelected('dxf')}>
                            <Text style={styles.formatText}>DXF (.dxf)</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.formatBtn, styles.cancelBtn]} onPress={() => setShowExportDialog(false)}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Filename input modal */}
            <Modal visible={showFilenameDialog} transparent animationType="fade" onRequestClose={() => setShowFilenameDialog(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Enter Filename</Text>
                        <Text style={styles.filenameHint}>
                            {pendingExportFormat === 'qgc' && 'Format: QGC Marking Points (.waypoints)'}
                            {pendingExportFormat === 'csv' && 'Format: CSV (.csv)'}
                            {pendingExportFormat === 'dxf' && 'Format: DXF (.dxf)'}
                        </Text>
                        <TextInput
                            style={styles.filenameInput}
                            placeholder="Enter filename"
                            placeholderTextColor="#888"
                            value={exportFilename}
                            onChangeText={setExportFilename}
                            maxLength={50}
                        />
                        <View style={styles.filenameButtonsRow}>
                            <TouchableOpacity style={[styles.formatBtn, styles.confirmBtn]} onPress={handleFilenameConfirm}>
                                <Text style={styles.formatText}>Export</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.formatBtn, styles.cancelBtn]} onPress={() => setShowFilenameDialog(false)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#07111be6',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(103, 232, 249, 0.15)',
        padding: 16,
        gap: 14,
    },

    // ── HEADER ──
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(103, 232, 249, 0.1)',
    },
    headerDragging: {
        borderBottomColor: 'rgba(103, 232, 249, 0.4)',
        backgroundColor: 'rgba(103, 232, 249, 0.04)',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerCloseBtn: {
        width: 20,
        height: 20,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.03)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerIconWrap: {
        width: 24,
        height: 24,
        borderRadius: 6,
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        color: '#E5F1FF',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 2,
    },
    headerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    headerBadgeDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    headerBadgeText: {
        fontSize: 7,
        fontWeight: '700',
        letterSpacing: 1,
    },

    // ── ACTION BUTTONS ──
    buttonsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    button: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 20,
        borderRadius: 8,
        borderWidth: 1,
        backgroundColor: '#08101a',
    },
    uploadBtn: {
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    exportBtn: {
        borderColor: 'rgba(59, 130, 246, 0.3)',
    },
    disabledBtn: {
        opacity: 0.35,
        backgroundColor: '#050c14',
        borderColor: 'rgba(255,255,255,0.05)',
    },
    buttonText: {
        fontWeight: '600',
        fontSize: 13,
    },

    // ── LOAD MISSION ──
    loadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 8,
        borderWidth: 1,
        height: 64,
    },
    loadActive: {
        backgroundColor: colors.blueBtn,
        borderColor: 'rgba(103, 232, 249, 0.3)',
    },
    loadText: {
        color: '#ffffff',
        fontWeight: '700',
        fontSize: 14,
        letterSpacing: 0.5,
    },
    loadCountBadge: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    loadCountText: {
        color: '#ffffff',
        fontSize: 10,
        fontWeight: '700',
        fontVariant: ['tabular-nums'] as any,
    },

    // ── MODALS ──
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: colors.panelBg,
        borderRadius: 14,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        borderWidth: 1,
        borderColor: colors.border,
    },
    modalTitle: {
        color: '#ffffff',
        fontSize: 17,
        fontWeight: '700',
        marginBottom: 16,
        textAlign: 'center',
    },
    formatBtn: {
        backgroundColor: colors.cardBg,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 10,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
    },
    formatText: {
        color: '#ffffff',
        fontWeight: '600',
        fontSize: 13,
    },
    filenameInput: {
        backgroundColor: colors.secondary,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: '#ffffff',
        marginBottom: 14,
        fontSize: 14,
    },
    filenameHint: {
        color: colors.textSecondary,
        fontSize: 12,
        marginBottom: 10,
        fontStyle: 'italic',
    },
    filenameButtonsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    confirmBtn: {
        flex: 1,
        backgroundColor: '#10b981',
    },
    cancelBtn: {
        backgroundColor: colors.cardBg,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    cancelBtnText: {
        color: '#ffffff',
        fontWeight: '700',
        fontSize: 13,
    },
});

export default MissionOpsPanel;

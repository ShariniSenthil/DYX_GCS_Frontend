import React, { useState, useCallback } from 'react';
import { Modal, Alert } from 'react-native';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { PathPlanWaypoint } from '../../types/pathplan';
import { RowAssignmentDialog, BlockAssignmentDialog, PileAssignmentDialog, RowBlockPileButtons } from './RowBlockPileDialogs';
import { EditWaypointDialog } from './EditWaypointDialog';
import { DraggableWaypointsTable } from './DraggableWaypointsTable';
import { recalculateWaypointDistances, vincentyDistance } from '../../utils/missionCalculator';
import CheckBox from '@react-native-community/checkbox';
import * as FileSystem from 'expo-file-system';
import { Paths } from 'expo-file-system';

interface Props {
    waypoints: PathPlanWaypoint[];
    selectedWaypoint?: number | null;
    onSelectWaypoint?: (id: number) => void;
    onDeleteWaypoint?: (id: number) => void;
    onUpdateWaypoints?: (waypoints: PathPlanWaypoint[]) => void;
    onToggleMark?: (id: number, mark: boolean) => void;
    globalServoEnabled?: boolean;
    missionName?: string;
    onMissionNameChange?: (name: string) => void;
    missionMode?: string;
    roverPosition?: { lat: number; lon: number } | null;
}

export const PathSequenceSidebar = React.memo(({
    waypoints,
    selectedWaypoint,
    onSelectWaypoint,
    onDeleteWaypoint,
    onUpdateWaypoints,
    onToggleMark,
    globalServoEnabled = true,
    missionName = 'DRAWN MISSION - 4:15:34',
    onMissionNameChange,
    missionMode,
    roverPosition,
}: Props) => {
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState(missionName);
    const [isFullScreenTable, setIsFullScreenTable] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false); // Toggle between fast scroll and drag-to-reorder
    // Unicode icons: ↗ (arrow out), ↩ (arrow in)

    // Check if mark section should be hidden
    const isMarkHidden = missionMode?.toLowerCase() === 'continuous' || missionMode?.toLowerCase() === 'dash';

    // Dialog states
    const [showRowDialog, setShowRowDialog] = useState(false);
    const [showBlockDialog, setShowBlockDialog] = useState(false);
    const [showPileDialog, setShowPileDialog] = useState(false);

    // Edit Dialog State
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [editingWaypoint, setEditingWaypoint] = useState<PathPlanWaypoint | null>(null);

    // Bulk delete mode
    const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
    const [selectedWaypoints, setSelectedWaypoints] = useState<number[]>([]);

    const handleSaveName = () => {
        if (onMissionNameChange) {
            onMissionNameChange(editedName);
        }
        setIsEditingName(false);
    };

    // Calculate distance from previous waypoint (or rover for the first waypoint)
    const getDistance = (index: number): string => {
        if (index === 0 && roverPosition && waypoints.length > 0) {
            const wp = waypoints[0];
            const dist = vincentyDistance(
                { lat: roverPosition.lat, lon: roverPosition.lon },
                { lat: wp.lat, lon: wp.lon }
            );
            return `${dist.toFixed(1)}m`;
        }
        if (index === 0) return '0.0m';
        const wp = waypoints[index];
        return wp.distance ? `${wp.distance.toFixed(1)}m` : '0.0m';
    };

    const handleRowSave = (row: string, startSeq: number, endSeq: number) => {
        const updated = waypoints.map((wp, index) => {
            const seq = index + 1;
            if (seq >= startSeq && seq <= endSeq) {
                return { ...wp, row };
            }
            return wp;
        });
        onUpdateWaypoints?.(updated);
        setShowRowDialog(false);
    };

    const handleBlockSave = (block: string, startSeq: number, endSeq: number) => {
        const updated = waypoints.map((wp, index) => {
            const seq = index + 1;
            if (seq >= startSeq && seq <= endSeq) {
                return { ...wp, block };
            }
            return wp;
        });
        onUpdateWaypoints?.(updated);
        setShowBlockDialog(false);
    };

    const handlePileSave = (autoGenerate: boolean, prefix: string) => {
        const updated = waypoints.map((wp, index) => {
            const pile = autoGenerate ? `${index + 1}` : `${prefix}${index + 1}`;
            return { ...wp, pile };
        });
        onUpdateWaypoints?.(updated);
        setShowPileDialog(false);
    };

    const handleEditWaypoint = (wp: PathPlanWaypoint) => {
        setEditingWaypoint(wp);
        setShowEditDialog(true);
    };

    const handleSaveWaypoint = (updatedWp: PathPlanWaypoint) => {
        const updated = waypoints.map(wp => wp.id === updatedWp.id ? updatedWp : wp);
        onUpdateWaypoints?.(updated);
        setShowEditDialog(false);
        setEditingWaypoint(null);
    };

    const handleReverseWaypoints = () => {
        const reversed = [...waypoints].reverse().map((wp, index) => ({
            ...wp,
            id: index + 1,
        }));

        onUpdateWaypoints?.(recalculateWaypointDistances(reversed));
    };

    const toggleBulkDeleteMode = () => {
        setBulkDeleteMode(!bulkDeleteMode);
        setSelectedWaypoints([]); // Clear selections when toggling mode
    };

    const handleWaypointSelect = (id: number) => {
        setSelectedWaypoints(prev =>
            prev.includes(id) ? prev.filter(wpId => wpId !== id) : [...prev, id]
        );
    };

    const handleBulkDelete = () => {
        if (onDeleteWaypoint) {
            selectedWaypoints.forEach(id => onDeleteWaypoint(id));
        }
        setBulkDeleteMode(false);
        setSelectedWaypoints([]);
    };

    const handleDistanceChange = (id: number, newDistance: number) => {
        const updatedWaypoints = waypoints.map(wp =>
            wp.id === id ? { ...wp, distance: newDistance } : wp
        );
        onUpdateWaypoints?.(updatedWaypoints);
    };

    const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
        if (!onUpdateWaypoints) return;

        try {
            const reordered = [...waypoints];
            const [removed] = reordered.splice(fromIndex, 1);
            reordered.splice(toIndex, 0, removed);

            const updated = recalculateWaypointDistances(reordered);
            onUpdateWaypoints(updated);

            console.log(`Waypoint moved: ${fromIndex + 1} → ${toIndex + 1}`);
        } catch (error) {
            console.error('Reorder failed:', error);
            Alert.alert('Error', 'Failed to reorder waypoints');
        }
    }, [waypoints, onUpdateWaypoints]);

    const handleExportWaypoints = async (format: 'json' | 'csv' | 'kml') => {
        let content = '';
        if (format === 'json') {
            content = JSON.stringify(waypoints, null, 2);
        } else if (format === 'csv') {
            content = 'id,lat,lon,alt,row,block,pile,distance\n';
            content += waypoints.map(wp => `${wp.id},${wp.lat},${wp.lon},${wp.alt},${wp.row || ''},${wp.block || ''},${wp.pile || ''},${wp.distance || ''}`).join('\n');
        } else if (format === 'kml') {
            content = '<?xml version="1.0" encoding="UTF-8"?>\n';
            content += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
            content += '<Document>\n';
            waypoints.forEach(wp => {
                content += `<Placemark><name>Waypoint ${wp.id}</name><Point><coordinates>${wp.lon},${wp.lat},${wp.alt}</coordinates></Point></Placemark>\n`;
            });
            content += '</Document>\n';
            content += '</kml>';
        }

        const fileUri = `${Paths.document}/waypoints.${format}`;
        await FileSystem.writeAsStringAsync(fileUri, content);
        alert(`Waypoints exported as ${format.toUpperCase()}! File saved to: ${fileUri}`);
    };

    return (
        <View style={styles.container}>
            {/* Mission Header */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View style={styles.headerLeft}>
                        {isEditingName ? (
                            <View style={styles.editContainer}>
                                <TextInput
                                    style={styles.nameInput}
                                    value={editedName}
                                    onChangeText={setEditedName}
                                    onBlur={handleSaveName}
                                    onSubmitEditing={handleSaveName}
                                    autoFocus
                                    selectTextOnFocus
                                />
                            </View>
                        ) : (
                            <TouchableOpacity onPress={() => setIsEditingName(true)} style={styles.nameContainer}>
                                <View style={styles.headerIconWrap}>
                                    <Ionicons name="list" size={16} color={colors.accent} />
                                </View>
                                <View>
                                    <Text style={styles.missionName} numberOfLines={1}>{missionName}</Text>
                                    <Text style={styles.editHint}>Tap to edit</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    </View>
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            onPress={() => {
                                if (waypoints.length === 0) return;
                                if (onUpdateWaypoints) {
                                    Alert.alert(
                                        'Delete All Marking Points',
                                        `Are you sure you want to delete all ${waypoints.length} marking points? This action cannot be undone.`,
                                        [
                                            { text: 'Cancel', style: 'cancel' },
                                            { text: 'Delete All', style: 'destructive', onPress: () => onUpdateWaypoints([]) }
                                        ]
                                    );
                                }
                            }}
                            disabled={waypoints.length === 0}
                            style={[styles.headerBtn, styles.deleteAllBtn, waypoints.length === 0 && { opacity: 0.4 }]}
                        >
                            <MaterialCommunityIcons name="delete-outline" size={18} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setIsFullScreenTable(true)} style={[styles.headerBtn, styles.expandBtn]}>
                            <MaterialCommunityIcons name="arrow-expand" size={18} color="#222" />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>


            {/* Waypoints List */}
            {/* Table Header — fixed above virtualized list */}
            <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderText, { flex: 0.4 }]}>Seq</Text>
                <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>Latitude</Text>
                <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>Longitude</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.6 }]}>Dist</Text>
                {!isMarkHidden && <Text style={[styles.tableHeaderText, { flex: 0.4 }]}>Mark</Text>}
                <Text style={[styles.tableHeaderText, { flex: 0.5 }]}>Action</Text>
            </View>
            <FlatList
                data={waypoints}
                renderItem={({ item: wp, index }) => (
                    <TouchableOpacity
                        key={`${wp.id}-${index}`}
                        style={[
                            styles.waypointItem,
                            selectedWaypoint === wp.id && styles.waypointItemSelected,
                        ]}
                        onPress={() => onSelectWaypoint?.(wp.id)}
                    >
                        <Text style={[styles.waypointCell, { flex: 0.4, fontWeight: 'bold' }]}>{index + 1}</Text>
                        <Text style={[styles.waypointCell, { flex: 1.2, fontFamily: 'monospace', fontSize: 10 }]}>{wp.lat?.toFixed(7) ?? '0.0000000'}</Text>
                        <Text style={[styles.waypointCell, { flex: 1.2, fontFamily: 'monospace', fontSize: 10 }]}>{wp.lon?.toFixed(7) ?? '0.0000000'}</Text>
                        <Text style={[styles.waypointCell, { flex: 0.6 }]}>{getDistance(index)}</Text>

                        {/* Mark Checkbox */}
                        {!isMarkHidden && (
                            <TouchableOpacity
                                style={{ flex: 0.4, alignItems: 'center' }}
                                onPress={() => {
                                    const effective = wp.mark !== undefined ? wp.mark : globalServoEnabled;
                                    onToggleMark?.(wp.id, !effective);
                                }}
                            >
                                <Text style={{ fontSize: 16 }}>{(wp.mark !== undefined ? wp.mark : globalServoEnabled) ? '✅' : '⬜'}</Text>
                            </TouchableOpacity>
                        )}

                        {/* Action Buttons */}
                        <View style={{ flex: 0.5, alignItems: 'center' }}>
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => onDeleteWaypoint?.(wp.id)}
                            >
                                <MaterialCommunityIcons name="delete-outline" size={18} color={colors.danger} />
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                )}
                keyExtractor={(wp, index) => `${wp.id}-${index}`}
                initialNumToRender={15}
                maxToRenderPerBatch={20}
                windowSize={5}
                getItemLayout={(_, index) => ({ length: 48, offset: 48 * index, index })}
                style={styles.waypointsList}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No marking points yet</Text>
                        <Text style={styles.emptyHint}>Tap on map to add</Text>
                    </View>
                }
                extraData={selectedWaypoint}
            />

            {/* Footer */}
            <View style={styles.footer}>
                <View style={styles.footerInner}>
                    <Ionicons name="location" size={12} color="rgba(103, 232, 249, 0.7)" />
                    <Text style={styles.footerText}>Total: {waypoints.length} marking points</Text>
                </View>
            </View>

            {/* Full Screen Modal for Waypoint Table */}
            <Modal visible={isFullScreenTable} animationType="slide" transparent={false}>
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <View style={styles.fsContainer}>
                        {/* Modal Header */}
                        <View style={styles.fsHeader}>
                            <View style={styles.fsHeaderLeft}>
                                <View style={styles.fsHeaderIconWrap}>
                                    <Ionicons name="list" size={20} color={colors.accent} />
                                </View>
                                <View>
                                    <Text style={styles.fsHeaderTitle}>MARKING POINTS TABLE</Text>
                                    <Text style={styles.fsHeaderSub}>{waypoints.length} waypoints loaded</Text>
                                </View>
                            </View>
                            <View style={styles.fsHeaderActions}>
                                <TouchableOpacity
                                    onPress={handleReverseWaypoints}
                                    disabled={waypoints.length < 2}
                                    style={[styles.fsActionBtn, styles.fsReverseBtn, waypoints.length < 2 && { opacity: 0.4 }]}
                                >
                                    <MaterialCommunityIcons name="swap-vertical" size={16} color="#fff" />
                                    <Text style={styles.fsActionBtnText}>Reverse</Text>
                                </TouchableOpacity>
                                {/* Edit Mode Toggle */}
                                <TouchableOpacity
                                    onPress={() => setIsEditMode(!isEditMode)}
                                    style={[styles.fsActionBtn, isEditMode ? styles.fsEditBtnActive : styles.fsEditBtn]}
                                >
                                    <Ionicons name={isEditMode ? 'create-outline' : 'eye-outline'} size={18} color={isEditMode ? '#fff' : '#222'} />
                                    <Text style={[styles.fsActionBtnText, isEditMode && styles.fsActionBtnTextActive]}>
                                        {isEditMode ? 'Edit' : 'View'}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setIsFullScreenTable(false)} style={[styles.fsActionBtn, styles.fsCloseBtn]}>
                                    <MaterialCommunityIcons name="arrow-collapse" size={18} color="#222" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Table */}
                        <View style={styles.fsTableWrap}>
                            {/* Table Header */}
                            <View style={styles.fsTableHeader}>
                                <View style={{ width: 36 }} />
                                <Text style={[styles.fsColHeader, { flex: 0.7 }]}>S/No</Text>
                                <TouchableOpacity style={{ flex: 1.2 }} onPress={() => setShowBlockDialog(true)}>
                                    <Text style={styles.fsColHeaderTap}>Block</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={{ flex: 1.2 }} onPress={() => setShowRowDialog(true)}>
                                    <Text style={styles.fsColHeaderTap}>Row</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={{ flex: 1.2 }} onPress={() => setShowPileDialog(true)}>
                                    <Text style={styles.fsColHeaderTap}>Pile</Text>
                                </TouchableOpacity>
                                <Text style={[styles.fsColHeader, { flex: 2 }]}>Latitude</Text>
                                <Text style={[styles.fsColHeader, { flex: 2 }]}>Longitude</Text>
                                <Text style={[styles.fsColHeader, { flex: 1.2 }]}>Altitude</Text>
                                <Text style={[styles.fsColHeader, { flex: 1.2 }]}>Distance</Text>
                                {!isMarkHidden && <Text style={[styles.fsColHeader, { flex: 0.8 }]}>Mark</Text>}
                                <View style={{ flex: 0.8 }} />
                            </View>
                            {/* Draggable Table */}
                            <DraggableWaypointsTable
                                waypoints={waypoints}
                                onReorder={handleReorder}
                                onDelete={onDeleteWaypoint}
                                onToggleMark={onToggleMark}
                                globalServoEnabled={globalServoEnabled}
                                missionMode={missionMode}
                                isEditMode={isEditMode}
                            />
                        </View>
                    </View>
                </GestureHandlerRootView>
            </Modal>

            {/* Dialogs */}
            <RowAssignmentDialog
                visible={showRowDialog}
                onClose={() => setShowRowDialog(false)}
                onSave={handleRowSave}
            />
            <BlockAssignmentDialog
                visible={showBlockDialog}
                onClose={() => setShowBlockDialog(false)}
                onSave={handleBlockSave}
            />
            <PileAssignmentDialog
                visible={showPileDialog}
                onClose={() => setShowPileDialog(false)}
                onSave={handlePileSave}
            />
            <EditWaypointDialog
                visible={showEditDialog}
                waypoint={editingWaypoint}
                onClose={() => setShowEditDialog(false)}
                onSave={handleSaveWaypoint}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.panelBg,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },

    // ── HEADER ──
    header: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerLeft: {
        flex: 1,
        marginRight: 8,
    },
    headerIconWrap: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    nameContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    missionName: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
    },
    editHint: {
        color: colors.textSecondary,
        fontSize: 8,
        letterSpacing: 0.5,
        opacity: 0.6,
    },
    editContainer: {
        flex: 1,
    },
    nameInput: {
        backgroundColor: colors.cardBg,
        color: colors.text,
        fontSize: 13,
        fontWeight: '600',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.accent,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    headerBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
    },
    deleteAllBtn: {
        backgroundColor: colors.danger,
        borderColor: 'rgba(239, 68, 68, 0.5)',
    },
    expandBtn: {
        backgroundColor: '#FFD600',
        borderColor: 'rgba(255, 214, 0, 0.5)',
    },

    // ── TABLE ──
    tableHeaderRow: {
        flexDirection: 'row',
        backgroundColor: colors.cardBg,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingHorizontal: 6,
        paddingVertical: 8,
    },
    tableHeaderText: {
        color: 'rgba(103, 232, 249, 0.8)',
        fontSize: 10,
        fontWeight: '700',
        textAlign: 'center',
        letterSpacing: 0.5,
    },
    waypointsList: {
        flex: 1,
    },
    waypointItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.03)',
        gap: 4,
    },
    waypointItemSelected: {
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        borderLeftWidth: 3,
        borderLeftColor: colors.accent,
    },
    waypointCell: {
        color: colors.textPrimary,
        fontSize: 11,
        textAlign: 'center',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        color: colors.textSecondary,
        fontSize: 14,
        marginBottom: 4,
    },
    emptyHint: {
        color: colors.textMuted,
        fontSize: 12,
    },
    actionBtn: {
        padding: 4,
    },

    // ── FOOTER ──
    footer: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.cardBg,
    },
    footerInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    footerText: {
        color: 'rgba(103, 232, 249, 0.7)',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1,
    },

    // ── FULLSCREEN MODAL ──
    fsContainer: {
        flex: 1,
        backgroundColor: colors.panelBg,
        padding: 18,
    },
    fsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: colors.cardBg,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    fsHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    fsHeaderIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fsHeaderTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 2,
    },
    fsHeaderSub: {
        color: 'rgba(103, 232, 249, 0.6)',
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1,
        marginTop: 2,
    },
    fsHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    fsActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
    },
    fsReverseBtn: {
        backgroundColor: colors.accent,
        borderColor: 'rgba(59, 130, 246, 0.5)',
    },
    fsEditBtn: {
        backgroundColor: colors.cardBg,
        borderColor: colors.border,
        paddingHorizontal: 14,
    },
    fsEditBtnActive: {
        backgroundColor: colors.accent,
        borderColor: 'rgba(59, 130, 246, 0.5)',
    },
    fsCloseBtn: {
        backgroundColor: '#FFD600',
        borderColor: 'rgba(255, 214, 0, 0.5)',
        paddingHorizontal: 14,
    },
    fsActionBtnTextActive: {
        color: '#ffffff',
    },
    fsActionBtnText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    fsTableWrap: {
        flex: 1,
        marginTop: 12,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
    },
    fsTableHeader: {
        flexDirection: 'row',
        backgroundColor: colors.cardBg,
        paddingVertical: 12,
        borderBottomWidth: 2,
        borderBottomColor: colors.border,
        alignItems: 'center',
    },
    fsColHeader: {
        color: 'rgba(103, 232, 249, 0.8)',
        fontWeight: '700',
        textAlign: 'center',
        fontSize: 13,
        letterSpacing: 0.5,
    },
    fsColHeaderTap: {
        color: 'rgba(103, 232, 249, 0.8)',
        fontWeight: '700',
        textAlign: 'center',
        fontSize: 13,
        letterSpacing: 0.5,
        textDecorationLine: 'underline',
        textDecorationColor: 'rgba(103, 232, 249, 0.3)',
    },
});

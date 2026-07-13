import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';
import { PathPlanWaypoint } from '../../types/pathplan';

interface EditWaypointDialogProps {
    visible: boolean;
    waypoint: PathPlanWaypoint | null;
    onClose: () => void;
    onSave: (updatedWaypoint: PathPlanWaypoint) => void;
}

export const EditWaypointDialog: React.FC<EditWaypointDialogProps> = ({
    visible,
    waypoint,
    onClose,
    onSave,
}) => {
    const [lat, setLat] = useState('');
    const [lon, setLon] = useState('');
    const [alt, setAlt] = useState('');
    const [row, setRow] = useState('');
    const [block, setBlock] = useState('');
    const [pile, setPile] = useState('');

    useEffect(() => {
        if (waypoint) {
            setLat(waypoint.lat.toString());
            setLon(waypoint.lon.toString());
            setAlt(waypoint.alt.toString());
            setRow(waypoint.row || '');
            setBlock(waypoint.block || '');
            setPile(waypoint.pile || '');
        }
    }, [waypoint]);

    const handleSave = () => {
        if (!waypoint) return;

        const updatedWaypoint: PathPlanWaypoint = {
            ...waypoint,
            lat: parseFloat(lat) || 0,
            lon: parseFloat(lon) || 0,
            alt: parseFloat(alt) || 0,
            row: row,
            block: block,
            pile: pile,
        };

        onSave(updatedWaypoint);
        onClose();
    };

    if (!waypoint) return null;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.dialog}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Edit Marking Point #{waypoint.id}</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Text style={styles.closeBtn}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.content}>
                        <View style={styles.row}>
                            <View style={styles.field}>
                                <Text style={styles.label}>Latitude</Text>
                                <TextInput
                                    style={styles.input}
                                    value={lat}
                                    onChangeText={setLat}
                                    keyboardType="numeric"
                                    placeholder="0.000000"
                                    placeholderTextColor={colors.textSecondary}
                                />
                            </View>
                            <View style={styles.field}>
                                <Text style={styles.label}>Longitude</Text>
                                <TextInput
                                    style={styles.input}
                                    value={lon}
                                    onChangeText={setLon}
                                    keyboardType="numeric"
                                    placeholder="0.000000"
                                    placeholderTextColor={colors.textSecondary}
                                />
                            </View>
                        </View>

                        <View style={styles.field}>
                            <Text style={styles.label}>Altitude (m)</Text>
                            <TextInput
                                style={styles.input}
                                value={alt}
                                onChangeText={setAlt}
                                keyboardType="numeric"
                                placeholder="0.0"
                                placeholderTextColor={colors.textSecondary}
                            />
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.row}>
                            <View style={styles.field}>
                                <Text style={styles.label}>Row</Text>
                                <TextInput
                                    style={styles.input}
                                    value={row}
                                    onChangeText={setRow}
                                    placeholder="Row ID"
                                    placeholderTextColor={colors.textSecondary}
                                />
                            </View>
                            <View style={styles.field}>
                                <Text style={styles.label}>Block</Text>
                                <TextInput
                                    style={styles.input}
                                    value={block}
                                    onChangeText={setBlock}
                                    placeholder="Block ID"
                                    placeholderTextColor={colors.textSecondary}
                                />
                            </View>
                        </View>

                        <View style={styles.field}>
                            <Text style={styles.label}>Pile</Text>
                            <TextInput
                                style={styles.input}
                                value={pile}
                                onChangeText={setPile}
                                placeholder="Pile ID"
                                placeholderTextColor={colors.textSecondary}
                            />
                        </View>
                    </ScrollView>

                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                            <Text style={styles.saveBtnText}>Save Changes</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    dialog: {
        width: 400,
        backgroundColor: colors.panelBg,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        maxHeight: '80%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
    },
    closeBtn: {
        fontSize: 20,
        color: colors.textSecondary,
        padding: 4,
    },
    content: {
        padding: 16,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    field: {
        flex: 1,
        marginBottom: 16,
    },
    label: {
        fontSize: 12,
        color: colors.textSecondary,
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    input: {
        backgroundColor: colors.inputBg,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 6,
        padding: 10,
        color: colors.text,
        fontSize: 14,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 8,
        marginBottom: 16,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        gap: 12,
    },
    cancelBtn: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cancelBtnText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: '500',
    },
    saveBtn: {
        backgroundColor: colors.primary,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 6,
    },
    saveBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
    },
});

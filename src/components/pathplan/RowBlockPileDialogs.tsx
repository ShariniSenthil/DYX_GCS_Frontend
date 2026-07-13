import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Switch, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';

interface RowDialogProps {
    visible: boolean;
    onClose: () => void;
    onSave: (row: string, startSeq: number, endSeq: number) => void;
}

interface BlockDialogProps {
    visible: boolean;
    onClose: () => void;
    onSave: (block: string, startSeq: number, endSeq: number) => void;
}

interface PileDialogProps {
    visible: boolean;
    onClose: () => void;
    onSave: (autoGenerate: boolean, prefix: string) => void;
}

export const RowBlockPileButtons: React.FC<{
    onBlock: () => void;
    onRow: () => void;
    onPile: () => void;
}> = ({ onBlock, onRow, onPile }) => (
    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16, justifyContent: 'center' }}>
        <TouchableOpacity style={[styles.button, { backgroundColor: '#FFD600', borderRadius: 12 }]} onPress={onBlock}>
            <Text style={{ color: '#222', fontWeight: 'bold' }}>Block</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { backgroundColor: '#FFD600', borderRadius: 12 }]} onPress={onRow}>
            <Text style={{ color: '#222', fontWeight: 'bold' }}>Row</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { backgroundColor: '#FFD600', borderRadius: 12 }]} onPress={onPile}>
            <Text style={{ color: '#222', fontWeight: 'bold' }}>Pile</Text>
        </TouchableOpacity>
    </View>
);
export const RowAssignmentDialog: React.FC<RowDialogProps> = ({ visible, onClose, onSave }) => {
    const [rows, setRows] = useState([
        { row: 'R1', startSeq: '1', endSeq: '10' }
    ]);

    const validateSequenceRange = (startSeq: number, endSeq: number): boolean => {
        if (startSeq <= 0 || endSeq <= 0 || startSeq > endSeq) {
            alert('Invalid sequence range. Ensure start sequence is less than or equal to end sequence, and both are positive numbers.');
            return false;
        }
        return true;
    };

    const handleAddRow = () => {
        setRows([...rows, { row: '', startSeq: '', endSeq: '' }]);
    };

    const handleChange = (idx: number, field: string, value: string) => {
        const updated = rows.map((r, i) => i === idx ? { ...r, [field]: value } : r);
        setRows(updated);
    };

    const handleSave = () => {
        for (const r of rows) {
            if (!r.row || !r.startSeq || !r.endSeq) {
                alert('Please fill all fields for each row.');
                return;
            }
            if (!validateSequenceRange(parseInt(r.startSeq), parseInt(r.endSeq))) {
                return;
            }
        }
        // Save all rows
        rows.forEach(r => onSave(r.row, parseInt(r.startSeq), parseInt(r.endSeq)));
        onClose();
    };

    const handleCancel = () => {
        setRows([{ row: 'R1', startSeq: '1', endSeq: '10' }]);
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.dialog}>
                    <View style={styles.dialogHeader}>
                        <Text style={styles.title}>Assign Row Numbers</Text>
                    </View>
                    <View style={{ flex: 1, width: '100%' }}>
                        <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
                            {rows.map((r, idx) => (
                                <View key={`row-${r.row}-${r.startSeq}-${idx}`} style={styles.card}>
                                    <View style={styles.cardHeader}>
                                        <Text style={styles.cardTitle}>Row Assignment {idx + 1}</Text>
                                        <TouchableOpacity onPress={() => {
                                            const updated = rows.filter((_, i) => i !== idx);
                                            setRows(updated);
                                        }}>
                                            <Text style={styles.removeText}>Remove</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.cardBody}>
                                        <View style={styles.inputGroupInline}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.labelSmall}>Row No</Text>
                                                <TextInput style={styles.input} value={r.row} onChangeText={v => handleChange(idx, 'row', v)} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.labelSmall}>Start Seq</Text>
                                                <TextInput style={styles.input} value={r.startSeq} onChangeText={v => handleChange(idx, 'startSeq', v)} keyboardType="numeric" />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.labelSmall}>End Seq</Text>
                                                <TextInput style={styles.input} value={r.endSeq} onChangeText={v => handleChange(idx, 'endSeq', v)} keyboardType="numeric" />
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            ))}
                            <TouchableOpacity
                                style={styles.addButton}
                                onPress={handleAddRow}
                                accessibilityLabel="add-new-row"
                            >
                                <Text style={styles.addButtonText}>➕  Add New Row Assignment</Text>
                            </TouchableOpacity>
                        </ScrollView>
                        <View style={styles.footerActions}>
                            <TouchableOpacity style={[styles.button, styles.cancelBtn]} onPress={handleCancel}>
                                <Text style={styles.btnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.button, styles.saveBtn]} onPress={handleSave}>
                                <Text style={styles.btnText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export const BlockAssignmentDialog: React.FC<BlockDialogProps> = ({ visible, onClose, onSave }) => {
    const [blocks, setBlocks] = useState([
        { block: 'B1', startSeq: '1', endSeq: '10' }
    ]);

    const validateSequenceRange = (startSeq: number, endSeq: number): boolean => {
        if (startSeq <= 0 || endSeq <= 0 || startSeq > endSeq) {
            alert('Invalid sequence range. Ensure start sequence is less than or equal to end sequence, and both are positive numbers.');
            return false;
        }
        return true;
    };

    const handleAddBlock = () => {
        setBlocks([...blocks, { block: '', startSeq: '', endSeq: '' }]);
    };

    const handleChange = (idx: number, field: string, value: string) => {
        const updated = blocks.map((b, i) => i === idx ? { ...b, [field]: value } : b);
        setBlocks(updated);
    };

    const handleSave = () => {
        for (const b of blocks) {
            if (!b.block || !b.startSeq || !b.endSeq) {
                alert('Please fill all fields for each block.');
                return;
            }
            if (!validateSequenceRange(parseInt(b.startSeq), parseInt(b.endSeq))) {
                return;
            }
        }
        // Save all blocks
        blocks.forEach(b => onSave(b.block, parseInt(b.startSeq), parseInt(b.endSeq)));
        onClose();
    };

    const handleCancel = () => {
        setBlocks([{ block: 'B1', startSeq: '1', endSeq: '10' }]);
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.dialog}>
                    <View style={styles.dialogHeader}>
                        <Text style={styles.title}>Assign Block Numbers</Text>
                    </View>
                    <View style={{ flex: 1, width: '100%' }}>
                        <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
                            {blocks.map((b, idx) => (
                                <View key={`block-${b.block}-${b.startSeq}-${idx}`} style={styles.card}>
                                    <View style={styles.cardHeader}>
                                        <Text style={styles.cardTitle}>Block Assignment {idx + 1}</Text>
                                        <TouchableOpacity onPress={() => {
                                            const updated = blocks.filter((_, i) => i !== idx);
                                            setBlocks(updated);
                                        }}>
                                            <Text style={styles.removeText}>Remove</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.cardBody}>
                                        <View style={styles.inputGroupInline}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.labelSmall}>Block No</Text>
                                                <TextInput style={styles.input} value={b.block} onChangeText={v => handleChange(idx, 'block', v)} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.labelSmall}>Start Seq</Text>
                                                <TextInput style={styles.input} value={b.startSeq} onChangeText={v => handleChange(idx, 'startSeq', v)} keyboardType="numeric" />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.labelSmall}>End Seq</Text>
                                                <TextInput style={styles.input} value={b.endSeq} onChangeText={v => handleChange(idx, 'endSeq', v)} keyboardType="numeric" />
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            ))}
                            <TouchableOpacity
                                style={styles.addButton}
                                onPress={handleAddBlock}
                                accessibilityLabel="add-new-block"
                            >
                                <Text style={styles.addButtonText}>➕  Add New Block Assignment</Text>
                            </TouchableOpacity>
                        </ScrollView>
                        <View style={styles.footerActions}>
                            <TouchableOpacity style={[styles.button, styles.cancelBtn]} onPress={handleCancel}>
                                <Text style={styles.btnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.button, styles.saveBtn]} onPress={handleSave}>
                                <Text style={styles.btnText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export const PileAssignmentDialog: React.FC<PileDialogProps> = ({ visible, onClose, onSave }) => {
    const [autoGenerate, setAutoGenerate] = useState(true);
    const [prefix, setPrefix] = useState('P');

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.dialog}>
                    <Text style={styles.title}>Assign Piles</Text>

                    <View style={styles.row}>
                        <Text style={styles.label}>Auto-generate Numbers</Text>
                        <Switch value={autoGenerate} onValueChange={setAutoGenerate} trackColor={{ true: colors.accent }} />
                    </View>

                    {!autoGenerate && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Pile Prefix</Text>
                            <TextInput style={styles.input} value={prefix} onChangeText={setPrefix} />
                        </View>
                    )}

                    <View style={styles.actions}>
                        <TouchableOpacity style={[styles.button, styles.cancelBtn]} onPress={onClose}>
                            <Text style={styles.btnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.button, styles.saveBtn]}
                            onPress={() => onSave(autoGenerate, prefix)}
                        >
                            <Text style={styles.btnText}>Apply</Text>
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
        width: 610, // 300 * 1.7 = 510
        minHeight: 540, // increased by 50% from 360 -> 540
        backgroundColor: colors.panelBg,
        borderRadius: 12,
        padding: 34, // 20 * 1.7 = 34
        borderWidth: 1,
        borderColor: colors.border,
        gap: 16,
    },
    footerActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 8,
    },
    dialogHeader: {
        width: '100%',
        backgroundColor: '#073763',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        marginBottom: 12,
    },
    card: {
        backgroundColor: '#08253a',
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.03)',
        marginBottom: 12,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    cardTitle: {
        color: '#A7F3D0',
        fontWeight: '700',
        fontSize: 16,
    },
    removeText: {
        color: colors.danger,
        fontSize: 14,
    },
    cardBody: {
        marginTop: 6,
    },
    inputGroupInline: {
        flexDirection: 'row',
        gap: 12,
    },
    labelSmall: {
        color: '#9FB7C9',
        fontSize: 13,
        marginBottom: 6,
    },
    addButton: {
        width: '100%',
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#0EA5E9',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
        marginBottom: 8,
    },
    addButtonText: {
        color: '#67E8F9',
        fontWeight: '700',
        fontSize: 16,
    },
    title: {
        color: colors.text,
        fontSize: 28,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    inputGroup: {
        gap: 10,
    },
    label: {
        color: colors.textSecondary,
        fontSize: 22,
    },
    input: {
        backgroundColor: colors.inputBg,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 6,
        padding: 10,
        color: colors.text,
    },
    row: {
        flexDirection: 'row',
        gap: 22,
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    actions: {
        flexDirection: 'row',
        gap: 22,
        marginTop: 10,
    },
    button: {
        flex: 1,
        height: 50,
        padding: 10,
        borderRadius: 6,
        alignItems: 'center',
    },
    cancelBtn: {
        backgroundColor: colors.danger,
    },
    saveBtn: {
        backgroundColor: colors.blueBtn,
    },
    btnText: {
        color: '#FFF',
        fontWeight: '600',
    },
});

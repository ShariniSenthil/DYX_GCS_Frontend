import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';

interface DashConfigDialogProps {
    visible: boolean;
    initialDistance: number;
    initialGap: number;
    onConfirm: (onTime: number, offTime: number) => void;
    onCancel: () => void;
}

export const DashConfigDialog: React.FC<DashConfigDialogProps> = ({
    visible,
    initialDistance,
    initialGap,
    onConfirm,
    onCancel,
}) => {
    const [distance, setDistance] = useState(initialDistance.toString());
    const [gap, setGap] = useState(initialGap.toString());

    // Reset values when dialog opens
    useEffect(() => {
        if (visible) {
            setDistance(initialDistance.toString());
            setGap(initialGap.toString());
        }
    }, [visible, initialDistance, initialGap]);

    const handleConfirm = () => {
        const onTimeVal = parseFloat(distance);
        const offTimeVal = parseFloat(gap);

        if (!isNaN(onTimeVal) && onTimeVal > 0 && !isNaN(offTimeVal) && offTimeVal > 0) {
            onConfirm(onTimeVal, offTimeVal);
        }
    };

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onCancel}
        >
            <View style={styles.overlay}>
                <View style={styles.dialogContainer}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.icon}>➖</Text>
                        <Text style={styles.title}>Dash Mode Settings</Text>
                    </View>

                    {/* Content */}
                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        <Text style={styles.description}>
                            Configure the ON/OFF spray pattern for Dash mode:
                        </Text>

                        {/* ON Time Input */}
                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>ON Time (seconds)</Text>
                            <Text style={styles.inputDescription}>
                                Duration servo stays ON
                            </Text>
                            <TextInput
                                style={styles.input}
                                value={distance}
                                onChangeText={setDistance}
                                keyboardType="numeric"
                                placeholder="2.0"
                                placeholderTextColor="#666"
                            />
                        </View>

                        {/* OFF Time Input */}
                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>OFF Time (seconds)</Text>
                            <Text style={styles.inputDescription}>
                                Duration servo stays OFF
                            </Text>
                            <TextInput
                                style={styles.input}
                                value={gap}
                                onChangeText={setGap}
                                keyboardType="numeric"
                                placeholder="1.0"
                                placeholderTextColor="#666"
                            />
                        </View>

                        {/* Preview */}
                        <View style={styles.previewContainer}>
                            <Text style={styles.previewLabel}>Pattern Preview:</Text>
                            <View style={styles.previewPattern}>
                                <View style={styles.previewOn}>
                                    <Text style={styles.previewText}>ON</Text>
                                    <Text style={styles.previewValue}>{parseFloat(distance) || 2.0}s</Text>
                                </View>
                                <View style={styles.previewOff}>
                                    <Text style={styles.previewText}>OFF</Text>
                                    <Text style={styles.previewValue}>{parseFloat(gap) || 1.0}s</Text>
                                </View>
                                <View style={styles.previewOn}>
                                    <Text style={styles.previewText}>ON</Text>
                                    <Text style={styles.previewValue}>{parseFloat(distance) || 2.0}s</Text>
                                </View>
                                <Text style={styles.previewEllipsis}>...</Text>
                            </View>
                        </View>
                    </ScrollView>

                    {/* Action Buttons */}
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={[styles.button, styles.cancelButton]}
                            onPress={onCancel}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.buttonText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.button, styles.confirmButton]}
                            onPress={handleConfirm}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.buttonText, styles.confirmButtonText]}>
                                Confirm
                            </Text>
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
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    dialogContainer: {
        backgroundColor: colors.cardBg,
        borderRadius: 12,
        width: '90%',
        maxWidth: 400,
        maxHeight: '80%',
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.headerBlue,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    icon: {
        fontSize: 28,
        marginRight: 12,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
        flex: 1,
    },
    content: {
        padding: 20,
        maxHeight: 400,
    },
    description: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 20,
        lineHeight: 20,
    },
    inputContainer: {
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 4,
    },
    inputDescription: {
        fontSize: 12,
        color: colors.textSecondary,
        marginBottom: 8,
    },
    input: {
        backgroundColor: colors.inputBg,
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        color: colors.text,
        fontSize: 16,
        fontWeight: '600',
        borderWidth: 1,
        borderColor: colors.border,
        textAlign: 'center',
    },
    previewContainer: {
        marginTop: 10,
        padding: 16,
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.3)',
    },
    previewLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.accent,
        marginBottom: 12,
    },
    previewPattern: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    previewOn: {
        backgroundColor: '#22c55e',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        alignItems: 'center',
    },
    previewOff: {
        backgroundColor: '#ef4444',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        alignItems: 'center',
    },
    previewText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    previewValue: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    previewEllipsis: {
        color: colors.textSecondary,
        fontSize: 16,
        fontWeight: 'bold',
    },
    buttonContainer: {
        flexDirection: 'row',
        padding: 16,
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.cardBg,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
    },
    button: {
        flex: 1,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        backgroundColor: colors.cardBg,
        borderWidth: 1,
        borderColor: colors.border,
    },
    confirmButton: {
        backgroundColor: colors.primary,
        borderWidth: 1,
        borderColor: colors.primary,
    },
    buttonText: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.text,
    },
    confirmButtonText: {
        color: colors.text,
    },
});

export default DashConfigDialog;

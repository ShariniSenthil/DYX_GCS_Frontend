import React, { useCallback, memo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity as RNTouchableOpacity, Platform } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { PathPlanWaypoint } from '../../types/pathplan';

// LegendList for high-performance virtualized rendering (1000+ items)
import { LegendList, LegendListRenderItemProps } from '@legendapp/list';

// Keep DraggableFlatList for web compatibility and edit mode
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';

interface Props {
    waypoints: PathPlanWaypoint[];
    onReorder: (fromIndex: number, toIndex: number) => void;
    onDelete?: (id: number) => void;
    onToggleMark?: (id: number, mark: boolean) => void;
    globalServoEnabled?: boolean;
    missionMode?: string;
    isEditMode?: boolean; // Toggle between fast scroll (LegendList) and drag-to-reorder (DraggableFlatList)
}

// ─── OPTIMIZED ROW COMPONENT (memo + custom comparison) ─────────────────────
// This is the KEY to <16ms toggle/delete: only re-renders if THIS item's data changed
const WaypointRow = memo(({
    item,
    index,
    isMarkHidden,
    globalServoEnabled,
    onDelete,
    onToggleMark,
    isActive,
    drag,
}: {
    item: PathPlanWaypoint;
    index: number;
    isMarkHidden: boolean;
    globalServoEnabled: boolean;
    onDelete?: (id: number) => void;
    onToggleMark?: (id: number, mark: boolean) => void;
    isActive?: boolean | undefined;
    drag?: () => void;
}) => {
    const isMarked = item.mark !== undefined ? item.mark : globalServoEnabled;

    return (
        <View style={[styles.row, index % 2 === 0 && styles.rowAlt, isActive && styles.rowActive]}>
            {/* Drag Handle */}
            <View style={styles.dragHandle}>
                {drag && (
                    <TouchableOpacity
                        onLongPress={drag}
                        delayLongPress={150}
                        style={styles.dragHandleTouch}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="chevron-expand-outline" size={24} color={colors.accent} />
                    </TouchableOpacity>
                )}
            </View>

            <Text style={[styles.cell, styles.colSeq]}>{index + 1}</Text>
            <Text style={[styles.cell, styles.colBlock]}>{item.block || '-'}</Text>
            <Text style={[styles.cell, styles.colRow]}>{item.row || '-'}</Text>
            <Text style={[styles.cell, styles.colPile]}>{item.pile || '-'}</Text>
            <Text style={[styles.cell, styles.colLat]}>{item.lat?.toFixed(7) ?? '0.0000000'}</Text>
            <Text style={[styles.cell, styles.colLon]}>{item.lon?.toFixed(7) ?? '0.0000000'}</Text>
            <Text style={[styles.cell, styles.colAlt]}>{item.alt?.toFixed(2) || '0.00'}</Text>
            <Text style={[styles.cell, styles.colDist]}>{item.distance?.toFixed(2) || '0.00'}</Text>

            {/* Mark Checkbox - O(1) toggle, no re-render cascade */}
            {!isMarkHidden && (
                <RNTouchableOpacity
                    style={styles.checkboxContainer}
                    onPress={() => onToggleMark?.(item.id, !isMarked)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons
                        name={isMarked ? 'checkbox' : 'square-outline'}
                        size={24}
                        color={isMarked ? colors.accent : colors.textMuted}
                    />
                </RNTouchableOpacity>
            )}

            {/* Delete Button */}
            {onDelete && (
                <RNTouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => onDelete(item.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Text style={styles.deleteBtnText}>Delete</Text>
                </RNTouchableOpacity>
            )}
        </View>
    );
}, (prevProps, nextProps) => {
    // CUSTOM COMPARISON: Only re-render if THIS row's data actually changed
    // This is what makes delete/toggle instant even with 1000+ items
    return (
        prevProps.item.id === nextProps.item.id &&
        prevProps.item.mark === nextProps.item.mark &&
        prevProps.item.lat === nextProps.item.lat &&
        prevProps.item.lon === nextProps.item.lon &&
        prevProps.item.alt === nextProps.item.alt &&
        prevProps.item.block === nextProps.item.block &&
        prevProps.item.row === nextProps.item.row &&
        prevProps.item.pile === nextProps.item.pile &&
        prevProps.item.distance === nextProps.item.distance &&
        prevProps.globalServoEnabled === nextProps.globalServoEnabled &&
        prevProps.isMarkHidden === nextProps.isMarkHidden &&
        prevProps.isActive === nextProps.isActive
    );
});
WaypointRow.displayName = 'WaypointRow';

// ─── WEB ROW (unchanged from original, for Platform.OS === 'web') ───────────
const WebRow: React.FC<{
    item: PathPlanWaypoint;
    index: number;
    onDelete?: (id: number) => void;
    onToggleMark?: (id: number, mark: boolean) => void;
    globalServoEnabled?: boolean;
    isMarkHidden?: boolean;
    isDragDisabled: boolean;
    dragState: { fromIndex: number; overIndex: number; settling?: boolean } | null;
    onPointerDownHandle: (index: number, y: number) => void;
}> = memo(({ item, index, onDelete, onToggleMark, globalServoEnabled = true, isMarkHidden = false, isDragDisabled, dragState, onPointerDownHandle }) => {
    const isBeingDragged = dragState?.fromIndex === index;
    const isOver = dragState !== null && dragState.overIndex === index && dragState.fromIndex !== index;

    let translateY = 0;
    if (dragState && !isBeingDragged) {
        const { fromIndex, overIndex } = dragState;
        if (fromIndex < overIndex && index > fromIndex && index <= overIndex) {
            translateY = -56;
        } else if (fromIndex > overIndex && index < fromIndex && index >= overIndex) {
            translateY = 56;
        }
    }

    return (
        <div
            data-row-index={index}
            style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isBeingDragged ? 'rgba(59, 130, 246, 0.3)' : index % 2 === 0 ? colors.cardBg : colors.panelBg,
                paddingTop: 7,
                paddingBottom: 7,
                paddingLeft: 16,
                paddingRight: 16,
                minHeight: 56,
                height: 56,
                borderBottom: `1px solid ${colors.border}`,
                width: '100%',
                boxSizing: 'border-box',
                userSelect: 'none',
                position: 'relative',
                zIndex: isBeingDragged ? 100 : 1,
                transform: `translateY(${translateY}px)`,
                transition: isBeingDragged ? 'none' : dragState ? 'transform 0.1s cubic-bezier(0.2, 0, 0, 1), background-color 0.08s' : 'none',
                opacity: isBeingDragged ? 0.85 : 1,
                boxShadow: isBeingDragged ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
                willChange: 'transform',
            } as React.CSSProperties}
        >
            <div
                onPointerDown={isDragDisabled ? undefined : (e) => {
                    e.preventDefault();
                    onPointerDownHandle(index, e.clientY);
                }}
                style={{
                    width: 29,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    cursor: isDragDisabled ? 'default' : 'grab',
                    touchAction: 'none',
                }}
            >
                <Ionicons name="chevron-expand-outline" size={24} color={isDragDisabled ? colors.textMuted : colors.accent} />
            </div>
            <Text style={[styles.cell, styles.colSeq]}>{index + 1}</Text>
            <Text style={[styles.cell, styles.colBlock]}>{item.block || '-'}</Text>
            <Text style={[styles.cell, styles.colRow]}>{item.row || '-'}</Text>
            <Text style={[styles.cell, styles.colPile]}>{item.pile || '-'}</Text>
            <Text style={[styles.cell, styles.colLat]}>{item.lat?.toFixed(7) ?? '0.0000000'}</Text>
            <Text style={[styles.cell, styles.colLon]}>{item.lon?.toFixed(7) ?? '0.0000000'}</Text>
            <Text style={[styles.cell, styles.colAlt]}>{item.alt?.toFixed(2) || '0.00'}</Text>
            <Text style={[styles.cell, styles.colDist]}>{item.distance?.toFixed(2) || '0.00'}</Text>
            {!isMarkHidden && (
                <div style={{ flex: 0.6, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <input
                        type="checkbox"
                        checked={item.mark !== undefined ? item.mark : globalServoEnabled}
                        onChange={(e) => {
                            e.stopPropagation();
                            const currentValue = item.mark !== undefined ? item.mark : globalServoEnabled;
                            onToggleMark?.(item.id, !currentValue);
                        }}
                        style={{ width: 22, height: 22, cursor: 'pointer', accentColor: colors.accent }}
                    />
                </div>
            )}
            {onDelete && (
                <RNTouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(item.id)}>
                    <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700' }}>Delete</Text>
                </RNTouchableOpacity>
            )}
        </div>
    );
});
WebRow.displayName = 'WebRow';

// ─── Smooth Web Draggable List ───────────────────────────────────────────────
const WebDraggableList: React.FC<Props> = ({ waypoints, onReorder, onDelete, onToggleMark, globalServoEnabled, missionMode }) => {
    const isDragDisabled = waypoints.length <= 1;
    const isMarkHidden = missionMode?.toLowerCase() === 'continuous' || missionMode?.toLowerCase() === 'dash';

    const [dragState, setDragState] = React.useState<{ fromIndex: number; overIndex: number; settling?: boolean } | null>(null);
    const dragRef = useRef<{ fromIndex: number; startY: number; currentY: number; raf: number | null }>({ fromIndex: -1, startY: 0, currentY: 0, raf: null });

    const ROW_HEIGHT = 56;

    const updateOverIndex = React.useCallback(() => {
        const ref = dragRef.current;
        const delta = ref.currentY - ref.startY;
        const indexShift = Math.round(delta / ROW_HEIGHT);
        const newOver = Math.max(0, Math.min(waypoints.length - 1, ref.fromIndex + indexShift));

        setDragState(prev => {
            if (prev && prev.overIndex === newOver) return prev;
            return { fromIndex: ref.fromIndex, overIndex: newOver };
        });

        ref.raf = null;
    }, [waypoints.length]);

    const handlePointerMove = React.useCallback((e: PointerEvent) => {
        dragRef.current.currentY = e.clientY;
        if (!dragRef.current.raf) {
            dragRef.current.raf = requestAnimationFrame(updateOverIndex);
        }
    }, [updateOverIndex]);

    const handlePointerUp = React.useCallback(() => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);

        if (dragRef.current.raf) {
            cancelAnimationFrame(dragRef.current.raf);
            dragRef.current.raf = null;
        }

        const finalState = dragState;
        setDragState(null);
        if (finalState && finalState.fromIndex !== finalState.overIndex) {
            onReorder(finalState.fromIndex, finalState.overIndex);
        }
    }, [handlePointerMove, onReorder, dragState]);

    const handlePointerDownHandle = React.useCallback((index: number, clientY: number) => {
        dragRef.current = { fromIndex: index, startY: clientY, currentY: clientY, raf: null };
        setDragState({ fromIndex: index, overIndex: index });

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
    }, [handlePointerMove, handlePointerUp]);

    React.useEffect(() => {
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            if (dragRef.current.raf) cancelAnimationFrame(dragRef.current.raf);
        };
    }, [handlePointerMove, handlePointerUp]);

    if (waypoints.length === 0) {
        return (
            <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No marking points yet</Text>
                <Text style={styles.emptyHint}>Tap on map to add</Text>
            </View>
        );
    }

    return (
        <div
            style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                borderBottomLeftRadius: 16,
                borderBottomRightRadius: 16,
                overflow: 'hidden',
                touchAction: 'none',
            } as React.CSSProperties}
        >
            {waypoints.map((item, index) => (
                <WebRow
                    key={`wp-${item.id}`}
                    item={item}
                    index={index}
                    isDragDisabled={isDragDisabled}
                    onDelete={onDelete}
                    onToggleMark={onToggleMark}
                    globalServoEnabled={globalServoEnabled}
                    isMarkHidden={isMarkHidden}
                    dragState={dragState}
                    onPointerDownHandle={handlePointerDownHandle}
                />
            ))}
        </div>
    );
};

// ─── MAIN NATIVE COMPONENT (LegendList for 60fps scroll) ─────────────────────
const NativeLegendList: React.FC<Props> = ({
    waypoints,
    onReorder,
    onDelete,
    onToggleMark,
    globalServoEnabled = true,
    missionMode,
}) => {
    const isMarkHidden = missionMode?.toLowerCase() === 'continuous' || missionMode?.toLowerCase() === 'dash';
    const dragIndexRef = useRef<number | null>(null);

    // Stable handlers - critical for memo to work
    const handleToggleMark = useCallback((id: number, mark: boolean) => {
        onToggleMark?.(id, mark);
    }, [onToggleMark]);

    const handleDelete = useCallback((id: number) => {
        onDelete?.(id);
    }, [onDelete]);

    const handleDragStart = useCallback((index: number) => {
        dragIndexRef.current = index;
    }, []);

    const handleDragEnd = useCallback(() => {
        dragIndexRef.current = null;
    }, []);

    const renderItem = useCallback((props: LegendListRenderItemProps<PathPlanWaypoint>) => (
        <WaypointRow
            item={props.item}
            index={props.index}
            isMarkHidden={isMarkHidden}
            globalServoEnabled={globalServoEnabled}
            onDelete={handleDelete}
            onToggleMark={handleToggleMark}
        />
    ), [isMarkHidden, globalServoEnabled, handleDelete, handleToggleMark]);

    const keyExtractor = useCallback((item: PathPlanWaypoint) => `wp-${item.id}`, []);

    if (waypoints.length === 0) {
        return (
            <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No marking points yet</Text>
                <Text style={styles.emptyHint}>Tap on map to add</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <LegendList
                data={waypoints}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                recycleItems={true}
                maintainVisibleContentPosition
                getFixedItemSize={() => 56}
                estimatedItemSize={56}
            />
        </View>
    );
};

// ─── Native Draggable List (for edit mode) ───────────────────────────────────
const NativeDraggableList: React.FC<Props> = ({ waypoints, onReorder, onDelete, onToggleMark, globalServoEnabled, missionMode }) => {
    const isDragDisabled = waypoints.length <= 1;
    const isMarkHidden = missionMode?.toLowerCase() === 'continuous' || missionMode?.toLowerCase() === 'dash';

    const renderItem = useCallback(
        (params: RenderItemParams<PathPlanWaypoint>) => (
            <ScaleDecorator>
                <WaypointRow
                    item={params.item}
                    index={params.getIndex() ?? 0}
                    isActive={params.isActive ?? false}
                    drag={params.drag}
                    isMarkHidden={isMarkHidden}
                    globalServoEnabled={globalServoEnabled ?? true}
                    onDelete={onDelete}
                    onToggleMark={onToggleMark}
                />
            </ScaleDecorator>
        ),
        [isMarkHidden, globalServoEnabled, onDelete, onToggleMark]
    );

    const handleDragEnd = useCallback(
        ({ from, to }: { from: number; to: number }) => {
            if (from !== to) onReorder(from, to);
        },
        [onReorder]
    );

    if (waypoints.length === 0) {
        return (
            <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No marking points yet</Text>
                <Text style={styles.emptyHint}>Tap on map to add</Text>
            </View>
        );
    }

    return (
        <DraggableFlatList
            data={waypoints}
            renderItem={renderItem}
            keyExtractor={(item) => `wp-${item.id}`}
            onDragEnd={handleDragEnd}
            activationDistance={15}
            containerStyle={styles.listContainer}
        />
    );
};

// ─── Exported Component ───────────────────────────────────────────────────────
export const DraggableWaypointsTable: React.FC<Props> = (props) => {
    const { waypoints, isEditMode = false } = props;

    if (Platform.OS === 'web') {
        return <WebDraggableList {...props} />;
    }

    // Edit mode: Use DraggableFlatList for drag-to-reorder
    // Normal mode: Use LegendList for maximum scroll performance (60fps+)
    if (isEditMode) {
        return <NativeDraggableList {...props} />;
    }

    return <NativeLegendList {...props} />;
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    listContainer: { flex: 1, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden' },
    row: {
        flexDirection: 'row',
        backgroundColor: colors.cardBg,
        paddingVertical: 9,
        paddingHorizontal: 10,
        minHeight: 56,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        width: '100%',
    },
    rowAlt: { backgroundColor: colors.panelBg },
    rowActive: {
        backgroundColor: 'rgba(59, 130, 246, 0.25)',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    cell: {
        color: '#ffffff',
        textAlign: 'center',
        fontSize: 20,
    },
    dragHandle: {
        width: 29,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dragHandleTouch: {
        width: 29,
        height: 29,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxContainer: {
        flex: 0.6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteBtn: {
        flex: 0.64,
        alignItems: 'center',
        padding: 4,
    },
    deleteBtnText: {
        color: colors.danger,
        fontSize: 13,
        fontWeight: '700',
    },
    colSeq: { flex: 0.56, fontWeight: 'bold' },
    colBlock: { flex: 0.96 },
    colRow: { flex: 0.96 },
    colPile: { flex: 0.96 },
    colLat: { flex: 1.6, fontFamily: 'monospace' },
    colLon: { flex: 1.6, fontFamily: 'monospace' },
    colAlt: { flex: 0.96 },
    colDist: { flex: 0.96 },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        color: colors.textSecondary,
        fontSize: 16,
        marginBottom: 6,
    },
    emptyHint: {
        color: colors.textMuted,
        fontSize: 13,
    },
});

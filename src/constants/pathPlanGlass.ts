/**
 * PathPlan floating glass HUD tokens — shared visual language for
 * Path Plan overlays and Mission Progress floating panels.
 */
export const PATH_PLAN_GLASS = {
  panelBg: '#07111be6',
  innerBg: '#08101a',
  border: 'rgba(103, 232, 249, 0.15)',
  borderSubtle: 'rgba(103, 232, 249, 0.1)',
  dragBg: 'rgba(103, 232, 249, 0.04)',
  dragBorder: 'rgba(103, 232, 249, 0.4)',
  cyan: '#67E8F9',
  title: '#E5F1FF',
  label: '#9FBEE3',
  muted: '#94A3B8',
  iconWrapBg: 'rgba(103, 232, 249, 0.12)',
  badgeBg: 'rgba(103, 232, 249, 0.15)',
  borderRadius: 12,
} as const;

/** Standard floating panel header typography (MissionOps / MissionStatistics) */
export const PATH_PLAN_HEADER = {
  title: {
    color: PATH_PLAN_GLASS.title,
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 2,
  },
  badgeText: {
    fontSize: 7,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: PATH_PLAN_GLASS.iconWrapBg,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  closeBtn: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  /** Compact toolbar row (Clear / Export in mission table header) */
  toolbarActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  actionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionBtnDanger: {
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  actionBtnAccent: {
    borderColor: PATH_PLAN_GLASS.border,
    backgroundColor: PATH_PLAN_GLASS.iconWrapBg,
  },
  actionBtnText: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  actionBtnTextDanger: {
    color: '#F87171',
  },
  actionBtnTextAccent: {
    color: PATH_PLAN_GLASS.cyan,
  },
};

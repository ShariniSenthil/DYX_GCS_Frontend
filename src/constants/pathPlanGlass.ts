/**
 * PathPlan floating glass HUD tokens — shared visual language for
 * Path Plan overlays, Mission Progress floating panels, and Dashboard.
 *
 * White = text  ·  Blue = accent / live  ·  Deep slate = surfaces
 */
export const PATH_PLAN_GLASS = {
  panelBg: 'rgba(15, 23, 42, 0.96)',
  innerBg: '#0B1220',
  border: 'rgba(148, 163, 184, 0.24)',
  borderSubtle: 'rgba(148, 163, 184, 0.14)',
  dragBg: 'rgba(59, 130, 246, 0.10)',
  dragBorder: 'rgba(96, 165, 250, 0.68)',
  cyan: '#38BDF8',
  title: '#F8FAFC',
  label: '#CBD5E1',
  muted: '#94A3B8',
  iconWrapBg: 'rgba(59, 130, 246, 0.16)',
  badgeBg: 'rgba(56, 189, 248, 0.16)',
  borderRadius: 14,
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
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
    borderColor: 'rgba(255, 59, 48, 0.45)',
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
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
    color: '#FF3B30',
  },
  actionBtnTextAccent: {
    color: PATH_PLAN_GLASS.cyan,
  },
};

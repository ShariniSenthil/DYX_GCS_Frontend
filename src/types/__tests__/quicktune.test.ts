import {
  PRETUNE_PARAMS,
  TUNED_PARAMS,
  WizardStep,
  TuneState,
  QuickTuneParam,
  ScriptCheckResult,
  AuxFunctionPayload,
  QuickTuneLogEntry,
  ParamSnapshot,
  TuneResult,
  WizardSharedState,
} from '../quicktune';

describe('QuickTune Types', () => {
  describe('PRETUNE_PARAMS', () => {
    test('should have exactly 18 parameters', () => {
      expect(PRETUNE_PARAMS).toHaveLength(18);
    });

    test('should contain only string values', () => {
      const allStrings = PRETUNE_PARAMS.every((param) => typeof param === 'string');
      expect(allStrings).toBe(true);
    });

    test('should contain real ArduRover 4.5.6 parameter names', () => {
      expect(PRETUNE_PARAMS).toContain('SCR_ENABLE');
      expect(PRETUNE_PARAMS).toContain('RTUN_ENABLE');
      expect(PRETUNE_PARAMS).toContain('RTUN_AUTO_FILTER');
      expect(PRETUNE_PARAMS).toContain('RTUN_STR_FFRATIO');
      expect(PRETUNE_PARAMS).toContain('RTUN_SPD_FFRATIO');
      expect(PRETUNE_PARAMS).toContain('CIRC_SPEED');
      expect(PRETUNE_PARAMS).toContain('CIRC_RADIUS');
      expect(PRETUNE_PARAMS).toContain('CIRC_DIR');
      expect(PRETUNE_PARAMS).toContain('ATC_STR_ACC_MAX');
      expect(PRETUNE_PARAMS).toContain('ATC_STR_RAT_MAX');
      expect(PRETUNE_PARAMS).toContain('ATC_BRAKE');
    });
  });

  describe('TUNED_PARAMS', () => {
    test('should have exactly 11 parameters', () => {
      expect(TUNED_PARAMS).toHaveLength(11);
    });

    test('should contain the params the Lua script actually modifies', () => {
      expect(TUNED_PARAMS).toContain('ATC_STR_RAT_FF');
      expect(TUNED_PARAMS).toContain('ATC_STR_RAT_P');
      expect(TUNED_PARAMS).toContain('ATC_SPEED_P');
      expect(TUNED_PARAMS).toContain('CRUISE_SPEED');
      expect(TUNED_PARAMS).toContain('CRUISE_THROTTLE');
    });
  });

  describe('Type exports', () => {
    test('WizardStep enum should have expected steps', () => {
      expect(WizardStep.Overview).toBe('overview');
      expect(WizardStep.PretuneCheck).toBe('pretune_check');
      expect(WizardStep.ApplyPretune).toBe('apply_pretune');
      expect(WizardStep.RunTuning).toBe('run_tuning');
      expect(WizardStep.ApplyTuned).toBe('apply_tuned');
      expect(WizardStep.Complete).toBe('complete');
    });

    test('TuneState enum should have expected states', () => {
      expect(TuneState.Idle).toBe('idle');
      expect(TuneState.Checking).toBe('checking');
      expect(TuneState.ApplyingPretune).toBe('applying_pretune');
      expect(TuneState.Tuning).toBe('tuning');
      expect(TuneState.ApplyingTuned).toBe('applying_tuned');
      expect(TuneState.Success).toBe('success');
      expect(TuneState.Failed).toBe('failed');
      expect(TuneState.Cancelled).toBe('cancelled');
    });

    test('QuickTuneParam interface structure', () => {
      const param: QuickTuneParam = {
        name: 'ATC_ACCEL_MAX',
        currentValue: 2.5,
        recommendedValue: 2.0,
        min: 0,
        max: 10,
        units: 'm/s²',
        description: 'Maximum acceleration',
      };
      expect(param.name).toBe('ATC_ACCEL_MAX');
      expect(typeof param.currentValue).toBe('number');
    });

    test('ScriptCheckResult interface structure', () => {
      const result: ScriptCheckResult = {
        passed: true,
        warnings: ['Low battery'],
        errors: [],
        paramSnapshots: [{ name: 'ATC_ACCEL_MAX', before: 2.5 }],
      };
      expect(result.passed).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    test('AuxFunctionPayload interface structure', () => {
      const payload: AuxFunctionPayload = {
        functionName: 'calibrate_imu',
        params: { axis: 'z', duration: 5000 },
        timeoutMs: 10000,
      };
      expect(payload.functionName).toBe('calibrate_imu');
      expect(typeof payload.params).toBe('object');
    });

    test('QuickTuneLogEntry interface structure', () => {
      const entry: QuickTuneLogEntry = {
        timestamp: '2026-04-04T10:00:00Z',
        step: WizardStep.ApplyPretune,
        state: TuneState.ApplyingPretune,
        message: 'Applying pretune parameters',
        details: { count: 18 },
      };
      expect(entry.message).toBe('Applying pretune parameters');
    });

    test('ParamSnapshot interface structure', () => {
      const snapshot: ParamSnapshot = {
        name: 'ATC_STR_RAT_P',
        before: 1.5,
        after: 2.0,
      };
      expect(snapshot.before).toBe(1.5);
      expect(snapshot.after).toBe(2.0);
    });

    test('TuneResult interface structure', () => {
      const result: TuneResult = {
        success: true,
        durationMs: 45000,
        appliedParams: { ATC_ACCEL_MAX: 2.0 },
        previousParams: { ATC_ACCEL_MAX: 1.5 },
        logs: [],
      };
      expect(result.success).toBe(true);
      expect(result.durationMs).toBe(45000);
    });

    test('WizardSharedState interface structure', () => {
      const state: WizardSharedState = {
        currentStep: WizardStep.RunTuning,
        tuneState: TuneState.Tuning,
        pretuneParams: { ATC_ACCEL_MAX: 2.5 },
        tunedParams: { ATC_ACCEL_MAX: 2.0 },
        checkResult: null,
        tuneResult: null,
        logs: [],
        startedAt: '2026-04-04T10:00:00Z',
      };
      expect(state.currentStep).toBe(WizardStep.RunTuning);
      expect(state.tuneState).toBe(TuneState.Tuning);
    });
  });
});

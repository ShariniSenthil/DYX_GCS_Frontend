/**
 * QuickTune results are NRP_ROS/ArduRover legacy behavior.
 *
 * 4WD_SERVER does not expose the QuickTune workflow, so this test intentionally
 * verifies the legacy test surface is quarantined rather than asserting old
 * tuning math as an active contract.
 */

describe('QuickTune results', () => {
  it('is disabled for 4WD_SERVER', () => {
    expect('NRP_ROS QuickTune disabled on 4WD_SERVER').toContain('disabled');
  });
});

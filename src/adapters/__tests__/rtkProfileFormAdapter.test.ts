import {
  buildRtkProfileCreateRequest,
  buildRtkProfileUpdateRequest,
  editorNeedsTlsDisabledConfirmation,
  editorWarnsForcedStop,
  profileToEditorForm,
  validateRtkProfileForm,
  EMPTY_RTK_PROFILE_FORM,
} from "../rtkProfileFormAdapter";
import type { RtkProfile } from "../../types/rtk";

const PROFILE: RtkProfile = {
  id: 9,
  name: "Base",
  caster_host: "caster.test",
  caster_port: 2101,
  mountpoint: "MOUNT",
  username: "rover",
  password_configured: true,
  rtcm_topic: "/mavros/gps_rtk/send_rtcm",
  connect_timeout_sec: 10,
  socket_timeout_sec: 1,
  healthy_age_sec: 5,
  stale_reconnect_sec: 10,
  reconnect_delay_sec: 5,
  first_data_timeout_sec: 10,
  gga_enabled: false,
  gga_interval_sec: 10,
  gga_max_age_sec: 5,
  tls_mode: "REQUIRED",
  max_mavros_rtcm_frame_bytes: 720,
  enabled: true,
  revision: 1,
  created_at_epoch: 1,
  updated_at_epoch: 1,
};

describe("RTK profile editor form", () => {
  it("requires password on create and never trims it", () => {
    const form = {
      ...EMPTY_RTK_PROFILE_FORM,
      name: "Base",
      caster_host: "caster.test",
      caster_port: "2101",
      mountpoint: "MOUNT",
      username: "rover",
      password: "",
    };
    expect(validateRtkProfileForm(form, "create").password).toBe(
      "Password is required",
    );

    const created = buildRtkProfileCreateRequest({
      ...form,
      password: "  keep spaces  ",
    });
    expect(created.password).toBe("  keep spaces  ");
    expect(created.tls_mode).toBe("REQUIRED");
  });

  it("omits blank password on edit and never repopulates from the profile", () => {
    const form = profileToEditorForm(PROFILE);
    expect(form.password).toBe("");
    const patch = buildRtkProfileUpdateRequest(form, PROFILE);
    expect(patch).not.toHaveProperty("password");
  });

  it("includes a replacement password with original whitespace", () => {
    const form = { ...profileToEditorForm(PROFILE), password: "  new  " };
    const patch = buildRtkProfileUpdateRequest(form, PROFILE);
    expect(patch.password).toBe("  new  ");
  });

  it("requires TLS DISABLED confirmation when switching away from REQUIRED", () => {
    expect(editorNeedsTlsDisabledConfirmation("DISABLED", "REQUIRED")).toBe(
      true,
    );
    expect(editorNeedsTlsDisabledConfirmation("REQUIRED")).toBe(false);
    expect(editorNeedsTlsDisabledConfirmation("DISABLED", "DISABLED")).toBe(
      false,
    );
  });

  it("warns when a runtime-significant edit can force STOPPED", () => {
    const form = {
      ...profileToEditorForm(PROFILE),
      caster_host: "other.caster",
    };
    const patch = buildRtkProfileUpdateRequest(form, PROFILE);
    expect(
      editorWarnsForcedStop(patch, PROFILE, PROFILE.id, "RUNNING"),
    ).toBe(true);
    expect(
      editorWarnsForcedStop(patch, PROFILE, PROFILE.id, "STOPPED"),
    ).toBe(false);
    expect(editorWarnsForcedStop({ name: "Other" }, PROFILE, PROFILE.id, "RUNNING")).toBe(
      false,
    );
  });
});

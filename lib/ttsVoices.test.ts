import { describe, it, expect, afterEach } from "vitest";
import { resolveVoiceId, VoiceNotConfiguredError, type VoiceId } from "./ttsVoices";

const ENV_VARS: Record<VoiceId, string> = {
  af_sarah: "ELEVENLABS_VOICE_AF_SARAH",
  af_bella: "ELEVENLABS_VOICE_AF_BELLA",
  am_adam: "ELEVENLABS_VOICE_AM_ADAM",
  am_michael: "ELEVENLABS_VOICE_AM_MICHAEL",
};

describe("resolveVoiceId", () => {
  const originals = Object.fromEntries(
    Object.values(ENV_VARS).map((envVar) => [envVar, process.env[envVar]]),
  );

  afterEach(() => {
    for (const [envVar, original] of Object.entries(originals)) {
      if (original === undefined) delete process.env[envVar];
      else process.env[envVar] = original;
    }
  });

  it("returns the configured ElevenLabs voice_id for each persona", () => {
    for (const [voiceId, envVar] of Object.entries(ENV_VARS) as [VoiceId, string][]) {
      process.env[envVar] = `${voiceId}-real-id`;
      expect(resolveVoiceId(voiceId)).toBe(`${voiceId}-real-id`);
    }
  });

  it("throws VoiceNotConfiguredError when the env var is unset", () => {
    delete process.env[ENV_VARS.af_sarah];
    expect(() => resolveVoiceId("af_sarah")).toThrow(VoiceNotConfiguredError);
  });

  it("throws VoiceNotConfiguredError when the env var is an empty string", () => {
    process.env[ENV_VARS.am_adam] = "";
    expect(() => resolveVoiceId("am_adam")).toThrow(VoiceNotConfiguredError);
  });
});

#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "bleak>=0.22.0",
# ]
# ///
"""
Interactive Mac BLE Qualification Runner for xBloom Studio (Issue #285).

Connects directly from macOS CoreBluetooth to an xBloom Studio over BLE,
executes the protocol qualification steps required by `ControlProtocol` and
`ControlCapabilityProfile`, prompts before any motor/water step, restores
all modified settings automatically, and saves structured capture evidence to:
  docs/machine-integration/captures/studio-qualification-latest.json

Usage:
  uv run scripts/qualify-studio-ble.py --self-test
  uv run scripts/qualify-studio-ble.py
  uv run scripts/qualify-studio-ble.py --section info
  uv run scripts/qualify-studio-ble.py --section settings
  uv run scripts/qualify-studio-ble.py --section scale
  uv run scripts/qualify-studio-ble.py --section grind
  uv run scripts/qualify-studio-ble.py --section pour
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import json
import math
import pathlib
import struct
import sys
import time
from typing import Any

SERVICE_UUID = "0000e0ff-3c17-d293-8e48-14fe2e4da212"
WRITE_CHAR_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb"
NOTIFY_CHAR_UUID = "0000ffe2-0000-1000-8000-00805f9b34fb"
SECONDARY_NOTIFY_CHAR_UUID = "0000ffe3-0000-1000-8000-00805f9b34fb"

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
CAPTURES_DIR = REPO_ROOT / "docs" / "machine-integration" / "captures"
LATEST_CAPTURE_PATH = CAPTURES_DIR / "studio-qualification-latest.json"

STATE_NAMES: dict[int, str] = {
    0x01: "IDLE",
    0x02: "GRINDING",
    0x03: "BREWING",
    0x04: "PAUSED",
    0x10: "COMPLETED",
    0x21: "BREWING_NFC",
    0x23: "BREWING_SOLO",
    0x29: "SCALE",
    0x33: "TEA_STEEPING",
    0x41: "POST_BREW",
    0x49: "SETTING",
    0x51: "WARNING",
}

EVENT_NAMES: dict[int, str] = {
    3500: "ACK_GRINDER_START",
    3505: "ACK_GRINDER_STOP",
    4506: "ACK_BREWER_START",
    4507: "ACK_BREWER_STOP",
    4508: "ACK_WATER_SOURCE",
    4510: "ACK_BREWER_TEMP",
    8003: "ACK_SCALE_ENTER",
    8005: "ACK_WEIGHT_UNIT",
    8006: "ACK_GRINDER_ENTER",
    8007: "ACK_BREWER_ENTER",
    8010: "ACK_TEMP_UNIT",
    8012: "ACK_GRINDER_QUIT",
    8013: "ACK_BREWER_QUIT",
    8014: "ACK_SCALE_EXIT",
    8016: "ACK_BREWER_PATTERN",
    8019: "ACK_FREESOLO_POUR",
    8021: "ACK_PAUSE_TEA",
    8022: "ACK_GET_STATUS",
    8023: "EVT_GRIND_COMPLETE_8023",
    8100: "ACK_HANDSHAKE",
    8103: "ACK_LED_BRIGHTNESS",
    8107: "EVT_BREWER_TEMP_APPLIED",
    8108: "EVT_BREWER_PATTERN_APPLIED",
    8500: "ACK_SCALE_TARE",
    9000: "EVT_EXIT_SETTING",
    9002: "EVT_SCALE_OVERWEIGHT_OR_MODE",
    9003: "EVT_GRINDER_STARTED",
    9004: "EVT_GRINDER_STOPPED",
    9005: "EVT_BREWER_STARTED",
    9006: "EVT_BREWER_STOPPED",
    9017: "EVT_SLEEP",
    9018: "EVT_WAKEUP",
    11506: "RESP_POUR_RADIUS_READ",
    11507: "ACK_POUR_RADIUS_SET",
    11508: "RESP_VIBRATION_READ",
    11509: "ACK_VIBRATION_SET",
    40502: "EVT_GRINDER_DOOR",
    40505: "EVT_GRINDER_CURRENT",
    40507: "EVT_GRINDER_DONE",
    40510: "EVT_BREWER_FLOW",
    40511: "EVT_BREWER_DONE",
    40521: "MACHINE_INFO",
    40523: "BREWER_TELEMETRY_40523",
}


def crc16_kermit(data: bytes | bytearray) -> int:
    """CRC-16/KERMIT (polynomial 0x1021 reflected = 0x8408, init 0x0000)."""
    crc = 0x0000
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0x8408
            else:
                crc >>= 1
    return crc & 0xFFFF


def _build_frame(func: int, cmd_code: int, payload: bytes) -> bytes:
    """
    Build an app->machine frame matching library/machine/protocol.ts:
      58 01 [func] [cmd_lo cmd_hi] [total_len_u32_le] 01 [payload...] [crc_lo crc_hi]
    Total frame overhead is 12 bytes; CRC-16/KERMIT covers bytes 0..length-2.
    """
    total_len = 12 + len(payload)
    head = bytearray(
        [
            0x58,
            0x01,
            func & 0xFF,
            cmd_code & 0xFF,
            (cmd_code >> 8) & 0xFF,
            total_len & 0xFF,
            (total_len >> 8) & 0xFF,
            0x00,
            0x00,
            0x01,
        ]
    )
    head.extend(payload)
    crc = crc16_kermit(head)
    return bytes(head) + bytes([crc & 0xFF, (crc >> 8) & 0xFF])


def build_type1(cmd_code: int, int32_values: list[int] | None = None) -> bytes:
    """Build a Type 1 frame (0x58 0x01 0x01) with little-endian int32 payload."""
    values = int32_values or []
    payload = b"".join(struct.pack("<i", v) for v in values)
    return _build_frame(0x01, cmd_code, payload)


def build_type1_bytes(cmd_code: int, raw_payload: bytes = b"") -> bytes:
    """Build a Type 1 frame (0x58 0x01 0x01) with raw byte payload."""
    return _build_frame(0x01, cmd_code, raw_payload)


def build_type2(cmd_code: int, raw_payload: bytes = b"") -> bytes:
    """Build a Type 2 frame (0x58 0x01 0x02) with raw byte payload."""
    return _build_frame(0x02, cmd_code, raw_payload)


def float_bits_to_int32(value: float) -> int:
    """Reinterpret IEEE 754 float32 bits as signed int32 for Type 1 payloads."""
    packed = struct.pack("<f", value)
    return struct.unpack("<i", packed)[0]


def split_frames(packet: bytes) -> list[bytes]:
    """
    Split a BLE notification packet that may contain multiple concatenated frames.
    Matches splitFrames() in library/machine/protocol.ts:
      Header: 58 02 07
      Bytes 5..8: total frame length (uint32 LE)
    """
    frames: list[bytes] = []
    offset = 0
    n = len(packet)
    while offset < n:
        remaining = n - offset
        if remaining < 12:
            break
        if packet[offset : offset + 3] != b"\x58\x02\x07":
            break
        total_len = struct.unpack("<I", packet[offset + 5 : offset + 9])[0]
        if total_len < 12 or total_len > remaining:
            break
        frames.append(packet[offset : offset + total_len])
        offset += total_len

    if not frames:
        return [packet]
    if offset < n:
        frames.append(packet[offset:])
    return frames


def _clean_text(data: bytes, start: int, end_inclusive: int) -> str:
    out: list[str] = []
    for i in range(start, min(end_inclusive + 1, len(data))):
        b = data[i]
        if b == 0 or b == 0xFF:
            break
        out.append(chr(b))
    return "".join(out)


def decode_machine_info(payload: bytes) -> dict[str, Any]:
    """Decode 40521 MachineInfo payload and record all raw byte offsets."""
    n = len(payload)
    serial = _clean_text(payload, 0, 12)
    model = _clean_text(payload, 13, 18)
    firmware = _clean_text(payload, 19, 28)
    mode_hex_ascii = _clean_text(payload, 51, 58)

    def u8(idx: int) -> int | None:
        return payload[idx] if idx < n else None

    def i8(idx: int) -> int | None:
        return struct.unpack("<b", payload[idx : idx + 1])[0] if idx < n else None

    def u32(idx: int) -> int | None:
        return struct.unpack("<I", payload[idx : idx + 4])[0] if idx + 4 <= n else None

    def i32(idx: int) -> int | None:
        return struct.unpack("<i", payload[idx : idx + 4])[0] if idx + 4 <= n else None

    def f32(idx: int) -> float | None:
        if idx + 4 > n:
            return None
        val = struct.unpack("<f", payload[idx : idx + 4])[0]
        return round(val, 4) if math.isfinite(val) else None

    grinder_raw_u8 = u8(37)
    return {
        "payloadLength": n,
        "payloadHex": payload.hex(),
        "serial": serial,
        "serialTrimmed": serial.strip(),
        "model": model,
        "firmware": firmware,
        "waterEnough_33": u8(33),
        "systemStatus_34": u8(34),
        "byte_35": u8(35),
        "waterFeed_36": u8(36),
        "grinderRaw_37_u8": grinder_raw_u8,
        "grinderRaw_37_i8": i8(37),
        "grinderAdjustedMinus30": max((grinder_raw_u8 or 30) - 30, 1),
        "ledType_38": u8(38),
        "voltage_39": u8(39),
        "tempUnit_40": u8(40),
        "weightUnit_41": u8(41),
        "bytes_42_50_hex": payload[42:51].hex() if n >= 51 else payload[42:].hex(),
        "modeAscii_51_58": mode_hex_ascii,
        "modeBytes_51_54_hex": payload[51:55].hex() if n >= 55 else "",
        "modeType_51_u32": u32(51),
        "pouringRadius_55_u32": u32(55),
        "pouringRadius_55_i32": i32(55),
        "pouringRadius_55_f32": f32(55),
        "vibrationInit_59_u32": u32(59),
        "vibrationInit_59_i32": i32(59),
        "vibrationInit_59_f32": f32(59),
        "trailingHex_63_plus": payload[63:].hex() if n > 63 else "",
        "allBytes": list(payload),
    }


def parse_frame(frame: bytes, characteristic: str = "FFE2") -> dict[str, Any]:
    """
    Parse a single device->app notification frame matching parseNotification()
    in library/machine/protocol.ts:
      58 02 07 [type] [sub] [total_len_u32_le] [marker_or_status] [payload...] [crc_lo crc_hi]
    """
    base: dict[str, Any] = {
        "characteristic": characteristic,
        "rawHex": frame.hex(),
        "length": len(frame),
    }
    if len(frame) < 12 or frame[:3] != b"\x58\x02\x07":
        base["kind"] = "unknown_raw"
        base["cmdName"] = f"RAW_{characteristic}"
        base["payloadHex"] = frame.hex()
        return base

    total_len = struct.unpack("<I", frame[5:9])[0]
    crc_actual = frame[-2] | (frame[-1] << 8)
    crc_calc = crc16_kermit(frame[:-2])
    crc_valid = (total_len == len(frame)) and (crc_actual == crc_calc)

    type_byte = frame[3]
    sub_byte = frame[4]
    cmd_le = type_byte | (sub_byte << 8)
    marker_or_status = frame[9]
    payload = frame[10:-2]

    base.update(
        {
            "header": [frame[0], frame[1], frame[2]],
            "typeByte": type_byte,
            "subByte": sub_byte,
            "cmdCodeLE": cmd_le,
            "cmdName": EVENT_NAMES.get(cmd_le, f"CMD_{cmd_le}"),
            "statusByte9": marker_or_status,
            "payloadLen": len(payload),
            "payloadHex": payload.hex(),
            "crcValid": crc_valid,
        }
    )

    if not crc_valid:
        base["kind"] = "invalid_crc"
        return base

    # 1. Slot receipts (11510, 40526)
    if cmd_le in (11510, 40526):
        base["kind"] = "receipt"
        base["status"] = marker_or_status
        return base

    # 2. Machine State (type_byte == 0x57)
    if type_byte == 0x57:
        state_byte = payload[0] if len(payload) >= 1 else 0
        base.update(
            {
                "kind": "status",
                "subType": "0x57",
                "stateByte": state_byte,
                "stateHex": f"0x{state_byte:02x}",
                "stateName": STATE_NAMES.get(state_byte, f"UNKNOWN_0x{state_byte:02x}"),
            }
        )
        return base

    # 3. Weight telemetry (type_byte == 0x15 or 0x4B with >= 4 bytes payload)
    # Note: 0x4B 0x1F with empty payload is event 8011 ("machine awake").
    if type_byte in (0x15, 0x4B) and len(payload) >= 4:
        val_f32 = struct.unpack("<f", payload[:4])[0]
        raw_i32 = struct.unpack("<i", payload[:4])[0]
        if type_byte == 0x15:
            base.update(
                {
                    "kind": "cup_weight",
                    "subType": "0x15",
                    "grams": round(val_f32, 3) if math.isfinite(val_f32) else None,
                    "rawInt32": raw_i32,
                }
            )
        else:
            base.update(
                {
                    "kind": "water_weight",
                    "subType": "0x4B",
                    "rawFloat": round(val_f32, 3) if math.isfinite(val_f32) else None,
                    "gramsOrMl": round(val_f32 / 1000.0, 3) if math.isfinite(val_f32) else None,
                    "rawInt32": raw_i32,
                }
            )
        return base

    # 4. Machine Info (40521 = 0x9E49, payload >= 55 bytes)
    if cmd_le == 40521 and len(payload) >= 55:
        base["kind"] = "info"
        base["info"] = decode_machine_info(payload)
        return base

    # 5. General event / response notification
    int32_values = [
        struct.unpack("<i", payload[i : i + 4])[0]
        for i in range(0, len(payload) - (len(payload) % 4), 4)
    ]
    uint32_values = [
        struct.unpack("<I", payload[i : i + 4])[0]
        for i in range(0, len(payload) - (len(payload) % 4), 4)
    ]
    base.update(
        {
            "kind": "event",
            "value0": payload[0] if len(payload) >= 1 else None,
            "payloadBytes": list(payload),
            "payloadInt32LE": int32_values,
            "payloadUint32LE": uint32_values,
            "payloadAscii": payload.decode("ascii", errors="replace"),
        }
    )
    return base


class QualificationSession:
    """Manages the BLE connection, frame log, and structured capture store."""

    def __init__(self, client: Any, device_name: str, device_address: str) -> None:
        self.client = client
        self.device_name = device_name
        self.device_address = device_address
        self.frames: list[dict[str, Any]] = []
        self.latest_info: dict[str, Any] | None = None
        self.latest_state: int | None = None
        self.active_motor_or_water: str | None = None
        self.echo_telemetry: bool = False
        self.capture: dict[str, Any] = self._load_or_init_capture()

    def _load_or_init_capture(self) -> dict[str, Any]:
        if LATEST_CAPTURE_PATH.exists():
            try:
                existing = json.loads(LATEST_CAPTURE_PATH.read_text(encoding="utf-8"))
                if isinstance(existing, dict):
                    existing["updatedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
                    existing["device"] = {
                        "name": self.device_name,
                        "address": self.device_address,
                    }
                    existing.setdefault("sections", {})
                    return existing
            except Exception:
                pass
        return {
            "schemaVersion": 1,
            "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "device": {
                "name": self.device_name,
                "address": self.device_address,
            },
            "machineIdentity": None,
            "initialInfo": None,
            "sections": {},
        }

    def save_capture(self) -> None:
        CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
        self.capture["updatedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
        serialized = json.dumps(self.capture, indent=2, sort_keys=False)
        LATEST_CAPTURE_PATH.write_text(serialized + "\n", encoding="utf-8")

    def on_notification(self, char_label: str, data: bytearray) -> None:
        now = time.monotonic()
        wall = dt.datetime.now(dt.timezone.utc).isoformat()
        for raw_frame in split_frames(bytes(data)):
            parsed = parse_frame(raw_frame, characteristic=char_label)
            parsed["tMono"] = round(now, 4)
            parsed["timestamp"] = wall
            self.frames.append(parsed)

            kind = parsed.get("kind")
            if kind == "info":
                self.latest_info = parsed["info"]
                print(
                    f"  [BLE <- {char_label}] MACHINE_INFO (40521): "
                    f"model={self.latest_info['model']!r} "
                    f"fw={self.latest_info['firmware']!r} "
                    f"serial={self.latest_info['serialTrimmed']!r} "
                    f"len={self.latest_info['payloadLength']} "
                    f"waterEnough={self.latest_info['waterEnough_33']} "
                    f"waterFeed={self.latest_info['waterFeed_36']} "
                    f"led={self.latest_info['ledType_38']} "
                    f"tempUnit={self.latest_info['tempUnit_40']} "
                    f"weightUnit={self.latest_info['weightUnit_41']} "
                    f"radius={self.latest_info['pouringRadius_55_u32']} "
                    f"vib={self.latest_info['vibrationInit_59_u32']}"
                )
            elif kind == "status":
                self.latest_state = parsed["stateByte"]
                print(
                    f"  [BLE <- {char_label}] STATUS (0x57): "
                    f"{parsed['stateHex']} ({parsed['stateName']})"
                )
            elif kind in ("cup_weight", "water_weight", "temperature"):
                if self.echo_telemetry:
                    if kind == "cup_weight":
                        print(f"  [BLE <- {char_label}] CUP_WEIGHT (0x15): {parsed['grams']} g")
                    elif kind == "water_weight":
                        print(
                            f"  [BLE <- {char_label}] WATER_WEIGHT (0x4B): "
                            f"raw={parsed['rawFloat']} ({parsed['gramsOrMl']} ml/g)"
                        )
                    elif kind == "temperature":
                        print(f"  [BLE <- {char_label}] TEMP (0x35): {parsed['celsius']} C")
            else:
                print(
                    f"  [BLE <- {char_label}] {parsed.get('cmdName')} "
                    f"(code={parsed.get('cmdCodeLE')}, kind={kind}, "
                    f"payload={parsed.get('payloadHex')})"
                )

    def mark(self) -> int:
        return len(self.frames)

    def frames_since(self, idx: int) -> list[dict[str, Any]]:
        return self.frames[idx:]

    async def send_frame(self, frame: bytes, label: str = "") -> int:
        idx = self.mark()
        cmd_le = frame[3] | (frame[4] << 8) if len(frame) >= 5 else -1
        name = label or EVENT_NAMES.get(cmd_le, f"CMD_{cmd_le}")
        print(f"  [BLE -> FFE1] {name} (code={cmd_le}): {frame.hex()}")
        await self.client.write_gatt_char(WRITE_CHAR_UUID, frame, response=False)
        return idx

    async def send_and_collect(
        self,
        frame: bytes,
        label: str = "",
        wait_seconds: float = 1.2,
    ) -> list[dict[str, Any]]:
        idx = await self.send_frame(frame, label=label)
        await asyncio.sleep(wait_seconds)
        return self.frames_since(idx)

    async def refresh_info(self, wait_seconds: float = 3.5) -> dict[str, Any] | None:
        idx = await self.send_frame(build_type1(8100, [185, 1]), label="HANDSHAKE_8100")
        deadline = time.monotonic() + wait_seconds
        while time.monotonic() < deadline:
            for f in self.frames_since(idx):
                if f.get("kind") == "info":
                    return f["info"]
            await asyncio.sleep(0.05)
        return None

    async def emergency_stop(self) -> None:
        if not self.client or not self.client.is_connected:
            return
        print("\n[SAFETY] Sending Grinder Stop (3505) and Brewer Stop (4507)...")
        try:
            await self.client.write_gatt_char(WRITE_CHAR_UUID, build_type1(3505), response=False)
            await asyncio.sleep(0.15)
            await self.client.write_gatt_char(WRITE_CHAR_UUID, build_type1(4507), response=False)
            await asyncio.sleep(0.3)
        except Exception as exc:
            print(f"[SAFETY] Warning while sending emergency stop: {exc}")
        self.active_motor_or_water = None


async def ainput(prompt: str) -> str:
    return await asyncio.to_thread(input, prompt)


def ask_yes_no(prompt: str, default: bool = True) -> bool:
    suffix = " [Y/n]: " if default else " [y/N]: "
    ans = input(prompt + suffix).strip().lower()
    if not ans:
        return default
    return ans in ("y", "yes")


async def run_phase_info(session: QualificationSession) -> None:
    print("\n" + "=" * 72)
    print("PHASE 1: Machine Identity & 40521 Info Blob")
    print("=" * 72)
    idx = session.mark()
    info = await session.refresh_info(wait_seconds=2.0)
    await asyncio.sleep(0.5)
    status_frames = await session.send_and_collect(build_type1(8022), label="GET_STATUS_8022", wait_seconds=1.0)

    if not info:
        raise RuntimeError("Did not receive 40521 MachineInfo frame after 8100 handshake.")

    if session.capture.get("initialInfo") is None:
        session.capture["initialInfo"] = info
    session.capture["machineIdentity"] = {
        "serial": info["serialTrimmed"],
        "serialRaw": info["serial"],
        "model": info["model"],
        "firmware": info["firmware"],
        "payloadLength": info["payloadLength"],
    }
    session.capture["sections"]["info"] = {
        "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "info": info,
        "handshakeFrames": session.frames_since(idx),
        "statusProbeFrames": status_frames,
    }
    session.save_capture()
    print(f"\n[OK] Saved Phase 1 (info) capture to {LATEST_CAPTURE_PATH.relative_to(REPO_ROOT)}")


async def run_phase_settings(session: QualificationSession) -> None:
    print("\n" + "=" * 72)
    print("PHASE 2: Non-Motor Settings & Readback Qualification")
    print("=" * 72)
    baseline = await session.refresh_info(wait_seconds=2.0)
    if not baseline:
        raise RuntimeError("Cannot run settings qualification without baseline 40521 MachineInfo.")

    results: dict[str, Any] = {
        "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "baselineInfo": baseline,
        "temperatureUnit_8010": {},
        "weightUnit_8005": {},
        "brightness_8103": {},
        "mechanicalTuning_11506_11508": {},
        "waterSource_4508": {},
    }

    # 1. Temperature Unit (8010) - Contradiction C6
    print("\n--- 2A. Temperature Unit (8010) ---")
    orig_temp_unit = baseline["tempUnit_40"]
    for val in (0, 1):
        frames = await session.send_and_collect(
            build_type1(8010, [val]), label=f"TEMP_UNIT_8010({val})", wait_seconds=1.0
        )
        info_after = await session.refresh_info(wait_seconds=1.5)
        observed = (
            await ainput(
                f"  -> Sent 8010 [{val}]. What temperature unit is shown on the Studio display? (c/f/unchanged): "
            )
        ).strip().lower()
        results["temperatureUnit_8010"][str(val)] = {
            "sentValue": val,
            "userObservedDisplay": observed,
            "infoTempUnit_40": info_after["tempUnit_40"] if info_after else None,
            "frames": frames,
            "infoAfter": info_after,
        }
    if orig_temp_unit is not None:
        print(f"  Restoring original temperature unit ({orig_temp_unit})...")
        await session.send_and_collect(build_type1(8010, [orig_temp_unit]), wait_seconds=0.8)
        await session.refresh_info(wait_seconds=1.2)

    # 2. Weight Unit (8005) - Contradiction C5
    print("\n--- 2B. Weight Unit (8005) ---")
    orig_weight_unit = baseline["weightUnit_41"]
    for val in (0, 1, 2):
        frames = await session.send_and_collect(
            build_type1(8005, [val]), label=f"WEIGHT_UNIT_8005({val})", wait_seconds=1.0
        )
        info_after = await session.refresh_info(wait_seconds=1.5)
        observed = (
            await ainput(
                f"  -> Sent 8005 [{val}]. What weight unit is shown on the Studio display? (g/oz/ml/unchanged): "
            )
        ).strip().lower()
        results["weightUnit_8005"][str(val)] = {
            "sentValue": val,
            "userObservedDisplay": observed,
            "infoWeightUnit_41": info_after["weightUnit_41"] if info_after else None,
            "frames": frames,
            "infoAfter": info_after,
        }
    if orig_weight_unit is not None:
        print(f"  Restoring original weight unit ({orig_weight_unit})...")
        await session.send_and_collect(build_type1(8005, [orig_weight_unit]), wait_seconds=0.8)
        await session.refresh_info(wait_seconds=1.2)

    # 3. Brightness (8103)
    print("\n--- 2C. Display Brightness (8103) ---")
    orig_led = baseline["ledType_38"]
    for level in (1, 8, 15, 0):
        frames = await session.send_and_collect(
            build_type1(8103, [level]), label=f"BRIGHTNESS_8103({level})", wait_seconds=1.0
        )
        info_after = await session.refresh_info(wait_seconds=1.5)
        observed = (
            await ainput(
                f"  -> Sent 8103 [{level}]. Describe display brightness (dim/mid/bright/off/unchanged): "
            )
        ).strip()
        results["brightness_8103"][str(level)] = {
            "sentValue": level,
            "userObservedDisplay": observed,
            "infoLedType_38": info_after["ledType_38"] if info_after else None,
            "frames": frames,
            "infoAfter": info_after,
        }
    restore_led = orig_led if (orig_led is not None and orig_led > 0) else 10
    print(f"  Restoring brightness ({restore_led})...")
    await session.send_and_collect(build_type1(8103, [restore_led]), wait_seconds=0.8)
    await session.refresh_info(wait_seconds=1.2)

    # 4. Mechanical Tuning Read (11506 / 11508)
    print("\n--- 2D. Mechanical Tuning Read Probes (11506 Pour Radius / 11508 Vibration) ---")
    r_11506_t2 = await session.send_and_collect(
        build_type2(11506), label="POUR_RADIUS_READ_11506_TYPE2", wait_seconds=1.2
    )
    r_11508_t2 = await session.send_and_collect(
        build_type2(11508), label="VIBRATION_READ_11508_TYPE2", wait_seconds=1.2
    )
    info_tuning = await session.refresh_info(wait_seconds=1.5)
    results["mechanicalTuning_11506_11508"] = {
        "baselinePouringRadius_55_u32": baseline["pouringRadius_55_u32"],
        "baselineVibrationInit_59_u32": baseline["vibrationInit_59_u32"],
        "read11506Type2Frames": r_11506_t2,
        "read11508Type2Frames": r_11508_t2,
        "infoAfterRead": info_tuning,
    }

    # 5. Optional Water Source (4508)
    print("\n--- 2E. Water Source (4508) ---")
    orig_water_feed = baseline["waterFeed_36"]
    print(f"  Current 40521 waterFeed_36 = {orig_water_feed} (0=tank, 1=tap)")
    if ask_yes_no("  Test toggling water source setting 4508 (non-pumping setting, will restore immediately)?", default=True):
        alt_feed = 1 if orig_water_feed == 0 else 0
        f_toggle = await session.send_and_collect(
            build_type1(4508, [alt_feed]), label=f"WATER_SOURCE_4508({alt_feed})", wait_seconds=1.0
        )
        info_toggled = await session.refresh_info(wait_seconds=1.5)
        f_restore = await session.send_and_collect(
            build_type1(4508, [orig_water_feed or 0]),
            label=f"WATER_SOURCE_4508({orig_water_feed or 0})",
            wait_seconds=1.0,
        )
        info_restored = await session.refresh_info(wait_seconds=1.5)
        results["waterSource_4508"] = {
            "originalWaterFeed_36": orig_water_feed,
            "toggledTo": alt_feed,
            "infoWaterFeedAfterToggle": info_toggled["waterFeed_36"] if info_toggled else None,
            "infoWaterFeedAfterRestore": info_restored["waterFeed_36"] if info_restored else None,
            "toggleFrames": f_toggle,
            "restoreFrames": f_restore,
        }

    session.capture["sections"]["settings"] = results
    session.save_capture()
    print(f"\n[OK] Saved Phase 2 (settings) capture to {LATEST_CAPTURE_PATH.relative_to(REPO_ROOT)}")


async def run_phase_scale(session: QualificationSession) -> None:
    print("\n" + "=" * 72)
    print("PHASE 3: Scale Tool Qualification (8003 Enter, 8500 Tare, 8014 Exit)")
    print("=" * 72)
    await ainput("  Ensure the scale tray is empty, then press Enter to send 8003 (Scale Enter)...")

    session.echo_telemetry = True
    try:
        enter_frames = await session.send_and_collect(
            build_type1(8003), label="SCALE_ENTER_8003", wait_seconds=2.5
        )
        await ainput(
            "\n  Place a small object (e.g. a cup or weight) on the scale so weight > 0, then press Enter..."
        )
        idx_loaded = session.mark()
        await asyncio.sleep(2.0)
        loaded_frames = session.frames_since(idx_loaded)

        print("\n  Sending 8500 (Scale Tare)...")
        tare_frames = await session.send_and_collect(
            build_type1(8500), label="SCALE_TARE_8500", wait_seconds=2.5
        )

        await ainput(
            "\n  Remove the object from the scale (should read negative), then press Enter to Tare again..."
        )
        tare2_frames = await session.send_and_collect(
            build_type1(8500), label="SCALE_TARE_8500_SECOND", wait_seconds=2.0
        )

        print("\n  Sending 8014 (Scale Exit)...")
        exit_frames = await session.send_and_collect(
            build_type1(8014), label="SCALE_EXIT_8014", wait_seconds=2.0
        )
    finally:
        session.echo_telemetry = False

    session.capture["sections"]["scale"] = {
        "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "enterFrames": enter_frames,
        "loadedTelemetryFrames": loaded_frames,
        "tareFrames": tare_frames,
        "secondTareFrames": tare2_frames,
        "exitFrames": exit_frames,
    }
    session.save_capture()
    print(f"\n[OK] Saved Phase 3 (scale) capture to {LATEST_CAPTURE_PATH.relative_to(REPO_ROOT)}")


async def run_phase_grind(session: QualificationSession) -> None:
    print("\n" + "=" * 72)
    print("PHASE 4: Grind Tool Qualification (8006 Enter, 3500 Start, 3505 Stop, 8012 Quit)")
    print("=" * 72)
    print("  SAFETY CHECK: Confirm the grinder hopper is EMPTY and clear of fingers/tools.")
    if not ask_yes_no("  Ready to run Phase 4 (Grind Tool)?", default=True):
        print("  Skipping Phase 4 (grind).")
        return

    # 4A. Non-starting navigation probes (8006)
    print("\n--- 4A. Grinder Enter (8006) Non-Starting & Range Probe ---")
    enter_60_frames = await session.send_and_collect(
        build_type1(8006, [60, 80]), label="GRINDER_ENTER_8006(size=60,rpm=80)", wait_seconds=2.0
    )
    obs_60 = (
        await ainput(
            "  -> Sent 8006 [60, 80]. Did the display open Grinder without starting the motor? What grind size/RPM is shown?: "
        )
    ).strip()

    # Probe BLE grind size < 40 (e.g., 20) and RPM step 5 (e.g., 85)
    enter_20_frames = await session.send_and_collect(
        build_type1(8006, [20, 85]), label="GRINDER_ENTER_8006(size=20,rpm=85)", wait_seconds=2.0
    )
    obs_20 = (
        await ainput(
            "  -> Sent 8006 [20, 85]. What grind size and RPM does the Studio display show now?: "
        )
    ).strip()

    # Return to standard size=60, rpm=80 before motor test
    await session.send_and_collect(
        build_type1(8006, [60, 80]), label="GRINDER_ENTER_8006(size=60,rpm=80)", wait_seconds=1.5
    )

    # 4B. Attended Motor Start (3500) & Stop (3505)
    start_frames: list[dict[str, Any]] = []
    stop_frames: list[dict[str, Any]] = []
    stop_repeat_frames: list[dict[str, Any]] = []
    natural_frames: list[dict[str, Any]] = []

    if ask_yes_no("\n  Run attended Grinder Start (3500) for ~2.5s followed by Grinder Stop (3505)?", default=True):
        session.active_motor_or_water = "grind"
        try:
            idx_start = await session.send_frame(
                build_type1(3500, [1000, 60, 80]), label="GRINDER_START_3500(1000,size=60,rpm=80)"
            )
            await asyncio.sleep(2.5)
            start_frames = session.frames_since(idx_start)

            stop_frames = await session.send_and_collect(
                build_type1(3505), label="GRINDER_STOP_3505", wait_seconds=2.5
            )
            session.active_motor_or_water = None

            # Test repeated Stop (3505) idempotency
            stop_repeat_frames = await session.send_and_collect(
                build_type1(3505), label="GRINDER_STOP_3505_REPEAT", wait_seconds=1.5
            )
        finally:
            if session.active_motor_or_water == "grind":
                await session.emergency_stop()

    if ask_yes_no(
        "\n  Also observe empty-hopper auto-stop / natural completion on 3500 (waits up to 15s, or press Ctrl+C to stop)?",
        default=True,
    ):
        await session.send_and_collect(
            build_type1(8006, [60, 80]), label="GRINDER_ENTER_8006(size=60,rpm=80)", wait_seconds=1.2
        )
        session.active_motor_or_water = "grind"
        try:
            idx_nat = await session.send_frame(
                build_type1(3500, [1000, 60, 80]), label="GRINDER_START_3500_NATURAL"
            )
            deadline = time.monotonic() + 15.0
            while time.monotonic() < deadline:
                recent = session.frames_since(idx_nat)
                if any(f.get("cmdCodeLE") in (40507, 9004, 8023) for f in recent):
                    await asyncio.sleep(1.0)
                    break
                await asyncio.sleep(0.2)
            else:
                print("  15s elapsed without auto-stop; sending 3505 Stop...")
                await session.send_and_collect(build_type1(3505), label="GRINDER_STOP_3505_FALLBACK", wait_seconds=2.0)
            natural_frames = session.frames_since(idx_nat)
            session.active_motor_or_water = None
        finally:
            if session.active_motor_or_water == "grind":
                await session.emergency_stop()

    print("\n  Sending 8012 (Grinder Quit)...")
    quit_frames = await session.send_and_collect(
        build_type1(8012), label="GRINDER_QUIT_8012", wait_seconds=2.0
    )

    session.capture["sections"]["grind"] = {
        "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "enter60Frames": enter_60_frames,
        "enter60DisplayObserved": obs_60,
        "enter20Frames": enter_20_frames,
        "enter20DisplayObserved": obs_20,
        "startFrames": start_frames,
        "stopFrames": stop_frames,
        "stopRepeatFrames": stop_repeat_frames,
        "naturalCompletionFrames": natural_frames,
        "quitFrames": quit_frames,
    }
    session.save_capture()
    print(f"\n[OK] Saved Phase 4 (grind) capture to {LATEST_CAPTURE_PATH.relative_to(REPO_ROOT)}")


async def run_phase_pour(session: QualificationSession) -> None:
    print("\n" + "=" * 72)
    print("PHASE 5: Pour / Brewer Tool Qualification (8007, 4506, 4510, 8016, 4507, 8013)")
    print("=" * 72)
    print("  SAFETY CHECK: Place an empty cup (>= 150 ml capacity) on the scale and confirm water is in the tank.")
    if not ask_yes_no("  Ready to run Phase 5 (Pour Tool)?", default=True):
        print("  Skipping Phase 5 (pour).")
        return

    info_before = await session.refresh_info(wait_seconds=1.5)

    # 5A. Non-starting Brewer Enter (8007)
    print("\n--- 5A. Brewer Enter (8007) Non-Starting Navigation ---")
    # [pattern=1 (circular), temp=25.0C * 10 as float32 bits]
    enter_frames = await session.send_and_collect(
        build_type1(8007, [1, float_bits_to_int32(250.0)]),
        label="BREWER_ENTER_8007(pattern=1,temp=25C)",
        wait_seconds=2.5,
    )
    obs_enter = (
        await ainput(
            "  -> Sent 8007 [1, 25.0C]. Did the Studio enter Brewer screen without pouring water? (y/n + notes): "
        )
    ).strip()

    # 5B. Attended Targeted Pour (4506) + Live Temp (4510) + Live Pattern (8016) + Stop (4507)
    session.echo_telemetry = True
    pour_stop_run: dict[str, Any] = {}
    pour_natural_run: dict[str, Any] = {}
    continuous_probe_run: dict[str, Any] = {}

    try:
        if ask_yes_no(
            "\n  Run 5B: Start ambient/warm 25C pour (4506, 60ml target @ 3.0 ml/s), test live temp (4510) + pattern (8016), then Stop (4507)?",
            default=True,
        ):
            session.active_motor_or_water = "pour"
            idx_run = session.mark()
            # 4506 payload: [tempC*10, pattern, volumeMl, flowRate*10_float32]
            start_f = await session.send_and_collect(
                build_type1(4506, [250, 1, 60, float_bits_to_int32(30.0)]),
                label="BREWER_START_4506(25C,pattern=1,vol=60ml,flow=3.0)",
                wait_seconds=3.0,
            )
            temp_f = await session.send_and_collect(
                build_type1(4510, [400]),
                label="BREWER_LIVE_TEMP_4510(40C)",
                wait_seconds=2.0,
            )
            pat_f = await session.send_and_collect(
                build_type1(8016, [2]),
                label="BREWER_LIVE_PATTERN_8016(spiral=2)",
                wait_seconds=2.0,
            )
            stop_f = await session.send_and_collect(
                build_type1(4507),
                label="BREWER_STOP_4507",
                wait_seconds=3.0,
            )
            session.active_motor_or_water = None
            stop_repeat_f = await session.send_and_collect(
                build_type1(4507),
                label="BREWER_STOP_4507_REPEAT",
                wait_seconds=1.5,
            )
            pour_stop_run = {
                "startFrames": start_f,
                "liveTempFrames": temp_f,
                "livePatternFrames": pat_f,
                "stopFrames": stop_f,
                "stopRepeatFrames": stop_repeat_f,
                "allRunFrames": session.frames_since(idx_run),
            }

        # 5C. Small Natural Completion Pour (4506, 15ml @ 3.5 ml/s, 25C)
        if ask_yes_no(
            "\n  Run 5C: Small 15 ml ambient pour (4506) allowed to finish naturally so we capture natural terminal proof?",
            default=True,
        ):
            await session.send_and_collect(
                build_type1(8007, [0, float_bits_to_int32(250.0)]),
                label="BREWER_ENTER_8007(pattern=0,temp=25C)",
                wait_seconds=1.5,
            )
            session.active_motor_or_water = "pour"
            idx_nat = await session.send_frame(
                build_type1(4506, [250, 0, 15, float_bits_to_int32(35.0)]),
                label="BREWER_START_4506_NATURAL(25C,pattern=0,vol=15ml,flow=3.5)",
            )
            deadline = time.monotonic() + 20.0
            while time.monotonic() < deadline:
                recent = session.frames_since(idx_nat)
                if any(f.get("cmdCodeLE") in (40511, 9006) for f in recent) or any(
                    f.get("kind") == "status" and f.get("stateByte") in (0x10, 0x01, 0x41)
                    for f in recent
                ):
                    await asyncio.sleep(1.5)
                    break
                await asyncio.sleep(0.2)
            else:
                print("  20s elapsed; sending 4507 Stop...")
                await session.send_and_collect(build_type1(4507), label="BREWER_STOP_4507_FALLBACK", wait_seconds=2.0)
            session.active_motor_or_water = None
            pour_natural_run = {
                "frames": session.frames_since(idx_nat),
            }

        # 5D. Continuous Pour Probe (4506 with volume=0 vs 8019 FreeSolo pour)
        if ask_yes_no(
            "\n  Run 5D: Probe continuous pour candidate (4506 with volume=0, stopped after 3s if it pours)?",
            default=True,
        ):
            await session.send_and_collect(
                build_type1(8007, [1, float_bits_to_int32(250.0)]),
                label="BREWER_ENTER_8007",
                wait_seconds=1.2,
            )
            session.active_motor_or_water = "pour"
            idx_cont = await session.send_frame(
                build_type1(4506, [250, 1, 0, float_bits_to_int32(30.0)]),
                label="BREWER_START_4506_VOL0_PROBE(25C,pattern=1,vol=0,flow=3.0)",
            )
            await asyncio.sleep(3.5)
            stop_cont = await session.send_and_collect(
                build_type1(4507), label="BREWER_STOP_4507_AFTER_VOL0", wait_seconds=2.0
            )
            session.active_motor_or_water = None
            obs_cont = (
                await ainput("  -> Did 4506 with volume=0 pour water or refuse/complete immediately?: ")
            ).strip()
            continuous_probe_run = {
                "frames": session.frames_since(idx_cont),
                "stopFrames": stop_cont,
                "userObserved": obs_cont,
            }
    finally:
        session.echo_telemetry = False
        if session.active_motor_or_water == "pour":
            await session.emergency_stop()

    print("\n  Sending 8013 (Brewer Quit)...")
    quit_frames = await session.send_and_collect(
        build_type1(8013), label="BREWER_QUIT_8013", wait_seconds=2.0
    )

    session.capture["sections"]["pour"] = {
        "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "infoBefore": info_before,
        "enterFrames": enter_frames,
        "enterDisplayObserved": obs_enter,
        "stopAndLiveControlsRun": pour_stop_run,
        "naturalCompletionRun": pour_natural_run,
        "continuousVol0Probe": continuous_probe_run,
        "quitFrames": quit_frames,
    }
    session.save_capture()
    print(f"\n[OK] Saved Phase 5 (pour) capture to {LATEST_CAPTURE_PATH.relative_to(REPO_ROOT)}")


def run_self_test() -> None:
    """Verify frame builders, CRC-16/KERMIT, and parsers against known vectors."""
    # 1. Handshake 8100 [185, 1] - exact vector from protocol.test.ts
    hs = build_type1(8100, [185, 1])
    assert hs.hex().upper() == "580101A41F1400000001B900000001000000BDD1", hs.hex().upper()

    # 2. Commit 8002 [] - exact vector from protocol.test.ts
    commit = build_type1(8002)
    assert commit.hex().upper() == "580101421F0C000000017FCF", commit.hex().upper()

    # 3. Type 2 11506 empty payload
    t2 = build_type2(11506)
    assert t2[:10] == bytes([0x58, 0x01, 0x02, 0xF2, 0x2C, 0x0C, 0x00, 0x00, 0x00, 0x01])
    assert crc16_kermit(t2[:-2]) == (t2[-2] | (t2[-1] << 8))

    # 4. Event 8011 (0x4B 0x1F empty payload) from protocol.test.ts
    awake = bytes([0x58, 0x02, 0x07, 0x4B, 0x1F, 0x0C, 0x00, 0x00, 0x00, 0xC1, 0xFC, 0x83])
    p_awake = parse_frame(awake)
    assert p_awake["kind"] == "event" and p_awake["cmdCodeLE"] == 8011

    # 5. Captured 40521 MachineInfo frame from protocol.test.ts
    captured_info = bytes(
        [
            0x58, 0x02, 0x07, 0x49, 0x9E, 0x4B, 0x00, 0x00, 0x00, 0xC1,
            0x4A, 0x31, 0x35, 0x41, 0x30, 0x32, 0x41, 0x34, 0x35, 0x48,
            0x30, 0x33, 0x38, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x56,
            0x31, 0x32, 0x2E, 0x30, 0x44, 0x2E, 0x35, 0x30, 0x30, 0x80,
            0x30, 0xBA, 0x47, 0x00, 0x00, 0x01, 0x01, 0x5A, 0x0F, 0x6E,
            0x01, 0x01, 0x41, 0x36, 0x03, 0x00, 0x00, 0x00, 0x11, 0xDF,
            0x42, 0x91, 0x32, 0x78, 0x56, 0xBC, 0x02, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x39, 0x34,
        ]
    )

    # 6. Synthetic status frame 0x29 (Scale)
    s_head = bytearray([0x58, 0x02, 0x07, 0x57, 0x00, 13, 0, 0, 0, 0xC1, 0x29])
    s_crc = crc16_kermit(s_head)
    status_frame = bytes(s_head) + bytes([s_crc & 0xFF, (s_crc >> 8) & 0xFF])

    parts = split_frames(captured_info + status_frame)
    assert len(parts) == 2
    p0 = parse_frame(parts[0])
    p1 = parse_frame(parts[1])
    assert p0["kind"] == "info" and p0["info"]["serialTrimmed"] == "J15A02A45H038"
    assert p0["info"]["firmware"] == "V12.0D.500"
    assert p0["info"]["waterFeed_36"] == 1
    assert p1["kind"] == "status" and p1["stateName"] == "SCALE"
    print("[SELF-TEST OK] Frame encoding, CRC-16/KERMIT, packet splitting, and parsers verified.")


async def discover_studio(timeout: float = 8.0, explicit_address: str | None = None) -> tuple[Any, str, str]:
    from bleak import BleakScanner

    if explicit_address:
        print(f"Looking up xBloom Studio at {explicit_address}...")
        dev = await BleakScanner.find_device_by_address(explicit_address, timeout=timeout)
        if dev is not None:
            return dev, (dev.name or "XBLOOM"), dev.address

    print(f"Scanning for xBloom Studio over Bluetooth LE ({timeout:.0f}s)...")
    devices = await BleakScanner.discover(timeout=timeout, return_adv=True)
    candidates: list[tuple[Any, Any]] = []
    for dev, adv in devices.values():
        name = (dev.name or adv.local_name or "").upper()
        uuids = [u.lower() for u in (adv.service_uuids or [])]
        if name.startswith("XBLOOM") or SERVICE_UUID in uuids:
            candidates.append((dev, adv))

    if not candidates:
        raise RuntimeError(
            "No xBloom Studio found via BLE scan. Ensure the Studio is awake (tap the knob) and disconnected from your phone."
        )

    candidates.sort(key=lambda item: getattr(item[1], "rssi", -999) or -999, reverse=True)
    for idx, (dev, adv) in enumerate(candidates):
        print(f"  [{idx}] {dev.name or adv.local_name or 'XBLOOM'} ({dev.address}) RSSI={adv.rssi}")
    best_dev, best_adv = candidates[0]
    return best_dev, (best_dev.name or best_adv.local_name or "XBLOOM"), best_dev.address


async def async_main(args: argparse.Namespace) -> None:
    from bleak import BleakClient

    dev, dev_name, dev_addr = await discover_studio(
        timeout=args.scan_timeout, explicit_address=args.address
    )
    print(f"\nConnecting to {dev_name} ({dev_addr})...")

    async with BleakClient(dev) as client:
        session = QualificationSession(client, dev_name, dev_addr)

        await client.start_notify(
            NOTIFY_CHAR_UUID,
            lambda _char, data: session.on_notification("FFE2", data),
        )
        try:
            await client.start_notify(
                SECONDARY_NOTIFY_CHAR_UUID,
                lambda _char, data: session.on_notification("FFE3", data),
            )
            print("Subscribed to both FFE2 and FFE3 notifications.")
        except Exception:
            print("Subscribed to FFE2 notifications (FFE3 notify not exposed).")

        try:
            sections = (
                ["info", "settings", "scale", "grind", "pour"]
                if args.section == "all"
                else [args.section]
            )
            if "info" not in sections:
                await run_phase_info(session)
            for sec in sections:
                if sec == "info":
                    await run_phase_info(session)
                elif sec == "settings":
                    await run_phase_settings(session)
                elif sec == "scale":
                    await run_phase_scale(session)
                elif sec == "grind":
                    await run_phase_grind(session)
                elif sec == "pour":
                    await run_phase_pour(session)
        except KeyboardInterrupt:
            print("\n[INTERRUPTED] Ctrl+C received.")
            await session.emergency_stop()
            session.save_capture()
            raise
        finally:
            if session.active_motor_or_water:
                await session.emergency_stop()
            session.save_capture()

    print("\n" + "=" * 72)
    print(f"All requested sections finished! Evidence written to:")
    print(f"  {LATEST_CAPTURE_PATH}")
    print("=" * 72)


def main() -> None:
    parser = argparse.ArgumentParser(description="Interactive Mac BLE Qualification Runner for xBloom Studio")
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run offline protocol encoding/decoding self-tests and exit.",
    )
    parser.add_argument(
        "--section",
        choices=["all", "info", "settings", "scale", "grind", "pour"],
        default="all",
        help="Run all qualification phases or a single phase (default: all).",
    )
    parser.add_argument(
        "--scan-timeout",
        type=float,
        default=8.0,
        help="BLE scan timeout in seconds (default: 8.0).",
    )
    parser.add_argument(
        "--address",
        type=str,
        default=None,
        help="Optional CoreBluetooth peripheral UUID to connect to directly.",
    )
    args = parser.parse_args()

    if args.self_test:
        run_self_test()
        return

    try:
        asyncio.run(async_main(args))
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()

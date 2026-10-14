"""Fail-closed Windows OpenSSH key-holder lifecycle for DawnTrader laptop callers."""

from __future__ import annotations

import ctypes
from ctypes import wintypes
import hashlib
import json
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, Sequence


FINGERPRINT_RE = re.compile(r"\bSHA256:[A-Za-z0-9+/]{43}\b")


class KeyholderError(RuntimeError):
    """A key-holder invariant was not satisfied."""


@dataclass(frozen=True)
class ServiceEpoch:
    pid: int
    start_ticks: int


@dataclass(frozen=True)
class Config:
    expected_fingerprint: str
    private_key_path: Path
    marker_path: Path
    registry_path: str
    clients: dict[str, Path]

    @classmethod
    def load(cls, path: Path) -> "Config":
        try:
            raw = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError) as exc:
            raise KeyholderError(f"cannot read key-holder config: {path}") from exc

        required = {
            "expectedFingerprint",
            "privateKeyPath",
            "markerPath",
            "registryPath",
            "clients",
        }
        if not isinstance(raw, dict):
            raise KeyholderError("key-holder config root must be an object")
        missing = sorted(required - raw.keys())
        if missing:
            raise KeyholderError(f"key-holder config is missing: {', '.join(missing)}")

        fingerprint = str(raw["expectedFingerprint"])
        if FINGERPRINT_RE.fullmatch(fingerprint) is None:
            raise KeyholderError("configured fingerprint is not an SHA256 fingerprint")

        if not isinstance(raw["clients"], dict):
            raise KeyholderError("configured clients must be an object")
        clients = {name: Path(value) for name, value in raw["clients"].items()}
        if set(clients) != {"ssh", "scp", "sftp"}:
            raise KeyholderError("configured clients must be exactly ssh, scp and sftp")
        expected_clients = {
            "ssh": r"C:\Windows\System32\OpenSSH\ssh.exe",
            "scp": r"C:\Windows\System32\OpenSSH\scp.exe",
            "sftp": r"C:\Windows\System32\OpenSSH\sftp.exe",
        }
        for name, expected_path in expected_clients.items():
            observed = str(clients[name]).replace("/", "\\").casefold()
            if observed != expected_path.casefold():
                raise KeyholderError(f"{name} must use the absolute Windows OpenSSH client")
        if str(raw["registryPath"]) != r"Software\OpenSSH\Agent\Keys":
            raise KeyholderError("registry path is outside the bounded Windows OpenSSH identity store")

        private_key_path = Path(raw["privateKeyPath"])
        marker_path = Path(raw["markerPath"])
        if not private_key_path.is_absolute() or not marker_path.is_absolute():
            raise KeyholderError("private key and marker paths must be absolute")

        return cls(
            expected_fingerprint=fingerprint,
            private_key_path=private_key_path,
            marker_path=marker_path,
            registry_path=str(raw["registryPath"]),
            clients=clients,
        )


class Backend(Protocol):
    def current_luid(self) -> str: ...
    def service_epoch(self) -> ServiceEpoch: ...
    def set_service_manual_and_start(self) -> None: ...
    def stop_service(self) -> None: ...
    def list_fingerprints(self) -> list[str]: ...
    def purge_identities(self) -> None: ...
    def add_identity(self, path: Path) -> None: ...
    def registry_snapshot(self) -> dict[str, str]: ...
    def purge_registry(self) -> None: ...
    def remove_registry_records(self, records: set[str]) -> None: ...
    def read_marker(self) -> dict[str, Any]: ...
    def write_marker(self, marker: dict[str, Any]) -> None: ...
    def remove_marker(self) -> None: ...
    def run_client(self, client: Path, args: Sequence[str]) -> int: ...


class WindowsBackend:
    def __init__(self, config: Config):
        if os.name != "nt":
            raise KeyholderError("the production key-holder only runs on Windows")
        self.config = config

    @staticmethod
    def _run(argv: Sequence[str], *, capture: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(item) for item in argv],
            check=False,
            capture_output=capture,
            text=True,
        )

    @staticmethod
    def _powershell(script: str) -> subprocess.CompletedProcess[str]:
        return WindowsBackend._run([
            r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
        ])

    def current_luid(self) -> str:
        class Luid(ctypes.Structure):
            _fields_ = [("LowPart", ctypes.c_uint32), ("HighPart", ctypes.c_int32)]

        class TokenStatistics(ctypes.Structure):
            _fields_ = [
                ("TokenId", Luid),
                ("AuthenticationId", Luid),
                ("ExpirationTime", ctypes.c_int64),
                ("TokenType", ctypes.c_int),
                ("ImpersonationLevel", ctypes.c_int),
                ("DynamicCharged", ctypes.c_uint32),
                ("DynamicAvailable", ctypes.c_uint32),
                ("GroupCount", ctypes.c_uint32),
                ("PrivilegeCount", ctypes.c_uint32),
                ("ModifiedId", Luid),
            ]

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)
        kernel32.GetCurrentProcess.argtypes = []
        kernel32.GetCurrentProcess.restype = wintypes.HANDLE
        kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel32.CloseHandle.restype = wintypes.BOOL
        advapi32.OpenProcessToken.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
        advapi32.OpenProcessToken.restype = wintypes.BOOL
        advapi32.GetTokenInformation.argtypes = [
            wintypes.HANDLE,
            ctypes.c_int,
            wintypes.LPVOID,
            wintypes.DWORD,
            ctypes.POINTER(wintypes.DWORD),
        ]
        advapi32.GetTokenInformation.restype = wintypes.BOOL

        token = wintypes.HANDLE()
        if not advapi32.OpenProcessToken(kernel32.GetCurrentProcess(), 0x0008, ctypes.byref(token)):
            raise KeyholderError("cannot open the current process token")
        try:
            stats = TokenStatistics()
            returned = wintypes.DWORD()
            if not advapi32.GetTokenInformation(
                token,
                10,
                ctypes.byref(stats),
                ctypes.sizeof(stats),
                ctypes.byref(returned),
            ):
                raise KeyholderError("cannot read the current logon authentication id")
            high = stats.AuthenticationId.HighPart & 0xFFFFFFFF
            return f"{high:08x}:{stats.AuthenticationId.LowPart:08x}"
        finally:
            kernel32.CloseHandle(token)

    def service_epoch(self) -> ServiceEpoch:
        result = self._powershell(
            "$s=Get-CimInstance Win32_Service -Filter \"Name='ssh-agent'\";"
            "if(!$s -or $s.State -ne 'Running' -or $s.ProcessId -eq 0){exit 3};"
            "$p=Get-Process -Id $s.ProcessId -ErrorAction Stop;"
            "@{pid=[int]$s.ProcessId;startTicks=[long]$p.StartTime.ToUniversalTime().Ticks}"
            "|ConvertTo-Json -Compress"
        )
        if result.returncode != 0:
            raise KeyholderError("Windows ssh-agent is not running")
        try:
            value = json.loads(result.stdout)
            return ServiceEpoch(pid=int(value["pid"]), start_ticks=int(value["startTicks"]))
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            raise KeyholderError("cannot determine the ssh-agent service epoch") from exc

    def set_service_manual_and_start(self) -> None:
        result = self._powershell(
            "Set-Service -Name ssh-agent -StartupType Manual -ErrorAction Stop;"
            "Start-Service -Name ssh-agent -ErrorAction Stop"
        )
        if result.returncode != 0:
            raise KeyholderError("cannot set ssh-agent to Manual and start it; run elevated")

    def stop_service(self) -> None:
        result = self._powershell(
            "$s=Get-Service -Name ssh-agent -ErrorAction Stop;"
            "if($s.Status -ne 'Stopped'){Stop-Service -Name ssh-agent -Force -ErrorAction Stop}"
        )
        if result.returncode != 0:
            raise KeyholderError("cannot stop ssh-agent; run elevated")

    @property
    def _ssh_add(self) -> Path:
        return self.config.clients["ssh"].with_name("ssh-add.exe")

    def list_fingerprints(self) -> list[str]:
        result = self._run([self._ssh_add, "-l", "-E", "sha256"])
        if result.returncode not in (0, 1):
            raise KeyholderError("cannot read identities from Windows ssh-agent")
        return FINGERPRINT_RE.findall(result.stdout + "\n" + result.stderr)

    def purge_identities(self) -> None:
        result = self._run([self._ssh_add, "-D"])
        if result.returncode not in (0, 1):
            raise KeyholderError("cannot purge identities from Windows ssh-agent")

    def add_identity(self, path: Path) -> None:
        if not path.is_file():
            raise KeyholderError(f"configured private key is absent: {path}")
        result = self._run([self._ssh_add, path], capture=False)
        if result.returncode != 0:
            raise KeyholderError("ssh-add did not load the configured identity")

    def _open_registry(self, path: str, access: int):
        import winreg

        return winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, access)

    def registry_snapshot(self) -> dict[str, str]:
        import winreg

        records: dict[str, str] = {}

        def walk(path: str, *, root: bool = False) -> None:
            try:
                key = self._open_registry(path, winreg.KEY_READ)
            except FileNotFoundError:
                return
            with key:
                if not root:
                    records[f"k|{path}"] = "present"
                value_index = 0
                while True:
                    try:
                        name, data, value_type = winreg.EnumValue(key, value_index)
                    except OSError:
                        break
                    digest = hashlib.sha256(repr((value_type, data)).encode("utf-8")).hexdigest()
                    records[f"v|{path}|{name}"] = digest
                    value_index += 1
                child_index = 0
                while True:
                    try:
                        child = winreg.EnumKey(key, child_index)
                    except OSError:
                        break
                    walk(f"{path}\\{child}")
                    child_index += 1

        walk(self.config.registry_path, root=True)
        return records

    def _delete_tree(self, path: str) -> None:
        import winreg

        try:
            key = self._open_registry(path, winreg.KEY_READ | winreg.KEY_WRITE)
        except FileNotFoundError:
            return
        children: list[str] = []
        with key:
            index = 0
            while True:
                try:
                    children.append(winreg.EnumKey(key, index))
                except OSError:
                    break
                index += 1
        for child in children:
            self._delete_tree(f"{path}\\{child}")
        parent, _, leaf = path.rpartition("\\")
        with self._open_registry(parent, winreg.KEY_WRITE) as parent_key:
            winreg.DeleteKey(parent_key, leaf)

    def purge_registry(self) -> None:
        self._delete_tree(self.config.registry_path)

    def remove_registry_records(self, records: set[str]) -> None:
        import winreg

        for record in sorted((item for item in records if item.startswith("v|"))):
            _, path, name = record.split("|", 2)
            try:
                with self._open_registry(path, winreg.KEY_SET_VALUE) as key:
                    winreg.DeleteValue(key, name)
            except FileNotFoundError:
                pass
        keys = [item[2:] for item in records if item.startswith("k|")]
        for path in sorted(keys, key=lambda value: value.count("\\"), reverse=True):
            self._delete_tree(path)

    def read_marker(self) -> dict[str, Any]:
        try:
            return json.loads(self.config.marker_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise KeyholderError("the current logon has not been unlocked") from exc

    @staticmethod
    def _current_sid() -> str:
        result = WindowsBackend._run([r"C:\Windows\System32\whoami.exe", "/user", "/fo", "csv", "/nh"])
        match = re.search(r'"(S-1-[0-9-]+)"', result.stdout)
        if result.returncode != 0 or match is None:
            raise KeyholderError("cannot determine the current Windows account SID")
        return match.group(1)

    @staticmethod
    def _secure_path(path: Path, *, directory: bool) -> None:
        sid = WindowsBackend._current_sid()
        inheritance = "(OI)(CI)F" if directory else "F"
        result = WindowsBackend._run([
            r"C:\Windows\System32\icacls.exe",
            path,
            "/inheritance:r",
            "/grant:r",
            f"*{sid}:{inheritance}",
            f"*S-1-5-18:{inheritance}",
        ])
        if result.returncode != 0:
            raise KeyholderError(f"cannot apply owner-only permissions to {path}")

    def write_marker(self, marker: dict[str, Any]) -> None:
        parent = self.config.marker_path.parent
        parent.mkdir(parents=True, exist_ok=True)
        self._secure_path(parent, directory=True)
        handle, temporary = tempfile.mkstemp(prefix="unlock-", suffix=".tmp", dir=parent)
        try:
            with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
                json.dump(marker, stream, sort_keys=True)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.config.marker_path)
            self._secure_path(self.config.marker_path, directory=False)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def remove_marker(self) -> None:
        try:
            self.config.marker_path.unlink()
        except FileNotFoundError:
            pass

    def run_client(self, client: Path, args: Sequence[str]) -> int:
        if not client.is_file():
            raise KeyholderError(f"configured Windows OpenSSH client is absent: {client}")
        return subprocess.run([str(client), *args], check=False).returncode


class Keyholder:
    def __init__(self, config: Config, backend: Backend):
        self.config = config
        self.backend = backend

    def _expected_only(self) -> None:
        fingerprints = self.backend.list_fingerprints()
        if fingerprints != [self.config.expected_fingerprint]:
            raise KeyholderError(
                "Windows ssh-agent must hold exactly the configured fingerprint; "
                f"observed {len(fingerprints)} identity/identities"
            )

    def assert_unlocked(self) -> dict[str, Any]:
        marker = self.backend.read_marker()
        epoch = self.backend.service_epoch()
        expected = {
            "version": 1,
            "fingerprint": self.config.expected_fingerprint,
            "luid": self.backend.current_luid(),
            "agentPid": epoch.pid,
            "agentStartTicks": epoch.start_ticks,
        }
        if marker != expected:
            raise KeyholderError("unlock marker does not match this logon and ssh-agent epoch")
        if self.backend.registry_snapshot():
            raise KeyholderError("Windows ssh-agent has persistent registry material")
        self._expected_only()
        return expected

    def unlock(self) -> dict[str, Any]:
        self.backend.remove_marker()
        self.backend.set_service_manual_and_start()
        try:
            self.backend.purge_identities()
            self.backend.purge_registry()
            if self.backend.list_fingerprints():
                raise KeyholderError("Windows ssh-agent was not empty after purge")
            if self.backend.registry_snapshot():
                raise KeyholderError("Windows ssh-agent registry was not empty after purge")

            before = self.backend.registry_snapshot()
            self.backend.add_identity(self.config.private_key_path)
            self._expected_only()
            after = self.backend.registry_snapshot()
            added = set(after) - set(before)
            changed = {name for name in after.keys() & before.keys() if after[name] != before[name]}
            attributed = added | changed
            if not attributed:
                raise KeyholderError("ssh-add created no attributable registry record")
            self.backend.remove_registry_records(attributed)
            if self.backend.registry_snapshot():
                raise KeyholderError("the attributed persistent registry record remains")
            self._expected_only()

            epoch = self.backend.service_epoch()
            marker = {
                "version": 1,
                "fingerprint": self.config.expected_fingerprint,
                "luid": self.backend.current_luid(),
                "agentPid": epoch.pid,
                "agentStartTicks": epoch.start_ticks,
            }
            self.backend.write_marker(marker)
            return self.assert_unlocked()
        except Exception as exc:
            cleanup_errors: list[str] = []
            for operation in (
                self.backend.remove_marker,
                self.backend.purge_identities,
                self.backend.purge_registry,
                self.backend.stop_service,
            ):
                try:
                    operation()
                except Exception as cleanup_exc:
                    cleanup_errors.append(str(cleanup_exc))
            if cleanup_errors:
                raise KeyholderError(
                    f"unlock failed ({exc}); fail-closed cleanup also failed: "
                    + "; ".join(cleanup_errors)
                ) from exc
            raise

    def lock(self) -> None:
        self.backend.remove_marker()
        try:
            self.backend.service_epoch()
        except KeyholderError:
            pass
        else:
            self.backend.purge_identities()
            if self.backend.list_fingerprints():
                raise KeyholderError("Windows ssh-agent still holds an identity after purge")
        self.backend.purge_registry()
        if self.backend.registry_snapshot():
            raise KeyholderError("Windows ssh-agent registry still holds identity material")
        self.backend.stop_service()
        try:
            self.backend.service_epoch()
        except KeyholderError:
            return
        raise KeyholderError("Windows ssh-agent is still running after lock")

    def execute(self, client_name: str, args: Sequence[str]) -> int:
        marker = self.assert_unlocked()
        client = self.config.clients.get(client_name)
        if client is None:
            raise KeyholderError(f"unsupported client: {client_name}")
        print(
            f"ssh-keyholder: launching {client} with {marker['fingerprint']} "
            f"from agent pid {marker['agentPid']}",
            file=os.sys.stderr,
        )
        return self.backend.run_client(client, args)

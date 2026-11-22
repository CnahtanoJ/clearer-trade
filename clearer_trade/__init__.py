"""clearer.trade post-trade execution auditing and telemetry primitives."""

from .telemetry import (
    anonymize_baskets,
    build_telemetry_payload,
    compute_attestation_sha256,
    compute_execution_hygiene,
    compute_twr_series,
    compute_twr_summary,
    validate_telemetry_payload,
    verify_attestation,
)

__version__ = "0.1.0"

__all__ = [
    "__version__",
    "anonymize_baskets",
    "build_telemetry_payload",
    "compute_attestation_sha256",
    "compute_execution_hygiene",
    "compute_twr_series",
    "compute_twr_summary",
    "validate_telemetry_payload",
    "verify_attestation",
]

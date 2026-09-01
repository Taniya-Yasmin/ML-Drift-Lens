"""Pydantic v2 API contracts shared by the FastAPI services."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    """Base API model that rejects misspelled or unsupported fields."""

    model_config = ConfigDict(extra="forbid")


class HealthResponse(APIModel):
    status: Literal["ok"]


ProtocolType = Literal["icmp", "tcp", "udp"]
ServiceType = Literal[
    "IRC", "X11", "Z39_50", "aol", "auth", "bgp", "courier", "csnet_ns",
    "ctf", "daytime", "discard", "domain", "domain_u", "echo", "eco_i",
    "ecr_i", "efs", "exec", "finger", "ftp", "ftp_data", "gopher",
    "harvest", "hostnames", "http", "http_2784", "http_443", "http_8001",
    "imap4", "iso_tsap", "klogin", "kshell", "ldap", "link", "login",
    "mtp", "name", "netbios_dgm", "netbios_ns", "netbios_ssn", "netstat",
    "nnsp", "nntp", "ntp_u", "other", "pm_dump", "pop_2", "pop_3",
    "printer", "private", "red_i", "remote_job", "rje", "shell", "smtp",
    "sql_net", "ssh", "sunrpc", "supdup", "systat", "telnet", "tftp_u",
    "tim_i", "time", "urh_i", "urp_i", "uucp", "uucp_path", "vmnet", "whois",
]
FlagType = Literal["OTH", "REJ", "RSTO", "RSTOS0", "RSTR", "S0", "S1", "S2", "S3", "SF", "SH"]


class TrafficInput(APIModel):
    """NSL-KDD feature vector accepted by the inference endpoint."""

    duration: float = Field(ge=0)
    protocol_type: ProtocolType
    service: ServiceType
    flag: FlagType
    src_bytes: float = Field(ge=0)
    dst_bytes: float = Field(ge=0)
    land: int = Field(ge=0, le=1)
    wrong_fragment: float = Field(ge=0)
    urgent: float = Field(ge=0)
    hot: float = Field(ge=0)
    num_failed_logins: float = Field(ge=0)
    logged_in: int = Field(ge=0, le=1)
    num_compromised: float = Field(ge=0)
    root_shell: int = Field(ge=0, le=1)
    su_attempted: int = Field(ge=0, le=2)
    num_root: float = Field(ge=0)
    num_file_creations: float = Field(ge=0)
    num_shells: float = Field(ge=0)
    num_access_files: float = Field(ge=0)
    num_outbound_cmds: float = Field(ge=0)
    is_host_login: int = Field(ge=0, le=1)
    is_guest_login: int = Field(ge=0, le=1)
    count: float = Field(ge=0)
    srv_count: float = Field(ge=0)
    serror_rate: float = Field(ge=0, le=1)
    srv_serror_rate: float = Field(ge=0, le=1)
    rerror_rate: float = Field(ge=0, le=1)
    srv_rerror_rate: float = Field(ge=0, le=1)
    same_srv_rate: float = Field(ge=0, le=1)
    diff_srv_rate: float = Field(ge=0, le=1)
    srv_diff_host_rate: float = Field(ge=0, le=1)
    dst_host_count: float = Field(ge=0)
    dst_host_srv_count: float = Field(ge=0)
    dst_host_same_srv_rate: float = Field(ge=0, le=1)
    dst_host_diff_srv_rate: float = Field(ge=0, le=1)
    dst_host_same_src_port_rate: float = Field(ge=0, le=1)
    dst_host_srv_diff_host_rate: float = Field(ge=0, le=1)
    dst_host_serror_rate: float = Field(ge=0, le=1)
    dst_host_srv_serror_rate: float = Field(ge=0, le=1)
    dst_host_rerror_rate: float = Field(ge=0, le=1)
    dst_host_srv_rerror_rate: float = Field(ge=0, le=1)


class PredictionResponse(APIModel):
    prediction: Literal["attack", "normal"]
    confidence: float = Field(ge=0, le=1)
    timestamp: datetime


class DriftFeatureScore(APIModel):
    psi: float = Field(ge=0)
    zscore: float


class DriftCheckResponse(APIModel):
    status: Literal["drift", "no_drift"]
    drifted_features: list[str]
    num_drifted_features: int = Field(ge=0)
    total_features_checked: int = Field(ge=0)
    per_feature: dict[str, DriftFeatureScore]
    checked_at: datetime
    sample_size: int = Field(ge=1)


class RetrainRequest(APIModel):
    triggered_by: Literal["auto", "manual"] = "manual"


class ModelMetrics(APIModel):
    accuracy: float = Field(ge=0, le=1)
    precision_score: float = Field(ge=0, le=1)
    recall: float = Field(ge=0, le=1)
    f1_score: float = Field(ge=0, le=1)


class ActiveModelMetrics(ModelMetrics):
    # The Node model-versions row has additional persistence fields; they are not
    # part of this service's public retraining response contract.
    model_config = ConfigDict(extra="ignore")

    id: int | None = None
    model_id: str | None = None
    is_active: bool | None = None


class RetrainResponse(APIModel):
    promoted: bool
    new_metrics: ModelMetrics
    current_metrics: ActiveModelMetrics | None
    mlflow_run_id: str

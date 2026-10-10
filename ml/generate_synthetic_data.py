"""Generate synthetic NSL-KDD data for model training."""

from pathlib import Path
import numpy as np
import pandas as pd

# Seed for reproducibility
np.random.seed(42)

# Feature names from contract
features = [
    "duration", "protocol_type", "service", "flag",
    "src_bytes", "dst_bytes", "land", "wrong_fragment", "urgent", "hot",
    "num_failed_logins", "logged_in", "num_compromised", "root_shell",
    "su_attempted", "num_root", "num_file_creations", "num_shells",
    "num_access_files", "num_outbound_cmds", "is_host_login", "is_guest_login",
    "count", "srv_count", "serror_rate", "srv_serror_rate", "rerror_rate",
    "srv_rerror_rate", "same_srv_rate", "diff_srv_rate", "srv_diff_host_rate",
    "dst_host_count", "dst_host_srv_count", "dst_host_same_srv_rate",
    "dst_host_diff_srv_rate", "dst_host_same_src_port_rate",
    "dst_host_srv_diff_host_rate", "dst_host_serror_rate", "dst_host_srv_serror_rate",
    "dst_host_rerror_rate", "dst_host_srv_rerror_rate"
]

categorical_features = ["protocol_type", "service", "flag"]
numerical_features = [f for f in features if f not in categorical_features]

def generate_data(n_samples, attack_ratio=0.2):
    """Generate synthetic NSL-KDD data."""
    data = {}
    
    # Generate numerical features
    for feat in numerical_features:
        if feat in ["duration", "src_bytes", "dst_bytes", "count", "srv_count"]:
            # Features with positive integer values
            data[feat] = np.random.exponential(100, n_samples).astype(int)
        elif feat in ["serror_rate", "srv_serror_rate", "rerror_rate", 
                      "srv_rerror_rate", "same_srv_rate", "diff_srv_rate",
                      "srv_diff_host_rate", "dst_host_same_srv_rate",
                      "dst_host_diff_srv_rate", "dst_host_same_src_port_rate",
                      "dst_host_srv_diff_host_rate", "dst_host_serror_rate",
                      "dst_host_srv_serror_rate", "dst_host_rerror_rate",
                      "dst_host_srv_rerror_rate"]:
            # Features as rates (0-1)
            data[feat] = np.random.uniform(0, 1, n_samples)
        else:
            # Binary or count features
            data[feat] = np.random.poisson(1, n_samples)
    
    # Generate categorical features
    protocols = ["tcp", "udp", "icmp"]
    services = ["http", "ftp", "telnet", "smtp", "ssh", "dns"]
    flags = ["SF", "S1", "S2", "S3", "REJ", "SH", "OTH"]
    
    data["protocol_type"] = np.random.choice(protocols, n_samples)
    data["service"] = np.random.choice(services, n_samples)
    data["flag"] = np.random.choice(flags, n_samples)
    
    # Generate labels (normal vs attack)
    n_attack = int(n_samples * attack_ratio)
    labels = ["normal"] * (n_samples - n_attack) + ["attack"] * n_attack
    np.random.shuffle(labels)
    data["label"] = labels
    
    # Generate difficulty level
    data["difficulty_level"] = np.random.randint(1, 4, n_samples)
    
    df = pd.DataFrame(data)
    return df[features + ["label", "difficulty_level"]]

# Create data directory
data_dir = Path(__file__).parent / "data" / "raw" / "synthetic"
data_dir.mkdir(parents=True, exist_ok=True)

# Generate training data (500 samples, ~20% attack)
train_data = generate_data(500, attack_ratio=0.2)
train_file = data_dir / "KDDTrain+.txt"
train_data.to_csv(train_file, index=False, header=False)
print(f"Generated training data: {train_file}")
print(f"  Samples: {len(train_data)}")
print(f"  Normal: {(train_data['label'] == 'normal').sum()}")
print(f"  Attack: {(train_data['label'] != 'normal').sum()}")

# Generate test data (200 samples, ~20% attack)
test_data = generate_data(200, attack_ratio=0.2)
test_file = data_dir / "KDDTest+.txt"
test_data.to_csv(test_file, index=False, header=False)
print(f"\nGenerated test data: {test_file}")
print(f"  Samples: {len(test_data)}")
print(f"  Normal: {(test_data['label'] == 'normal').sum()}")
print(f"  Attack: {(test_data['label'] != 'normal').sum()}")

print("\nData generation complete!")

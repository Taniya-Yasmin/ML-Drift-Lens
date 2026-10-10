"""Train the baseline NSL-KDD intrusion detection model."""

from .train import parse_args, train

if __name__ == "__main__":
    result = train(parse_args())

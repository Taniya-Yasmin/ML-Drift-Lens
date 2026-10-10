FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10

WORKDIR /app

COPY ml/inference-requirements.txt /app/ml/inference-requirements.txt
RUN pip install --no-cache-dir --only-binary=:all: --prefer-binary \
    --timeout 120 --retries 10 \
    -r /app/ml/inference-requirements.txt

COPY ml /app/ml

EXPOSE 8000 5000

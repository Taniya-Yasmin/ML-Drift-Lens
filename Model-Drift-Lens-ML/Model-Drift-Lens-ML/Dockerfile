FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Override these per-service in docker-compose.yml
    APP_MODULE=app.main:app \
    APP_PORT=8000

WORKDIR /service

# libgomp1 — required by XGBoost on Linux.
# curl    — used by the compose HEALTHCHECK.
RUN apt-get update \
    && apt-get install --no-install-recommends -y libgomp1 curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app \
    && useradd --system --gid app --create-home app

COPY requirements.lock ./
RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements.lock

COPY app     ./app
COPY models  ./models
COPY data    ./data
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

USER app

EXPOSE 8000

CMD ["./start.sh"]
